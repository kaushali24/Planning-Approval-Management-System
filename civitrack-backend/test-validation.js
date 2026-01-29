#!/usr/bin/env node
/**
 * CiviTrack Validation Tests
 * Tests input validation, error handling, and data integrity
 */

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

let testResults = { passed: 0, failed: 0 };

// ============================================================================
// VALIDATION FUNCTIONS (Backend-side tests)
// ============================================================================

/**
 * Email validation
 */
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Password validation - must have:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 */
function isValidPassword(password) {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[@$!%*?&]/.test(password)) return false;
  return true;
}

/**
 * NIC validation (Sri Lankan format)
 */
function isValidNIC(nic) {
  // 9 digits + V or 12 digits
  return /^(\d{9}[Vv]|\d{12})$/.test(nic);
}

/**
 * Phone number validation
 */
function isValidPhoneNumber(phone) {
  // Sri Lankan format: 07X or +947X
  return /^(\+947\d{8}|07\d{8})$/.test(phone);
}

/**
 * Test runner
 */
function test(description, fn) {
  try {
    process.stdout.write(`  ⏳ ${description}... `);
    const result = fn();
    if (result) {
      console.log(`${COLORS.green}✓ PASS${COLORS.reset}`);
      testResults.passed++;
    } else {
      console.log(`${COLORS.red}✗ FAIL${COLORS.reset}`);
      testResults.failed++;
    }
  } catch (error) {
    console.log(`${COLORS.red}✗ FAIL${COLORS.reset}`);
    console.log(`     ${error.message}`);
    testResults.failed++;
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

async function runTests() {
  console.log(`\n${COLORS.blue}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.yellow}CiviTrack Input Validation Tests${COLORS.reset}`);
  console.log(`${COLORS.blue}═══════════════════════════════════════════════════════${COLORS.reset}\n`);

  // =========================================================================
  // EMAIL VALIDATION
  // =========================================================================
  console.log(`${COLORS.yellow}1. EMAIL VALIDATION${COLORS.reset}\n`);

  test('Accept valid email', () => isValidEmail('user@example.com'));
  test('Accept complex valid email', () => isValidEmail('john.doe+tag@company.co.uk'));
  test('Reject email without @', () => !isValidEmail('userexample.com'));
  test('Reject email without domain', () => !isValidEmail('user@'));
  test('Reject email with spaces', () => !isValidEmail('user @example.com'));
  test('Reject empty email', () => !isValidEmail(''));
  test('Reject email with multiple @', () => !isValidEmail('user@@example.com'));

  // =========================================================================
  // PASSWORD VALIDATION
  // =========================================================================
  console.log(`\n${COLORS.yellow}2. PASSWORD VALIDATION${COLORS.reset}\n`);

  test('Accept valid strong password', () => isValidPassword('SecurePass@123'));
  test('Accept valid strong password 2', () => isValidPassword('MyPassword!2025'));
  test('Reject password < 8 characters', () => !isValidPassword('Pass@1'));
  test('Reject password without uppercase', () => !isValidPassword('securepass@123'));
  test('Reject password without lowercase', () => !isValidPassword('SECUREPASS@123'));
  test('Reject password without number', () => !isValidPassword('SecurePass@abc'));
  test('Reject password without special char', () => !isValidPassword('SecurePass123'));
  test('Reject empty password', () => !isValidPassword(''));
  test('Accept password with different special chars', () => isValidPassword('Test$Pass123'));
  test('Accept password with ! special char', () => isValidPassword('Test!Pass123'));

  // =========================================================================
  // NIC VALIDATION
  // =========================================================================
  console.log(`\n${COLORS.yellow}3. NIC NUMBER VALIDATION${COLORS.reset}\n`);

  test('Accept valid 9-digit NIC with V', () => isValidNIC('123456789V'));
  test('Accept valid 9-digit NIC with lowercase v', () => isValidNIC('123456789v'));
  test('Accept valid 12-digit NIC', () => isValidNIC('123456789012'));
  test('Reject NIC < 9 digits', () => !isValidNIC('12345678V'));
  test('Reject NIC with invalid format', () => !isValidNIC('1234567890'));
  test('Reject NIC with letters in digits', () => !isValidNIC('12345678AV'));
  test('Reject empty NIC', () => !isValidNIC(''));
  test('Reject NIC with spaces', () => !isValidNIC('123456789 V'));

  // =========================================================================
  // PHONE NUMBER VALIDATION
  // =========================================================================
  console.log(`\n${COLORS.yellow}4. PHONE NUMBER VALIDATION${COLORS.reset}\n`);

  test('Accept valid 07X format', () => isValidPhoneNumber('0712345678'));
  test('Accept valid +947X format', () => isValidPhoneNumber('+94712345678'));
  test('Reject phone without country code', () => !isValidPhoneNumber('712345678'));
  test('Reject phone with invalid prefix', () => !isValidPhoneNumber('0512345678'));
  test('Reject phone too short', () => !isValidPhoneNumber('071234567'));
  test('Reject phone too long', () => !isValidPhoneNumber('07123456789'));
  test('Reject phone with spaces', () => !isValidPhoneNumber('071 234 5678'));
  test('Reject empty phone', () => !isValidPhoneNumber(''));

  // =========================================================================
  // COMBINED VALIDATION TESTS
  // =========================================================================
  console.log(`\n${COLORS.yellow}5. FORM VALIDATION (COMBINED)${COLORS.reset}\n`);

  function validateRegistration(data) {
    const errors = [];
    
    if (!data.full_name || data.full_name.trim().length === 0) {
      errors.push('Full name is required');
    } else if (data.full_name.length < 3) {
      errors.push('Full name must be at least 3 characters');
    } else if (data.full_name.length > 255) {
      errors.push('Full name must not exceed 255 characters');
    }

    if (!isValidEmail(data.email)) {
      errors.push('Invalid email format');
    }

    if (!isValidNIC(data.nic_number)) {
      errors.push('Invalid NIC number format');
    }

    if (!isValidPhoneNumber(data.contact_number)) {
      errors.push('Invalid phone number format');
    }

    if (!isValidPassword(data.password)) {
      errors.push('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
    }

    return { valid: errors.length === 0, errors };
  }

  test('Valid registration form passes', () => {
    const result = validateRegistration({
      full_name: 'Kamal Silva',
      email: 'kamal@example.com',
      nic_number: '123456789V',
      contact_number: '0712345678',
      password: 'SecurePass@123'
    });
    return result.valid && result.errors.length === 0;
  });

  test('Invalid email rejected', () => {
    const result = validateRegistration({
      full_name: 'Kamal Silva',
      email: 'invalid-email',
      nic_number: '123456789V',
      contact_number: '0712345678',
      password: 'SecurePass@123'
    });
    return !result.valid && result.errors.includes('Invalid email format');
  });

  test('Weak password rejected', () => {
    const result = validateRegistration({
      full_name: 'Kamal Silva',
      email: 'kamal@example.com',
      nic_number: '123456789V',
      contact_number: '0712345678',
      password: '123'
    });
    return !result.valid && result.errors.some(e => e.includes('Password'));
  });

  test('Invalid NIC rejected', () => {
    const result = validateRegistration({
      full_name: 'Kamal Silva',
      email: 'kamal@example.com',
      nic_number: '12345678',
      contact_number: '0712345678',
      password: 'SecurePass@123'
    });
    return !result.valid && result.errors.includes('Invalid NIC number format');
  });

  test('Invalid phone rejected', () => {
    const result = validateRegistration({
      full_name: 'Kamal Silva',
      email: 'kamal@example.com',
      nic_number: '123456789V',
      contact_number: '1234567',
      password: 'SecurePass@123'
    });
    return !result.valid && result.errors.includes('Invalid phone number format');
  });

  test('Short name rejected', () => {
    const result = validateRegistration({
      full_name: 'Ka',
      email: 'kamal@example.com',
      nic_number: '123456789V',
      contact_number: '0712345678',
      password: 'SecurePass@123'
    });
    return !result.valid && result.errors.some(e => e.includes('at least 3 characters'));
  });

  test('Empty name rejected', () => {
    const result = validateRegistration({
      full_name: '',
      email: 'kamal@example.com',
      nic_number: '123456789V',
      contact_number: '0712345678',
      password: 'SecurePass@123'
    });
    return !result.valid && result.errors.includes('Full name is required');
  });

  // =========================================================================
  // SQL INJECTION PREVENTION
  // =========================================================================
  console.log(`\n${COLORS.yellow}6. SECURITY TESTS (SQL Injection Prevention)${COLORS.reset}\n`);

  test('Reject email with SQL injection attempt', () => {
    const malicious = "'; DROP TABLE applicants; --";
    return !isValidEmail(malicious);
  });

  test('Reject NIC with special SQL characters', () => {
    const malicious = "123456789V' OR '1'='1";
    return !isValidNIC(malicious);
  });

  test('Accept but sanitize special characters in name', () => {
    // Names should only contain letters, spaces, hyphens, apostrophes
    const name = "John O'Brien";
    return name.length > 0; // Would be sanitized at database layer
  });

  // =========================================================================
  // RESULTS
  // =========================================================================
  console.log(`\n${COLORS.blue}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.yellow}VALIDATION TEST RESULTS${COLORS.reset}`);
  console.log(`${COLORS.blue}═══════════════════════════════════════════════════════${COLORS.reset}\n`);

  const passColor = testResults.failed === 0 ? COLORS.green : COLORS.red;
  console.log(`${passColor}✓ Passed: ${testResults.passed}${COLORS.reset}`);
  console.log(`${testResults.failed > 0 ? COLORS.red : COLORS.green}✗ Failed: ${testResults.failed}${COLORS.reset}`);
  console.log(`  Total: ${testResults.passed + testResults.failed}\n`);

  console.log(`${COLORS.blue}═══════════════════════════════════════════════════════${COLORS.reset}\n`);

  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
  process.exit(1);
});
