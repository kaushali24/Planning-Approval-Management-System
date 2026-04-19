const { validationResult } = require('express-validator');
const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const {
  buildDocumentStorageInfo,
  moveUploadedFile,
  removeFileIfExists,
  getDocumentFilePath,
} = require('../utils/documentStorage');
const {
  APPLICATION_STATUSES,
  STATUSES_REQUIRING_REASON,
  APPLICATION_PERMIT_CODES,
  normalizeString,
  isValidApplicationStatus,
  validateApplicationStatusTransition,
  getAllowedNextStatuses,
} = require('../utils/applicationValidation');
const {
  parseSortParam,
  isValidDate,
  buildFilterConditions,
  buildWhereClause,
  buildOrderByClause,
  buildPaginationClause,
} = require('../utils/queryBuilder');

const STAFF_ROLES = ['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin'];
const getChangedByStaffId = (user) => (STAFF_ROLES.includes(user.role) ? user.userId : null);

const DEFAULT_DOCUMENT_CHECKLIST = [
  { key: 'deed', required: true, active: true },
  { key: 'survey_plan', required: true, active: true },
  { key: 'nic_copy', required: true, active: true },
  { key: 'photo', required: false, active: true },
];

const normalizeDocumentType = (value) => normalizeString(value)?.toLowerCase().replace(/\s+/g, '_');

const normalizeSelectedPermitCode = (value) => normalizeString(value)?.toLowerCase();

const getDocumentChecklistConfig = async () => {
  try {
    const result = await pool.query(
      `SELECT doc_type_key, is_required, is_active
       FROM document_checklist_config
       ORDER BY sort_order ASC, id ASC`
    );

    if (!result.rows.length) {
      return DEFAULT_DOCUMENT_CHECKLIST;
    }

    const normalized = result.rows
      .map((row) => ({
        key: normalizeDocumentType(row.doc_type_key),
        required: row.is_required === true,
        active: row.is_active !== false,
      }))
      .filter((row) => !!row.key && row.active);

    if (!normalized.length) {
      return DEFAULT_DOCUMENT_CHECKLIST;
    }

    return normalized;
  } catch (error) {
    // Fallback keeps current behavior if migration has not been applied yet.
    if (error && error.code === '42P01') {
      return DEFAULT_DOCUMENT_CHECKLIST;
    }
    throw error;
  }
};

const getAllowedAndRequiredDocumentTypes = async () => {
  const config = await getDocumentChecklistConfig();
  const allowedDocumentTypes = config.map((item) => item.key);
  const requiredDocumentTypes = config.filter((item) => item.required).map((item) => item.key);

  return {
    allowedDocumentTypes,
    requiredDocumentTypes,
  };
};

const parseSelectedPermitCodes = (input) => {
  if (input === undefined || input === null) {
    return [];
  }

  if (Array.isArray(input)) {
    return input
      .map(normalizeSelectedPermitCode)
      .filter((value) => APPLICATION_PERMIT_CODES.includes(value));
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map(normalizeSelectedPermitCode)
          .filter((value) => APPLICATION_PERMIT_CODES.includes(value));
      }
    } catch (err) {
      return [];
    }
  }

  return [];
};

const syncSelectedPermitCodes = async (client, applicationId, selectedPermitCodes) => {
  await client.query('DELETE FROM application_permit_selections WHERE application_id = $1', [applicationId]);

  for (const permitCode of selectedPermitCodes) {
    await client.query(
      'INSERT INTO application_permit_selections (application_id, permit_code) VALUES ($1, $2)',
      [applicationId, permitCode]
    );
  }
};

const parseDocumentTypes = (input) => {
  if (input === undefined || input === null) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.map(normalizeDocumentType);
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeDocumentType);
        }
      } catch (err) {
        return [];
      }
    }

    return [normalizeDocumentType(trimmed)];
  }

  return [];
};

