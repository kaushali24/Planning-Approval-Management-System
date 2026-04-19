const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { validatePassword } = require('../utils/validation');

const STAFF_ROLES = ['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin'];
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';

const generateTemporaryPassword = (length = 12) => {
  let output = '';
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * TEMP_PASSWORD_CHARS.length);
    output += TEMP_PASSWORD_CHARS[index];
  }
  return output;
};

exports.getTechnicalOfficers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         sa.id,
         sa.staff_id,
         sa.full_name,
         sa.email,
         sa.role,
         sa.is_active,
         COALESCE(active_assignments.active_assignment_count, 0)::int AS active_assignment_count,
         COALESCE(active_assignments.inspection_pending_count, 0)::int AS inspection_pending_count,
         COALESCE(active_assignments.report_pending_count, 0)::int AS report_pending_count,
         COALESCE(coc_load.coc_active_count, 0)::int AS coc_active_count
       FROM staff_accounts sa
       LEFT JOIN (
         SELECT
           aa.assigned_to,
           COUNT(*)::int AS active_assignment_count,
           COUNT(*) FILTER (
             WHERE COALESCE(i.result, 'pending') = 'pending'
           )::int AS inspection_pending_count,
           COUNT(*) FILTER (
             WHERE COALESCE(i.result, 'pending') IN ('compliant', 'deviation')
           )::int AS report_pending_count
         FROM application_assignments aa
         LEFT JOIN inspections i ON i.application_id = aa.application_id
         WHERE aa.status IN ('pending', 'accepted', 'in_progress')
         GROUP BY aa.assigned_to
       ) active_assignments ON active_assignments.assigned_to = sa.id
       LEFT JOIN (
         SELECT
           cr.assigned_to,
           COUNT(*)::int AS coc_active_count
         FROM coc_requests cr
         WHERE cr.assigned_to IS NOT NULL
           AND cr.status IN ('assigned-to-to', 'inspection-complete')
         GROUP BY cr.assigned_to
       ) coc_load ON coc_load.assigned_to = sa.id
       WHERE sa.role = 'technical_officer'
         AND sa.is_active = TRUE
       ORDER BY sa.full_name ASC, sa.id ASC`
    );

    res.json({
      technicalOfficers: result.rows,
    });
  } catch (error) {
    console.error('Get technical officers error:', error);
    res.status(500).json({
      error: 'Failed to fetch technical officers',
      details: error.message,
    });
  }
};

exports.getStaffAccounts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, staff_id, full_name, email, role, is_active, created_at, updated_at
       FROM staff_accounts
       WHERE role <> 'admin'
       ORDER BY full_name ASC, id ASC`
    );

    res.json({
      staffAccounts: result.rows,
    });
  } catch (error) {
    console.error('Get staff accounts error:', error);
    res.status(500).json({
      error: 'Failed to fetch staff accounts',
      details: error.message,
    });
  }
};

exports.createStaffAccount = async (req, res) => {
  try {
    const { fullName, email, role, password } = req.body;
    const normalizedEmail = (email || '').toString().trim().toLowerCase();
    const normalizedRole = (role || '').toString().trim();
    const normalizedPassword = typeof password === 'string' ? password.trim() : '';
    const createdBy = req.user?.userId || null;

    if (!fullName || !normalizedEmail || !normalizedRole) {
      return res.status(400).json({ error: 'fullName, email, and role are required' });
    }

    if (!STAFF_ROLES.includes(normalizedRole) || normalizedRole === 'admin') {
      return res.status(400).json({ error: 'Invalid role for staff account creation' });
    }

    const duplicate = await pool.query('SELECT id FROM staff_accounts WHERE email = $1', [normalizedEmail]);
    if (duplicate.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    let initialPassword = normalizedPassword;
    let isTemporaryPassword = false;

    if (initialPassword) {
      const passwordValidation = validatePassword(initialPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({ error: passwordValidation.message });
      }
    } else {
      initialPassword = generateTemporaryPassword(12);
      isTemporaryPassword = true;
    }

    const passwordHash = await bcrypt.hash(initialPassword, 10);

    const created = await pool.query(
      `INSERT INTO staff_accounts (staff_id, full_name, email, role, password_hash, is_active, created_by, created_at, updated_at)
       VALUES (
         (
           SELECT 'STF-' || LPAD((COALESCE(MAX(SUBSTRING(staff_id FROM 'STF-(\\d+)')::int), 0) + 1)::text, 3, '0')
           FROM staff_accounts
         ),
         $1,
         $2,
         $3,
         $4,
         TRUE,
         $5,
         NOW(),
         NOW()
       )
       RETURNING id, staff_id, full_name, email, role, is_active, created_at, updated_at`,
      [fullName.toString().trim(), normalizedEmail, normalizedRole, passwordHash, createdBy]
    );

    res.status(201).json({
      message: 'Staff account created successfully',
      staffAccount: created.rows[0],
      temporaryPassword: isTemporaryPassword ? initialPassword : null,
      usedTemporaryPassword: isTemporaryPassword,
    });
  } catch (error) {
    console.error('Create staff account error:', error);
    res.status(500).json({
      error: 'Failed to create staff account',
      details: error.message,
    });
  }
};

exports.updateStaffAccountStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body;

    const result = await pool.query(
      `UPDATE staff_accounts
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
         AND role <> 'admin'
       RETURNING id, staff_id, full_name, email, role, is_active, created_at, updated_at`,
      [isActive === true, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Staff account not found' });
    }

    return res.json({
      message: `Staff account ${isActive ? 'activated' : 'deactivated'} successfully`,
      staffAccount: result.rows[0],
    });
  } catch (error) {
    console.error('Update staff account status error:', error);
    return res.status(500).json({
      error: 'Failed to update staff account status',
      details: error.message,
    });
  }
};