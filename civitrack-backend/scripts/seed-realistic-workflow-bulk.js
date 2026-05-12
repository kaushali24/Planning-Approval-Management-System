#!/usr/bin/env node
/**
 * Bulk realistic seeder:
 * - Ensures additional applicants exist
 * - Creates many applications spread across workflow stages
 * - Writes coherent status history and payment rows for relevant stages
 *
 * Usage:
 *   node scripts/seed-realistic-workflow-bulk.js
 *   node scripts/seed-realistic-workflow-bulk.js --count=54 --newApplicants=18
 */

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const args = process.argv.slice(2);
const countArg = args.find((arg) => arg.startsWith('--count='));
const applicantsArg = args.find((arg) => arg.startsWith('--newApplicants='));
const totalApplicationsTarget = Number.parseInt((countArg || '').split('=')[1], 10) || 54;
const newApplicantsTarget = Number.parseInt((applicantsArg || '').split('=')[1], 10) || 18;

const applicantRefPrefix = `APP/${new Date().getFullYear()}/`;
const statusesCycle = [
  'draft',
  'submitted',
  'under_review',
  'correction',
  'committee_review',
  'appeal_submitted',
  'permit_collected',
  'closed',
];

function daysAgo(days) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function buildStatusPath(finalStatus) {
  if (finalStatus === 'draft') return ['draft'];
  if (finalStatus === 'submitted') return ['submitted'];
  if (finalStatus === 'under_review') return ['submitted', 'under_review'];
  if (finalStatus === 'correction') return ['submitted', 'under_review', 'correction'];
  if (finalStatus === 'committee_review') return ['submitted', 'under_review', 'committee_review'];
  if (finalStatus === 'appeal_submitted') return ['submitted', 'under_review', 'rejected', 'appeal_submitted'];
  if (finalStatus === 'permit_collected') return ['submitted', 'under_review', 'approved', 'permit_approved', 'permit_collected'];
  if (finalStatus === 'closed') return ['submitted', 'under_review', 'approved', 'permit_approved', 'permit_collected', 'closed'];
  return ['submitted'];
}