const cleanupUploadedFiles = (files) => {
  if (!Array.isArray(files)) {
    return;
  }

  for (const file of files) {
    if (!file || !file.path) {
      continue;
    }

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
};

/**
 * Create a new application
 * POST /api/applications
 */
exports.createApplication = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = req.user;
    const {
      application_type,
      submitted_applicant_name,
      submitted_nic_number,
      submitted_email,
      selected_permit_codes,
      assessment_number,
      deed_number,
      survey_plan_ref,
      land_extent,
      project_details,
      latitude,
      longitude,
      declaration_accepted,
      status,
    } = req.body;

    const normalizedName = normalizeString(submitted_applicant_name);
    const normalizedNic = normalizeString(submitted_nic_number);
    const normalizedEmail = normalizeString(submitted_email)?.toLowerCase();
    const normalizedAddress = normalizeString(req.body.submitted_address) || 'N/A';
    const normalizedContact = normalizeString(req.body.submitted_contact) || 'N/A';

    // Verify applicant exists
    const applicantCheck = await pool.query(
      'SELECT id FROM applicants WHERE id = $1',
      [user.userId]
    );

    if (!applicantCheck.rows.length) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    const selectedPermitCodes = parseSelectedPermitCodes(selected_permit_codes);

    await client.query('BEGIN');

    // Insert application with all form fields
    const result = await client.query(
      `INSERT INTO applications 
       (applicant_id, application_type, submitted_applicant_name, submitted_nic_number,
        submitted_address, submitted_contact, submitted_email,
        assessment_number, deed_number, survey_plan_ref, land_extent,
        project_details, latitude, longitude, declaration_accepted, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
       RETURNING id, application_code, applicant_id, application_type, status, submission_date, submitted_applicant_name`,
      [
        user.userId,
        application_type,
        normalizedName,
        normalizedNic,
        normalizedAddress,
        normalizedContact,
        normalizedEmail,
        normalizeString(assessment_number) || null,
        normalizeString(deed_number) || null,
        normalizeString(survey_plan_ref) || null,
        normalizeString(land_extent) || null,
        project_details ? (typeof project_details === 'string' ? JSON.parse(project_details) : project_details) : null,
        latitude || null,
        longitude || null,
        declaration_accepted === true,
        status || 'submitted'
      ]
    );

    if (selectedPermitCodes.length > 0) {
      await syncSelectedPermitCodes(client, result.rows[0].id, selectedPermitCodes);
    }

    // Record status in history
    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by)
       VALUES ($1, $2, NOW(), $3)`,
      [result.rows[0].id, result.rows[0].status, getChangedByStaffId(user)]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Application created successfully',
      application: result.rows[0],
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Create application error:', error);
    res.status(500).json({ error: 'Failed to create application', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
};

/**
 * Get applications with advanced filtering, search, and sorting
 * Supports: search by name, status/type filters, date range, custom sorting, pagination
 * GET /api/applications
 */
exports.getApplications = async (req, res) => {
  try {
    const user = req.user;
    const { search, status, type, fromDate, toDate, sort, page = 1, limit = 20 } = req.query;

    // Validate dates if provided
    if (fromDate && !isValidDate(fromDate)) {
      return res.status(400).json({ error: 'Invalid fromDate format (use YYYY-MM-DD)' });
    }
    if (toDate && !isValidDate(toDate)) {
      return res.status(400).json({ error: 'Invalid toDate format (use YYYY-MM-DD)' });
    }

    // Parse sort parameter
    let sortClause = [];
    try {
      sortClause = parseSortParam(sort);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const offset = (page - 1) * limit;
    let baseFrom = ' FROM applications a ';
    let params = [];
    let conditions = [];

    // Role-based visibility filtering
    if (user.accountType === 'applicant' || user.role === 'applicant') {
      // Applicants see only their own applications
      conditions.push(`a.applicant_id = $${params.length + 1}`);
      params.push(user.userId);
    } else if (user.accountType === 'staff' || user.role === 'staff' || STAFF_ROLES.includes(user.role)) {
      // Staff can see assigned applications + all non-draft (for PO/Admin/Superintendent)
      if (user.role === 'planning_officer' || user.role === 'superintendent' || user.role === 'admin') {
        conditions.push(`a.status != 'draft'`);
      } else {
        // Technical Officers only see assigned + new submissions
        conditions.push(`(
          EXISTS (
            SELECT 1
            FROM application_assignments aa
            WHERE aa.application_id = a.id
              AND aa.assigned_to = $${params.length + 1}
              AND aa.status IN ('pending', 'accepted', 'in_progress')
          )
          OR a.status IN ('submitted', 'under_review')
        )`);
        params.push(user.userId);
      }
    }
    // Admin/Committee see all applications (no additional restrictions)

    // Build filter conditions (search, status, type, date range)
    const filterResult = buildFilterConditions(
      { searchQuery: search, status, type, fromDate, toDate },
      { baseParams: params }
    );
    conditions = [...conditions, ...filterResult.whereConditions];
    params = filterResult.params;

    // Build WHERE clause
    const whereClause = buildWhereClause(conditions);

    // Get total count for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) as total${baseFrom}${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Build ORDER BY clause
    const orderByClause = buildOrderByClause(sortClause);

    // Build LIMIT/OFFSET
    const paginationResult = buildPaginationClause(parseInt(limit, 10), offset, params);

    // Build and execute main data query
    const dataQuery = `
      SELECT
        a.id, a.application_code, a.applicant_id, a.application_type, a.status,
        a.submission_date, a.last_updated, a.submitted_applicant_name, 
        a.submitted_email, a.submitted_address,
        a.assessment_number, a.deed_number, a.survey_plan_ref, a.land_extent,
        a.project_details, a.latitude, a.longitude, a.declaration_accepted,
        a.preliminary_check_data,
        ap.applicant_ref_id AS applicant_ref,
        (SELECT COUNT(*) FROM documents WHERE application_id = a.id) as document_count,
        (SELECT COUNT(*) FROM inspections WHERE application_id = a.id) as inspection_count,
        latest_assignment.assigned_to as assigned_to_id,
        latest_assignment.assigned_to_name,
        latest_assignment.assigned_at as assigned_at,
        latest_assignment.assignment_status,
        latest_assignment.notes as assignment_notes,
        latest_inspection.id as latest_inspection_id,
        latest_inspection.staff_id as latest_inspection_staff_id,
        latest_inspection.staff_name as latest_inspection_staff_name,
        latest_inspection.scheduled_date as latest_inspection_scheduled_date,
        latest_inspection.result as latest_inspection_result,
        latest_inspection.observations as latest_inspection_observations,
        latest_inspection.recommendation as latest_inspection_recommendation,
        latest_inspection.created_at as latest_inspection_created_at,
        latest_hold.hold_type,
        latest_hold.hold_status,
        latest_hold.reason as hold_reason,
        latest_hold.clearance_authority,
        latest_hold.requested_at as hold_requested_at,
        latest_hold.resolved_at as hold_resolved_at,
        latest_hold.resolution_note,
        latest_payment.amount as latest_payment_amount,
        latest_payment.payment_status as latest_payment_status,
        latest_payment.payment_method as latest_payment_method,
        latest_payment.transaction_id as latest_payment_reference,
        latest_payment.paid_at as latest_payment_paid_at,
        latest_payment.created_at as latest_payment_created_at
      ${baseFrom}
      LEFT JOIN applicants ap ON ap.id = a.applicant_id
      LEFT JOIN LATERAL (
        SELECT
          aa.assigned_to,
          staff.full_name as assigned_to_name,
          aa.assigned_at,
          aa.status as assignment_status,
          aa.notes
        FROM application_assignments aa
        LEFT JOIN staff_accounts staff ON staff.id = aa.assigned_to
        WHERE aa.application_id = a.id
          AND aa.status IN ('pending', 'accepted', 'in_progress')
        ORDER BY aa.assigned_at DESC, aa.id DESC
        LIMIT 1
      ) latest_assignment ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          i.id,
          i.staff_id,
          staff.full_name as staff_name,
          i.scheduled_date,
          i.result,
          i.observations,
          i.recommendation,
          i.created_at
        FROM inspections i
        LEFT JOIN staff_accounts staff ON staff.id = i.staff_id
        WHERE i.application_id = a.id
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT 1
      ) latest_inspection ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          ah.hold_type,
          ah.hold_status,
          ah.reason,
          ah.clearance_authority,
          ah.requested_at,
          ah.resolved_at,
          ah.resolution_note
        FROM application_holds ah
        WHERE ah.application_id = a.id
        ORDER BY ah.requested_at DESC, ah.id DESC
        LIMIT 1
      ) latest_hold ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          p.amount,
          p.status as payment_status,
          p.payment_method,
          p.transaction_id,
          p.paid_at,
          p.created_at
        FROM payments p
        WHERE p.application_id = a.id
          AND p.payment_type IN ('application_fee', 'processing_fee')
        ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC
        LIMIT 1
      ) latest_payment ON TRUE
      ${whereClause}
      ${orderByClause}
      ${paginationResult.clause}
    `;

    const result = await pool.query(dataQuery, paginationResult.params);

    res.json({
      applications: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
      filters: {
        search: search || null,
        status: status || null,
        type: type || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        sort: sort || null,
      },
    });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications', details: error.message });
  }
};

/**
 * Get single application by ID
 * GET /api/applications/:id
 */
exports.getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        a.*, 
        applicant.applicant_ref_id as applicant_ref,
        applicant.full_name as applicant_full_name,
        applicant.email as applicant_email,
        (SELECT json_agg(row_to_json(d.*)) FROM documents d WHERE d.application_id = a.id) as documents,
        (SELECT json_agg(row_to_json(i.*)) FROM inspections i WHERE i.application_id = a.id) as inspections,
        (SELECT json_agg(row_to_json(ash.*)) FROM application_status_history ash WHERE ash.application_id = a.id ORDER BY ash.changed_at DESC) as status_history
      FROM applications a
      LEFT JOIN applicants applicant ON a.applicant_id = applicant.id
      WHERE a.id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get application by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch application', details: error.message });
  }
};

/**
 * Update application status
 * PATCH /api/applications/:id/status
 */
exports.updateApplicationStatus = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const applicationId = Number.parseInt(req.params.id, 10);
    const status = normalizeString(req.body.status);
    const notes = normalizeString(req.body.notes);
    const user = req.user;

    if (Number.isNaN(applicationId)) {
      return res.status(400).json({ error: 'Invalid application ID' });
    }

    if (!isValidApplicationStatus(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${APPLICATION_STATUSES.join(', ')}` });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    // Get current application with row lock to avoid concurrent workflow updates
    const appResult = await client.query(
      'SELECT status FROM applications WHERE id = $1 FOR UPDATE',
      [applicationId]
    );

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Application not found' });
    }

    const currentStatus = appResult.rows[0].status;
    const transitionCheck = validateApplicationStatusTransition({
      fromStatus: currentStatus,
      toStatus: status,
      userRole: user.role,
    });

    if (!transitionCheck.allowed) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({
        error: transitionCheck.reason,
        currentStatus,
        requestedStatus: status,
        allowedNextStatuses: getAllowedNextStatuses(currentStatus, user.role),
      });
    }

    if (STATUSES_REQUIRING_REASON.includes(status) && (!notes || notes.length < 5)) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({
        error: `Status ${status} requires notes with at least 5 characters`,
      });
    }

    // Update application status
    const updateResult = await client.query(
      `UPDATE applications 
       SET status = $1, last_updated = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [status, applicationId]
    );

    // Record in status history
    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, $2, NOW(), $3, $4, $5)`,
      [applicationId, status, user.userId, notes || null, `${currentStatus}->${status}`]
    );

    // Synchronize with application_assignments record for assignments/acceptance workflow
    if (status === 'accepted') {
      await client.query(
        `UPDATE application_assignments 
         SET status = 'accepted' 
         WHERE application_id = $1 AND assigned_to = $2 AND status = 'pending'`,
        [applicationId, user.userId]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;

    res.json({
      message: 'Application status updated successfully',
      application: updateResult.rows[0],
    });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query('ROLLBACK').catch(e => console.error('Rollback failed:', e));
    }
    console.error('Update application status error:', error);
    res.status(500).json({ error: 'Failed to update application status', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
};

/**
 * Update application details
 * PATCH /api/applications/:id
 */
exports.updateApplication = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const submittedApplicantName = normalizeString(req.body.submitted_applicant_name);
    const submittedEmail = normalizeString(req.body.submitted_email)?.toLowerCase();

    const result = await pool.query(
      `UPDATE applications 
         SET submitted_applicant_name = COALESCE($1, submitted_applicant_name),
           submitted_email = COALESCE($2, submitted_email),
           last_updated = NOW()
       WHERE id = $3
       RETURNING *`,
      [submittedApplicantName, submittedEmail, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({
      message: 'Application updated successfully',
      application: result.rows[0],
    });
  } catch (error) {
    console.error('Update application error:', error);
    res.status(500).json({ error: 'Failed to update application', details: error.message });
  }
};

/**
 * Assign application to staff
 * POST /api/applications/:id/assign
 */
exports.assignApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to, notes } = req.body;
    const user = req.user;

    const assignedToValue = normalizeString(assigned_to);
    if (!assignedToValue) {
      return res.status(400).json({ error: 'Staff member is required for assignment' });
    }

    // Verify application exists
    const appResult = await pool.query(
      'SELECT id FROM applications WHERE id = $1',
      [id]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ error: 'Application not found' });
    }

    let staffResult = null;
    if (/^\d+$/.test(assignedToValue)) {
      staffResult = await pool.query(
        'SELECT id, full_name FROM staff_accounts WHERE id = $1',
        [Number.parseInt(assignedToValue, 10)]
      );
    }

    if (!staffResult || !staffResult.rows.length) {
      staffResult = await pool.query(
        `SELECT id, full_name
         FROM staff_accounts
         WHERE staff_id = $1 OR LOWER(full_name) = LOWER($1)
         ORDER BY id ASC
         LIMIT 1`,
        [assignedToValue]
      );
    }

    if (!staffResult.rows.length) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    const assignedToId = staffResult.rows[0].id;
    const assignmentNotes = normalizeString(notes) || null;

    // Check for existing active assignment
    const existingAssignment = await pool.query(
      `SELECT id FROM application_assignments 
       WHERE application_id = $1 AND status IN ('pending', 'accepted', 'in_progress')`,
      [id]
    );

    if (existingAssignment.rows.length) {
      // Update existing
      await pool.query(
        `UPDATE application_assignments 
         SET assigned_to = $1, assigned_by = $2, assigned_at = NOW(), notes = COALESCE($3, notes) 
         WHERE application_id = $4 AND status IN ('pending', 'accepted', 'in_progress')`,
        [assignedToId, user.userId, assignmentNotes, id]
      );
    } else {
      // Create new assignment
      await pool.query(
        `INSERT INTO application_assignments (application_id, assigned_to, assigned_by, assignment_type, status)
         VALUES ($1, $2, $3, 'initial_review', 'pending')`,
        [id, assignedToId, user.userId]
      );

      if (assignmentNotes) {
        await pool.query(
          `UPDATE application_assignments
           SET notes = $1
           WHERE application_id = $2 AND assigned_to = $3 AND assigned_by = $4`,
          [assignmentNotes, id, assignedToId, user.userId]
        );
      }
    }

    res.json({
      message: 'Application assigned successfully',
      assignedTo: assignedToId,
      assignedToName: staffResult.rows[0].full_name,
    });
  } catch (error) {
    console.error('Assign application error:', error);
    res.status(500).json({ error: 'Failed to assign application', details: error.message });
  }
};

