const { validationResult } = require('express-validator');
const pool = require('../config/db');
const { sendError } = require('../middleware/errorHandler');
const { applyStatusTransition } = require('../utils/applicationStatusUpdater');

const isApplicantUser = (user) => user.accountType === 'applicant' || user.role === 'applicant';
const isBuildingApplication = (applicationType) => String(applicationType || '').trim().toLowerCase() === 'building';
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
      await applyStatusTransition({
        client,
        applicationId,
        toStatus: status,
        changedBy,
        reason,
      });

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

const getApplication = async (applicationId) => {
  const result = await pool.query(
    `SELECT id, applicant_id, application_type, status
     FROM applications
     WHERE id = $1`,
    [applicationId]
  );
  return result.rows[0] || null;
};

exports.issuePermit = async (req, res) => {
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

    const applicationId = parseInt(req.params.applicationId, 10);
    const { valid_until, permit_reference, max_years = 5 } = req.body;
    const normalizedMaxYears = Number.parseInt(max_years, 10);
    if (!Number.isInteger(normalizedMaxYears) || normalizedMaxYears < 1 || normalizedMaxYears > 5) {
      return sendError(res, 400, 'max_years must be between 1 and 5', {
        code: 'PERMIT_MAX_YEARS_INVALID',
        path: req.originalUrl,
        method: req.method,
      });
    }

    await client.query('BEGIN');

    const appResult = await client.query(
      `SELECT id, applicant_id, application_type, status, application_code
       FROM applications
       WHERE id = $1`,
      [applicationId]
    );
    const application = appResult.rows[0] || null;
    if (!application) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Application not found', {
        code: 'APPLICATION_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (!isBuildingApplication(application.application_type)) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Permits are issued only for building applications', {
        code: 'PERMIT_NOT_ALLOWED_FOR_APPLICATION_TYPE',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const existingPermit = await client.query(
      'SELECT id FROM permit_workflow WHERE application_id = $1',
      [applicationId]
    );

    if (existingPermit.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'Permit already issued for this application', {
        code: 'PERMIT_ALREADY_EXISTS',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const generatedReference = application.application_code || permit_reference || String(applicationId);

    const permitResult = await client.query(
      `INSERT INTO permit_workflow (
        application_id,
        permit_reference,
        permit_type,
        issued_at,
        valid_until,
        issued_by,
        max_years,
        extensions_used
      )
      VALUES ($1, $2, $3, NOW(), $4, $5, $6, 0)
      RETURNING *`,
      [
        applicationId,
        generatedReference,
        application.application_type || 'building',
        valid_until,
        req.user.userId,
        normalizedMaxYears,
      ]
    );

    await applyStatusWithFallback(
      client,
      applicationId,
      ['permit_approved', 'approved', 'endorsed'],
      req.user.userId,
      'Permit issued'
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Permit issued successfully',
      permit: permitResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Issue permit error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PERMIT_ISSUE_FAILED',
        message: 'Failed to issue permit',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.getPermitByApplication = async (req, res) => {
  try {
    const applicationId = parseInt(req.params.applicationId, 10);

    const app = await getApplication(applicationId);
    if (!app) {
      return sendError(res, 404, 'Application not found', {
        code: 'APPLICATION_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (isApplicantUser(req.user) && app.applicant_id !== req.user.userId) {
      return sendError(res, 403, 'Access denied', {
        code: 'AUTH_FORBIDDEN',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (!isBuildingApplication(app.application_type)) {
      return sendError(res, 404, 'Permit not found for this application', {
        code: 'PERMIT_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const result = await pool.query(
      `SELECT
        p.*,
        (
          SELECT json_agg(row_to_json(pe2.*))
          FROM (
            SELECT *
            FROM permit_extensions pe
            WHERE pe.permit_id = p.id
            ORDER BY pe.extension_no DESC
          ) pe2
        ) as extensions,
        (
          SELECT json_agg(row_to_json(pc2.*))
          FROM (
            SELECT *
            FROM permit_collection_checks pc
            WHERE pc.permit_id = p.id
            ORDER BY pc.check_type
          ) pc2
        ) as collection_checks
       FROM permit_workflow p
       WHERE p.application_id = $1`,
      [applicationId]
    );

    if (!result.rows.length) {
      return sendError(res, 404, 'Permit not found for this application', {
        code: 'PERMIT_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get permit error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PERMIT_FETCH_FAILED',
        message: 'Failed to fetch permit',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  }
};

exports.extendPermit = async (req, res) => {
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

    const applicationId = parseInt(req.params.applicationId, 10);
    const { payment_status = 'completed', payment_reference, payment_method, notes } = req.body;

    await client.query('BEGIN');

    const permitResult = await client.query(
      `SELECT p.*, a.application_type, a.status AS application_status
       FROM permit_workflow p
       LEFT JOIN applications a ON a.id = p.application_id
       WHERE p.application_id = $1`,
      [applicationId]
    );

    if (!permitResult.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Permit not found for this application', {
        code: 'PERMIT_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const permit = permitResult.rows[0];

    const resolvedPermitType = permit.permit_type || permit.application_type;
    if (resolvedPermitType && !isBuildingApplication(resolvedPermitType)) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Permit extensions are available only for building applications', {
        code: 'PERMIT_EXTENSION_NOT_ALLOWED',
        path: req.originalUrl,
        method: req.method,
      });
    }

    if (permit.extensions_used >= permit.max_years - 1) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Maximum permit extension limit reached', {
        code: 'PERMIT_EXTENSION_LIMIT_REACHED',
        path: req.originalUrl,
        method: req.method,
      });
    }
    if (String(payment_status || '').toLowerCase() !== 'completed') {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Only completed payments can be used for permit extension', {
        code: 'PERMIT_EXTENSION_PAYMENT_INCOMPLETE',
        path: req.originalUrl,
        method: req.method,
      });
    }
    if (!String(payment_reference || '').trim() || !String(payment_method || '').trim()) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'payment_reference and payment_method are required for permit extension', {
        code: 'PERMIT_EXTENSION_PAYMENT_DETAILS_REQUIRED',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const previousValid = new Date(permit.valid_until);
    const extendedValid = new Date(previousValid);
    extendedValid.setFullYear(extendedValid.getFullYear() + 1);

    const extensionNo = permit.extensions_used + 1;
    const extensionNoCheck = await client.query(
      `SELECT COALESCE(MAX(extension_no), 0) + 1 AS expected_no
       FROM permit_extensions
       WHERE permit_id = $1`,
      [permit.id]
    );
    const expectedNo = Number.parseInt(extensionNoCheck.rows[0]?.expected_no, 10) || 1;
    if (expectedNo !== extensionNo) {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'Permit extension sequence mismatch detected', {
        code: 'PERMIT_EXTENSION_SEQUENCE_MISMATCH',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const extensionResult = await client.query(
      `INSERT INTO permit_extensions (
        permit_id,
        extension_no,
        payment_status,
        payment_reference,
        payment_method,
        previous_valid_until,
        extended_valid_until,
        approved_by,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        permit.id,
        extensionNo,
        payment_status,
        payment_reference || null,
        payment_method || null,
        previousValid,
        extendedValid,
        req.user.userId,
        notes || null,
      ]
    );

    const updatedPermit = await client.query(
      `UPDATE permit_workflow
       SET valid_until = $1,
           extensions_used = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [extendedValid, extensionNo, permit.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Permit extended successfully',
      extension: extensionResult.rows[0],
      permit: updatedPermit.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Extend permit error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PERMIT_EXTEND_FAILED',
        message: 'Failed to extend permit',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

exports.collectPermit = async (req, res) => {
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

    const applicationId = parseInt(req.params.applicationId, 10);
    const { checks = [] } = req.body;

    await client.query('BEGIN');

    const permitResult = await client.query(
      `SELECT p.*, a.application_type
       FROM permit_workflow p
       LEFT JOIN applications a ON a.id = p.application_id
       WHERE p.application_id = $1`,
      [applicationId]
    );

    if (!permitResult.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Permit not found for this application', {
        code: 'PERMIT_NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    }

    const permit = permitResult.rows[0];
    if (permit.permit_collected) {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'Permit is already marked as collected', {
        code: 'PERMIT_ALREADY_COLLECTED',
        path: req.originalUrl,
        method: req.method,
      });
    }
    if (permit.application_status && permit.application_status !== 'permit_approved') {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Permit can only be collected when application status is permit_approved', {
        code: 'PERMIT_COLLECTION_INVALID_STATUS',
        details: { currentStatus: permit.application_status },
        path: req.originalUrl,
        method: req.method,
      });
    }

    const resolvedPermitType = permit.permit_type || permit.application_type;
    if (resolvedPermitType && !isBuildingApplication(resolvedPermitType)) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'Permit collection is available only for building applications', {
        code: 'PERMIT_COLLECTION_NOT_ALLOWED',
        path: req.originalUrl,
        method: req.method,
      });
    }

    for (const check of checks) {
      if (!check.check_type) {
        continue;
      }

      await client.query(
        `INSERT INTO permit_collection_checks (permit_id, check_type, is_completed, checked_at, note)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (permit_id, check_type)
         DO UPDATE SET is_completed = EXCLUDED.is_completed, checked_at = NOW(), note = EXCLUDED.note`,
        [permit.id, check.check_type, !!check.is_completed, check.note || null]
      );
    }

    const updated = await client.query(
      `UPDATE permit_workflow
       SET permit_collected = TRUE,
           permit_collected_at = NOW(),
           collected_by = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.user.userId, permit.id]
    );

    await applyStatusWithFallback(
      client,
      applicationId,
      ['permit_collected', 'closed', 'approved'],
      req.user.userId,
      'Permit physically collected'
    );

    await client.query('COMMIT');

    res.json({
      message: 'Permit collection recorded successfully',
      permit: updated.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Collect permit error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PERMIT_COLLECT_FAILED',
        message: 'Failed to record permit collection',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } finally {
    client.release();
  }
};

/**
 * Planning counter: issued permits with application context (collection, extensions).
 * GET /api/permits/planning-queue
 */
exports.listPlanningPermitQueue = async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '100', 10)));

    const result = await pool.query(
      `SELECT
        p.id,
        p.application_id,
        p.permit_reference,
        p.permit_type,
        p.issued_at,
        p.valid_until,
        p.permit_collected,
        p.permit_collected_at,
        p.extensions_used,
        p.max_years,
        a.application_code,
        a.status AS application_status,
        a.submitted_applicant_name,
        a.submitted_email,
        a.application_type
       FROM permit_workflow p
       JOIN applications a ON a.id = p.application_id
       ORDER BY
         CASE WHEN COALESCE(p.permit_collected, FALSE) THEN 1 ELSE 0 END,
         p.issued_at DESC NULLS LAST,
         p.id DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ permits: result.rows });
  } catch (error) {
    console.error('List planning permit queue error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PERMIT_QUEUE_FETCH_FAILED',
        message: 'Failed to fetch permit queue',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  }
};

exports.getExpiringPermits = async (req, res) => {
  try {
    const days = Math.max(1, Math.min(90, parseInt(req.query.days || '30', 10)));

    const result = await pool.query(
      `SELECT
        p.id,
        p.application_id,
        p.permit_reference,
        p.valid_until,
        p.max_years,
        p.extensions_used,
        a.submitted_applicant_name,
        a.submitted_email,
        (p.valid_until::date - CURRENT_DATE) AS days_remaining
       FROM permit_workflow p
       JOIN applications a ON a.id = p.application_id
       WHERE p.permit_type = 'building'
         AND p.valid_until IS NOT NULL
         AND p.valid_until::date >= CURRENT_DATE
         AND p.valid_until::date <= CURRENT_DATE + ($1::text || ' days')::interval
       ORDER BY p.valid_until ASC`,
      [days]
    );

    res.json({
      days,
      permits: result.rows,
    });
  } catch (error) {
    console.error('Get expiring permits error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PERMIT_EXPIRING_FETCH_FAILED',
        message: 'Failed to fetch expiring permits',
        details: error.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  }
};
