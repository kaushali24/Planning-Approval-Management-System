#!/usr/bin/env node
const pool = require('../config/db');

async function run() {
  const totalApplications = await pool.query('SELECT COUNT(*)::int AS count FROM applications');
  const statuses = await pool.query(
    'SELECT status, COUNT(*)::int AS count FROM applications GROUP BY status ORDER BY count DESC, status'
  );
  const payments = await pool.query("SELECT COUNT(*)::int AS count FROM payments WHERE status = 'completed'");
  const notifications = await pool.query('SELECT COUNT(*)::int AS count FROM notifications');
  const history = await pool.query('SELECT COUNT(*)::int AS count FROM application_status_history');

  console.log(JSON.stringify({
    applications: totalApplications.rows[0]?.count || 0,
    statuses: statuses.rows,
    paymentsCompleted: payments.rows[0]?.count || 0,
    notifications: notifications.rows[0]?.count || 0,
    statusHistory: history.rows[0]?.count || 0,
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

