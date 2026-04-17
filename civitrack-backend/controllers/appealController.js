const { validationResult } = require('express-validator');
const pool = require('../config/db');
const { sendError } = require('../middleware/errorHandler');

const STAFF_ROLES = ['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin'];
const APPEAL_STATUSES = [
  'submitted',
  'under-review',
  'routed-to-to',
  'forwarded-to-committee',
  'resubmit-required',
  'resolved',
  'rejected',
];

const isApplicant = (user) => user.accountType === 'applicant' || user.role === 'applicant';
const isStaff = (user) => STAFF_ROLES.includes(user.role);
const getChangedByStaffId = (user) => (isStaff(user) ? user.userId : null);

const normalizeAppealDocumentKind = (kind) => {
  if (kind === 'corrected' || kind === 'additional') {
    return kind;
  }
  return 'additional';
};

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
      if (err.code !== '23514') {
        throw err;
      }

      await client.query('ROLLBACK TO SAVEPOINT app_status_attempt');
      await client.query('RELEASE SAVEPOINT app_status_attempt');
    }
  }

  return null;
};

const ownsApplication = async (applicationId, applicantId) => {
  const result = await pool.query(
    'SELECT id FROM applications WHERE id = $1 AND applicant_id = $2',
    [applicationId, applicantId]
  );
  return result.rows.length > 0;
};

const ownsAppeal = async (appealCaseId, applicantId) => {
  const result = await pool.query(
    `SELECT ac.id
     FROM appeal_cases ac
     JOIN applications a ON a.id = ac.application_id
     WHERE ac.id = $1 AND a.applicant_id = $2`,
    [appealCaseId, applicantId]
  );
  return result.rows.length > 0;
};

