require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

async function main() {
  const sql = fs.readFileSync('database/migration_drop_legacy_applicant_id.sql', 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(sql);
    console.log('migration_drop_legacy_applicant_id applied');

    const cols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'applicants' ORDER BY ordinal_position"
    );
    console.log(cols.rows.map((r) => r.column_name).join(', '));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
