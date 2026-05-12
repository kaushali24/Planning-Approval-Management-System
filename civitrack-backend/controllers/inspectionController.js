const pool = require('../config/db');
const { applyStatusTransition } = require('../utils/applicationStatusUpdater');

const canAccessApplication = async (applicationId, staffId) => {
  const result = await pool.query(
    `SELECT a.id
     FROM applications a
     WHERE a.id = $1
       AND (
         a.assigned_to = $2
         OR EXISTS (
           SELECT 1
           FROM application_assignments aa
           WHERE aa.application_id = a.id
             AND aa.assigned_to = $2
             AND aa.status IN ('pending', 'accepted', 'in_progress')
         )
       )`,
    [applicationId, staffId]
  );

  return result.rows.length > 0;
};

exports.getMyInspections = async (req, res) => {
  try {
    const staffId = req.user.userId;
    const result = await pool.query(
      `SELECT
         i.id,
         i.application_id,
         i.staff_id,
         i.scheduled_date,
         i.result,
         i.observations,
         i.recommendation,
         i.created_at
       FROM inspections i
       WHERE i.staff_id = $1
       ORDER BY i.created_at DESC, i.id DESC`,
      [staffId]
    );

    res.json({ inspections: result.rows });
  } catch (error) {
    console.error('Get my inspections error:', error);
    res.status(500).json({ error: 'Failed to fetch inspections', details: error.message });
  }
};

