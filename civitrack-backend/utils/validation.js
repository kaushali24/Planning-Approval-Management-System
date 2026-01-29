// Validation utility functions

/**
 * Validate email format
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 */
const validatePassword = (password) => {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!/[@$!%*?&#]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character (@$!%*?&#)' };
  }
  return { valid: true };
};

/**
 * Validate Sri Lankan NIC number
 * Old format: 9 digits + V/X (e.g., 199512345V)
 * New format: 12 digits (e.g., 199951234567)
 */
const validateNIC = (nic) => {
  const nicRegex = /^([0-9]{9}[VvXx]|[0-9]{12})$/;
  return nicRegex.test(nic);
};

/**
 * Validate Sri Lankan phone number
 * Format: 0xxxxxxxxx (10 digits) or +94xxxxxxxxx
 */
const validatePhone = (phone) => {
  const phoneRegex = /^(\+94|0)[0-9]{9}$/;
  return phoneRegex.test(phone);
};

/**
 * Validate full name
 * Minimum 3 characters, only letters and spaces
 */
const validateFullName = (name) => {
  if (!name || name.trim().length < 3) {
    return false;
  }
  const nameRegex = /^[a-zA-Z\s]{3,}$/;
  return nameRegex.test(name.trim());
};

/**
 * Comprehensive validation for applicant registration
 */
const validateApplicantRegistration = (data) => {
  const errors = [];

  // Full name
  if (!data.fullName || !validateFullName(data.fullName)) {
    errors.push({ field: 'fullName', message: 'Full name must be at least 3 characters and contain only letters' });
  }

  // NIC
  if (!data.nicNumber || !validateNIC(data.nicNumber)) {
    errors.push({ field: 'nicNumber', message: 'Invalid NIC format. Use 9 digits + V/X or 12 digits' });
  }

  // Email
  if (!data.email || !validateEmail(data.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }

  // Phone
  if (!data.contactNumber || !validatePhone(data.contactNumber)) {
    errors.push({ field: 'contactNumber', message: 'Invalid phone number. Use format: 0771234567 or +94771234567' });
  }

  // Password
  if (!data.password) {
    errors.push({ field: 'password', message: 'Password is required' });
  } else {
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.valid) {
      errors.push({ field: 'password', message: passwordValidation.message });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  validateEmail,
  validatePassword,
  validateNIC,
  validatePhone,
  validateFullName,
  validateApplicantRegistration
};