/**
 * Get application assignment history
 * GET /api/applications/:id/assignments
 */
exports.getApplicationAssignments = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        aa.id, aa.application_id, aa.assigned_to, aa.assigned_by, aa.status,
        aa.assigned_at,
        staff.full_name as staff_name,
        assigned_by_staff.full_name as assigned_by_name
       FROM application_assignments aa
       LEFT JOIN staff_accounts staff ON aa.assigned_to = staff.id
       LEFT JOIN staff_accounts assigned_by_staff ON aa.assigned_by = assigned_by_staff.id
       WHERE aa.application_id = $1
       ORDER BY aa.assigned_at DESC`,
      [id]
    );

    res.json({
      assignments: result.rows,
    });
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
  }
};

/**
 * Delete application (only if pending and owned by user or admin)
 * DELETE /api/applications/:id
 */
exports.deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const result = await pool.query(
      'SELECT * FROM applications WHERE id = $1',
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = result.rows[0];

    // Only allow deletion of pending applications
    if (!['pending', 'submitted'].includes(app.status)) {
      return res.status(400).json({ error: 'Only pending/submitted applications can be deleted' });
    }

    // Check ownership
    if ((user.accountType === 'applicant' || user.role === 'applicant') && app.applicant_id !== user.userId) {
      return res.status(403).json({ error: 'You can only delete your own applications' });
    }

    // Delete application
    await pool.query(
      'DELETE FROM applications WHERE id = $1',
      [id]
    );

    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ error: 'Failed to delete application', details: error.message });
  }
};

/**
 * Get application statistics (for dashboards)
 * GET /api/applications/stats/summary
 */
exports.getApplicationStats = async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_applications,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'under_review' THEN 1 END) as under_review,
        COUNT(CASE WHEN status = 'endorsed' THEN 1 END) as endorsed,
        COUNT(CASE WHEN status = 'certified' THEN 1 END) as certified,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN status IN ('appeal_submitted', 'not_granted_appeal_required') THEN 1 END) as appealed,
        DATE_TRUNC('month', submission_date) as month
      FROM applications
      GROUP BY DATE_TRUNC('month', submission_date)
      ORDER BY month DESC
    `);

    res.json({
      stats: statsResult.rows,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics', details: error.message });
  }
};

/**
 * Save draft data (partial form save)
 * PATCH /api/applications/:id/draft
 * 
 * Allows applicants to save incomplete application data
 * No validation required - user can save partial data
 */