exports.scheduleInspectionForApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    const applicationId = Number.parseInt(req.params.applicationId, 10);
    const staffId = req.user.userId;
    const { scheduled_date } = req.body;

    const hasAccess = await canAccessApplication(applicationId, staffId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'This application is not assigned to you' });
    }

    await client.query('BEGIN');

    const appRow = await client.query(
      `SELECT id, status FROM applications WHERE id = $1 FOR UPDATE`,
      [applicationId]
    );
    if (!appRow.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }
    if (appRow.rows[0].status !== 'under_review') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Inspections can only be scheduled while the application is under technical review (under_review)',
        code: 'INVALID_STATUS_FOR_INSPECTION_SCHEDULE',
        currentStatus: appRow.rows[0].status,
      });
    }

    const existing = await client.query(
      `SELECT id
       FROM inspections
       WHERE application_id = $1 AND staff_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [applicationId, staffId]
    );

    let inspection;
    if (existing.rows.length) {
      const updateResult = await client.query(
        `UPDATE inspections
         SET scheduled_date = $1
         WHERE id = $2
         RETURNING *`,
        [scheduled_date, existing.rows[0].id]
      );
      inspection = updateResult.rows[0];
    } else {
      const insertResult = await client.query(
        `INSERT INTO inspections (application_id, staff_id, scheduled_date, result)
         VALUES ($1, $2, $3, 'pending')
         RETURNING *`,
        [applicationId, staffId, scheduled_date]
      );
      inspection = insertResult.rows[0];
    }

    await applyStatusTransition({
      client,
      applicationId,
      toStatus: 'under_review',
      changedBy: staffId,
      reason: 'Site inspection scheduled by Technical Officer',
      sourceStage: 'inspection-scheduled',
    });

    await client.query('COMMIT');

    res.json({
      message: 'Inspection schedule saved successfully',
      inspection,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Schedule inspection error:', error);
    res.status(500).json({ error: 'Failed to schedule inspection', details: error.message });
  } finally {
    client.release();
  }
};

const {
  buildDocumentStorageInfo,
  moveUploadedFile,
  removeFileIfExists,
} = require('../utils/documentStorage');

exports.submitInspectionReportForApplication = async (req, res) => {
  const client = await pool.connect();
  let persistedFiles = [];
  try {
    const applicationId = Number.parseInt(req.params.applicationId, 10);
    const staffId = req.user.userId;
    const { recommendation, observations, result, far_observed, setback_observed, plot_coverage_observed } = req.body;

    let finalObservations = observations || '';
    if (far_observed || setback_observed || plot_coverage_observed) {
      finalObservations = `
[TECHNICAL METRICS]
FAR: ${far_observed || 'N/A'}
Setbacks: ${setback_observed || 'N/A'}
Plot Coverage: ${plot_coverage_observed || 'N/A'}

[SITE FINDINGS]
${observations || 'No additional observations recorded.'}
      `.trim();
    }

    const hasAccess = await canAccessApplication(applicationId, staffId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'This application is not assigned to you' });
    }

    // Get application details for document storage
    const appResult = await client.query(
      `SELECT a.application_code, a.applicant_id, ap.applicant_ref_id
       FROM applications a
       JOIN applicants ap ON ap.id = a.applicant_id
       WHERE a.id = $1`,
      [applicationId]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ error: 'Application not found' });
    }
    const app = appResult.rows[0];

    const normalizedRecommendation = recommendation === 'not-granted' ? 'reject' : recommendation;
    const normalizedResult = result || (normalizedRecommendation === 'approve' || normalizedRecommendation === 'conditional' ? 'compliant' : 'deviation');

    await client.query('BEGIN');

    const appStatusRow = await client.query(
      `SELECT status FROM applications WHERE id = $1 FOR UPDATE`,
      [applicationId]
    );
    if (!appStatusRow.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }
    if (appStatusRow.rows[0].status !== 'under_review') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Inspection reports can only be submitted while the application is under technical review (under_review)',
        code: 'INVALID_STATUS_FOR_INSPECTION_REPORT',
        currentStatus: appStatusRow.rows[0].status,
      });
    }

    // 1. Process Files
    const files = Array.isArray(req.files)
      ? req.files
      : Object.values(req.files || {}).flat();
    for (const file of files) {
      // Determine document category
      // If the fieldname is 'report', it's the main report. Otherwise, if it starts with 'photo', it's a site photo.
      const isReport = file.fieldname === 'report' || file.mimetype === 'application/pdf';
      const documentCategory = isReport ? 'technical_report' : 'site_photo';
      const docType = isReport ? 'Technical Inspection Report' : 'Site Inspection Photo';

      const storageInfo = buildDocumentStorageInfo({
        applicantRefId: app.applicant_ref_id,
        applicationCode: app.application_code,
        documentCategory,
        filename: file.filename,
      });

      await moveUploadedFile(file.path, storageInfo.absolutePath);
      persistedFiles.push({ path: storageInfo.absolutePath });

      // Insert document record
      await client.query(
        `INSERT INTO documents (
          application_id, applicant_ref_id, application_code,
          doc_type, document_category, original_filename,
          stored_filename, storage_key, file_url, mime_type, file_size
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          applicationId, app.applicant_ref_id, app.application_code,
          docType, documentCategory, file.originalname,
          file.filename, storageInfo.relativePath, storageInfo.relativePath,
          file.mimetype, file.size
        ]
      );
    }

    // 2. Update Inspection Record
    const existing = await client.query(
      `SELECT id
       FROM inspections
       WHERE application_id = $1 AND staff_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [applicationId, staffId]
    );

    let inspection;
    if (existing.rows.length) {
      const updateResult = await client.query(
        `UPDATE inspections
         SET result = $1,
             observations = $2,
             recommendation = $3,
             scheduled_date = COALESCE(scheduled_date, NOW())
         WHERE id = $4
         RETURNING *`,
        [normalizedResult, finalObservations || null, normalizedRecommendation || null, existing.rows[0].id]
      );
      inspection = updateResult.rows[0];
    } else {
      const insertResult = await client.query(
        `INSERT INTO inspections (application_id, staff_id, scheduled_date, result, observations, recommendation)
         VALUES ($1, $2, NOW(), $3, $4, $5)
         RETURNING *`,
        [applicationId, staffId, normalizedResult, finalObservations || null, normalizedRecommendation || null]
      );
      inspection = insertResult.rows[0];
    }

    // 3. Update Application Status
    await applyStatusTransition({
      client,
      applicationId,
      toStatus: 'sw_review_pending',
      changedBy: staffId,
      reason: 'Technical Officer submitted inspection report and photos for SW review',
      sourceStage: 'to-report-submitted',
    });

    await client.query('COMMIT');

    res.json({
      message: 'Inspection report and photos submitted successfully',
      inspection,
      fileCount: files.length,
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    // Cleanup files on error
    for (const file of persistedFiles) {
      await removeFileIfExists(file.path).catch(() => {});
    }
    console.error('Submit inspection report error:', error);
    res.status(500).json({ error: 'Failed to submit inspection report', details: error.message });
  } finally {
    client.release();
  }
};

exports.placeHoldForApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    const applicationId = Number.parseInt(req.params.applicationId, 10);
    const staffId = req.user.userId;
    const { hold_type, reason, clearance_authority, complaint_source, resolution_steps } = req.body;
    // Canonical explicit status is 2-way: complaint vs clearance.
    // Anything that is not an external clearance hold is treated as a complaint-style hold.
    const holdStatus = hold_type === 'clearance'
      ? 'hold_clearance'
      : 'hold_complaint';

    const combinedReason = hold_type === 'complaint' && (complaint_source || resolution_steps)
      ? `Source: ${complaint_source || 'Unknown'}\nNature: ${reason}\nResolution Step: ${resolution_steps || 'Pending investigation'}`
      : reason;

    const hasAccess = await canAccessApplication(applicationId, staffId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'This application is not assigned to you' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE application_holds
       SET hold_status = 'resolved',
           resolved_by = $1,
           resolved_at = NOW(),
           resolution_note = COALESCE(resolution_note, 'Superseded by a newer hold action')
       WHERE application_id = $2
         AND hold_status = 'active'`,
      [staffId, applicationId]
    );

    const holdResult = await client.query(
      `INSERT INTO application_holds (
         application_id,
         hold_type,
         hold_status,
         reason,
         clearance_authority,
         requested_by,
         requested_at
       )
       VALUES ($1, $2, 'active', $3, $4, $5, NOW())
       RETURNING *`,
      [applicationId, hold_type, combinedReason, clearance_authority || null, staffId]
    );

    await applyStatusTransition({
      client,
      applicationId,
      toStatus: holdStatus,
      changedBy: staffId,
      reason: `TO hold (${hold_type}): ${reason}`,
      sourceStage: 'to-hold',
    });

    await client.query('COMMIT');

    res.json({
      message: 'Application hold recorded successfully',
      hold: holdResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Place hold error:', error);
    res.status(500).json({ error: 'Failed to place hold', details: error.message });
  } finally {
    client.release();
  }
};

