/**
 * Applies `database/migrations/*.sql` in **lexicographic filename order** (0001, 0002, …).
 * Each file runs at most once; version = basename without `.sql`, recorded in `schema_migrations`.
 * Assumption: migrations are idempotent enough to re-run `ensureSchemaMigrationsTable` safely in CI.
 */
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');

const MIGRATIONS_DIR = path.join(__dirname, 'database', 'migrations');
const BASE_SCHEMA_PATH = path.join(__dirname, 'database', 'schema.sql');

const shouldBootstrapBaseSchema = () => {
  const flag = (process.env.DB_BOOTSTRAP_SCHEMA || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
};

const doesTableExist = async (client, tableName) => {
  const result = await client.query('SELECT to_regclass($1) AS reg', [`public.${tableName}`]);
  return Boolean(result.rows?.[0]?.reg);
};

const bootstrapBaseSchemaIfNeeded = async (client) => {
  if (!shouldBootstrapBaseSchema()) {
    return;
  }

  // If the base schema is already present, don't touch it.
  const hasApplications = await doesTableExist(client, 'applications');
  if (hasApplications) {
    return;
  }

  if (!fs.existsSync(BASE_SCHEMA_PATH)) {
    throw new Error(`Base schema file not found at ${BASE_SCHEMA_PATH}`);
  }

  console.log('Bootstrapping base schema from database/schema.sql (DB_BOOTSTRAP_SCHEMA enabled)...');
  const schemaSql = fs.readFileSync(BASE_SCHEMA_PATH, 'utf8');
  await client.query(schemaSql);
  console.log('Base schema bootstrap completed.');
};

const readMigrationFiles = () => {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return files.map((file) => ({
    version: file.replace(/\.sql$/i, ''),
    file,
    fullPath: path.join(MIGRATIONS_DIR, file),
  }));
};

const ensureSchemaMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
};

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureSchemaMigrationsTable(client);
    await client.query('COMMIT');

    await bootstrapBaseSchemaIfNeeded(client);

    const migrations = readMigrationFiles();
    for (const migration of migrations) {
      const existsResult = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [migration.version]
      );
      if (existsResult.rows.length) {
        continue;
      }

      const sql = fs.readFileSync(migration.fullPath, 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, description) VALUES ($1, $2)',
        [migration.version, migration.file]
      );
      await client.query('COMMIT');
      console.log(`Applied migration: ${migration.file}`);
    }

    console.log('Database migrations completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

run();
