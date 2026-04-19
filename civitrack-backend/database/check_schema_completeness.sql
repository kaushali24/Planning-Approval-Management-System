-- CiviTrack schema completeness + 3NF-oriented entity/attribute audit
-- Run with:
-- psql -U postgres -d planning_app_db -f civitrack-backend/database/check_schema_completeness.sql

-- 1) Required entities (tables)
WITH expected_tables(table_name) AS (
    VALUES
      ('applicants'),
      ('staff_accounts'),
      ('password_resets'),
      ('applications'),
      ('application_permit_selections'),
      ('documents'),
      ('inspections'),
      ('fines'),
      ('document_corrections'),
      ('coc_requests'),
      ('permit_workflow'),
      ('permit_extensions'),
      ('application_status_history'),
      ('application_holds'),
      ('committee_decisions'),
      ('non_indemnification_agreements'),
      ('appeal_cases'),
      ('appeal_versions'),
      ('appeal_documents'),
      ('appeal_member_notes'),
      ('coc_declarations'),
      ('coc_violations'),
      ('coc_reinspections'),
      ('permit_collection_checks'),
      ('payments'),
      ('notifications'),
      ('application_assignments')
)
SELECT
  et.table_name AS missing_table
FROM expected_tables et
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_name = et.table_name
WHERE t.table_name IS NULL
ORDER BY et.table_name;