exports.resolveHoldForApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    const applicationId = Number.parseInt(req.params.applicationId, 10);
    const staffId = req.user.userId;
    const { resolution_note } = req.body;

    const hasAccess = await canAccessApplication(applicationId, staffId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'This application is not assigned to you' });
    }

    await client.query('BEGIN');

    const activeHoldResult = await client.query(
      `SELECT id, hold_type, requested_at
       FROM application_holds
       WHERE application_id = $1
         AND hold_status = 'active'
       ORDER BY requested_at DESC, id DESC
       LIMIT 1`,
      [applicationId]
    );

    if (!activeHoldResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No active hold found for this application' });
    }

    const priorStatusResult = await client.query(
      `SELECT ash.status
       FROM application_status_history ash
       WHERE ash.application_id = $1
         AND ash.changed_at < $2
         AND ash.status NOT IN ('hold_complaint', 'hold_clearance')
       ORDER BY ash.changed_at DESC, ash.id DESC
       LIMIT 1`,
      [applicationId, activeHoldResult.rows[0].requested_at]
    );
    const restoredStatus = priorStatusResult.rows[0]?.status || 'under_review';

    const resolvedResult = await client.query(
      `UPDATE application_holds
       SET hold_status = 'resolved',
           resolved_by = $1,
           resolved_at = NOW(),
           resolution_note = $2
       WHERE id = $3
       RETURNING *`,
      [staffId, resolution_note, activeHoldResult.rows[0].id]
    );

    await applyStatusTransition({
      client,
      applicationId,
      toStatus: restoredStatus,
      changedBy: staffId,
      reason: `TO resolved hold: ${resolution_note || 'No note provided'}`,
      sourceStage: 'to-hold-resolved',
    });

    await client.query('COMMIT');

    res.json({
      message: 'Application hold resolved successfully',
      hold: resolvedResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Resolve hold error:', error);
    res.status(500).json({ error: 'Failed to resolve hold', details: error.message });
  } finally {
    client.release();
  }
};

exports.declineAssignmentForApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    const applicationId = Number.parseInt(req.params.applicationId, 10);
    const staffId = req.user.userId;
    const { reason } = req.body;

    const hasAccess = await canAccessApplication(applicationId, staffId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'This application is not assigned to you' });
    }

    await client.query('BEGIN');

    const assignmentResult = await client.query(
      `UPDATE application_assignments
       SET status = 'reassigned',
           completed_at = NOW(),
           rejection_reason = $1,
           notes = CASE
             WHEN notes IS NULL OR notes = '' THEN $2
             ELSE notes || E'\n' || $2
           END
       WHERE application_id = $3
         AND assigned_to = $4
         AND status IN ('pending', 'accepted', 'in_progress')
       RETURNING id`,
      [reason, `TO declined assignment: ${reason}`, applicationId, staffId]
    );

    if (!assignmentResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No active assignment found to decline' });
    }

    await client.query(
      `UPDATE applications
       SET assigned_to = NULL
       WHERE id = $1`,
      [applicationId]
    );

    await applyStatusTransition({
      client,
      applicationId,
      toStatus: 'submitted',
      changedBy: staffId,
      reason: `TO declined assignment: ${reason}`,
      sourceStage: 'to-assignment-declined',
    });

    await client.query('COMMIT');

    res.json({
      message: 'Assignment declined and returned for reassignment',
      applicationId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Decline assignment error:', error);
    res.status(500).json({ error: 'Failed to decline assignment', details: error.message });
  } finally {
    client.release();
  }
};

exports.referBackToTechnicalOfficerForApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    const applicationId = Number.parseInt(req.params.applicationId, 10);
    const staffId = req.user.userId;
    const { reason, referral_type } = req.body;

    await client.query('BEGIN');

    const appResult = await client.query(
      `SELECT id
       FROM applications
       WHERE id = $1`,
      [applicationId]
    );

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    await applyStatusTransition({
      client,
      applicationId,
      toStatus: 'under_review',
      changedBy: staffId,
      reason: `SW referred back to TO (${referral_type}): ${reason}`,
      sourceStage: 'sw-referred-back',
    });

    await client.query(
      `UPDATE application_assignments
       SET status = 'in_progress',
           notes = CASE
             WHEN notes IS NULL OR notes = '' THEN $1
             ELSE notes || E'\n' || $1
           END
       WHERE application_id = $2
         AND status IN ('pending', 'accepted', 'in_progress')`,
      [`SW refer-back (${referral_type}): ${reason}`, applicationId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Application referred back to Technical Officer successfully',
      applicationId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('SW refer-back error:', error);
    res.status(500).json({ error: 'Failed to refer back to Technical Officer', details: error.message });
  } finally {
    client.release();
  }
};
