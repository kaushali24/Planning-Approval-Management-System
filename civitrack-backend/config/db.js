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
