const pool = require('../config/db');

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

    await client.query(
      `UPDATE applications
       SET status = 'under_review', last_updated = NOW()
       WHERE id = $1`,
      [applicationId]
    );

    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'under_review', NOW(), $2, $3, 'inspection-scheduled')`,
      [applicationId, staffId, 'Site inspection scheduled by Technical Officer']
    );

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

exports.submitInspectionReportForApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    const applicationId = Number.parseInt(req.params.applicationId, 10);
    const staffId = req.user.userId;
    const { recommendation, observations, result } = req.body;

    const hasAccess = await canAccessApplication(applicationId, staffId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'This application is not assigned to you' });
    }

    const normalizedRecommendation = recommendation === 'not-granted' ? 'reject' : recommendation;
    const normalizedResult = result || (normalizedRecommendation === 'approve' || normalizedRecommendation === 'conditional' ? 'compliant' : 'deviation');

    await client.query('BEGIN');

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
        [normalizedResult, observations || null, normalizedRecommendation || null, existing.rows[0].id]
      );
      inspection = updateResult.rows[0];
    } else {
      const insertResult = await client.query(
        `INSERT INTO inspections (application_id, staff_id, scheduled_date, result, observations, recommendation)
         VALUES ($1, $2, NOW(), $3, $4, $5)
         RETURNING *`,
        [applicationId, staffId, normalizedResult, observations || null, normalizedRecommendation || null]
      );
      inspection = insertResult.rows[0];
    }

    await client.query(
      `UPDATE applications
       SET status = 'committee_review', last_updated = NOW()
       WHERE id = $1`,
      [applicationId]
    );

    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'committee_review', NOW(), $2, $3, 'to-report-submitted')`,
      [applicationId, staffId, 'Technical Officer submitted inspection report']
    );

    await client.query('COMMIT');

    res.json({
      message: 'Inspection report submitted successfully',
      inspection,
    });
  } catch (error) {
    await client.query('ROLLBACK');
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
    const { hold_type, reason, clearance_authority } = req.body;

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
      [applicationId, hold_type, reason, clearance_authority || null, staffId]
    );

    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'under_review', NOW(), $2, $3, 'to-hold')`,
      [applicationId, staffId, `TO hold (${hold_type}): ${reason}`]
    );

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
      `SELECT id
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

    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'under_review', NOW(), $2, $3, 'to-hold-resolved')`,
      [applicationId, staffId, `TO resolved hold: ${resolution_note}`]
    );

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
       SET assigned_to = NULL,
           status = 'submitted',
           last_updated = NOW()
       WHERE id = $1`,
      [applicationId]
    );

    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'submitted', NOW(), $2, $3, 'to-assignment-declined')`,
      [applicationId, staffId, `TO declined assignment: ${reason}`]
    );

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

    await client.query(
      `UPDATE applications
       SET status = 'under_review',
           last_updated = NOW()
       WHERE id = $1`,
      [applicationId]
    );

    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'under_review', NOW(), $2, $3, 'sw-referred-back')`,
      [applicationId, staffId, `SW referred back to TO (${referral_type}): ${reason}`]
    );

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
