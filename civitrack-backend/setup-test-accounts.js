#!/usr/bin/env node
/**
 * CiviTrack Test Accounts Setup
 * Creates test accounts for all roles and dashboards
 */

const bcrypt = require('bcryptjs');
const pool = require('./config/db');

// Test account data
const testAccounts = {
  applicants: [
    {
      applicantId: 'APP/2026/00001',
      fullName: 'Nimal Jayasinghe',
      nicNumber: '123456789V',
      email: 'nimal@example.com',
      contactNumber: '0712345678',
      password: 'Admin@123',
    }
  ],
  staff: [
    {
      staffId: 'STF-001',
      fullName: 'Admin User',
      email: 'admin@kps.gov.lk',
      role: 'admin',
      password: 'Admin@123',
    },
    {
      staffId: 'STF-002',
      fullName: 'Technical Officer',
      email: 'technicalofficer@kps.gov.lk',
      role: 'technical_officer',
      password: 'TechOff@123',
    },
    {
      staffId: 'STF-003',
      fullName: 'Planning Officer',
      email: 'planningofficer@kps.gov.lk',
      role: 'planning_officer',
      password: 'PlanOff@123',
    },
    {
      staffId: 'STF-004',
      fullName: 'Senior Works Officer',
      email: 'seniorworks@kps.gov.lk',
      role: 'superintendent',
      password: 'SenWorks@123',
    },
    {
      staffId: 'STF-005',
      fullName: 'Committee Member',
      email: 'committee@kps.gov.lk',
      role: 'committee',
      password: 'Commit@123',
    },
    {
      staffId: 'STF-006',
      fullName: 'Superintendent',
      email: 'superintendent@kps.gov.lk',
      role: 'superintendent',
      password: 'Super@123',
    }
  ]
};

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function insertApplicants() {
  console.log('📝 Inserting Applicant Test Accounts...\n');

  for (const applicant of testAccounts.applicants) {
    try {
      const hashedPassword = await hashPassword(applicant.password);

      // Check if email already exists
      const checkEmail = await pool.query(
        'SELECT id FROM applicants WHERE email = $1',
        [applicant.email]
      );

      if (checkEmail.rows.length > 0) {
        console.log(`⚠️  Applicant ${applicant.email} already exists - skipping`);
        continue;
      }

      // Insert applicant
      const result = await pool.query(
        `INSERT INTO applicants (applicant_id, full_name, nic_number, email, contact_number, password_hash, email_verified, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true, true)
         RETURNING id, email, full_name, applicant_id`,
        [
          applicant.applicantId,
          applicant.fullName,
          applicant.nicNumber,
          applicant.email,
          applicant.contactNumber,
          hashedPassword
        ]
      );

      const inserted = result.rows[0];
      console.log(`✓ Created Applicant: ${inserted.full_name}`);
      console.log(`  Email: ${inserted.email}`);
      console.log(`  Applicant ID: ${inserted.applicant_id}`);
      console.log(`  Database ID: ${inserted.id}`);
      console.log(`  Password: ${applicant.password}\n`);

    } catch (error) {
      console.error(`✗ Failed to insert applicant ${applicant.email}:`, error.message);
    }
  }
}

async function insertStaffAccounts() {
  console.log('\n📝 Inserting Staff Test Accounts...\n');

  for (const staff of testAccounts.staff) {
    try {
      const hashedPassword = await hashPassword(staff.password);

      // Check if email already exists
      const checkEmail = await pool.query(
        'SELECT id FROM staff_accounts WHERE email = $1',
        [staff.email]
      );

      if (checkEmail.rows.length > 0) {
        console.log(`⚠️  Staff ${staff.email} already exists - skipping`);
        continue;
      }

      // Insert staff account
      const result = await pool.query(
        `INSERT INTO staff_accounts (staff_id, full_name, email, role, password_hash, is_active, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, 1, NOW(), NOW())
         RETURNING id, staff_id, email, role, full_name`,
        [
          staff.staffId,
          staff.fullName,
          staff.email,
          staff.role,
          hashedPassword
        ]
      );

      const inserted = result.rows[0];
      console.log(`✓ Created Staff Account: ${inserted.full_name}`);
      console.log(`  Email: ${inserted.email}`);
      console.log(`  Role: ${inserted.role}`);
      console.log(`  Staff ID: ${inserted.staff_id}`);
      console.log(`  Password: ${staff.password}\n`);

    } catch (error) {
      console.error(`✗ Failed to insert staff ${staff.email}:`, error.message);
    }
  }
}

async function verifyAccounts() {
  console.log('\n✅ Verifying Accounts in Database...\n');

  try {
    // Count applicants
    const applicantCount = await pool.query('SELECT COUNT(*) FROM applicants');
    console.log(`Total Applicants: ${applicantCount.rows[0].count}`);

    // Count staff
    const staffCount = await pool.query('SELECT COUNT(*) FROM staff_accounts');
    console.log(`Total Staff Accounts: ${staffCount.rows[0].count}\n`);

    // List all applicants
    console.log('APPLICANTS:');
    const applicants = await pool.query('SELECT id, email, full_name FROM applicants ORDER BY created_at DESC');
    applicants.rows.forEach(row => {
      console.log(`  • ${row.full_name} (${row.email})`);
    });

    // List all staff by role
    console.log('\nSTAFF ACCOUNTS:');
    const staff = await pool.query('SELECT id, staff_id, email, role, full_name FROM staff_accounts ORDER BY role, created_at DESC');
    
    const groupedByRole = {};
    staff.rows.forEach(row => {
      if (!groupedByRole[row.role]) {
        groupedByRole[row.role] = [];
      }
      groupedByRole[row.role].push(row);
    });

    Object.keys(groupedByRole).sort().forEach(role => {
      console.log(`\n  ${role.toUpperCase()}:`);
      groupedByRole[role].forEach(row => {
        console.log(`    • ${row.full_name} (${row.email})`);
      });
    });

  } catch (error) {
    console.error('Error verifying accounts:', error.message);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('CiviTrack Test Accounts Setup');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    await insertApplicants();
    await insertStaffAccounts();
    await verifyAccounts();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✓ Test Accounts Setup Complete');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
