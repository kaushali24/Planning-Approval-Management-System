/**
 * simpleDashboardController.js
 *
 * Powers the simplified CiviTrack workflow:
 *   submitted → under_review → correction → sw_review_pending → endorsed → approved/rejected → closed
 *
 * These endpoints are intentionally minimal and do NOT replace the existing
 * applicationController.js — they operate in parallel via /api/simple/* routes.
 */

const pool = require('../config/db');
const {
  getAllowedNextStatusesForWorkflow,
  validateStatusTransition,
  getWorkflowConfig,
  normalizeString,
} = require('../utils/applicationValidation');
const {
  sendApplicationToSWNotification,
  sendApplicationToCommitteeNotification,
  sendApplicationReferralNotificationToTO,
  sendApplicantInspectionScheduledEmail,
  sendApplicantApprovalEmail,
  sendApplicantCorrectionsEmail,
} = require('../utils/emailService');
const { assertNoActiveHold } = require('../utils/holdGate');
const { applyStatusTransition } = require('../utils/applicationStatusUpdater');

const safeSendEmail = async (label, sendFn) => {
  try {
    await sendFn();
  } catch (error) {
    console.error(`[simpleDashboard] ${label} email failed:`, error?.message || error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/simple/dashboard
//
// Returns a role-filtered list of applications + a status count summary.
// Each role sees only the slice of the pipeline relevant to them.
// ─────────────────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const { role, userId } = req.user;

    let whereClause = '';
    const params = [];

    switch (role) {
      case 'planning_officer':
        // PO owns: submitted, verified, payment_pending, under_review, correction
        whereClause = `WHERE status IN ('submitted', 'verified', 'payment_pending', 'under_review', 'correction')`;
        break;

      case 'superintendent':
        // SW owns: sw_review_pending, endorsed — plus correction/under_review for context
        whereClause = `WHERE status IN ('sw_review_pending', 'endorsed', 'under_review', 'correction')`;
        break;

      case 'committee':
        // Committee owns: endorsed → decision
        whereClause = `WHERE status IN ('endorsed', 'approved_awaiting_agreement', 'approved', 'rejected')`;
        break;

      case 'technical_officer':
        // TO owns: under_review/hold applications assigned specifically to them
        params.push(userId);
        whereClause = `WHERE status IN ('under_review', 'hold_complaint', 'hold_clearance') AND assigned_to_staff_id = $1`;
        break;

      case 'admin':
        whereClause = `WHERE status != 'draft'`;
        break;

      default:
        // Applicant: own applications only, all non-draft statuses
        params.push(userId);
        whereClause = `WHERE applicant_id = $1 AND status != 'draft'`;
        break;
    }

    const result = await pool.query(
      `SELECT * FROM v_simple_applications
       ${whereClause}
       ORDER BY last_updated DESC
       LIMIT 100`,
      params
    );

    // Build status counts for the stats row
    const counts = {};
    for (const row of result.rows) {
      counts[row.status] = (counts[row.status] || 0) + 1;
    }

    return res.json({
      applications: result.rows,
      counts,
      total: result.rows.length,
    });
  } catch (err) {
    console.error('[simpleDashboard] getDashboard error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard', details: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/simple/applications/:id
//
// Returns full application detail including documents and full status history.
// Accessible by any authenticated user (applicant sees only own apps via middleware).
// ─────────────────────────────────────────────────────────────────────────────
exports.getApplicationDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, userId } = req.user;

    // Base query from the view
    const appResult = await pool.query(
      `SELECT * FROM v_simple_applications WHERE id = $1`,
      [id]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = appResult.rows[0];

    // Applicants can only view their own
    if (role === 'applicant' && String(app.applicant_id) !== String(userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch documents
    const docsResult = await pool.query(
      `SELECT
         id,
         doc_type,
         document_category,
         file_url,
         original_filename,
         stored_filename,
         mime_type,
         file_size,
         uploaded_at
       FROM documents
       WHERE application_id = $1
       ORDER BY uploaded_at DESC`,
      [id]
    );

    // Fetch full status history (newest first)
    const historyResult = await pool.query(
      `SELECT
         ash.id,
         ash.status,
         ash.changed_at,
         ash.reason,
         ash.source_stage,
         s.full_name AS changed_by_name,
         s.role      AS changed_by_role
       FROM application_status_history ash
       LEFT JOIN staff_accounts s ON s.id = ash.changed_by
       WHERE ash.application_id = $1
       ORDER BY ash.changed_at DESC`,
      [id]
    );

    const assignmentsResult = await pool.query(
      `SELECT
         aa.id,
         aa.assigned_to,
         aa.assigned_by,
         aa.status,
         aa.notes,
         aa.assigned_at,
         assignee.full_name AS assigned_to_name,
         assigner.full_name AS assigned_by_name
       FROM application_assignments aa
       LEFT JOIN staff_accounts assignee ON assignee.id = aa.assigned_to
       LEFT JOIN staff_accounts assigner ON assigner.id = aa.assigned_by
       WHERE aa.application_id = $1
       ORDER BY aa.assigned_at DESC, aa.id DESC`,
      [id]
    );

    const inspectionsResult = await pool.query(
      `SELECT
         i.id,
         i.staff_id,
         i.scheduled_date,
         i.result,
         i.observations,
         i.recommendation,
         i.created_at,
         s.full_name AS staff_name
       FROM inspections i
       LEFT JOIN staff_accounts s ON s.id = i.staff_id
       WHERE i.application_id = $1
       ORDER BY i.created_at DESC, i.id DESC`,
      [id]
    );

    const holdsResult = await pool.query(
      `SELECT
         h.id,
         h.hold_type,
         h.hold_status,
         h.reason,
         h.clearance_authority,
         h.requested_by,
         h.requested_at,
         h.resolved_by,
         h.resolved_at,
         h.resolution_note,
         requester.full_name AS requested_by_name,
         resolver.full_name AS resolved_by_name
       FROM application_holds h
       LEFT JOIN staff_accounts requester ON requester.id = h.requested_by
       LEFT JOIN staff_accounts resolver ON resolver.id = h.resolved_by
       WHERE h.application_id = $1
       ORDER BY h.requested_at DESC, h.id DESC`,
      [id]
    );

    const activeHold = holdsResult.rows.find((h) => h.hold_status === 'active') || null;

    return res.json({
      ...app,
      documents: docsResult.rows,
      history: historyResult.rows,
      assignments: assignmentsResult.rows,
      inspections: inspectionsResult.rows,
      holds: holdsResult.rows,
      activeHold,
    });
  } catch (err) {
    console.error('[simpleDashboard] getApplicationDetail error:', err);
    return res.status(500).json({ error: 'Failed to fetch application', details: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/simple/applications/:id/advance
//
// Moves an application to the next status.
// Body: { status: string, notes?: string }
//
// Validates:
//   1. Role is allowed to set that status
//   2. Workflow transition is valid for current status
//   3. Notes are present when the status requires them
// ─────────────────────────────────────────────────────────────────────────────
exports.advanceApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status: toStatus, notes, decisionMeta } = req.body;
    const { role, userId } = req.user;

    // ── 1. Validate input ──────────────────────────────────────────────────
    if (!toStatus || typeof toStatus !== 'string') {
      return res.status(400).json({ error: '`status` field is required in request body' });
    }

    const trimmedNotes = (notes || '').trim();

    // ── 2. Check role permission ───────────────────────────────────────────
    const allowedForRole = getWorkflowConfig('simple').rolePermissions[role] || [];
    if (!allowedForRole.includes(toStatus)) {
      return res.status(403).json({
        error: `Your role (${role}) cannot set status to '${toStatus}'`,
        allowedForRole,
      });
    }

    // ── 3. Notes are required for certain statuses ─────────────────────────
    if (getWorkflowConfig('simple').statusesRequiringReason.includes(toStatus) && trimmedNotes.length < 5) {
      return res.status(400).json({
        error: `A note of at least 5 characters is required when setting status to '${toStatus}'`,
      });
    }

    await client.query('BEGIN');

    // ── 4. Lock & fetch current status ────────────────────────────────────
    const appResult = await client.query(
      `SELECT id, status, applicant_id, application_code
       FROM applications
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = appResult.rows[0];
    const fromStatus = app.status;

    const isCommitteeApproval = fromStatus === 'endorsed' && toStatus === 'approved' && ['committee', 'admin'].includes(role);
    if (isCommitteeApproval) {
      const normalizedDecisionMeta = decisionMeta && typeof decisionMeta === 'object' ? decisionMeta : {};
      const requiredFields = ['decisionNo', 'meetingDate', 'decisionReason'];
      const missingFields = requiredFields.filter((field) => !String(normalizedDecisionMeta[field] || '').trim());
      if (missingFields.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Committee approval requires complete decision metadata',
          code: 'COMMITTEE_DECISION_METADATA_REQUIRED',
          missingFields,
          requiredFields,
        });
      }
    }

    const effectiveToStatus = isCommitteeApproval ? 'approved_awaiting_agreement' : toStatus;
    const transitionReason = isCommitteeApproval
      ? `${trimmedNotes || ''}${trimmedNotes ? ' | ' : ''}Decision No: ${decisionMeta.decisionNo}; Meeting: ${decisionMeta.meetingDate}; Reason: ${decisionMeta.decisionReason}`.trim()
      : (trimmedNotes || null);

    try {
      await assertNoActiveHold({
        client,
        applicationId: id,
        userRole: role,
        currentStatus: fromStatus,
        requestedStatus: effectiveToStatus,
      });
    } catch (e) {
      if (e?.httpStatus === 409 && e?.payload?.code === 'APPLICATION_ON_HOLD') {
        await client.query('ROLLBACK');
        return res.status(409).json(e.payload);
      }
      throw e;
    }

    // ── 5. Validate workflow transition ───────────────────────────────────
    const transitionCheck = validateStatusTransition({
      fromStatus,
      toStatus: effectiveToStatus,
      userRole: role,
      workflow: 'simple',
    });
    if (!transitionCheck.allowed) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: transitionCheck.reason,
        currentStatus: fromStatus,
        allowedNext: getAllowedNextStatusesForWorkflow({
          fromStatus,
          userRole: role,
          workflow: 'simple',
        }),
      });
    }

    // ── 6. Apply status update + history (single shared helper) ───────────
    await applyStatusTransition({
      client,
      applicationId: id,
      toStatus: effectiveToStatus,
      changedBy: userId,
      reason: transitionReason,
      sourceStage: `${fromStatus}->${effectiveToStatus}`,
    });

    await client.query('COMMIT');

    const applicantContact = await pool.query(
      `SELECT full_name, email
       FROM applicants
       WHERE id = $1`,
      [app.applicant_id]
    );

    if (effectiveToStatus === 'approved_awaiting_agreement' && applicantContact.rows.length && applicantContact.rows[0].email) {
      const applicant = applicantContact.rows[0];
      await safeSendEmail('approval', () =>
        sendApplicantApprovalEmail(applicant.email, applicant.full_name || 'Applicant', app.application_code, trimmedNotes || '')
      );
    } else if (effectiveToStatus === 'endorsed') {
      const committeeContact = await pool.query(
        `SELECT full_name, email
         FROM staff_accounts
         WHERE role = 'committee' AND is_active = TRUE
         ORDER BY id ASC
         LIMIT 1`
      );
      const swContact = await pool.query(
        `SELECT full_name
         FROM staff_accounts
         WHERE id = $1`,
        [userId]
      );
      if (committeeContact.rows.length && committeeContact.rows[0].email) {
        await safeSendEmail('to-committee-review', () =>
          sendApplicationToCommitteeNotification(
            committeeContact.rows[0].email,
            committeeContact.rows[0].full_name || 'Committee Member',
            applicantContact.rows[0]?.full_name || 'Applicant',
            app.application_code,
            swContact.rows[0]?.full_name || 'Superintendent',
            trimmedNotes || ''
          )
        );
      }
    } else if (fromStatus === 'sw_review_pending' && effectiveToStatus === 'under_review') {
      const toContact = await pool.query(
        `SELECT s.full_name, s.email
         FROM application_assignments aa
         JOIN staff_accounts s ON s.id = aa.assigned_to
         WHERE aa.application_id = $1
           AND aa.status IN ('pending', 'accepted', 'in_progress')
         ORDER BY aa.assigned_at DESC, aa.id DESC
         LIMIT 1`,
        [id]
      );
      const swContact = await pool.query(
        `SELECT full_name
         FROM staff_accounts
         WHERE id = $1`,
        [userId]
      );
      if (toContact.rows.length && toContact.rows[0].email) {
        await safeSendEmail('sw-referral-to-to', () =>
          sendApplicationReferralNotificationToTO(
            toContact.rows[0].email,
            toContact.rows[0].full_name || 'Technical Officer',
            applicantContact.rows[0]?.full_name || 'Applicant',
            app.application_code,
            swContact.rows[0]?.full_name || 'Superintendent',
            trimmedNotes || 'Please revise the report and resubmit.',
            'report-correction'
          )
        );
      }
    } else if (effectiveToStatus === 'correction' && applicantContact.rows.length && applicantContact.rows[0].email) {
      const applicant = applicantContact.rows[0];
      await safeSendEmail('correction-request', () =>
        sendApplicantCorrectionsEmail(
          applicant.email,
          applicant.full_name || 'Applicant',
          app.application_code,
          trimmedNotes || 'Please review correction comments in your dashboard.'
        )
      );
    }

    return res.json({
      message: 'Application status updated successfully',
      applicationId: id,
      applicationCode: app.application_code,
      from: fromStatus,
      to: effectiveToStatus,
      requestedTo: toStatus,
      notes: trimmedNotes || null,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch((rbErr) => console.error('Rollback error:', rbErr));
    console.error('[simpleDashboard] advanceApplication error:', err);
    return res.status(500).json({ error: 'Failed to update status', details: err.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/simple/applications/:id/inspection-report   (multipart/form-data)
//
// SW submits site inspection report + optional file attachments.
// On success the application is automatically moved to 'endorsed'.
//
// Body fields (form-data):
//   observations   string  — site findings (required, min 10 chars)
//   recommendation string  — 'approve' | 'conditional' | 'reject'
//   result         string  — 'compliant' | 'deviation' | 'pending'  (optional)
//   notes          string  — endorsement note (optional)
// Files (optional, up to 5):
//   report         PDF     — formal technical report document
//   photos         images  — site inspection photos
// ─────────────────────────────────────────────────────────────────────────────
const {
  buildDocumentStorageInfo,
  moveUploadedFile,
  removeFileIfExists,
} = require('../utils/documentStorage');

exports.submitInspectionReport = async (req, res) => {
  const client = await pool.connect();
  const persistedFiles = [];

  try {
    const { id } = req.params;
    const { role, userId } = req.user;
    const { observations, recommendation, result, notes } = req.body;

    // ── Role guard ────────────────────────────────────────────────────────
    if (!['superintendent', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only Superintendent can submit inspection reports' });
    }

    // ── Input validation ──────────────────────────────────────────────────
    if (!observations || String(observations).trim().length < 10) {
      return res.status(400).json({ error: 'observations is required (minimum 10 characters)' });
    }
    const validRecs = ['approve', 'conditional', 'reject'];
    if (!recommendation || !validRecs.includes(recommendation)) {
      return res.status(400).json({
        error: `recommendation must be one of: ${validRecs.join(', ')}`,
      });
    }

    await client.query('BEGIN');

    // ── Lock & verify application ─────────────────────────────────────────
    const appResult = await client.query(
      `SELECT a.id, a.status, a.application_code, a.applicant_id,
              ap.applicant_ref_id
       FROM applications a
       JOIN applicants ap ON ap.id = a.applicant_id
       WHERE a.id = $1
       FOR UPDATE`,
      [id]
    );

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = appResult.rows[0];

    if (app.status !== 'sw_review_pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Inspection report can only be submitted when status is 'sw_review_pending'. Current: '${app.status}'`,
      });
    }

    // ── Determine result from recommendation if not provided ──────────────
    const normalizedResult =
      result ||
      (recommendation === 'approve' || recommendation === 'conditional' ? 'compliant' : 'deviation');

    const trimmedObs = String(observations).trim();
    const trimmedNotes = (notes || '').trim();

    // ── Process file uploads ──────────────────────────────────────────────
    const files = req.files || [];
    for (const file of files) {
      const isReport =
        file.fieldname === 'report' || (file.mimetype && file.mimetype.includes('pdf'));
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

      await client.query(
        `INSERT INTO documents (
           application_id, applicant_ref_id, application_code,
           doc_type, document_category, original_filename,
           stored_filename, storage_key, file_url, mime_type, file_size
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id, app.applicant_ref_id, app.application_code,
          docType, documentCategory, file.originalname,
          file.filename, storageInfo.relativePath, storageInfo.relativePath,
          file.mimetype, file.size,
        ]
      );
    }

    // ── Upsert inspection record (SW is both inspector + endorser) ────────
    const existingInspection = await client.query(
      `SELECT id FROM inspections
       WHERE application_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );

    let inspection;
    if (existingInspection.rows.length) {
      const upd = await client.query(
        `UPDATE inspections
         SET staff_id      = $1,
             result        = $2,
             observations  = $3,
             recommendation = $4,
             scheduled_date = COALESCE(scheduled_date, NOW())
         WHERE id = $5
         RETURNING *`,
        [userId, normalizedResult, trimmedObs, recommendation, existingInspection.rows[0].id]
      );
      inspection = upd.rows[0];
    } else {
      const ins = await client.query(
        `INSERT INTO inspections (application_id, staff_id, scheduled_date, result, observations, recommendation)
         VALUES ($1, $2, NOW(), $3, $4, $5)
         RETURNING *`,
        [id, userId, normalizedResult, trimmedObs, recommendation]
      );
      inspection = ins.rows[0];
    }

    const historyNote = trimmedNotes
      ? `Site inspection completed. Recommendation: ${recommendation}. ${trimmedNotes}`
      : `Site inspection completed by SW. Recommendation: ${recommendation}.`;

    await applyStatusTransition({
      client,
      applicationId: id,
      toStatus: 'endorsed',
      changedBy: userId,
      reason: historyNote,
      sourceStage: 'sw-inspection-report',
    });

    await client.query('COMMIT');

    return res.json({
      message: 'Inspection report submitted. Application endorsed for committee.',
      inspection,
      fileCount: files.length,
      from: 'sw_review_pending',
      to: 'endorsed',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Clean up any files that were moved before the error
    for (const f of persistedFiles) {
      await removeFileIfExists(f.path).catch(() => {});
    }
    console.error('[simpleDashboard] submitInspectionReport error:', err);
    return res.status(500).json({ error: 'Failed to submit inspection report', details: err.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/simple/staff/to-list
// Return list of Technical Officers and their current active workload count.
// Used by PO to assign applications.
// ─────────────────────────────────────────────────────────────────────────────
exports.getToList = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id, s.full_name, s.email,
        COUNT(aa.id) FILTER (WHERE aa.status IN ('pending', 'accepted', 'in_progress')) AS load_count
      FROM staff_accounts s
      LEFT JOIN application_assignments aa ON aa.assigned_to = s.id
      WHERE s.role = 'technical_officer' AND s.is_active = TRUE
      GROUP BY s.id
      ORDER BY load_count ASC, s.full_name ASC
    `);
    
    return res.json({ technical_officers: result.rows });
  } catch (err) {
    console.error('[simpleDashboard] getToList error:', err);
    return res.status(500).json({ error: 'Failed to fetch TO list', details: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/simple/applications/:id/assign-to
// As a PO, assign an application to a TO. 
// Uses existing application_assignments table.
// Body: { toStaffId: number }
// ─────────────────────────────────────────────────────────────────────────────
exports.assignTo = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { toStaffId } = req.body;
    const { role, userId } = req.user;

    if (!['planning_officer', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only PO can assign to TO' });
    }

    if (!toStaffId) return res.status(400).json({ error: 'toStaffId is required' });

    await client.query('BEGIN');

    // Make sure TO exists
    const toCheck = await client.query(`SELECT id, full_name FROM staff_accounts WHERE id = $1 AND role = 'technical_officer'`, [toStaffId]);
    if (!toCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Technical Officer not found' });
    }
    const toName = toCheck.rows[0].full_name;

    // Check application status
    const appResult = await client.query(`SELECT id, status FROM applications WHERE id = $1 FOR UPDATE`, [id]);
    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    // Usually app must be under_review to assign TO
    if (appResult.rows[0].status !== 'under_review') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Application must be under_review to assign to TO' });
    }

    // Inactivate old assignments
    await client.query(`
      UPDATE application_assignments 
      SET status = 'reassigned', completed_at = NOW() 
      WHERE application_id = $1 AND status IN ('pending', 'accepted', 'in_progress')
    `, [id]);

    // Create new assignment
    await client.query(`
      INSERT INTO application_assignments (application_id, assigned_to, assigned_by, status, notes)
      VALUES ($1, $2, $3, 'in_progress', 'Assigned by PO via simple workflow')
    `, [id, toStaffId, userId]);

    // Add status history record for transparency, though status doesn't change
    await client.query(`
      INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
      VALUES ($1, 'under_review', NOW(), $2, $3, 'po-assigned-to')
    `, [id, userId, `Assigned to Technical Officer: ${toName}`]);

    // Update last_updated
    await client.query(`UPDATE applications SET last_updated = NOW() WHERE id = $1`, [id]);

    await client.query('COMMIT');

    return res.json({ message: `Successfully assigned to TO: ${toName}` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[simpleDashboard] assignTo error:', err);
    return res.status(500).json({ error: 'Failed to assign TO', details: err.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/simple/applications/:id/schedule-inspection
// TO schedules the inspection date/time.
// Body: { scheduled_date: ISO String }
// ─────────────────────────────────────────────────────────────────────────────
exports.scheduleInspection = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { scheduled_date } = req.body;
    const { role, userId } = req.user;

    if (!['technical_officer', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only TO can schedule an inspection' });
    }
    if (!scheduled_date) {
      return res.status(400).json({ error: 'scheduled_date is required' });
    }

    await client.query('BEGIN');

    // Check access
    const appResult = await client.query(`
      SELECT a.id, a.status, a.application_code
      FROM applications a
      JOIN application_assignments aa ON aa.application_id = a.id
      WHERE a.id = $1 AND aa.assigned_to = $2 AND aa.status IN ('pending', 'accepted', 'in_progress')
      FOR UPDATE
    `, [id, userId]);

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied: Application not assigned to you, or not found' });
    }

    // Upsert into inspections
    const existing = await client.query(`SELECT id FROM inspections WHERE application_id = $1 AND staff_id = $2 LIMIT 1`, [id, userId]);
    
    if (existing.rows.length) {
      await client.query(`UPDATE inspections SET scheduled_date = $1 WHERE id = $2`, [scheduled_date, existing.rows[0].id]);
    } else {
      await client.query(`
        INSERT INTO inspections (application_id, staff_id, scheduled_date, result) 
        VALUES ($1, $2, $3, 'pending')
      `, [id, userId, scheduled_date]);
    }

    await client.query(`
      INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
      VALUES ($1, 'under_review', NOW(), $2, $3, 'to-scheduled-inspection')
    `, [id, userId, `Inspection Scheduled for: ${new Date(scheduled_date).toLocaleString()}`]);

    await client.query(`UPDATE applications SET last_updated = NOW() WHERE id = $1`, [id]);

    await client.query('COMMIT');

    const applicantContact = await pool.query(
      `SELECT ap.full_name, ap.email, s.full_name AS technical_officer_name
       FROM applications a
       JOIN applicants ap ON ap.id = a.applicant_id
       LEFT JOIN staff_accounts s ON s.id = $2
       WHERE a.id = $1`,
      [id, userId]
    );
    if (applicantContact.rows.length && applicantContact.rows[0].email) {
      const row = applicantContact.rows[0];
      await safeSendEmail('inspection-scheduled', () =>
        sendApplicantInspectionScheduledEmail(
          row.email,
          row.full_name || 'Applicant',
          appResult.rows[0].application_code || id,
          scheduled_date,
          row.technical_officer_name || 'Technical Officer',
          ''
        )
      );
    }

    return res.json({ message: 'Inspection scheduled successfully', scheduled_date });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[simpleDashboard] scheduleInspection error:', err);
    return res.status(500).json({ error: 'Failed to schedule inspection', details: err.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/simple/applications/:id/submit-to-report
// TO submits inspection report & files -> Application moves to sw_review_pending
// Body: { observations, recommendation, notes }
// Files: report pdf, photos
// ─────────────────────────────────────────────────────────────────────────────
exports.submitTOReport = async (req, res) => {
  const client = await pool.connect();
  const persistedFiles = [];

  try {
    const { id } = req.params;
    const { role, userId } = req.user;
    const { observations, recommendation, notes } = req.body;

    if (!['technical_officer', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only TO can submit this inspection report' });
    }

    if (!observations || String(observations).trim().length < 10) {
      return res.status(400).json({ error: 'observations is required (minimum 10 characters)' });
    }

    const validRecs = ['approve', 'conditional', 'reject'];
    if (!recommendation || !validRecs.includes(recommendation)) {
      return res.status(400).json({ error: `recommendation must be one of: ${validRecs.join(', ')}` });
    }

    await client.query('BEGIN');

    // Check app & assignment
    const appResult = await client.query(`
      SELECT a.id, a.status, a.application_code, a.applicant_id, ap.applicant_ref_id
      FROM applications a
      JOIN applicants ap ON ap.id = a.applicant_id
      JOIN application_assignments aa ON aa.application_id = a.id
      WHERE a.id = $1 AND aa.assigned_to = $2 AND aa.status IN ('pending', 'accepted', 'in_progress')
      FOR UPDATE
    `, [id, userId]);

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Application not assigned to you, or not found' });
    }

    const app = appResult.rows[0];

    if (app.status !== 'under_review') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Application must be under_review to submit report. Current: '${app.status}'` });
    }

    const normalizedResult = (recommendation === 'approve' || recommendation === 'conditional') ? 'compliant' : 'deviation';
    const trimmedObs = String(observations).trim();
    const trimmedNotes = (notes || '').trim();

    // Process file uploads
    const files = req.files || [];
    for (const file of files) {
      const isReport = file.fieldname === 'report' || (file.mimetype && file.mimetype.includes('pdf'));
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

      await client.query(`
        INSERT INTO documents (
          application_id, applicant_ref_id, application_code, doc_type, document_category, 
          original_filename, stored_filename, storage_key, file_url, mime_type, file_size
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [
        id, app.applicant_ref_id, app.application_code, docType, documentCategory, 
        file.originalname, file.filename, storageInfo.relativePath, storageInfo.relativePath, 
        file.mimetype, file.size
      ]);
    }

    // Upsert inspection record
    const existingInspection = await client.query(`SELECT id FROM inspections WHERE application_id = $1 AND staff_id = $2 LIMIT 1`, [id, userId]);

    let inspection;
    if (existingInspection.rows.length) {
      const upd = await client.query(`
        UPDATE inspections
        SET result = $1, observations = $2, recommendation = $3, scheduled_date = COALESCE(scheduled_date, NOW())
        WHERE id = $4 RETURNING *
      `, [normalizedResult, trimmedObs, recommendation, existingInspection.rows[0].id]);
      inspection = upd.rows[0];
    } else {
      const ins = await client.query(`
        INSERT INTO inspections (application_id, staff_id, scheduled_date, result, observations, recommendation)
        VALUES ($1, $2, NOW(), $3, $4, $5) RETURNING *
      `, [id, userId, normalizedResult, trimmedObs, recommendation]);
      inspection = ins.rows[0];
    }

    const historyNote = trimmedNotes
      ? `TO submitted report. Rec: ${recommendation}. ${trimmedNotes}`
      : `TO submitted inspection report. Rec: ${recommendation}.`;

    await applyStatusTransition({
      client,
      applicationId: id,
      toStatus: 'sw_review_pending',
      changedBy: userId,
      reason: historyNote,
      sourceStage: 'to-inspection-report',
    });

    await client.query('COMMIT');

    const swContact = await pool.query(
      `SELECT s.full_name, s.email
       FROM staff_accounts s
       WHERE s.role = 'superintendent' AND s.is_active = TRUE
       ORDER BY s.id ASC
       LIMIT 1`
    );
    const applicantContact = await pool.query(
      `SELECT full_name
       FROM applicants
       WHERE id = $1`,
      [app.applicant_id]
    );
    const toProfileResult = await pool.query(
      `SELECT full_name
       FROM staff_accounts
       WHERE id = $1`,
      [userId]
    );

    if (swContact.rows.length && swContact.rows[0].email) {
      await safeSendEmail('to-sw-review', () =>
        sendApplicationToSWNotification(
          swContact.rows[0].email,
          swContact.rows[0].full_name || 'Superintendent',
          applicantContact.rows[0]?.full_name || 'Applicant',
          app.application_code,
          toProfileResult.rows[0]?.full_name || 'Technical Officer',
          recommendation
        )
      );
    }

    return res.json({
      message: 'Inspection report submitted successfully. Application forwarded to SW.',
      inspection,
      fileCount: files.length,
      from: 'under_review',
      to: 'sw_review_pending',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    for (const f of persistedFiles) {
      await removeFileIfExists(f.path).catch(() => {});
    }
    console.error('[simpleDashboard] submitTOReport error:', err);
    return res.status(500).json({ error: 'Failed to submit inspection report', details: err.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/simple/applications/:id/hold
// TO places a hold (complaint / clearance / technical-deficiency).
// Body: { hold_type, reason, clearance_authority?, complaint_source?, resolution_steps? }
// This writes a row to application_holds AND sets canonical applications.status to
// hold_complaint / hold_clearance (explicit-status-first).
// ─────────────────────────────────────────────────────────────────────────────
exports.placeHold = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { role, userId } = req.user;
    const { hold_type, reason, clearance_authority, complaint_source, resolution_steps } = req.body;

    if (!['technical_officer', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only TO can place a hold' });
    }

    const holdStatus = hold_type === 'clearance' ? 'hold_clearance' : 'hold_complaint';

    const combinedReason = hold_type === 'complaint' && (complaint_source || resolution_steps)
      ? `Source: ${complaint_source || 'Unknown'}\nNature: ${reason}\nResolution Step: ${resolution_steps || 'Pending investigation'}`
      : reason;

    await client.query('BEGIN');

    const appResult = await client.query(
      `SELECT a.id, a.status, a.application_code
       FROM applications a
       JOIN application_assignments aa ON aa.application_id = a.id
       WHERE a.id = $1 AND aa.assigned_to = $2 AND aa.status IN ('pending', 'accepted', 'in_progress')
       FOR UPDATE`,
      [id, userId]
    );
    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied: Application not assigned to you, or not found' });
    }

    await client.query(
      `UPDATE application_holds
       SET hold_status = 'resolved',
           resolved_by = $1,
           resolved_at = NOW(),
           resolution_note = COALESCE(resolution_note, 'Superseded by a newer hold action')
       WHERE application_id = $2
         AND hold_status = 'active'`,
      [userId, id]
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
      [id, hold_type, combinedReason, clearance_authority || null, userId]
    );

    await applyStatusTransition({
      client,
      applicationId: id,
      toStatus: holdStatus,
      changedBy: userId,
      reason: `TO hold (${hold_type}): ${reason}`,
      sourceStage: 'to-hold',
    });

    await client.query('COMMIT');
    return res.json({ message: 'Hold placed successfully', hold: holdResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[simpleDashboard] placeHold error:', err);
    return res.status(500).json({ error: 'Failed to place hold', details: err.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/simple/applications/:id/resolve-hold
// TO resolves the latest active hold and restores status to last non-hold stage
// (with under_review fallback).
// Body: { resolution_note }
// ─────────────────────────────────────────────────────────────────────────────
exports.resolveHold = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { role, userId } = req.user;
    const { resolution_note } = req.body;

    if (!['technical_officer', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only TO can resolve a hold' });
    }

    await client.query('BEGIN');

    const appResult = await client.query(
      `SELECT a.id
       FROM applications a
       JOIN application_assignments aa ON aa.application_id = a.id
       WHERE a.id = $1 AND aa.assigned_to = $2 AND aa.status IN ('pending', 'accepted', 'in_progress')
       FOR UPDATE`,
      [id, userId]
    );
    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied: Application not assigned to you, or not found' });
    }

    const activeHoldResult = await client.query(
      `SELECT id, requested_at
       FROM application_holds
       WHERE application_id = $1 AND hold_status = 'active'
       ORDER BY requested_at DESC, id DESC
       LIMIT 1`,
      [id]
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
      [id, activeHoldResult.rows[0].requested_at]
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
      [userId, resolution_note, activeHoldResult.rows[0].id]
    );

    await applyStatusTransition({
      client,
      applicationId: id,
      toStatus: restoredStatus,
      changedBy: userId,
      reason: `TO resolved hold: ${resolution_note || 'No note provided'}`,
      sourceStage: 'to-hold-resolved',
    });

    await client.query('COMMIT');
    return res.json({ message: 'Hold resolved successfully', hold: resolvedResult.rows[0], restoredStatus });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[simpleDashboard] resolveHold error:', err);
    return res.status(500).json({ error: 'Failed to resolve hold', details: err.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/simple/applications/:id/set-fee
// PO sets application fee and moves status to payment_pending.
// ─────────────────────────────────────────────────────────────────────────────
exports.setFee = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { amount, notes } = req.body;
    const { role, userId } = req.user;
    const normalizedAmount = Number.parseFloat(amount);
    const normalizedNotes = normalizeString(notes);

    if (!['planning_officer', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only PO can set fees' });
    }
    if (Number.isNaN(normalizedAmount) || normalizedAmount < 0) {
      return res.status(400).json({ error: 'amount must be a valid non-negative number' });
    }

    await client.query('BEGIN');

    const appResult = await client.query(
      `SELECT id, status, applicant_id, application_code
       FROM applications
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = appResult.rows[0];
    const transitionCheck = validateStatusTransition({
      fromStatus: app.status,
      toStatus: 'payment_pending',
      userRole: role,
      workflow: 'simple',
    });
    if (!transitionCheck.allowed) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot set fee while application is '${app.status}'`,
        allowedNext: getAllowedNextStatusesForWorkflow({
          fromStatus: app.status,
          userRole: role,
          workflow: 'simple',
        }),
      });
    }

    await client.query(
      `DELETE FROM payments
       WHERE application_id = $1
         AND payment_type = 'application_fee'
         AND status = 'pending'`,
      [id]
    );

    const paymentResult = await client.query(
      `INSERT INTO payments (
         application_id, payment_type, amount, status, transaction_id, payment_method, created_at
       )
       VALUES ($1, 'application_fee', $2, 'pending', $3, 'online', NOW())
       RETURNING id, amount, status, transaction_id, created_at`,
      [id, normalizedAmount, `REQ-${id}-${Date.now()}`]
    );

    await applyStatusTransition({
      client,
      applicationId: id,
      toStatus: 'payment_pending',
      changedBy: userId,
      reason: normalizedNotes || `Inspection fee set: LKR ${normalizedAmount.toLocaleString()}`,
      sourceStage: 'simple-fee-set',
    });

    await client.query('COMMIT');

    return res.json({
      message: 'Inspection fee set successfully',
      applicationId: id,
      status: 'payment_pending',
      payment: paymentResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[simpleDashboard] setFee error:', err);
    return res.status(500).json({ error: 'Failed to set application fee', details: err.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/simple/applications/:id/confirm-payment
// PO confirms payment and moves status back to under_review.
// ─────────────────────────────────────────────────────────────────────────────
exports.confirmPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const { role, userId } = req.user;
    const normalizedNotes = normalizeString(notes);

    if (!['planning_officer', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only PO can confirm payments' });
    }

    await client.query('BEGIN');

    const appResult = await client.query(
      `SELECT id, status
       FROM applications
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }
    if (appResult.rows[0].status !== 'payment_pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Application must be payment_pending to confirm payment' });
    }

    const paymentResult = await client.query(
      `SELECT id
       FROM payments
       WHERE application_id = $1
         AND payment_type = 'application_fee'
         AND status IN ('pending', 'processing', 'submitted')
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    if (!paymentResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No pending application fee found' });
    }

    await client.query(
      `UPDATE payments
       SET status = 'completed', paid_at = COALESCE(paid_at, NOW())
       WHERE id = $1`,
      [paymentResult.rows[0].id]
    );

    await applyStatusTransition({
      client,
      applicationId: id,
      toStatus: 'under_review',
      changedBy: userId,
      reason: normalizedNotes || 'Payment confirmed by planning officer',
      sourceStage: 'simple-payment-confirmed',
    });

    await client.query('COMMIT');

    return res.json({
      message: 'Payment confirmed successfully',
      applicationId: id,
      status: 'under_review',
      paymentId: paymentResult.rows[0].id,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[simpleDashboard] confirmPayment error:', err);
    return res.status(500).json({ error: 'Failed to confirm payment', details: err.message });
  } finally {
    client.release();
  }
};

