require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== SCHEMA ANALYSIS: applications vs application_status_history ===\n');
    
    // Get applications table structure
    const appSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'applications'
      ORDER BY ordinal_position
    `);
    
    console.log('--- applications TABLE COLUMNS ---');
    appSchema.rows.forEach(row => {
      console.log(`  ${row.column_name.padEnd(25)} | ${row.data_type.padEnd(15)} | NULL: ${row.is_nullable} | DEFAULT: ${row.column_default || 'none'}`);
    });
    
    // Get application_status_history table structure
    const histSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'application_status_history'
      ORDER BY ordinal_position
    `);
    
    console.log('\n--- application_status_history TABLE COLUMNS ---');
    histSchema.rows.forEach(row => {
      console.log(`  ${row.column_name.padEnd(25)} | ${row.data_type.padEnd(15)} | NULL: ${row.is_nullable} | DEFAULT: ${row.column_default || 'none'}`);
    });
    
    // Get foreign key constraints
    const fkConstraints = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name IN ('applications', 'application_status_history')
      ORDER BY tc.table_name
    `);
    
    console.log('\n--- FOREIGN KEY RELATIONSHIPS ---');
    fkConstraints.rows.forEach(row => {
      console.log(`  ${row.table_name} (${row.column_name}) → ${row.foreign_table_name} (${row.foreign_column_name})`);
    });
    
    // Check for data consistency
    console.log('\n--- DATA CONSISTENCY CHECK ---');
    
    const appCount = await pool.query('SELECT COUNT(*) as cnt FROM applications');
    const histCount = await pool.query('SELECT COUNT(*) as cnt FROM application_status_history');
    
    console.log(`\nApplications records: ${appCount.rows[0].cnt}`);
    console.log(`Application status history records: ${histCount.rows[0].cnt}`);
    
    // Check for orphaned history records (history pointing to non-existent applications)
    const orphanedHist = await pool.query(`
      SELECT ash.id, ash.application_id, a.id as app_exists
      FROM application_status_history ash
      LEFT JOIN applications a ON ash.application_id = a.id
      WHERE a.id IS NULL
    `);
    
    if (orphanedHist.rows.length > 0) {
      console.log(`\n⚠️  ORPHANED RECORDS FOUND: ${orphanedHist.rows.length}`);
      console.log('application_status_history records pointing to non-existent applications:');
      orphanedHist.rows.forEach(row => {
        console.log(`  History ID ${row.id} → Application ID ${row.application_id} (MISSING)`);
      });
    } else {
      console.log('\n✅ No orphaned records: All history records have valid application references');
    }
    
    // Show sample data relationships
    console.log('\n--- SAMPLE DATA RELATIONSHIPS ---\n');
    
    const samples = await pool.query(`
      SELECT 
        a.id,
        a.application_code,
        COUNT(ash.id) as status_history_count,
        STRING_AGG(DISTINCT ash.status, ', ' ORDER BY ash.status) as statuses
      FROM applications a
      LEFT JOIN application_status_history ash ON a.id = ash.application_id
      GROUP BY a.id, a.application_code
      ORDER BY a.id
      LIMIT 5
    `);
    
    console.log('Sample relationships (first 5 applications):');
    console.log('ID | application_code | Status History Count | Status Values');
    console.log('-'.repeat(80));
    samples.rows.forEach(row => {
      console.log(`${String(row.id).padEnd(3)}| ${String(row.application_code).padEnd(17)}| ${String(row.status_history_count).padEnd(21)}| ${row.statuses || 'NONE'}`);
    });
    
    // Check for applications without any history
    const noHistory = await pool.query(`
      SELECT COUNT(*) as cnt
      FROM applications a
      LEFT JOIN application_status_history ash ON a.id = ash.application_id
      WHERE ash.id IS NULL
    `);
    
    console.log(`\nApplications with NO status history: ${noHistory.rows[0].cnt}`);
    
    // Show the relationship pattern
    console.log('\n--- RELATIONSHIP PATTERN ---');
    console.log(`
Connection is CORRECT:
  applications.id (Primary Key)
         ↓
  application_status_history.application_id (Foreign Key) → applications.id

Why application_code exists:
  - application_code is a HUMAN-READABLE identifier (e.g., "APP/2026/00001")
  - id is the INTERNAL database identifier (auto-incremented)
  - application_status_history uses id (not application_code) for FK

This is PROPER DESIGN because:
  ✅ FKs should reference immutable primary keys, not business codes
  ✅ application_code could theoretically change; id cannot
  ✅ IDs are faster for queries and joins
  ✅ Prevents accidental code duplicate issues
    `);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