exports.saveDraft = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const { id } = req.params;
    const user = req.user;

    // Verify application exists and is in draft status
    const appResult = await pool.query(
      'SELECT * FROM applications WHERE id = $1 AND applicant_id = $2',
      [id, user.userId]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const app = appResult.rows[0];

    if (app.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft applications can be updated' });
    }

    // Normalize input fields
    const {
      application_type,
      submitted_applicant_name,
      submitted_nic_number,
      submitted_email,
      submitted_address,
      submitted_contact,
      selected_permit_codes,
      assessment_number,
      deed_number,
      survey_plan_ref,
      land_extent,
      project_details,
      latitude,
      longitude,
      declaration_accepted,
    } = req.body;

    // Build update query with only provided fields
    const updateFields = [];
    const updateParams = [];
    let paramIndex = 1;
    const selectedPermitCodesProvided = selected_permit_codes !== undefined;

    if (application_type !== undefined) {
      updateFields.push(`application_type = $${paramIndex++}`);
      updateParams.push(application_type);
    }

    if (submitted_applicant_name !== undefined) {
      updateFields.push(`submitted_applicant_name = $${paramIndex++}`);
      updateParams.push(normalizeString(submitted_applicant_name));
    }

    if (submitted_nic_number !== undefined) {
      updateFields.push(`submitted_nic_number = $${paramIndex++}`);
      updateParams.push(normalizeString(submitted_nic_number));
    }

    if (submitted_email !== undefined) {
      updateFields.push(`submitted_email = $${paramIndex++}`);
      updateParams.push(normalizeString(submitted_email)?.toLowerCase());
    }

    if (submitted_address !== undefined) {
      updateFields.push(`submitted_address = $${paramIndex++}`);
      updateParams.push(normalizeString(submitted_address));
    }

    if (submitted_contact !== undefined) {
      updateFields.push(`submitted_contact = $${paramIndex++}`);
      updateParams.push(normalizeString(submitted_contact));
    }

    if (assessment_number !== undefined) {
      updateFields.push(`assessment_number = $${paramIndex++}`);
      updateParams.push(normalizeString(assessment_number));
    }

    if (deed_number !== undefined) {
      updateFields.push(`deed_number = $${paramIndex++}`);
      updateParams.push(normalizeString(deed_number));
    }

    if (survey_plan_ref !== undefined) {
      updateFields.push(`survey_plan_ref = $${paramIndex++}`);
      updateParams.push(normalizeString(survey_plan_ref));
    }

    if (land_extent !== undefined) {
      updateFields.push(`land_extent = $${paramIndex++}`);
      updateParams.push(normalizeString(land_extent));
    }

    if (project_details !== undefined) {
      updateFields.push(`project_details = $${paramIndex++}`);
      updateParams.push(typeof project_details === 'string' ? JSON.parse(project_details) : project_details);
    }

    if (latitude !== undefined) {
      updateFields.push(`latitude = $${paramIndex++}`);
      updateParams.push(latitude);
    }

    if (longitude !== undefined) {
      updateFields.push(`longitude = $${paramIndex++}`);
      updateParams.push(longitude);
    }

    if (declaration_accepted !== undefined) {
      updateFields.push(`declaration_accepted = $${paramIndex++}`);
      updateParams.push(declaration_accepted);
    }

    const selectedPermitCodes = selectedPermitCodesProvided ? parseSelectedPermitCodes(selected_permit_codes) : null;

    if (updateFields.length === 0 && !selectedPermitCodesProvided) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    await client.query('BEGIN');

    // Always update last_updated
    updateFields.push(`last_updated = NOW()`);

    updateParams.push(id);

    const updateQuery = `
      UPDATE applications 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await client.query(updateQuery, updateParams);

    if (selectedPermitCodesProvided) {
      await syncSelectedPermitCodes(client, result.rows[0].id, selectedPermitCodes);
    }

    await client.query('COMMIT');

    res.json({
      message: 'Draft saved successfully',
      application: result.rows[0],
      progress: {
        hasType: !!result.rows[0].application_type,
        hasApplicantInfo: !!result.rows[0].submitted_applicant_name,
        hasPropertyDetails: !!result.rows[0].assessment_number,
        hasLocation: !!result.rows[0].latitude,
        hasDeclaration: result.rows[0].declaration_accepted,
      },
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Save draft error:', error);
    res.status(500).json({ error: 'Failed to save draft', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
};

/**
 * Get draft data
 * GET /api/applications/:id/draft
 * 
 * Retrieve current draft status and saved fields
 */
exports.getDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const result = await pool.query(
      'SELECT * FROM applications WHERE id = $1 AND applicant_id = $2 AND status = $3',
      [id, user.userId, 'draft']
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const app = result.rows[0];

    // Calculate completion percentage
    const completedFields = [
      app.application_type,
      app.submitted_applicant_name,
      app.submitted_nic_number,
      app.submitted_email,
      app.assessment_number,
      app.deed_number,
      app.latitude,
      app.declaration_accepted,
    ].filter(f => !!f).length;

    const totalImportantFields = 8;
    const completionPercentage = Math.round((completedFields / totalImportantFields) * 100);

    res.json({
      draft: app,
      progress: {
        completionPercentage,
        completedFields,
        totalImportantFields,
        lastUpdated: app.last_updated,
      },
    });
  } catch (error) {
    console.error('Get draft error:', error);
    res.status(500).json({ error: 'Failed to fetch draft', details: error.message });
  }
};

/**
 * Clear draft data
 * DELETE /api/applications/:id/draft
 * 
 * Resets draft to initial state (removes all field data but keeps draft record)
 */
exports.clearDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Verify draft exists
    const appResult = await pool.query(
      'SELECT * FROM applications WHERE id = $1 AND applicant_id = $2 AND status = $3',
      [id, user.userId, 'draft']
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    // Clear all draft data
    const result = await pool.query(
      `UPDATE applications 
       SET application_type = NULL,
           submitted_applicant_name = NULL,
           submitted_nic_number = NULL,
           submitted_email = NULL,
           submitted_address = NULL,
           submitted_contact = NULL,
           assessment_number = NULL,
           deed_number = NULL,
           survey_plan_ref = NULL,
           land_extent = NULL,
           project_details = NULL,
           latitude = NULL,
           longitude = NULL,
           declaration_accepted = FALSE,
           last_updated = NOW()
       WHERE id = $1
       RETURNING id, status, last_updated`,
      [id]
    );

    res.json({
      message: 'Draft cleared successfully',
      draft: result.rows[0],
    });
  } catch (error) {
    console.error('Clear draft error:', error);
    res.status(500).json({ error: 'Failed to clear draft', details: error.message });
  }
};

/**
 * Submit draft as application
 * POST /api/applications/:id/draft/submit
 * 
 * Converts draft to submitted status
 * Requires full validation - all mandatory fields must be present
 */
exports.submitDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Verify draft exists
    const appResult = await pool.query(
      'SELECT * FROM applications WHERE id = $1 AND applicant_id = $2 AND status = $3',
      [id, user.userId, 'draft']
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    // NOTE: Strict document type pre-check is removed here because the frontend 
    // uploads documents immediately AFTER this call in the same submission flow.
    // Preliminary verification by a staff member will perform official document checks.
    /*
    const docTypeResult = await pool.query(
      `SELECT DISTINCT LOWER(doc_type) AS doc_type
       FROM documents
       WHERE application_id = $1`,
      [id]
    );

    const { requiredDocumentTypes } = await getAllowedAndRequiredDocumentTypes();

    const uploadedDocTypes = new Set(docTypeResult.rows.map((row) => normalizeDocumentType(row.doc_type)).filter(Boolean));
    const missingDocumentTypes = requiredDocumentTypes.filter((docType) => !uploadedDocTypes.has(docType));

    if (missingDocumentTypes.length > 0) {
      return res.status(400).json({
        error: 'Required documents are missing before submission',
        requiredDocumentTypes,
        uploadedDocumentTypes: Array.from(uploadedDocTypes),
        missingDocumentTypes,
      });
    }
    */

    const {
      application_type,
      submitted_applicant_name,
      submitted_nic_number,
      submitted_email,
      submitted_address,
      submitted_contact,
    } = req.body;

    // Normalize fields
    const normalizedName = normalizeString(submitted_applicant_name);
    const normalizedNic = normalizeString(submitted_nic_number);
    const normalizedEmail = normalizeString(submitted_email)?.toLowerCase();
    const normalizedAddress = normalizeString(submitted_address) || 'N/A';
    const normalizedContact = normalizeString(submitted_contact) || 'N/A';

    // Update draft to submitted status
    const result = await pool.query(
      `UPDATE applications 
       SET status = 'submitted',
           application_type = $1,
           submitted_applicant_name = $2,
           submitted_nic_number = $3,
           submitted_address = $4,
           submitted_contact = $5,
           submitted_email = $6,
           last_updated = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        application_type,
        normalizedName,
        normalizedNic,
        normalizedAddress,
        normalizedContact,
        normalizedEmail,
        id,
      ]
    );

    // Record submission in status history
    await pool.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by)
       VALUES ($1, 'submitted', NOW(), $2)`,
      [id, user.userId]
    );

    res.json({
      message: 'Application submitted successfully',
      application: result.rows[0],
    });
  } catch (error) {
    console.error('Submit draft error:', error);
    res.status(500).json({ error: 'Failed to submit application', details: error.message });
  }
};

/**
 * Upload one or more documents for an application
 * POST /api/applications/:id/documents
 */
exports.uploadApplicationDocuments = async (req, res) => {
  let transactionStarted = false;
  const persistedFiles = [];
  try {
    const { id: applicationId } = req.params;
    const user = req.user;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const appResult = await pool.query(
      `SELECT a.id, a.applicant_id, a.application_code, a.status, ap.applicant_ref_id
       FROM applications a
       JOIN applicants ap ON ap.id = a.applicant_id
       WHERE a.id = $1`,
      [applicationId]
    );

    if (!appResult.rows.length) {
      cleanupUploadedFiles(req.files);
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = appResult.rows[0];

    if ((user.accountType === 'applicant' || user.role === 'applicant') && app.applicant_id !== user.userId) {
      cleanupUploadedFiles(req.files);
      return res.status(403).json({ error: 'You can only upload documents for your own applications' });
    }

    if (app.status === 'closed') {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ error: 'Documents cannot be uploaded for closed applications' });
    }

    let docTypes = parseDocumentTypes(req.body.doc_types || req.body.doc_type || req.body.documentTypes);
    // If the client didn't provide matching doc types, default each file to a generic 'document' type
    if (!Array.isArray(docTypes) || docTypes.length !== req.files.length) {
      // Try to gracefully handle mismatch: if we got some types but wrong count, pad or truncate
      if (Array.isArray(docTypes) && docTypes.length > 0) {
        while (docTypes.length < req.files.length) {
          docTypes.push('document');
        }
        docTypes = docTypes.slice(0, req.files.length);
      } else {
        docTypes = req.files.map(() => 'document');
      }
    }

    // Accept any non-empty doc_type string. The frontend already validates which
    // documents are required per permit type, and permit-specific types (e.g.
    // building_plan, boundary_wall_plan, site-plan) are not in the common
    // checklist config table, so we must not reject them here.
    const invalidDocTypes = docTypes.filter((docType) => !docType || typeof docType !== 'string' || !docType.trim());
    if (invalidDocTypes.length > 0) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({
        error: 'Each uploaded file must have a valid, non-empty document type',
      });
    }

    await pool.query('BEGIN');
    transactionStarted = true;

    const uploadedDocuments = [];

    for (let index = 0; index < req.files.length; index += 1) {
      const file = req.files[index];
      const docType = docTypes[index];
      const documentCategory = String(docType || '').trim().toLowerCase().replace(/\s+/g, '_') || 'document';
      const storageInfo = buildDocumentStorageInfo({
        applicantRefId: app.applicant_ref_id,
        applicationCode: app.application_code,
        documentCategory,
        filename: file.filename,
      });

      await moveUploadedFile(file.path, storageInfo.absolutePath);
      persistedFiles.push({ path: storageInfo.absolutePath });

      const inserted = await pool.query(
        `INSERT INTO documents (
          application_id,
          applicant_ref_id,
          application_code,
          doc_type,
          document_category,
          original_filename,
          stored_filename,
          storage_key,
          file_url,
          mime_type,
          file_size
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, application_id, applicant_ref_id, application_code, doc_type, document_category, original_filename, stored_filename, storage_key, file_url, uploaded_at`,
        [
          applicationId,
          app.applicant_ref_id,
          app.application_code,
          docType,
          documentCategory,
          file.originalname,
          file.filename,
          storageInfo.relativePath,
          storageInfo.relativePath,
          file.mimetype,
          file.size,
        ]
      );

      console.log('Inserted document ID:', inserted.rows[0].id);
      uploadedDocuments.push(inserted.rows[0]);
    }

    await pool.query('COMMIT');

    const { allowedDocumentTypes, requiredDocumentTypes } = await getAllowedAndRequiredDocumentTypes();

    res.status(201).json({
      message: 'Documents uploaded successfully',
      count: uploadedDocuments.length,
      documents: uploadedDocuments,
      allowedDocumentTypes,
      requiredDocumentTypes,
    });
  } catch (error) {
    if (transactionStarted) {
      await pool.query('ROLLBACK').catch((rollbackError) => {
        console.error('Rollback error:', rollbackError);
      });
    }
    if (Array.isArray(req.files)) {
      await Promise.all(persistedFiles.map((file) => removeFileIfExists(file.path).catch((cleanupError) => {
        console.error('Persisted upload cleanup error:', cleanupError);
      })));
    }
    cleanupUploadedFiles(req.files);
    console.error('Upload application documents error:', error);
    if (res && !res.headersSent) {
      res.status(500).json({ error: 'Failed to upload documents', details: error.message });
    }
  }
};

/**
 * Resubmit specific corrected documents for an application
 * POST /api/applications/:id/resubmit-corrections
 */
exports.resubmitCorrections = async (req, res) => {
  let client;
  let transactionStarted = false;
  const persistedFiles = [];
  try {
    const { id: applicationId } = req.params;
    const user = req.user;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided for resubmission' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    // 1. Get application and current preliminary check data
    const appResult = await client.query(
      `SELECT a.id, a.applicant_id, a.application_code, a.status, a.preliminary_check_data, ap.applicant_ref_id
       FROM applications a
       JOIN applicants ap ON ap.id = a.applicant_id
       WHERE a.id = $1 FOR UPDATE`,
      [applicationId]
    );

    if (!appResult.rows.length) {
      cleanupUploadedFiles(req.files);
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = appResult.rows[0];

    // Auth check
    if ((user.accountType === 'applicant' || user.role === 'applicant') && app.applicant_id !== user.userId) {
      cleanupUploadedFiles(req.files);
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only resubmit corrections for your own applications' });
    }

    if (app.status !== 'correction') {
      cleanupUploadedFiles(req.files);
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only applications in correction status can accept resubmissions here' });
    }

    // 2. Parse doc IDs being resubmitted
    // Expecting doc_ids in the same order as files
    let resubmittedDocIds = [];
    try {
      const rawIds = req.body.doc_ids || req.body.documentIds;
      if (typeof rawIds === 'string') {
        resubmittedDocIds = JSON.parse(rawIds);
      } else if (Array.isArray(rawIds)) {
        resubmittedDocIds = rawIds;
      }
    } catch (e) {
      resubmittedDocIds = [];
    }

    if (!Array.isArray(resubmittedDocIds) || resubmittedDocIds.length !== req.files.length) {
      cleanupUploadedFiles(req.files);
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Provided document IDs count does not match uploaded files count' });
    }

    const currentPrelimData = app.preliminary_check_data || {};
    const currentDeficientDocs = Array.isArray(currentPrelimData.deficientDocuments) ? currentPrelimData.deficientDocuments : [];

    // 3. Process each file
    const uploadedDocs = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const targetDocId = resubmittedDocIds[i];
      
      // Find the label from current deficient docs if possible
      const deficientDocInfo = currentDeficientDocs.find(d => String(d.id) === String(targetDocId));
      const docType = deficientDocInfo ? deficientDocInfo.label : 'correction_document';
      const documentCategory = docType.trim().toLowerCase().replace(/\s+/g, '_');

      const storageInfo = buildDocumentStorageInfo({
        applicantRefId: app.applicant_ref_id,
        applicationCode: app.application_code,
        documentCategory,
        filename: file.filename,
      });

      await moveUploadedFile(file.path, storageInfo.absolutePath);
      persistedFiles.push({ path: storageInfo.absolutePath });

      const inserted = await client.query(
        `INSERT INTO documents (
          application_id, applicant_ref_id, application_code, 
          doc_type, document_category, original_filename, 
          stored_filename, storage_key, file_url, mime_type, file_size
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, doc_type, file_url`,
        [
          applicationId, app.applicant_ref_id, app.application_code,
          docType, documentCategory, file.originalname,
          file.filename, storageInfo.relativePath, storageInfo.relativePath,
          file.mimetype, file.size
        ]
      );
      uploadedDocs.push(inserted.rows[0]);
    }

    // 4. Update preliminary_check_data
    // Move resubmitted docs from deficientDocuments to a corrected history if we want, or just remove them.
    // For now, let's remove them from deficientDocuments to clear the flags.
    const remainingDeficientDocs = currentDeficientDocs.filter(
      doc => !resubmittedDocIds.map(id => String(id)).includes(String(doc.id))
    );

    const updatedPrelimData = {
      ...currentPrelimData,
      deficientDocuments: remainingDeficientDocs,
      lastCorrectionAt: new Date().toISOString(),
    };

    // 5. Update application status to Stage 2 (submitted)
    await client.query(
      `UPDATE applications 
       SET preliminary_check_data = $1, status = 'submitted', last_updated = NOW() 
       WHERE id = $2`,
      [JSON.stringify(updatedPrelimData), applicationId]
    );

    // 6. Record status history
    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason)
       VALUES ($1, 'submitted', NOW(), $2, $3)`,
      [applicationId, user.userId, `Applicant resubmitted corrections for: ${resubmittedDocIds.join(', ')}`]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    res.status(200).json({
      message: 'Corrections resubmitted successfully. Application returned to Preliminary Examination.',
      applicationId,
      status: 'submitted',
      uploadedCount: uploadedDocs.length,
      remainingDeficiencies: remainingDeficientDocs.length
    });

  } catch (error) {
    if (transactionStarted && client) {
      await client.query('ROLLBACK').catch(e => console.error('Rollback error:', e));
    }
    if (Array.isArray(req.files)) {
      await Promise.all(persistedFiles.map((file) => removeFileIfExists(file.path).catch(e => console.error(e))));
    }
    console.error('Resubmit corrections error:', error);
    if (res && !res.headersSent) {
      res.status(500).json({ error: 'Failed to resubmit corrections', details: error.message });
    }
  } finally {
    if (client) client.release();
  }
};


