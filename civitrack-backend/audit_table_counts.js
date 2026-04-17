require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tableRows = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const counts = [];
    for (const row of tableRows.rows) {
      const table = row.table_name;
      const result = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
      counts.push({ table, count: result.rows[0].cnt });
    }

    const zero = counts.filter((t) => t.count === 0).map((t) => t.table);

    console.log(JSON.stringify({
      tableCounts: counts,
      zeroCountTables: zero,
      totalTables: counts.length,
      nonEmptyTables: counts.length - zero.length,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
