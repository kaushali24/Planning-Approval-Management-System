const { validationResult } = require('express-validator');
const pool = require('../config/db');
const { sendError } = require('../middleware/errorHandler');

const STAFF_ROLES = ['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin'];
const COC_STATUSES = [
  'requested',
  'fee-calculated',
  'paid',
  'assigned-to-to',
  'inspection-complete',
  'coc-approved',
  'coc-collected',
  'coc-violations-found',
  'coc-rectification-in-progress',
  'reinspection-requested',
  'coc-fine-paid-regularization-pending',
  'pending',
  'inspection_scheduled',
  'inspected',
  'compliant',
  'deviation',
  'issued',
  'rejected',
];

const isApplicantUser = (user) => user.accountType === 'applicant' || user.role === 'applicant';
const isStaffUser = (user) => STAFF_ROLES.includes(user.role);
const getChangedByStaffId = (user) => (isStaffUser(user) ? user.userId : null);
const toValidationErrors = (errors) => errors.array().map((err) => ({
  field: err.path || err.param,
  message: err.msg,
  value: err.value,
  location: err.location,
}));

const applyStatusWithFallback = async (client, applicationId, preferredStatuses, changedBy, reason) => {
  for (const status of preferredStatuses) {
    try {
      await client.query('SAVEPOINT app_status_attempt');

      await client.query(
        `UPDATE applications
         SET status = $1, last_updated = NOW()
         WHERE id = $2`,
        [status, applicationId]
      );

      await client.query(
        `INSERT INTO application_status_history (application_id, status, changed_by, reason)
         VALUES ($1, $2, $3, $4)`,
        [applicationId, status, changedBy, reason]
      );

      await client.query('RELEASE SAVEPOINT app_status_attempt');

      return status;
    } catch (err) {
      // 23514 = check_violation
      if (err.code !== '23514') {
        throw err;
      }

      await client.query('ROLLBACK TO SAVEPOINT app_status_attempt');
      await client.query('RELEASE SAVEPOINT app_status_attempt');
    }
  }

  return null;
};

const getAppById = async (applicationId) => {
  const result = await pool.query(
    `SELECT id, applicant_id, status, application_type, submitted_applicant_name, submitted_email
     FROM applications
     WHERE id = $1`,
    [applicationId]
  );
  return result.rows[0] || null;
};

const applicantOwnsCoc = async (userId, cocRequestId) => {
  const result = await pool.query(
    `SELECT c.id
     FROM coc_requests c
     JOIN applications a ON a.id = c.application_id
     WHERE c.id = $1 AND a.applicant_id = $2`,
    [cocRequestId, userId]
  );
  return result.rows.length > 0;
};

const getCocWithOwnership = async (client, cocRequestId) => {
  const result = await client.query(
    `SELECT c.*, a.applicant_id, a.id as application_id
     FROM coc_requests c
     JOIN applications a ON a.id = c.application_id
     WHERE c.id = $1
     FOR UPDATE`,
    [cocRequestId]
  );
  return result.rows[0] || null;
};

