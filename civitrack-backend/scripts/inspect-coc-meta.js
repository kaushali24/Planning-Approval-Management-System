#!/usr/bin/env node
const pool = require('../config/db');

async function run() {
  const columns = await pool.query(
    `SELECT column_name, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'coc_requests'
       AND column_name = 'coc_id'`
  );

  const triggers = await pool.query(
    `SELECT tgname
     FROM pg_trigger
     WHERE tgrelid = 'coc_requests'::regclass
       AND NOT tgisinternal`
  );

  console.log(JSON.stringify({
    cocIdColumn: columns.rows,
    triggers: triggers.rows,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