async function getApplicantRefColumn(client) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'applicants'
       AND column_name IN ('applicant_ref_id', 'applicant_id')
     ORDER BY CASE WHEN column_name = 'applicant_ref_id' THEN 1 ELSE 2 END
     LIMIT 1`
  );
  return result.rows[0]?.column_name || null;
}

async function getNextApplicantRef(client, refColumn) {
  const result = await client.query(
    `SELECT ${refColumn} AS ref
     FROM applicants
     WHERE ${refColumn} LIKE $1
     ORDER BY ${refColumn} DESC
     LIMIT 1`,
    [`${applicantRefPrefix}%`]
  );
  const lastRef = result.rows[0]?.ref || `${applicantRefPrefix}00000`;
  const seq = Number.parseInt(String(lastRef).split('/').pop(), 10) || 0;
  return `${applicantRefPrefix}${String(seq + 1).padStart(5, '0')}`;
}

async function ensureBulkApplicants(client, refColumn) {
  const created = [];
  const passwordHash = await bcrypt.hash('Applicant@123', 10);

  for (let i = 1; i <= newApplicantsTarget; i += 1) {
    const email = `bulk.applicant.${String(i).padStart(2, '0')}@example.com`;
    const existing = await client.query('SELECT id, full_name, email FROM applicants WHERE email = $1 LIMIT 1', [email]);
    if (existing.rows.length) {
      created.push(existing.rows[0]);
      continue;
    }

    const ref = await getNextApplicantRef(client, refColumn);
    const fullName = `Bulk Applicant ${String(i).padStart(2, '0')}`;
    const nic = `1999${String(10000000 + i).slice(-8)}`;
    const phone = `077${String(1000000 + i).slice(-7)}`;

    const inserted = await client.query(
      `INSERT INTO applicants (${refColumn}, full_name, nic_number, email, contact_number, password_hash, email_verified, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)
       RETURNING id, full_name, email`,
      [ref, fullName, nic, email, phone, passwordHash]
    );
    created.push(inserted.rows[0]);
  }

  return created;
}

async function getStaffByRole(client) {
  const result = await client.query(
    `SELECT id, role, full_name
     FROM staff_accounts
     WHERE role IN ('admin', 'planning_officer', 'technical_officer', 'superintendent', 'committee')
       AND is_active = TRUE
     ORDER BY id`
  );
  const grouped = {};
  for (const row of result.rows) {
    if (!grouped[row.role]) grouped[row.role] = [];
    grouped[row.role].push(row);
  }
  return grouped;
}

function actorForStatus(status, staff) {
  if (status === 'draft') return staff.admin?.[0] || null;
  if (status === 'submitted') return null;
  if (status === 'under_review' || status === 'correction') return staff.technical_officer?.[0] || staff.planning_officer?.[0] || null;
  if (status === 'committee_review') return staff.superintendent?.[0] || null;
  if (status === 'rejected' || status === 'approved') return staff.committee?.[0] || null;
  return staff.admin?.[0] || null;
}

async function insertApplicationWithHistory(client, { applicant, index, finalStatus, staff }) {
  const path = buildStatusPath(finalStatus);
  const submittedAt = daysAgo(randomInt(3, 180));
  const lastUpdated = new Date(submittedAt.getTime() + randomInt(1, 20) * 24 * 60 * 60 * 1000);
  const assignedTo = ['under_review', 'correction', 'committee_review', 'appeal_submitted', 'permit_collected', 'closed'].includes(finalStatus)
    ? (staff.technical_officer?.[index % (staff.technical_officer?.length || 1)] || null)
    : null;

  const appType = index % 4 === 0 ? 'subdivision' : 'building';
  const insertApp = await client.query(
    `INSERT INTO applications (
      applicant_id, status, submission_date, last_updated, application_type,
      submitted_applicant_name, submitted_nic_number, submitted_address, submitted_contact, submitted_email,
      assessment_number, deed_number, survey_plan_ref, land_extent, project_details,
      latitude, longitude, declaration_accepted, assigned_to
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15::jsonb,
      $16, $17, $18, $19
    )
    RETURNING id, application_code`,
    [
      applicant.id,
      finalStatus,
      submittedAt,
      lastUpdated,
      appType,
      applicant.full_name,
      `2000${String(10000000 + index).slice(-8)}`,
      `${10 + (index % 80)} Main Road, Kelaniya`,
      `071${String(1000000 + index).slice(-7)}`,
      applicant.email,
      `ASS-BULK-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`,
      `DEED-BULK-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`,
      `SP-BULK-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`,
      `${8 + (index % 20)} perches`,
      JSON.stringify({
        seed_key: `bulk-realistic-${String(index + 1).padStart(4, '0')}`,
        sample_tag: 'civitrack-live-like-bulk',
        project: index % 3 === 0 ? 'Residential extension' : 'New house plan',
      }),
      6.96 + (index % 15) * 0.001,
      79.90 + (index % 20) * 0.001,
      finalStatus !== 'draft',
      assignedTo ? assignedTo.id : null,
    ]
  );

  const applicationId = insertApp.rows[0].id;
  let historyAt = new Date(submittedAt);
  for (const status of path) {
    const actor = actorForStatus(status, staff);
    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        applicationId,
        status,
        historyAt,
        actor ? actor.id : null,
        `Workflow progressed to ${status.replace(/_/g, ' ')}`,
        'bulk-seed',
      ]
    );
    historyAt = new Date(historyAt.getTime() + randomInt(2, 24) * 60 * 60 * 1000);
  }

  // For progressed items, include an application fee payment.
  if (!['draft', 'submitted'].includes(finalStatus)) {
    await client.query(
      `INSERT INTO payments (
        application_id, payment_type, amount, status, transaction_id, payment_method, paid_at, created_at
      ) VALUES ($1, 'application_fee', $2, 'completed', $3, $4, $5, $5)`,
      [
        applicationId,
        4000 + (index % 7) * 500,
        `TXN-BULK-APP-${String(applicationId).padStart(6, '0')}`,
        pick(['cash', 'card', 'bank_transfer']),
        new Date(submittedAt.getTime() + 2 * 60 * 60 * 1000),
      ]
    );
  }

  return {
    applicationId,
    applicationCode: insertApp.rows[0].application_code,
    finalStatus,
  };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const refColumn = await getApplicantRefColumn(client);
    if (!refColumn) {
      throw new Error('Unable to detect applicant reference column.');
    }

    const staff = await getStaffByRole(client);
    if (!staff.admin?.length || !staff.technical_officer?.length || !staff.superintendent?.length || !staff.committee?.length) {
      throw new Error('Required staff roles missing. Ensure test/staff accounts exist.');
    }

    const applicants = await ensureBulkApplicants(client, refColumn);
    const existingDemo = await client.query(
      "SELECT id, full_name, email FROM applicants WHERE email = 'pabodakaushali2001@gmail.com' LIMIT 1"
    );
    if (existingDemo.rows.length) applicants.unshift(existingDemo.rows[0]);

    const created = [];
    for (let i = 0; i < totalApplicationsTarget; i += 1) {
      const applicant = applicants[i % applicants.length];
      const finalStatus = statusesCycle[i % statusesCycle.length];
      const item = await insertApplicationWithHistory(client, {
        applicant,
        index: i,
        finalStatus,
        staff,
      });
      created.push(item);
    }

    await client.query('COMMIT');

    const byStatus = created.reduce((acc, row) => {
      acc[row.finalStatus] = (acc[row.finalStatus] || 0) + 1;
      return acc;
    }, {});

    console.log('Bulk realistic seed complete');
    console.log(`Applicants ensured: ${applicants.length}`);
    console.log(`Applications created: ${created.length}`);
    console.log('Status distribution:');
    Object.keys(byStatus).sort().forEach((status) => {
      console.log(`  - ${status}: ${byStatus[status]}`);
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Bulk realistic seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

