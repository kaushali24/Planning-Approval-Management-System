const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password123@localhost:5432/civitrack',
});

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id FROM applications WHERE application_code = 'APP/2026/00001' OR application_code = 'APP/2025/00017' LIMIT 1`
    );
    if (!res.rows.length) return console.log('No app found');
    const appId = res.rows[0].id;
    
    // reset to Stage 2 correction
    await client.query(`
      UPDATE applications
      SET status = 'correction',
          preliminary_check_data = '{"notes": "Please upload a clearer ID card.", "deficientDocuments": [{"id": "doc1", "label": "National ID Card", "reason": "Too blurry"}]}'
      WHERE id = $1
    `, [appId]);
    console.log('App set to correction. ID:', appId);
  } finally {
    client.release();
    pool.end();
  }
}
run();
