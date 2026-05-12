#!/usr/bin/env node
/**
 * Reset transactional records while preserving identity/config data.
 *
 * Defaults to dry-run. Use --apply to execute truncation.
 * Example:
 *   node scripts/reset-transactional-data.js
 *   node scripts/reset-transactional-data.js --apply
 */

const pool = require('../config/db');

const argv = new Set(process.argv.slice(2));
const apply = argv.has('--apply');

// Keep applicants + staff_accounts as requested. Keep config tables.
const TRANSACTIONAL_TABLES = [
  'appeal_member_notes',
  'appeal_documents',
  'appeal_versions',
  'appeal_cases',
  'permit_extensions',
  'permit_collection_checks',
  'permit_workflow',
  'coc_declarations',
  'coc_reinspections',
  'coc_violations',
  'coc_requests',
  'fines',
  'payments',
  'notifications',
  'inspections',
  'documents',
  'application_holds',
  'application_status_history',
  'application_assignments',
  'application_permit_selections',
  'applications',
];

async function findExistingTables(client, candidates) {
  const result = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [candidates]
  );
  const set = new Set(result.rows.map((row) => row.table_name));
  return candidates.filter((name) => set.has(name));
}

async function main() {
  const client = await pool.connect();
  try {
    const existingTables = await findExistingTables(client, TRANSACTIONAL_TABLES);
    const missingTables = TRANSACTIONAL_TABLES.filter((name) => !existingTables.includes(name));

    console.log('Transactional reset plan');
    console.log('------------------------');
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Tables targeted (${existingTables.length}): ${existingTables.join(', ') || '(none found)'}`);
    if (missingTables.length) {
      console.log(`Tables skipped (not present): ${missingTables.join(', ')}`);
    }
    console.log('Preserved tables: applicants, staff_accounts, admin/system config tables');

    if (!apply) {
      console.log('\nDry run complete. Re-run with --apply to execute.');
      return;
    }

    if (!existingTables.length) {
      console.log('\nNo matching transactional tables found. Nothing to truncate.');
      return;
    }

    await client.query('BEGIN');
    const truncateSql = `TRUNCATE TABLE ${existingTables.map((name) => `"${name}"`).join(', ')} RESTART IDENTITY CASCADE`;
    await client.query(truncateSql);
    await client.query('COMMIT');

    console.log('\nTransactional data reset complete.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Reset failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