exports.createAppealCase = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: errors.array().map((err) => ({
          field: err.path || err.param,
          message: err.msg,
          value: err.value,
          location: err.location,
        })),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const user = req.user;
    const {
      application_id,
      route = 'committee',
      additional_fee,
      summary,
      corrections_category,
      special_circumstances,
      contains_new_plans = false,
      documents = [],
    } = req.body;

    if (isApplicant(user)) {
      const owns = await ownsApplication(application_id, user.userId);
      if (!owns) {
        return sendError(res, 403, 'You can only create appeals for your own applications', {
          code: 'AUTH_FORBIDDEN',
          path: req.originalUrl,
          method: req.method,
        });
      }
    }

    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM appeal_cases WHERE application_id = $1', [application_id]);
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'Appeal case already exists for this application', {
        code: 'APPEAL_ALREADY_EXISTS',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const appealCaseResult = await client.query(
      `INSERT INTO appeal_cases (application_id, route, status, additional_fee, portal_open)
       VALUES ($1, $2, 'submitted', $3, TRUE)
       RETURNING *`,
      [application_id, route, additional_fee || null]
    );

    const appealCase = appealCaseResult.rows[0];

    const versionResult = await client.query(
      `INSERT INTO appeal_versions (
        appeal_case_id,
        appeal_no,
        summary,
        corrections_category,
        special_circumstances,
        contains_new_plans
      )
      VALUES ($1, 1, $2, $3, $4, $5)
      RETURNING *`,
      [
        appealCase.id,
        summary || null,
        corrections_category || null,
        special_circumstances || null,
        contains_new_plans,
      ]
    );

    const version = versionResult.rows[0];

    for (const doc of documents) {
      if (!doc.label || !doc.kind) {
        continue;
      }
      await client.query(
        `INSERT INTO appeal_documents (appeal_version_id, document_id, label, kind, required)
         VALUES ($1, $2, $3, $4, $5)`,
        [version.id, doc.document_id || null, doc.label, normalizeAppealDocumentKind(doc.kind), doc.required !== false]
      );
    }

    await applyStatusWithFallback(
      client,
      application_id,
      ['appeal_submitted', 'under_review', 'pending'],
      getChangedByStaffId(user),
      'Appeal case created'
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Appeal case created successfully',
      appealCase,
      initialVersion: version,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create appeal case error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'APPEAL_CREATE_FAILED',
        message: 'Failed to create appeal case',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.getAppealCases = async (req, res) => {
  try {
    const user = req.user;
    const { status, route, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let fromSql = `
      FROM appeal_cases ac
      JOIN applications a ON a.id = ac.application_id
    `;
    const params = [];
    const where = [];

    if (isApplicant(user)) {
      where.push(`a.applicant_id = $${params.length + 1}`);
      params.push(user.userId);
    }

    if (status) {
      where.push(`ac.status = $${params.length + 1}`);
      params.push(status);
    }

    if (route) {
      where.push(`ac.route = $${params.length + 1}`);
      params.push(route);
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) as total ${fromSql} ${whereSql}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const query = `
      SELECT
        ac.id,
        ac.application_id,
        ac.route,
        ac.status,
        ac.portal_open,
        ac.additional_fee,
        ac.created_at,
        ac.updated_at,
        a.submitted_applicant_name,
        a.submitted_email,
        a.application_type
      ${fromSql}
      ${whereSql}
      ORDER BY ac.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(parseInt(limit, 10), parseInt(offset, 10));
    const result = await pool.query(query, params);

    res.json({
      appealCases: result.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get appeal cases error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'APPEAL_LIST_FETCH_FAILED',
        message: 'Failed to fetch appeal cases',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  }
};

exports.getAppealCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (isApplicant(user)) {
      const owns = await ownsAppeal(id, user.userId);
      if (!owns) {
        return sendError(res, 403, 'Access denied for this appeal case', {
          code: 'AUTH_FORBIDDEN',
          path: req.originalUrl,
          method: req.method,
        });
      }
    }

    const result = await pool.query(
      `SELECT
        ac.*,
        a.application_type,
        a.status as application_status,
        a.submitted_applicant_name,
        a.submitted_nic_number,
        a.submitted_email,
        (
          SELECT json_agg(row_to_json(v.*))
          FROM (
            SELECT *
            FROM appeal_versions av
            WHERE av.appeal_case_id = ac.id
            ORDER BY av.appeal_no DESC
          ) v
        ) as versions,
        (
          SELECT json_agg(row_to_json(d.*))
          FROM (
            SELECT ad.*
            FROM appeal_documents ad
            JOIN appeal_versions av ON av.id = ad.appeal_version_id
            WHERE av.appeal_case_id = ac.id
            ORDER BY ad.id DESC
          ) d
        ) as documents,
        (
          SELECT json_agg(row_to_json(n.*))
          FROM (
            SELECT *
            FROM appeal_member_notes amn
            WHERE amn.appeal_case_id = ac.id
            ORDER BY amn.noted_at DESC
          ) n
        ) as member_notes
      FROM appeal_cases ac
      JOIN applications a ON a.id = ac.application_id
      WHERE ac.id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return sendError(res, 404, 'Appeal case not found', {
        code: 'APPEAL_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get appeal case error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'APPEAL_FETCH_FAILED',
        message: 'Failed to fetch appeal case',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  }
};

exports.addAppealVersion = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: errors.array().map((err) => ({
          field: err.path || err.param,
          message: err.msg,
          value: err.value,
          location: err.location,
        })),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const user = req.user;
    const {
      summary,
      corrections_category,
      special_circumstances,
      contains_new_plans = false,
      documents = [],
    } = req.body;

    if (isApplicant(user)) {
      const owns = await ownsAppeal(id, user.userId);
      if (!owns) {
        return sendError(res, 403, 'Access denied for this appeal case', {
          code: 'AUTH_FORBIDDEN',
          path: req.originalUrl,
          method: req.method,
        });
      }
    }

    await client.query('BEGIN');

    const caseResult = await client.query('SELECT * FROM appeal_cases WHERE id = $1', [id]);
    if (!caseResult.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Appeal case not found', {
        code: 'APPEAL_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const noResult = await client.query(
      `SELECT COALESCE(MAX(appeal_no), 0) + 1 AS next_no
       FROM appeal_versions
       WHERE appeal_case_id = $1`,
      [id]
    );

    const nextNo = parseInt(noResult.rows[0].next_no, 10);

    const versionResult = await client.query(
      `INSERT INTO appeal_versions (
        appeal_case_id,
        appeal_no,
        summary,
        corrections_category,
        special_circumstances,
        contains_new_plans
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [id, nextNo, summary || null, corrections_category || null, special_circumstances || null, contains_new_plans]
    );

    for (const doc of documents) {
      if (!doc.label || !doc.kind) {
        continue;
      }
      await client.query(
        `INSERT INTO appeal_documents (appeal_version_id, document_id, label, kind, required)
         VALUES ($1, $2, $3, $4, $5)`,
        [versionResult.rows[0].id, doc.document_id || null, doc.label, normalizeAppealDocumentKind(doc.kind), doc.required !== false]
      );
    }

    await client.query(
      `UPDATE appeal_cases
       SET status = 'submitted', updated_at = NOW(), portal_open = TRUE
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Appeal version added successfully',
      version: versionResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add appeal version error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'APPEAL_VERSION_ADD_FAILED',
        message: 'Failed to add appeal version',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.addAppealMemberNote = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: errors.array().map((err) => ({
          field: err.path || err.param,
          message: err.msg,
          value: err.value,
          location: err.location,
        })),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const { note } = req.body;

    const caseResult = await pool.query('SELECT id FROM appeal_cases WHERE id = $1', [id]);
    if (!caseResult.rows.length) {
      return sendError(res, 404, 'Appeal case not found', {
        code: 'APPEAL_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const result = await pool.query(
      `INSERT INTO appeal_member_notes (appeal_case_id, noted_by, note)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, req.user.userId, note]
    );

    res.status(201).json({
      message: 'Appeal note added successfully',
      note: result.rows[0],
    });
  } catch (error) {
    console.error('Add appeal note error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'APPEAL_NOTE_ADD_FAILED',
        message: 'Failed to add appeal note',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  }
};

exports.updateAppealStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: errors.array().map((err) => ({
          field: err.path || err.param,
          message: err.msg,
          value: err.value,
          location: err.location,
        })),
        path: req.originalUrl,
        method: req.method,
      });
    }

    const { id } = req.params;
    const { status, route, portal_open, additional_fee } = req.body;

    if (!APPEAL_STATUSES.includes(status)) {
      return sendError(res, 400, `Invalid status. Allowed: ${APPEAL_STATUSES.join(', ')}`, {
        code: 'VALIDATION_ERROR',
        path: req.originalUrl,
        method: req.method,
      });
    }

    await client.query('BEGIN');

    const caseResult = await client.query('SELECT id, application_id FROM appeal_cases WHERE id = $1', [id]);
    if (!caseResult.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Appeal case not found', {
        code: 'APPEAL_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const appealCase = caseResult.rows[0];

    const updatedResult = await client.query(
      `UPDATE appeal_cases
       SET status = $1,
           route = COALESCE($2, route),
           portal_open = COALESCE($3, portal_open),
           additional_fee = COALESCE($4, additional_fee),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [status, route || null, portal_open ?? null, additional_fee ?? null, id]
    );

    if (status === 'forwarded-to-committee') {
      await applyStatusWithFallback(
        client,
        appealCase.application_id,
        ['committee_review', 'under_review', 'endorsed'],
        getChangedByStaffId(req.user),
        'Appeal forwarded to committee'
      );
    }

    if (status === 'rejected') {
      await applyStatusWithFallback(
        client,
        appealCase.application_id,
        ['rejected', 'correction'],
        getChangedByStaffId(req.user),
        'Appeal rejected'
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'Appeal status updated successfully',
      appealCase: updatedResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update appeal status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'APPEAL_STATUS_UPDATE_FAILED',
        message: 'Failed to update appeal status',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};
