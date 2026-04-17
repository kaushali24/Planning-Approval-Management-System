const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generateToken } = require('../utils/jwt');
const { validateApplicantRegistration, validateFullName, validatePhone, normalizePhone } = require('../utils/validation');
const { generateOTP, sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');

const hasDuplicateApplicantContact = async (client, normalizedContact, excludeApplicantId = null) => {
  const { rows } = await client.query(
    'SELECT id, contact_number FROM applicants WHERE contact_number IS NOT NULL'
  );

  return rows.some((row) => {
    if (excludeApplicantId && Number(row.id) === Number(excludeApplicantId)) {
      return false;
    }

    return normalizePhone(row.contact_number) === normalizedContact;
  });
};

// Helper: generate sequential applicant ID per year (APP/YYYY/00001)
const getNextApplicantId = async (client) => {
  const year = new Date().getFullYear();
  const prefix = `APP/${year}/`;

  const { rows } = await client.query(
    `SELECT applicant_ref_id
     FROM applicants
     WHERE applicant_ref_id LIKE $1
     ORDER BY applicant_ref_id DESC
     LIMIT 1`,
    [`${prefix}%`]
  );

  const lastId = rows[0]?.applicant_ref_id;
  const lastSeq = lastId ? parseInt(lastId.split('/').pop(), 10) : 0;
  const nextSeq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
  const padded = String(nextSeq).padStart(5, '0');

  return `${prefix}${padded}`;
};

// Register - Applicant only
exports.register = async (req, res) => {
  const client = await pool.connect();

  try {
    const { fullName, nicNumber, email, contactNumber, password } = req.body;

    // Validate input
    const validation = validateApplicantRegistration({
      fullName,
      nicNumber,
      email,
      contactNumber,
      password
    });

    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }

    // Check if email already used
    const emailCheck = await client.query(
      `SELECT email FROM applicants WHERE email = $1
       UNION ALL
       SELECT email FROM staff_accounts WHERE email = $1`,
      [email]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Check if NIC already used
    const nicCheck = await client.query(
      'SELECT nic_number FROM applicants WHERE nic_number = $1',
      [nicNumber]
    );

    if (nicCheck.rows.length > 0) {
      return res.status(400).json({ error: 'NIC number already registered' });
    }

    const normalizedContactNumber = normalizePhone(contactNumber);

    // Check if contact number already used (normalized to handle +94 vs 0 format)
    const hasDuplicateContact = await hasDuplicateApplicantContact(client, normalizedContactNumber);

    if (hasDuplicateContact) {
      return res.status(400).json({ error: 'Contact number already registered' });
    }

    await client.query('BEGIN');

    const applicantId = await getNextApplicantId(client);
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP for email verification
    const verificationCode = generateOTP();
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const insertQuery = `
      INSERT INTO applicants (applicant_ref_id, full_name, nic_number, email, contact_number, password_hash, verification_code, verification_code_expires)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, applicant_ref_id AS applicant_id, full_name, nic_number, email, contact_number, email_verified, created_at;
    `;

    const { rows } = await client.query(insertQuery, [
      applicantId,
      fullName,
      nicNumber,
      email,
      normalizedContactNumber,
      hashedPassword,
      verificationCode,
      codeExpires,
    ]);

    await client.query('COMMIT');

    const user = rows[0];

    // Send verification email
    const emailResult = await sendVerificationEmail(email, fullName, verificationCode);

    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error);
      // Don't fail registration if email fails, user can resend
    }

    res.status(201).json({
      message: 'Registration successful. Please check your email for verification code.',
      user: {
        id: user.id,
        applicantId: user.applicant_id,
        fullName: user.full_name,
        email: user.email,
        emailVerified: user.email_verified,
      },
      requiresVerification: true,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
};

// Login - Applicant & Staff
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', { email, passwordLength: password?.length });

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Fetch from applicants or staff (email should be unique across both)
    const query = `
                  SELECT id, applicant_ref_id AS external_id, 'applicant' AS account_type, 'applicant' AS role,
             full_name, nic_number, contact_number, email, password_hash, email_verified
      FROM applicants WHERE email = $1 AND is_active = true
      UNION ALL
      SELECT id, staff_id AS external_id, 'staff' AS account_type, role,
             full_name, NULL AS nic_number, NULL AS contact_number, email, password_hash, true AS email_verified
      FROM staff_accounts WHERE email = $1 AND is_active = true
      LIMIT 1;
    `;

    const result = await pool.query(query, [email]);
    console.log('Query result rows:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('No user found with email:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    console.log('User found:', { id: user.id, email: user.email, account_type: user.account_type });
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    console.log('Password match:', passwordMatch);

    if (!passwordMatch) {
      console.log('Password does not match');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check email verification for applicants only
    if (user.account_type === 'applicant' && !user.email_verified) {
      return res.status(403).json({ 
        error: 'Email not verified. Please check your email for the verification code.',
        requiresVerification: true,
        email: user.email
      });
    }

    const token = generateToken({
      userId: user.id,
      role: user.role,
      accountType: user.account_type,
      externalId: user.external_id,
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        accountType: user.account_type,
        externalId: user.external_id,
        full_name: user.full_name,
        nic_number: user.nic_number,
        contact_number: user.contact_number,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    const { accountType, userId } = req.user;

    if (!accountType) {
      return res.status(400).json({ error: 'Account type missing from token' });
    }

    if (accountType === 'applicant') {
      const { rows } = await pool.query(
        `SELECT id, applicant_ref_id AS applicant_id, full_name, nic_number, email, contact_number, created_at, is_active
         FROM applicants WHERE id = $1`,
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({ user: { ...rows[0], role: 'applicant', account_type: 'applicant' } });
    }

    if (accountType === 'staff') {
      const { rows } = await pool.query(
        `SELECT id, staff_id, full_name, email, role, is_active, created_at
         FROM staff_accounts WHERE id = $1`,
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({ user: { ...rows[0], account_type: 'staff' } });
    }

    return res.status(400).json({ error: 'Unrecognized account type' });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Forgot password - send OTP reset code
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const accountLookup = await pool.query(
      `SELECT id, full_name, 'applicant' AS account_type FROM applicants WHERE email = $1 AND is_active = true
       UNION ALL
       SELECT id, full_name, 'staff' AS account_type FROM staff_accounts WHERE email = $1 AND is_active = true`,
      [email]
    );

    if (accountLookup.rows.length === 0) {
      // Don't reveal if email exists (security best practice)
      return res.status(200).json({ message: 'If email exists, reset code will be sent shortly' });
    }

    const user = accountLookup.rows[0];

    // Generate 6-digit OTP
    const resetToken = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query(
      'INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)',
      [email, resetToken, expiresAt]
    );

    // Send password reset email
    const emailResult = await sendPasswordResetEmail(email, user.full_name, resetToken);

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      // Still return success to not reveal email existence
    }

    res.json({
      message: 'If email exists, reset code will be sent shortly',
      // Only show token in development for testing
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

// Verify reset token/OTP
exports.verifyResetToken = async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      return res.status(400).json({ error: 'Email and token are required' });
    }

    const result = await pool.query(
      'SELECT id FROM password_resets WHERE email = $1 AND token = $2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    res.json({ message: 'Reset code is valid' });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// Reset password with OTP
exports.resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate password strength
    const passwordValidation = require('../utils/validation').validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    const tokenResult = await pool.query(
      'SELECT id FROM password_resets WHERE email = $1 AND token = $2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    const accountLookup = await pool.query(
      `SELECT id, 'applicant' AS account_type FROM applicants WHERE email = $1 AND is_active = true
       UNION ALL
       SELECT id, 'staff' AS account_type FROM staff_accounts WHERE email = $1 AND is_active = true`,
      [email]
    );

    if (accountLookup.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (accountLookup.rows.length > 1) {
      return res.status(400).json({ error: 'Email is linked to multiple accounts. Contact admin.' });
    }

    const account = accountLookup.rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (account.account_type === 'applicant') {
      await pool.query(
        'UPDATE applicants SET password_hash = $1, updated_at = NOW() WHERE email = $2',
        [hashedPassword, email]
      );
    } else {
      await pool.query(
        'UPDATE staff_accounts SET password_hash = $1, updated_at = NOW() WHERE email = $2',
        [hashedPassword, email]
      );
    }

    await pool.query('DELETE FROM password_resets WHERE email = $1', [email]);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
};

// Change password (authenticated)
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { accountType, userId } = req.user || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (!accountType || !userId) {
      return res.status(400).json({ error: 'Invalid token or session' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Fetch user record depending on account type
    let table, idColumn;
    if (accountType === 'applicant') {
      table = 'applicants';
      idColumn = 'id';
    } else if (accountType === 'staff') {
      table = 'staff_accounts';
      idColumn = 'id';
    } else {
      return res.status(400).json({ error: 'Unrecognized account type' });
    }

    const { rows } = await pool.query(
      `SELECT password_hash FROM ${table} WHERE ${idColumn} = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const matches = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const sameAsOld = await bcrypt.compare(newPassword, rows[0].password_hash);
    if (sameAsOld) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE ${table} SET password_hash = $1, updated_at = NOW() WHERE ${idColumn} = $2`,
      [newHash, userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// Update applicant profile (authenticated)
exports.updateProfile = async (req, res) => {
  try {
    const { accountType, userId } = req.user || {};
    const { fullName, contactNumber } = req.body;

    if (!accountType || !userId) {
      return res.status(400).json({ error: 'Invalid token or session' });
    }

    if (accountType !== 'applicant') {
      return res.status(403).json({ error: 'Only applicants can update this profile section' });
    }

    if (!fullName || !contactNumber) {
      return res.status(400).json({ error: 'Full name and contact number are required' });
    }

    if (!validateFullName(fullName)) {
      return res.status(400).json({ error: 'Invalid full name format' });
    }

    if (!validatePhone(contactNumber)) {
      return res.status(400).json({ error: 'Invalid contact number format' });
    }

    const normalizedContactNumber = normalizePhone(contactNumber);
    const hasDuplicateContact = await hasDuplicateApplicantContact(pool, normalizedContactNumber, userId);

    if (hasDuplicateContact) {
      return res.status(400).json({ error: 'Contact number already registered' });
    }

    const { rows } = await pool.query(
      `UPDATE applicants
       SET full_name = $1,
           contact_number = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, applicant_ref_id AS applicant_id, full_name, nic_number, email, contact_number, email_verified, created_at, updated_at`,
      [fullName.trim(), normalizedContactNumber, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'Profile updated successfully',
      user: {
        ...rows[0],
        role: 'applicant',
        account_type: 'applicant',
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Admin: Reset staff password
exports.resetStaffPassword = async (req, res) => {
  try {
    const { staffEmail, newPassword } = req.body;
    const { userId, role } = req.user || {};

    if (!staffEmail || !newPassword) {
      return res.status(400).json({ error: 'Staff email and new password are required' });
    }

    if (!userId || role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Find the staff account
    const { rows } = await pool.query(
      'SELECT id, staff_id, email FROM staff_accounts WHERE email = $1',
      [staffEmail]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Staff account not found' });
    }

    const staff = rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE staff_accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, staff.id]
    );

    console.log(`Admin ${req.user.userId} reset password for staff ${staff.staff_id}`);

    res.json({ 
      message: 'Staff password reset successfully',
      staffId: staff.staff_id 
    });
  } catch (error) {
    console.error('Reset staff password error:', error);
    res.status(500).json({ error: 'Failed to reset staff password' });
  }
};

// Verify email with OTP
exports.verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    const { rows } = await pool.query(
      'SELECT id, applicant_ref_id AS applicant_id, full_name, email, verification_code, verification_code_expires, email_verified FROM applicants WHERE email = $1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const user = rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    if (!user.verification_code || !user.verification_code_expires) {
      return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
    }

    if (new Date() > new Date(user.verification_code_expires)) {
      return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
    }

    if (user.verification_code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Mark email as verified
    await pool.query(
      'UPDATE applicants SET email_verified = true, verification_code = NULL, verification_code_expires = NULL WHERE id = $1',
      [user.id]
    );

    // Generate token for auto-login
    const token = generateToken({
      userId: user.id,
      role: 'applicant',
      accountType: 'applicant',
      externalId: user.applicant_id,
    });

    res.json({
      message: 'Email verified successfully',
      user: {
        id: user.id,
        applicantId: user.applicant_id,
        fullName: user.full_name,
        email: user.email,
        emailVerified: true,
      },
      token,
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
};

// Resend verification OTP
exports.resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { rows } = await pool.query(
      'SELECT id, full_name, email, email_verified FROM applicants WHERE email = $1 AND email_verified = false',
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Account not found or already verified' });
    }

    const user = rows[0];

    // Generate new OTP
    const verificationCode = generateOTP();
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query(
      'UPDATE applicants SET verification_code = $1, verification_code_expires = $2 WHERE id = $3',
      [verificationCode, codeExpires, user.id]
    );

    // Send email
    const emailResult = await sendVerificationEmail(user.email, user.full_name, verificationCode);

    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error);
      return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
    }

    res.json({ message: 'Verification code sent successfully' });
  } catch (error) {
    console.error('Resend verification code error:', error);
    res.status(500).json({ error: 'Failed to resend verification code' });
  }
};
