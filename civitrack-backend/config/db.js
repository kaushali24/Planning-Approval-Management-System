/**
 * Shared PostgreSQL pool. `DATABASE_URL` must be set in every environment (see `.env.example`).
 *
 * Why session timezone: business dates in reports and audit trails align to Sri Lanka local time
 * (`Asia/Colombo`) regardless of where the Node process runs.
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'Asia/Colombo'").catch((err) => {
    console.error('Failed to set PostgreSQL session timezone:', err);
  });
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
