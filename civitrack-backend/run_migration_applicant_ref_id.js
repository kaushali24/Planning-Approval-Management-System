require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query('ALTER TABLE applicants ADD COLUMN IF NOT EXISTS applicant_ref_id VARCHAR(50)');
    const hasLegacyColumn = await pool.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'applicants'
        AND column_name = 'applicant_id'
    `);
    if (hasLegacyColumn.rows.length) {
      await pool.query(`
        UPDATE applicants
        SET applicant_ref_id = applicant_id
        WHERE applicant_ref_id IS NULL
          AND applicant_id IS NOT NULL
      `);
    }
    await pool.query('ALTER TABLE applicants ALTER COLUMN applicant_ref_id SET NOT NULL');

    const hasConstraint = await pool.query(
      "SELECT 1 FROM pg_constraint WHERE conname = 'applicants_applicant_ref_id_key'"
    );
    if (!hasConstraint.rows.length) {
      await pool.query('ALTER TABLE applicants ADD CONSTRAINT applicants_applicant_ref_id_key UNIQUE (applicant_ref_id)');
    }

    await pool.query('CREATE INDEX IF NOT EXISTS idx_applicants_applicant_ref_id ON applicants(applicant_ref_id)');

    const check = await pool.query(
      'SELECT id, applicant_ref_id FROM applicants ORDER BY id LIMIT 10'
    );

    console.log(JSON.stringify({ migrated: true, rows: check.rows }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
