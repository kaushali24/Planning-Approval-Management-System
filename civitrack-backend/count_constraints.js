require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  
  const r1 = await p.query("SELECT COUNT(*) as cnt FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='PRIMARY KEY'");
  const r2 = await p.query("SELECT COUNT(*) as cnt FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='FOREIGN KEY'");
  const r3 = await p.query("SELECT COUNT(*) as cnt FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='UNIQUE'");
  const r4 = await p.query("SELECT COUNT(*) as cnt FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='CHECK'");
  
  console.log('Primary Keys:', r1.rows[0].cnt);
  console.log('Foreign Keys:', r2.rows[0].cnt);
  console.log('Unique Constraints:', r3.rows[0].cnt);
  console.log('Check Constraints:', r4.rows[0].cnt);
  
  await p.end();
}

main().catch(e => console.error(e.message));