exports.createCocRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: toValidationErrors(errors),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const user = req.user;
    const { application_id, notes, declarations = [] } = req.body;

    const application = await getAppById(application_id);
    if (!application) {
      return sendError(res, 404, 'Application not found', {
        code: 'APPLICATION_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (isApplicantUser(user) && application.applicant_id !== user.userId) {
      return sendError(res, 403, 'You can only create COC requests for your own applications', {
        code: 'AUTH_FORBIDDEN',
        path: req.originalUrl,
        method: req.method,
      });
    }

    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM coc_requests WHERE application_id = $1', [application_id]);
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'COC request already exists for this application', {
        code: 'COC_ALREADY_EXISTS',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const cocId = `COC-${new Date().getFullYear()}-${String(application_id).padStart(6, '0')}`;

    const insertResult = await client.query(
      `INSERT INTO coc_requests (
        coc_id,
        application_id,
        applicant_id,
        applicant_email,
        applicant_name,
        status,
        declarations,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, 'requested', $6::jsonb, $7)
      RETURNING id, coc_id, application_id, status, request_date, applicant_name`,
      [
        cocId,
        application_id,
        application.applicant_id,
        application.submitted_email,
        application.submitted_applicant_name,
        JSON.stringify(declarations),
        notes || null,
      ]
    );

    await applyStatusWithFallback(
      client,
      application_id,
      ['coc_pending', 'under_review', 'pending'],
      getChangedByStaffId(user),
      'COC request created'
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'COC request created successfully',
      cocRequest: insertResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create COC request error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COC_CREATE_FAILED',
        message: 'Failed to create COC request',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.getCocRequests = async (req, res) => {
  try {
    const user = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let fromSql = `
      FROM coc_requests c
      JOIN applications a ON a.id = c.application_id
    `;
    const params = [];
    const where = [];

    if (isApplicantUser(user)) {
      where.push(`a.applicant_id = $${params.length + 1}`);
      params.push(user.userId);
    } else if (isStaffUser(user) && user.role !== 'admin' && user.role !== 'committee') {
      fromSql += ' LEFT JOIN application_assignments aa ON aa.application_id = a.id ';
      where.push(`(aa.assigned_to = $${params.length + 1} OR c.assigned_to = $${params.length + 1})`);
      params.push(user.userId);
    }

    if (status) {
      where.push(`c.status = $${params.length + 1}`);
      params.push(status);
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) as total ${fromSql} ${whereSql}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const dataQuery = `
      SELECT
        c.id,
        c.coc_id,
        c.application_id,
        c.status,
        c.request_date,
        c.applicant_name,
        c.applicant_email,
        c.assigned_to,
        c.fee_amount,
        c.paid_at,
        c.fine_paid_at,
        c.deviation_fine,
        c.violation_report,
        c.regularization_status,
        c.rectification_confirmed_at,
        c.reinspection_requested_at,
        c.collected_at,
        c.valid_until,
        c.issued_at,
        a.application_type,
        a.submitted_applicant_name
      ${fromSql}
      ${whereSql}
      ORDER BY c.request_date DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(parseInt(limit, 10), parseInt(offset, 10));
    const result = await pool.query(dataQuery, params);

    res.json({
      cocRequests: result.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get COC requests error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COC_LIST_FETCH_FAILED',
        message: 'Failed to fetch COC requests',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  }
};

exports.getCocRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (isApplicantUser(user)) {
      const owns = await applicantOwnsCoc(user.userId, id);
      if (!owns) {
        return sendError(res, 403, 'Access denied for this COC request', {
          code: 'AUTH_FORBIDDEN',
          path: req.originalUrl,
          method: req.method,
        });
      }
    }

    const result = await pool.query(
      `SELECT
        c.*,
        a.application_type,
        a.status as application_status,
        a.submitted_applicant_name,
        a.submitted_nic_number,
        a.submitted_email,
        (SELECT json_agg(row_to_json(cd.*)) FROM coc_declarations cd WHERE cd.coc_request_id = c.id) as declaration_rows,
        (SELECT json_agg(row_to_json(cv.*)) FROM coc_violations cv WHERE cv.coc_request_id = c.id ORDER BY cv.reported_at DESC) as violations,
        (SELECT json_agg(row_to_json(cr.*)) FROM coc_reinspections cr WHERE cr.coc_request_id = c.id ORDER BY cr.round_no DESC) as reinspections
      FROM coc_requests c
      JOIN applications a ON a.id = c.application_id
      WHERE c.id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return sendError(res, 404, 'COC request not found', {
        code: 'COC_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get COC request by ID error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COC_FETCH_FAILED',
        message: 'Failed to fetch COC request',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  }
};

exports.updateCocStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: toValidationErrors(errors),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const { status, notes, assigned_to, fee_amount } = req.body;

    if (!COC_STATUSES.includes(status)) {
      return sendError(res, 400, `Invalid status. Allowed: ${COC_STATUSES.join(', ')}`, {
        code: 'VALIDATION_ERROR',
        path: req.originalUrl,
        method: req.method,
      });
    }

    await client.query('BEGIN');

    const current = await client.query('SELECT id, application_id, status FROM coc_requests WHERE id = $1', [id]);
    if (!current.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'COC request not found', {
        code: 'COC_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const cocRequest = current.rows[0];

    const updated = await client.query(
      `UPDATE coc_requests
       SET status = $1,
           notes = COALESCE($2, notes),
           assigned_to = COALESCE($3, assigned_to),
           fee_amount = COALESCE($4, fee_amount),
           assigned_at = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE assigned_at END,
           inspection_completed_at = CASE WHEN $1 = 'inspection-complete' THEN NOW() ELSE inspection_completed_at END,
           issued_at = CASE WHEN $1 = 'issued' THEN NOW() ELSE issued_at END,
           collected_at = CASE WHEN $1 = 'coc-collected' THEN NOW() ELSE collected_at END
       WHERE id = $5
       RETURNING *`,
      [status, notes || null, assigned_to || null, fee_amount || null, id]
    );

    if (['issued', 'coc-approved'].includes(status)) {
      await applyStatusWithFallback(
        client,
        cocRequest.application_id,
        ['coc_issued', 'approved', 'certified'],
        getChangedByStaffId(req.user),
        `COC moved to ${status}`
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'COC status updated successfully',
      cocRequest: updated.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update COC status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COC_STATUS_UPDATE_FAILED',
        message: 'Failed to update COC status',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.addDeclaration = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: toValidationErrors(errors),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const { declaration_type, accepted = true } = req.body;

    const cocResult = await pool.query('SELECT id FROM coc_requests WHERE id = $1', [id]);
    if (!cocResult.rows.length) {
      return sendError(res, 404, 'COC request not found', {
        code: 'COC_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const result = await pool.query(
      `INSERT INTO coc_declarations (coc_request_id, declaration_type, accepted, acknowledged_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (coc_request_id, declaration_type)
       DO UPDATE SET accepted = EXCLUDED.accepted, acknowledged_at = NOW()
       RETURNING *`,
      [id, declaration_type, accepted]
    );

    res.status(201).json({
      message: 'Declaration recorded successfully',
      declaration: result.rows[0],
    });
  } catch (error) {
    console.error('Add declaration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COC_DECLARATION_ADD_FAILED',
        message: 'Failed to record declaration',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  }
};

exports.addViolation = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: toValidationErrors(errors),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const {
      deviation_type,
      comments,
      fine_amount,
      no_appeal = true,
      inspection_type = 'initial-inspection',
      inspection_id,
    } = req.body;

    await client.query('BEGIN');

    const cocResult = await client.query('SELECT id FROM coc_requests WHERE id = $1', [id]);
    if (!cocResult.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'COC request not found', {
        code: 'COC_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const result = await client.query(
      `INSERT INTO coc_violations (
        coc_request_id,
        inspection_id,
        deviation_type,
        comments,
        fine_amount,
        no_appeal,
        inspection_type,
        reported_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [id, inspection_id || null, deviation_type, comments || null, fine_amount, no_appeal, inspection_type, req.user.userId]
    );

    await client.query(
      `UPDATE coc_requests
       SET status = 'coc-violations-found', deviation_fine = $1, violation_report = $2::jsonb
       WHERE id = $3`,
      [fine_amount, JSON.stringify({ deviation_type, comments: comments || null }), id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Violation recorded successfully',
      violation: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add violation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COC_VIOLATION_ADD_FAILED',
        message: 'Failed to record violation',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.addReinspection = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: toValidationErrors(errors),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const { result = 'pending', notes } = req.body;

    await client.query('BEGIN');

    const cocResult = await client.query('SELECT id FROM coc_requests WHERE id = $1', [id]);
    if (!cocResult.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'COC request not found', {
        code: 'COC_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const roundResult = await client.query(
      `SELECT COALESCE(MAX(round_no), 0) + 1 AS next_round
       FROM coc_reinspections
       WHERE coc_request_id = $1`,
      [id]
    );

    const nextRound = parseInt(roundResult.rows[0].next_round, 10);

    const insertResult = await client.query(
      `INSERT INTO coc_reinspections (
        coc_request_id,
        round_no,
        requested_at,
        completed_at,
        result,
        technical_officer_id,
        notes
      )
      VALUES (
        $1,
        $2,
        NOW(),
        CASE WHEN $3 = 'pending' THEN NULL ELSE NOW() END,
        $3,
        $4,
        $5
      )
      RETURNING *`,
      [id, nextRound, result, req.user.userId, notes || null]
    );

    await client.query(
      `UPDATE coc_requests
       SET reinspection_rounds = $1,
           reinspection_requested_at = COALESCE(reinspection_requested_at, NOW()),
           reinspection_completed_at = CASE WHEN $2 = 'pending' THEN reinspection_completed_at ELSE NOW() END,
           status = CASE WHEN $2 = 'compliant' THEN 'compliant' WHEN $2 = 'deviation' THEN 'deviation' ELSE 'reinspection-requested' END
       WHERE id = $3`,
      [nextRound, result, id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Reinspection recorded successfully',
      reinspection: insertResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add reinspection error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COC_REINSPECTION_ADD_FAILED',
        message: 'Failed to record reinspection',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.submitApplicantPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: toValidationErrors(errors),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const { amount, payment_method = 'online', transaction_id, paid_at } = req.body;
    const user = req.user;

    await client.query('BEGIN');

    const coc = await getCocWithOwnership(client, id);
    if (!coc) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'COC request not found', {
        code: 'COC_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (isApplicantUser(user) && Number(coc.applicant_id) !== Number(user.userId)) {
      await client.query('ROLLBACK');
      return sendError(res, 403, 'Access denied for this COC request', {
        code: 'AUTH_FORBIDDEN',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const normalizedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Payment amount must be a valid positive number', {
        code: 'VALIDATION_ERROR',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const paidAt = paid_at ? new Date(paid_at) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'paid_at must be a valid date time', {
        code: 'VALIDATION_ERROR',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const transactionId = transaction_id || `COC-${id}-${Date.now()}`;

    const isFineFlow = coc.status === 'coc-violations-found' || coc.status === 'coc-fine-paid-regularization-pending';
    const isFixable = coc.violation_report && Object.prototype.hasOwnProperty.call(coc.violation_report, 'isFixable')
      ? !!coc.violation_report.isFixable
      : true;

    const paymentType = isFineFlow ? 'deviation_fine' : 'coc_fee';
    const nextStatus = !isFineFlow
      ? 'paid'
      : isFixable
      ? 'coc-rectification-in-progress'
      : 'coc-fine-paid-regularization-pending';

    const paymentResult = await client.query(
      `INSERT INTO payments (
        coc_request_id,
        payment_type,
        amount,
        status,
        transaction_id,
        payment_method,
        paid_at
      )
      VALUES ($1, $2, $3, 'completed', $4, $5, $6)
      RETURNING *`,
      [id, paymentType, normalizedAmount, transactionId, payment_method, paidAt.toISOString()]
    );

    await client.query(
      `UPDATE coc_requests
       SET status = $1,
           paid_at = CASE WHEN $2 = 'coc_fee' THEN $3 ELSE paid_at END,
           fine_paid_at = CASE WHEN $2 = 'deviation_fine' THEN $3 ELSE fine_paid_at END,
           regularization_status = CASE
             WHEN $2 = 'deviation_fine' AND $4 = TRUE THEN 'rectify'
             WHEN $2 = 'deviation_fine' AND $4 = FALSE THEN 'fine-paid'
             ELSE regularization_status
           END
       WHERE id = $5`,
      [nextStatus, paymentType, paidAt.toISOString(), isFixable, id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'COC payment recorded successfully',
      payment: paymentResult.rows[0],
      cocStatus: nextStatus,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit applicant COC payment error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'COC_PAYMENT_FAILED',
        message: 'Failed to record COC payment',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.submitCorrectionEvidence = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: toValidationErrors(errors),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const { evidence_note } = req.body;
    const user = req.user;

    await client.query('BEGIN');

    const coc = await getCocWithOwnership(client, id);
    if (!coc) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'COC request not found', {
        code: 'COC_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (isApplicantUser(user) && Number(coc.applicant_id) !== Number(user.userId)) {
      await client.query('ROLLBACK');
      return sendError(res, 403, 'Access denied for this COC request', {
        code: 'AUTH_FORBIDDEN',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (!['coc-rectification-in-progress', 'coc-violations-found'].includes(coc.status)) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Correction evidence cannot be submitted in current COC status', {
        code: 'COC_INVALID_STATUS',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const mergedNote = [coc.notes, `Correction evidence: ${evidence_note}`]
      .filter(Boolean)
      .join('\n');

    const updated = await client.query(
      `UPDATE coc_requests
       SET status = 'coc-rectification-in-progress',
           rectification_confirmed_at = NOW(),
           notes = $1
       WHERE id = $2
       RETURNING *`,
      [mergedNote, id]
    );

    await client.query('COMMIT');

    return res.json({
      message: 'Correction evidence submitted successfully',
      cocRequest: updated.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit correction evidence error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'COC_CORRECTION_SUBMIT_FAILED',
        message: 'Failed to submit correction evidence',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.requestApplicantReinspection = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: toValidationErrors(errors),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const user = req.user;

    await client.query('BEGIN');

    const coc = await getCocWithOwnership(client, id);
    if (!coc) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'COC request not found', {
        code: 'COC_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (isApplicantUser(user) && Number(coc.applicant_id) !== Number(user.userId)) {
      await client.query('ROLLBACK');
      return sendError(res, 403, 'Access denied for this COC request', {
        code: 'AUTH_FORBIDDEN',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (!coc.rectification_confirmed_at) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Submit correction evidence before requesting reinspection', {
        code: 'COC_REINSPECTION_NOT_ELIGIBLE',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const fineRequired = Number(coc.deviation_fine || 0) > 0;
    if (fineRequired && !coc.fine_paid_at) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Pay the fine before requesting reinspection', {
        code: 'COC_FINE_REQUIRED',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const updated = await client.query(
      `UPDATE coc_requests
       SET status = 'reinspection-requested',
           reinspection_requested_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await client.query('COMMIT');

    return res.json({
      message: 'Reinspection requested successfully',
      cocRequest: updated.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Request applicant reinspection error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'COC_REINSPECTION_REQUEST_FAILED',
        message: 'Failed to request reinspection',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};