-- 2) Required attributes by entity
WITH expected_columns(table_name, column_name) AS (
    VALUES
      ('applicants', 'id'),
      ('applicants', 'applicant_id'),
      ('applicants', 'full_name'),
      ('applicants', 'nic_number'),
      ('applicants', 'email'),
      ('applicants', 'password_hash'),
      ('applicants', 'email_verified'),

      ('staff_accounts', 'id'),
      ('staff_accounts', 'staff_id'),
      ('staff_accounts', 'full_name'),
      ('staff_accounts', 'email'),
      ('staff_accounts', 'role'),
      ('staff_accounts', 'password_hash'),

      ('applications', 'id'),
      ('applications', 'applicant_id'),
      ('applications', 'status'),
      ('applications', 'application_type'),
      ('applications', 'submitted_applicant_name'),
      ('applications', 'submitted_nic_number'),
      ('applications', 'submitted_address'),
      ('applications', 'submitted_contact'),
      ('applications', 'submitted_email'),
      ('applications', 'project_details'),
      ('applications', 'assigned_to'),
      ('applications', 'reviewed_by'),
      ('applications', 'committee_decision'),

      ('application_permit_selections', 'id'),
      ('application_permit_selections', 'application_id'),
      ('application_permit_selections', 'permit_code'),

      ('documents', 'id'),
      ('documents', 'application_id'),
      ('documents', 'doc_type'),
      ('documents', 'file_url'),

      ('inspections', 'id'),
      ('inspections', 'application_id'),
      ('inspections', 'staff_id'),
      ('inspections', 'scheduled_date'),
      ('inspections', 'result'),
      ('inspections', 'report_document_id'),
      ('inspections', 'recommendation'),

      ('fines', 'id'),
      ('fines', 'inspection_id'),
      ('fines', 'staff_id'),
      ('fines', 'amount'),
      ('fines', 'reason'),

      ('document_corrections', 'id'),
      ('document_corrections', 'application_id'),
      ('document_corrections', 'original_document_id'),
      ('document_corrections', 'requested_by'),
      ('document_corrections', 'verified_by'),
      ('document_corrections', 'verified_at'),
      ('document_corrections', 'status'),

      ('coc_requests', 'id'),
      ('coc_requests', 'coc_id'),
      ('coc_requests', 'application_id'),
      ('coc_requests', 'applicant_email'),
      ('coc_requests', 'status'),
      ('coc_requests', 'declarations'),
      ('coc_requests', 'fee_amount'),
      ('coc_requests', 'assigned_to'),
      ('coc_requests', 'violation_report'),
      ('coc_requests', 'deviation_fine'),
      ('coc_requests', 'regularization_status'),
      ('coc_requests', 'approved_by_committee_at'),
      ('coc_requests', 'collected_at'),
      ('coc_requests', 'inspection_id'),
      ('coc_requests', 'certificate_url'),

      ('permit_workflow', 'id'),
      ('permit_workflow', 'application_id'),
      ('permit_workflow', 'permit_reference'),
      ('permit_workflow', 'permit_type'),
      ('permit_workflow', 'issued_at'),
      ('permit_workflow', 'valid_until'),
      ('permit_workflow', 'permit_collected'),
      ('permit_workflow', 'max_years'),
      ('permit_workflow', 'extensions_used'),

      ('permit_extensions', 'id'),
      ('permit_extensions', 'permit_id'),
      ('permit_extensions', 'extension_no'),
      ('permit_extensions', 'fee_amount'),
      ('permit_extensions', 'payment_status'),
      ('permit_extensions', 'previous_valid_until'),
      ('permit_extensions', 'extended_valid_until'),

      ('application_status_history', 'id'),
      ('application_status_history', 'application_id'),
      ('application_status_history', 'status'),
      ('application_status_history', 'changed_at'),

      ('application_holds', 'id'),
      ('application_holds', 'application_id'),
      ('application_holds', 'hold_type'),
      ('application_holds', 'hold_status'),

      ('committee_decisions', 'id'),
      ('committee_decisions', 'application_id'),
      ('committee_decisions', 'decision_no'),
      ('committee_decisions', 'decision_type'),

      ('non_indemnification_agreements', 'id'),
      ('non_indemnification_agreements', 'application_id'),
      ('non_indemnification_agreements', 'agreement_no'),
      ('non_indemnification_agreements', 'status'),

      ('appeal_cases', 'id'),
      ('appeal_cases', 'application_id'),
      ('appeal_cases', 'route'),
      ('appeal_cases', 'status'),

      ('appeal_versions', 'id'),
      ('appeal_versions', 'appeal_case_id'),
      ('appeal_versions', 'appeal_no'),

      ('appeal_documents', 'id'),
      ('appeal_documents', 'appeal_version_id'),
      ('appeal_documents', 'kind'),

      ('appeal_member_notes', 'id'),
      ('appeal_member_notes', 'appeal_case_id'),
      ('appeal_member_notes', 'note'),

      ('coc_declarations', 'id'),
      ('coc_declarations', 'coc_request_id'),
      ('coc_declarations', 'declaration_type'),

      ('coc_violations', 'id'),
      ('coc_violations', 'coc_request_id'),
      ('coc_violations', 'deviation_type'),
      ('coc_violations', 'fine_amount'),

      ('coc_reinspections', 'id'),
      ('coc_reinspections', 'coc_request_id'),
      ('coc_reinspections', 'round_no'),
      ('coc_reinspections', 'result'),

      ('permit_collection_checks', 'id'),
      ('permit_collection_checks', 'permit_id'),
      ('permit_collection_checks', 'check_type'),
      ('permit_collection_checks', 'is_completed'),

      ('payments', 'id'),
      ('payments', 'application_id'),
      ('payments', 'coc_request_id'),
      ('payments', 'fine_id'),
      ('payments', 'payment_type'),
      ('payments', 'amount'),
      ('payments', 'status'),

      ('notifications', 'id'),
      ('notifications', 'user_type'),
      ('notifications', 'applicant_id'),
      ('notifications', 'staff_id'),
      ('notifications', 'notification_type'),
      ('notifications', 'title'),
      ('notifications', 'message'),

      ('application_assignments', 'id'),
      ('application_assignments', 'application_id'),
      ('application_assignments', 'assigned_to'),
      ('application_assignments', 'assigned_by'),
      ('application_assignments', 'assignment_type'),
      ('application_assignments', 'status')
)
SELECT
  ec.table_name,
  ec.column_name AS missing_column
FROM expected_columns ec
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = ec.table_name
 AND c.column_name = ec.column_name
WHERE c.column_name IS NULL
ORDER BY ec.table_name, ec.column_name;

-- 3) Quick summary counts by table
SELECT
  table_name,
  COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'applicants', 'staff_accounts', 'password_resets', 'applications', 'documents',
    'application_permit_selections',
    'inspections', 'fines', 'document_corrections', 'coc_requests', 'permit_workflow', 'permit_extensions',
    'application_status_history', 'application_holds', 'committee_decisions', 'non_indemnification_agreements',
    'appeal_cases', 'appeal_versions', 'appeal_documents', 'appeal_member_notes',
    'coc_declarations', 'coc_violations', 'coc_reinspections', 'permit_collection_checks', 'payments',
    'notifications', 'application_assignments'
  )
GROUP BY table_name
ORDER BY table_name;
