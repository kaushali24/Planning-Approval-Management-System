require('dotenv').config();
const { Pool } = require('pg');

const requiredTables = [
  'applicants','staff_accounts','password_resets','applications','application_permit_selections','documents','inspections','fines',
  'document_corrections','coc_requests','permit_workflow','permit_extensions','application_assignments',
  'application_status_history','application_holds','committee_decisions','non_indemnification_agreements',
  'appeal_cases','appeal_versions','appeal_documents','appeal_member_notes',
  'coc_declarations','coc_violations','coc_reinspections','permit_collection_checks','payments','notifications'
];

const requiredColumns = {
  applicants: ['id','applicant_ref_id','full_name','nic_number','email','password_hash'],
  staff_accounts: ['id','staff_id','full_name','email','role','password_hash'],
  applications: ['id','applicant_id','application_type','status','submitted_applicant_name','submitted_nic_number','submitted_email'],
  application_permit_selections: ['id','application_id','permit_code'],
  documents: ['id','application_id','doc_type','file_url','applicant_ref_id','application_code','document_category','original_filename','stored_filename','storage_key'],
  inspections: ['id','application_id','staff_id','result'],
  fines: ['id','inspection_id','staff_id','amount','reason'],
  coc_requests: ['id','application_id','status','assigned_to','inspection_id'],
  permit_workflow: ['id','application_id','permit_type','valid_until','permit_collected'],
  permit_extensions: ['id','permit_id','extension_no','payment_status'],
  application_assignments: ['id','application_id','assigned_to','assigned_by','status'],
  application_status_history: ['id','application_id','status','changed_at'],
  application_holds: ['id','application_id','hold_type','hold_status'],
  committee_decisions: ['id','application_id','decision_no','decision_type'],
  non_indemnification_agreements: ['id','application_id','agreement_no','status'],
  appeal_cases: ['id','application_id','route','status'],
  appeal_versions: ['id','appeal_case_id','appeal_no'],
  appeal_documents: ['id','appeal_version_id','kind'],
  appeal_member_notes: ['id','appeal_case_id','note'],
  coc_declarations: ['id','coc_request_id','declaration_type','accepted'],
  coc_violations: ['id','coc_request_id','deviation_type','fine_amount'],
  coc_reinspections: ['id','coc_request_id','round_no','result'],
  permit_collection_checks: ['id','permit_id','check_type','is_completed'],
  payments: ['id','payment_type','amount','status'],
  notifications: ['id','user_type','notification_type','title','message']
};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tblRes = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const existingTables = new Set(tblRes.rows.map((r) => r.table_name));
    const missingTables = requiredTables.filter((t) => !existingTables.has(t));

    const colRes = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'");
    const colsByTable = new Map();
    for (const row of colRes.rows) {
      if (!colsByTable.has(row.table_name)) colsByTable.set(row.table_name, new Set());
      colsByTable.get(row.table_name).add(row.column_name);
    }

    const missingColumns = [];
    for (const [table, cols] of Object.entries(requiredColumns)) {
      const present = colsByTable.get(table) || new Set();
      for (const c of cols) {
        if (!present.has(c)) missingColumns.push(`${table}.${c}`);
      }
    }

    const pkRes = await pool.query(`
      SELECT t.table_name
      FROM information_schema.tables t
      LEFT JOIN information_schema.table_constraints tc
        ON tc.table_schema=t.table_schema
       AND tc.table_name=t.table_name
       AND tc.constraint_type='PRIMARY KEY'
      WHERE t.table_schema='public'
        AND t.table_name = ANY($1::text[])
        AND tc.constraint_name IS NULL
      ORDER BY t.table_name
    `, [requiredTables]);

    const fkRes = await pool.query(`
      SELECT t.table_name
      FROM information_schema.tables t
      LEFT JOIN information_schema.table_constraints tc
        ON tc.table_schema=t.table_schema
       AND tc.table_name=t.table_name
       AND tc.constraint_type='FOREIGN KEY'
      WHERE t.table_schema='public'
        AND t.table_name = ANY($1::text[])
        AND t.table_name NOT IN ('applicants','staff_accounts','password_resets')
      GROUP BY t.table_name
      HAVING COUNT(tc.constraint_name)=0
      ORDER BY t.table_name
    `, [requiredTables]);

    console.log('Database:', process.env.DATABASE_URL ? 'DATABASE_URL configured' : 'DATABASE_URL missing');
    console.log('Required tables:', requiredTables.length);
    console.log('Missing tables:', missingTables.length ? missingTables.join(', ') : 'None');
    console.log('Missing required columns:', missingColumns.length ? missingColumns.join(', ') : 'None');
    console.log('Tables without PK:', pkRes.rows.length ? pkRes.rows.map(r=>r.table_name).join(', ') : 'None');
    console.log('Workflow tables without FK:', fkRes.rows.length ? fkRes.rows.map(r=>r.table_name).join(', ') : 'None');

    if (!missingTables.length && !missingColumns.length && !pkRes.rows.length && !fkRes.rows.length) {
      console.log('3NF readiness check: PASS (structure/keys/FKs present for required model).');
      process.exitCode = 0;
    } else {
      console.log('3NF readiness check: FAIL (see missing items above).');
      process.exitCode = 2;
    }
  } catch (e) {
    console.error('Audit failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