/**
 * Get application documents
 * GET /api/applications/:id/documents
 */
exports.getApplicationDocuments = async (req, res) => {
  try {
    const { id: applicationId } = req.params;
    const user = req.user;

    const appResult = await pool.query(
      'SELECT applicant_id FROM applications WHERE id = $1',
      [applicationId]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if ((user.accountType === 'applicant' || user.role === 'applicant') && appResult.rows[0].applicant_id !== user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT id, application_id, applicant_ref_id, application_code, doc_type, document_category,
              original_filename, stored_filename, storage_key, COALESCE(storage_key, file_url) AS file_url, uploaded_at
       FROM documents
       WHERE application_id = $1
       ORDER BY uploaded_at DESC`,
      [applicationId]
    );

    const { allowedDocumentTypes, requiredDocumentTypes } = await getAllowedAndRequiredDocumentTypes();
    const uploadedTypes = Array.from(new Set(result.rows.map((row) => normalizeDocumentType(row.doc_type)).filter(Boolean)));
    const missingRequiredTypes = requiredDocumentTypes.filter((docType) => !uploadedTypes.includes(docType));

    res.json({
      documents: result.rows,
      allowedDocumentTypes,
      requiredDocumentTypes,
      missingRequiredDocumentTypes: missingRequiredTypes,
    });
  } catch (error) {
    console.error('Get application documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents', details: error.message });
  }
};

/**
 * Delete application document
 * DELETE /api/applications/:applicationId/documents/:documentId
 */
exports.deleteApplicationDocument = async (req, res) => {
  let transactionStarted = false;
  try {
    const { applicationId, documentId } = req.params;
    const user = req.user;

    const result = await pool.query(
      `SELECT d.*, a.applicant_id
       FROM documents d
       JOIN applications a ON a.id = d.application_id
       WHERE d.id = $1 AND d.application_id = $2`,
      [documentId, applicationId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Document not found for this application' });
    }

    const document = result.rows[0];
    if ((user.accountType === 'applicant' || user.role === 'applicant') && document.applicant_id !== user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('BEGIN');
    transactionStarted = true;
    await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
    await pool.query('COMMIT');

    // Clean up file after successful db delete
    const absolutePath = getDocumentFilePath(document);
    await removeFileIfExists(absolutePath);

    return res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    if (transactionStarted) {
      await pool.query('ROLLBACK').catch((rollbackError) => {
        console.error('Rollback error:', rollbackError);
      });
    }
    console.error('Delete application document error:', error);
    return res.status(500).json({ error: 'Failed to delete document', details: error.message });
  }
};

/**
 * Submit offline payment proof for an application fee
 * POST /api/applications/:id/payment-proof
 */
exports.submitApplicationPaymentProof = async (req, res) => {
  const client = await pool.connect();
  try {
    const applicationId = Number.parseInt(req.params.id, 10);
    const user = req.user;
    const {
      amount,
      payment_method,
      reference_no,
      submitted_at,
    } = req.body;

    await client.query('BEGIN');

    const appResult = await client.query(
      `SELECT id, applicant_id
       FROM applications
       WHERE id = $1
       FOR UPDATE`,
      [applicationId]
    );

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    if ((user.accountType === 'applicant' || user.role === 'applicant') && appResult.rows[0].applicant_id !== user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only submit payment proof for your own applications' });
    }

    const normalizedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payment amount must be a valid positive number' });
    }

    const normalizedMethod = normalizeString(payment_method);
    if (!['bank', 'counter'].includes(normalizedMethod)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'payment_method must be bank or counter' });
    }

    const normalizedReference = normalizeString(reference_no) || `OFFLINE-${applicationId}-${Date.now()}`;
    const paidAt = submitted_at ? new Date(submitted_at) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'submitted_at must be a valid date time' });
    }

    const paymentResult = await client.query(
      `INSERT INTO payments (
        application_id,
        payment_type,
        amount,
        status,
        transaction_id,
        payment_method,
        paid_at
      )
      VALUES ($1, 'application_fee', $2, 'processing', $3, $4, $5)
      RETURNING *`,
      [applicationId, normalizedAmount, normalizedReference, normalizedMethod, paidAt.toISOString()]
    );

    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'payment_pending', NOW(), $2, $3, 'payment-proof-submitted')`,
      [applicationId, getChangedByStaffId(user), `Offline payment proof submitted via ${normalizedMethod}`]
    );

    await client.query(
      `UPDATE applications
       SET last_updated = NOW()
       WHERE id = $1`,
      [applicationId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Payment proof submitted successfully',
      payment: paymentResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit payment proof error:', error);
    res.status(500).json({ error: 'Failed to submit payment proof', details: error.message });
  } finally {
    client.release();
  }
};

/**
 * Record online payment for an application fee
 * POST /api/applications/:id/payments/online
 */
exports.recordApplicationOnlinePayment = async (req, res) => {
  const client = await pool.connect();
  try {
    const applicationId = Number.parseInt(req.params.id, 10);
    const user = req.user;
    const {
      amount,
      transaction_id,
      receipt_id,
      paid_at,
    } = req.body;

    await client.query('BEGIN');

    const appResult = await client.query(
      `SELECT id, applicant_id
       FROM applications
       WHERE id = $1
       FOR UPDATE`,
      [applicationId]
    );

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    if ((user.accountType === 'applicant' || user.role === 'applicant') && appResult.rows[0].applicant_id !== user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only pay for your own applications' });
    }

    const normalizedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payment amount must be a valid positive number' });
    }

    const normalizedTransactionId = normalizeString(transaction_id) || normalizeString(receipt_id) || `ONLINE-${applicationId}-${Date.now()}`;
    const paidAt = paid_at ? new Date(paid_at) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'paid_at must be a valid date time' });
    }

    const paymentResult = await client.query(
      `INSERT INTO payments (
        application_id,
        payment_type,
        amount,
        status,
        transaction_id,
        payment_method,
        paid_at
      )
      VALUES ($1, 'application_fee', $2, 'completed', $3, 'online', $4)
      RETURNING *`,
      [applicationId, normalizedAmount, normalizedTransactionId, paidAt.toISOString()]
    );

    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'payment_pending', NOW(), $2, $3, 'payment-online-completed')`,
      [applicationId, getChangedByStaffId(user), 'Online application fee payment completed']
    );

    await client.query(
      `UPDATE applications
       SET last_updated = NOW()
       WHERE id = $1`,
      [applicationId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Online payment recorded successfully',
      payment: paymentResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Record online payment error:', error);
    res.status(500).json({ error: 'Failed to record online payment', details: error.message });
  } finally {
    client.release();
  }
};

/**
 * BATCH OPERATIONS (STEP 5)
 * =========================
 */

/**
 * Record preliminary check results (draft or final)
 * POST /api/applications/:id/preliminary-check
 */
exports.recordPreliminaryCheck = async (req, res) => {
  const client = await pool.connect();
  try {
    const applicationId = Number.parseInt(req.params.id, 10);
    const user = req.user;
    const {
      deficientDocuments, // Array of { id, label, reason }
      notes,
      isDraft,
      checklist, // Object of { surveyScale: bool, ... }
    } = req.body;

    await client.query('BEGIN');

    // Fetch current status
    const appResult = await client.query(
      'SELECT id, status FROM applications WHERE id = $1 FOR UPDATE',
      [applicationId]
    );

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }

    const currentStatus = appResult.rows[0].status;
    let newStatus = currentStatus;

    // Determine new status if not a draft
    if (isDraft === false) {
      if (deficientDocuments && deficientDocuments.length > 0) {
        newStatus = 'correction';
      } else {
        newStatus = 'verified';
      }
    }

    // Save preliminary check data (JSONB)
    const preliminaryCheckData = {
      checklist: checklist || {},
      deficientDocuments: deficientDocuments || [],
      notes: notes || '',
      lastUpdatedBy: user.userId,
      lastUpdatedAt: new Date().toISOString(),
      isDraft: !!isDraft,
    };

    await client.query(
      `UPDATE applications 
       SET preliminary_check_data = $1,
           status = $2,
           last_updated = NOW()
       WHERE id = $3`,
      [JSON.stringify(preliminaryCheckData), newStatus, applicationId]
    );

    // Record status history if changed
    if (newStatus !== currentStatus) {
      await client.query(
        `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason)
         VALUES ($1, $2, NOW(), $3, $4)`,
        [applicationId, newStatus, getChangedByStaffId(user), isDraft ? 'Draft progress saved' : (newStatus === 'verified' ? 'Preliminary verification completed' : 'Corrections requested')]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: isDraft ? 'Preliminary check progress saved' : 'Preliminary check finalized',
      status: newStatus,
      preliminaryCheckData,
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Record preliminary check error:', error);
    res.status(500).json({ error: 'Failed to record preliminary check', details: error.message });
  } finally {
    if (client) client.release();
  }
};

/**
 * Bulk status updates for multiple applications
 * POST /api/applications/batch/status-updates
 * 
 * Request body: {
 *   updates: [
 *     { applicationId, newStatus, notes? },
 *     ...
 *   ]
 * }
 *
 * All updates execute in single transaction - rollback on first failure
 * Returns: { successCount, failureCount, results: [{applicationId, success, message, error?}] }
 */
exports.batchUpdateStatus = async (req, res) => {
  let transactionStarted = false;
  try {
    const { updates } = req.body;
    const user = req.user;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates must be a non-empty array' });
    }

    if (updates.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 updates per batch allowed' });
    }

    const results = [];

    await pool.query('BEGIN');
    transactionStarted = true;

    // Process each update in the batch
    for (const update of updates) {
      const { applicationId, newStatus, notes } = update;

      // Basic validation
      if (!applicationId || !newStatus) {
        results.push({
          applicationId,
          success: false,
          message: 'Missing required fields: applicationId, newStatus',
        });
        continue;
      }

      if (!isValidApplicationStatus(newStatus)) {
        results.push({
          applicationId,
          success: false,
          message: `Invalid status: ${newStatus}`,
        });
        continue;
      }

      try {
        // Get current application with row lock
        const appResult = await pool.query(
          'SELECT * FROM applications WHERE id = $1 FOR UPDATE',
          [applicationId]
        );

        if (!appResult.rows.length) {
          results.push({
            applicationId,
            success: false,
            message: 'Application not found',
          });
          continue;
        }

        const currentApplication = appResult.rows[0];

        // Validate transition
        const transitionCheck = validateApplicationStatusTransition({
          fromStatus: currentApplication.status,
          toStatus: newStatus,
          userRole: user.role,
        });

        if (!transitionCheck.allowed) {
          results.push({
            applicationId,
            success: false,
            message: transitionCheck.reason,
            allowedNextStatuses: getAllowedNextStatuses(currentApplication.status, user.role),
          });
          continue;
        }

        // Check notes requirement
        if (STATUSES_REQUIRING_REASON.includes(newStatus) && (!notes || notes.length < 5)) {
          results.push({
            applicationId,
            success: false,
            message: `Status ${newStatus} requires notes with at least 5 characters`,
          });
          continue;
        }

        // Update application status
        await pool.query(
          `UPDATE applications 
           SET status = $1, last_updated = NOW() 
           WHERE id = $2`,
          [newStatus, applicationId]
        );

        // Record in status history
        await pool.query(
          `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
           VALUES ($1, $2, NOW(), $3, $4, $5)`,
          [applicationId, newStatus, user.userId, notes || null, `${currentApplication.status}->${newStatus}`]
        );

        results.push({
          applicationId,
          success: true,
          message: `Status updated from '${currentApplication.status}' to '${newStatus}'`,
          fromStatus: currentApplication.status,
          toStatus: newStatus,
        });
      } catch (itemError) {
        results.push({
          applicationId,
          success: false,
          message: 'Database error during update',
          error: itemError.message,
        });
      }
    }

    // Check if any failed - if yes, rollback
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      await pool.query('ROLLBACK');
      return res.status(400).json({
        message: 'Batch operation rolled back - one or more updates failed',
        successCount: results.filter(r => r.success).length,
        failureCount: failedResults.length,
        results,
      });
    }

    await pool.query('COMMIT');

    res.json({
      message: 'All status updates completed successfully',
      successCount: results.length,
      failureCount: 0,
      results,
    });
  } catch (error) {
    if (transactionStarted) {
      await pool.query('ROLLBACK').catch(err => console.error('Rollback error:', err));
    }
    console.error('Batch update status error:', error);
    res.status(500).json({ 
      error: 'Failed to process batch updates', 
      details: error.message,
      successCount: 0,
      failureCount: 0,
      results: [],
    });
  }
};

/**
 * Bulk application assignments
 * POST /api/applications/batch/assign
 * 
 * Request body: {
 *   assignments: [
 *     { applicationId, assignedTo },
 *     ...
 *   ]
 * }
 *
 * All assignments execute in single transaction - rollback on first failure
 * Returns: { successCount, failureCount, results: [{applicationId, success, message, error?}] }
 */
exports.batchAssignApplications = async (req, res) => {
  let transactionStarted = false;
  try {
    const { assignments } = req.body;
    const user = req.user;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'Assignments must be a non-empty array' });
    }

    if (assignments.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 assignments per batch allowed' });
    }

    const results = [];

    await pool.query('BEGIN');
    transactionStarted = true;

    const normalizedAssignments = assignments.map((assignment) => ({
      applicationId: assignment.applicationId,
      assignedTo: normalizeString(assignment.assignedTo),
      notes: normalizeString(assignment.notes) || null,
    }));

    const numericStaffIds = normalizedAssignments
      .filter((assignment) => /^\d+$/.test(assignment.assignedTo || ''))
      .map((assignment) => Number.parseInt(assignment.assignedTo, 10));

    // Get all staff IDs upfront to verify they exist
    const staffIds = [...new Set(numericStaffIds)];
    const staffResult = await pool.query(
      'SELECT id FROM staff_accounts WHERE id = ANY($1)',
      [staffIds]
    );

    const validStaffIds = new Set(staffResult.rows.map(r => r.id));

    // Process each assignment in the batch
    for (const assignment of normalizedAssignments) {
      const { applicationId, assignedTo } = assignment;

      // Basic validation
      if (!applicationId || !assignedTo) {
        results.push({
          applicationId,
          success: false,
          message: 'Missing required fields: applicationId, assignedTo',
        });
        continue;
      }

      let resolvedStaff = null;
      if (/^\d+$/.test(assignedTo)) {
        const assignedToId = Number.parseInt(assignedTo, 10);
        if (validStaffIds.has(assignedToId)) {
          resolvedStaff = { id: assignedToId };
        }
      }

      if (!resolvedStaff) {
        const staffLookup = await pool.query(
          `SELECT id FROM staff_accounts WHERE staff_id = $1 OR LOWER(full_name) = LOWER($1) ORDER BY id ASC LIMIT 1`,
          [assignedTo]
        );

        if (staffLookup.rows.length) {
          resolvedStaff = staffLookup.rows[0];
        }
      }

      if (!resolvedStaff) {
        results.push({
          applicationId,
          success: false,
          message: `Staff member ${assignedTo} not found`,
        });
        continue;
      }

      try {
        // Get application with row lock
        const appResult = await pool.query(
          'SELECT id FROM applications WHERE id = $1 FOR UPDATE',
          [applicationId]
        );

        if (!appResult.rows.length) {
          results.push({
            applicationId,
            success: false,
            message: 'Application not found',
          });
          continue;
        }

        // Check for existing active assignment
        const existingAssignment = await pool.query(
          `SELECT id FROM application_assignments 
           WHERE application_id = $1 AND status IN ('pending', 'accepted', 'in_progress')`,
          [applicationId]
        );

        if (existingAssignment.rows.length) {
          // Update existing assignment
          await pool.query(
            `UPDATE application_assignments 
             SET assigned_to = $1, assigned_by = $2, assigned_at = NOW(), notes = COALESCE($3, notes) 
             WHERE application_id = $4 AND status IN ('pending', 'accepted', 'in_progress')`,
            [resolvedStaff.id, user.userId, assignment.notes, applicationId]
          );

          results.push({
            applicationId,
            success: true,
            message: `Assignment updated for staff member ${resolvedStaff.id}`,
            assignedTo: resolvedStaff.id,
          });
        } else {
          // Create new assignment
          await pool.query(
            `INSERT INTO application_assignments (application_id, assigned_to, assigned_by, assignment_type, status)
             VALUES ($1, $2, $3, 'batch_assignment', 'pending')`,
            [applicationId, resolvedStaff.id, user.userId]
          );

          results.push({
            applicationId,
            success: true,
            message: `Application assigned to staff member ${resolvedStaff.id}`,
            assignedTo: resolvedStaff.id,
          });
        }
      } catch (itemError) {
        results.push({
          applicationId,
          success: false,
          message: 'Database error during assignment',
          error: itemError.message,
        });
      }
    }

    // Check if any failed - if yes, rollback
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      await pool.query('ROLLBACK');
      return res.status(400).json({
        message: 'Batch operation rolled back - one or more assignments failed',
        successCount: results.filter(r => r.success).length,
        failureCount: failedResults.length,
        results,
      });
    }

    await pool.query('COMMIT');

    res.json({
      message: 'All assignments completed successfully',
      successCount: results.length,
      failureCount: 0,
      results,
    });
  } catch (error) {
    if (transactionStarted) {
      await pool.query('ROLLBACK').catch(err => console.error('Rollback error:', err));
    }
    console.error('Batch assign error:', error);
    res.status(500).json({ 
      error: 'Failed to process batch assignments', 
      details: error.message,
      successCount: 0,
      failureCount: 0,
      results: [],
    });
  }
}

/**
 * Resubmit an application after corrections
 * PATCH /api/applications/:id/resubmit
 */
exports.resubmitApplication = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const { id } = req.params;
    const user = req.user;
    const {
      application_type,
      submitted_applicant_name,
      submitted_nic_number,
      submitted_email,
      submitted_address,
      submitted_contact,
      selected_permit_codes,
      assessment_number,
      deed_number,
      survey_plan_ref,
      land_extent,
      project_details,
      latitude,
      longitude,
      declaration_accepted,
    } = req.body;

    await client.query('BEGIN');

    // Verify application belongs to user and is in correction status
    const appResult = await client.query(
      'SELECT status FROM applications WHERE id = $1 AND applicant_id = $2 FOR UPDATE',
      [id, user.userId]
    );

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found or unauthorized' });
    }

    if (appResult.rows[0].status !== 'correction' && appResult.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only applications in correction or draft status can be resubmitted' });
    }

    const normalizedName = normalizeString(submitted_applicant_name);
    const normalizedNic = normalizeString(submitted_nic_number);
    const normalizedEmail = normalizeString(submitted_email)?.toLowerCase();
    const normalizedAddress = normalizeString(submitted_address) || 'N/A';
    const normalizedContact = normalizeString(submitted_contact) || 'N/A';
    const selectedPermitCodes = parseSelectedPermitCodes(selected_permit_codes);

    // Update application
    const result = await client.query(
      `UPDATE applications 
       SET 
         application_type = $1, 
         submitted_applicant_name = $2, 
         submitted_nic_number = $3,
         submitted_address = $4, 
         submitted_contact = $5, 
         submitted_email = $6,
         assessment_number = $7, 
         deed_number = $8, 
         survey_plan_ref = $9, 
         land_extent = $10,
         project_details = $11, 
         latitude = $12, 
         longitude = $13, 
         declaration_accepted = $14,
         status = 'submitted',
         last_updated = NOW()
       WHERE id = $15
       RETURNING id, application_code, status, submission_date`,
      [
        application_type,
        normalizedName,
        normalizedNic,
        normalizedAddress,
        normalizedContact,
        normalizedEmail,
        normalizeString(assessment_number) || null,
        normalizeString(deed_number) || null,
        normalizeString(survey_plan_ref) || null,
        normalizeString(land_extent) || null,
        project_details ? (typeof project_details === 'string' ? JSON.parse(project_details) : project_details) : null,
        latitude || null,
        longitude || null,
        declaration_accepted === true,
        id
      ]
    );

    await syncSelectedPermitCodes(client, id, selectedPermitCodes);

    // Add status history entry
    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason)
       VALUES ($1, 'submitted', NOW(), $2, 'Applicant resubmitted corrected application')`,
      [id, user.userId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Application resubmitted successfully',
      application: result.rows[0]
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Resubmit application error:', error);
    res.status(500).json({ error: 'Failed to resubmit application', details: error.message });
  } finally {
    if (client) client.release();
  }
};

