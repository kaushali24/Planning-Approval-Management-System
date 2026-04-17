require('dotenv').config();
const { Pool } = require('pg');

const tables = [
  'application_assignments',
  'application_holds',
  'application_permit_selections',
  'coc_reinspections',
  'coc_violations',
  'committee_decisions',
  'document_corrections',
  'fines',
  'non_indemnification_agreements',
  'password_resets',
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const table of tables) {
      console.log(`\n=== ${table} ===`);
      const cols = await pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table]
      );
      cols.rows.forEach((c) => {
        console.log(`${c.column_name} | ${c.data_type} | null=${c.is_nullable} | default=${c.column_default || 'none'}`);
      });

      const checks = await pool.query(
        `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conrelid = $1::regclass
           AND contype = 'c'`,
        [table]
      );
      checks.rows.forEach((ch) => {
        console.log(`CHECK ${ch.conname}: ${ch.def}`);
      });
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