/**
 * Set inspection fee for an application
 * POST /api/applications/:id/set-fee
 */
exports.setApplicationFee = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const applicationId = Number.parseInt(req.params.id, 10);
    const { amount, notes } = req.body;
    const user = req.user;

    const normalizedAmount = Number.parseFloat(amount);
    if (Number.isNaN(normalizedAmount) || normalizedAmount < 0) {
      return res.status(400).json({ error: 'Inspection fee must be a valid non-negative number' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    // Get current application with row lock
    const appResult = await client.query(
      'SELECT status, applicant_id FROM applications WHERE id = $1 FOR UPDATE',
      [applicationId]
    );

    if (!appResult.rows.length) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Application not found' });
    }

    const application = appResult.rows[0];

    // Create payment record (remove old pending application_fee payments if any)
    await client.query(
      "DELETE FROM payments WHERE application_id = $1 AND payment_type = 'application_fee' AND status = 'pending'",
      [applicationId]
    );

    const paymentResult = await client.query(
      `INSERT INTO payments (
        application_id, 
        payment_type, 
        amount, 
        status, 
        transaction_id, 
        payment_method, 
        created_at
      ) 
      VALUES ($1, 'application_fee', $2, 'pending', $3, 'online', NOW())
      RETURNING *`,
      [applicationId, normalizedAmount, `REQ-${applicationId}-${Date.now()}`]
    );

    // Update application status
    await client.query(
      `UPDATE applications 
       SET status = 'payment_pending', last_updated = NOW() 
       WHERE id = $1`,
      [applicationId]
    );

    // Record in history
    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'payment_pending', NOW(), $2, $3, 'fee-set')`,
      [applicationId, user.userId, notes || `Inspection fee of LKR ${normalizedAmount.toLocaleString()} set by planning officer`]
    );

    // Create notification for applicant
    await client.query(
      `INSERT INTO notifications (
        user_type, 
        applicant_id, 
        notification_type, 
        title, 
        message, 
        related_application_id,
        related_entity_type,
        related_entity_id,
        priority
      )
      VALUES ('applicant', $1, 'payment_pending', 'Inspection Fee Required', $2, $3, 'payment', $4, 'normal')`,
      [
        application.applicant_id, 
        `An inspection fee of LKR ${normalizedAmount.toLocaleString()} has been set for your application. Please complete the payment to proceed.`,
        applicationId,
        paymentResult.rows[0].id
      ]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    res.json({
      message: 'Inspection fee set successfully and applicant notified',
      payment: paymentResult.rows[0]
    });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query('ROLLBACK').catch(e => console.error('Rollback failed:', e));
    }
    console.error('Set application fee error:', {
      message: error.message,
      stack: error.stack,
      applicationId: req.params.id,
      amount: req.body.amount
    });
    res.status(500).json({ 
      error: 'Failed to set application fee', 
      details: error.message,
      code: error.code // Include DB error code if available
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

/**
 * Verify payment proof for an application fee
 * POST /api/applications/:id/verify-payment
 */
exports.verifyApplicationPayment = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const applicationId = Number.parseInt(req.params.id, 10);
    const user = req.user;

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    // Get current application and pending/processing payment
    const paymentResult = await client.query(
      `SELECT id, status FROM payments 
       WHERE application_id = $1 AND payment_type = 'application_fee' AND status IN ('pending', 'processing', 'submitted')
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [applicationId]
    );

    if (!paymentResult.rows.length) {
      // Check if already completed
      const checkResult = await client.query(
        "SELECT id FROM payments WHERE application_id = $1 AND payment_type = 'application_fee' AND status = 'completed'",
        [applicationId]
      );
      
      if (checkResult.rows.length) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(200).json({ message: 'Payment already verified' });
      }
      
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'No pending or processing inspection fee payment record found for this application' });
    }

    const paymentId = paymentResult.rows[0].id;

    // Update payment status
    await client.query(
      "UPDATE payments SET status = 'completed', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1",
      [paymentId]
    );

    // Update application status to under_review (ready for TO assignment)
    await client.query(
      "UPDATE applications SET status = 'under_review', last_updated = NOW() WHERE id = $1",
      [applicationId]
    );

    // Record in history
    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, 'under_review', NOW(), $2, 'Payment verified by planning officer', 'payment-verified')`,
      [applicationId, user.userId]
    );

    // Create notification for applicant
    await client.query(
      `INSERT INTO notifications (
        user_type, applicant_id, notification_type, title, message, related_application_id, priority
      )
      SELECT 'applicant', applicant_id, 'payment_received', 'Payment Verified', 
             'Your inspection fee payment has been verified. Your application is now moving to technical review.', 
             $1, 'normal'
      FROM applications WHERE id = $1`,
      [applicationId]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    res.json({ message: 'Payment verified successfully. Application moved to Technical Review.' });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query('ROLLBACK').catch(e => console.error('Rollback failed:', e));
    }
    console.error('Verify application payment error:', {
      message: error.message,
      stack: error.stack,
      applicationId: req.params.id
    });
    res.status(500).json({ 
      error: 'Failed to verify application payment', 
      details: error.message,
      code: error.code
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};
