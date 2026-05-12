-- CiviTrack Database Schema Update
-- This script adds all missing tables while preserving test data in applicants, staff_accounts, password_resets
-- Ensures 3NF compliance and matches SRS requirements

-- Drop tables in correct order (reverse FK dependency)
DROP TABLE IF EXISTS application_assignments CASCADE;
DROP TABLE IF EXISTS permit_collection_checks CASCADE;
DROP TABLE IF EXISTS coc_reinspections CASCADE;
DROP TABLE IF EXISTS coc_violations CASCADE;
DROP TABLE IF EXISTS coc_declarations CASCADE;
DROP TABLE IF EXISTS appeal_member_notes CASCADE;
DROP TABLE IF EXISTS appeal_documents CASCADE;
DROP TABLE IF EXISTS appeal_versions CASCADE;
DROP TABLE IF EXISTS appeal_cases CASCADE;
DROP TABLE IF EXISTS non_indemnification_agreements CASCADE;
DROP TABLE IF EXISTS committee_decisions CASCADE;
DROP TABLE IF EXISTS application_holds CASCADE;
DROP TABLE IF EXISTS application_status_history CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS permit_extensions CASCADE;
DROP TABLE IF EXISTS permit_workflow CASCADE;
DROP TABLE IF EXISTS application_permit_selections CASCADE;
DROP TABLE IF EXISTS document_corrections CASCADE;
DROP TABLE IF EXISTS fines CASCADE;
DROP TABLE IF EXISTS coc_requests CASCADE;
DROP TABLE IF EXISTS inspections CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS applications CASCADE;

-- Applications table
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    applicant_id INT NOT NULL,
    application_type VARCHAR(50) NOT NULL CHECK (application_type IN ('building', 'subdivision')),
    status VARCHAR(60) DEFAULT 'submitted' CHECK (status IN (
        'draft', 'submitted', 'under_review', 'correction', 'committee_review',
        'not_granted_appeal_required', 'appeal_submitted', 'approved_awaiting_agreement',
        'agreement_completed', 'permit_approved', 'permit_collected', 'closed',
        'pending', 'endorsed', 'approved', 'certified', 'rejected'
    )),
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Temporal snapshots (capture data at submission time for audit)
    submitted_applicant_name VARCHAR(255) NOT NULL,
    submitted_nic_number VARCHAR(12) NOT NULL,
    submitted_address TEXT NOT NULL,
    submitted_contact VARCHAR(20) NOT NULL,
    submitted_email VARCHAR(255) NOT NULL,
    
    -- Land details
    assessment_number VARCHAR(50),
    deed_number VARCHAR(50),
    survey_plan_ref VARCHAR(50),
    land_extent VARCHAR(50),
    project_details JSONB,
    
    -- Location
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Declarations
    declaration_accepted BOOLEAN DEFAULT FALSE,
    
    -- Workflow (legacy - keeping for compatibility)
    assigned_to INT,
    reviewed_by INT,
    reviewed_at TIMESTAMP,
    committee_decision VARCHAR(50),
    committee_notes TEXT,
    decided_at TIMESTAMP,
    
    CONSTRAINT fk_applications_applicant FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE,
    CONSTRAINT fk_applications_assigned_to FOREIGN KEY (assigned_to) REFERENCES staff_accounts(id) ON DELETE SET NULL,
    CONSTRAINT fk_applications_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

-- Normalized selected permit rows for the application wizard
CREATE TABLE application_permit_selections (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    permit_code VARCHAR(30) NOT NULL CHECK (permit_code IN ('building', 'boundary_wall', 'subdivision')),
    selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_application_permit_selection UNIQUE (application_id, permit_code),
    CONSTRAINT fk_application_permit_selections_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- Documents table (3NF: separate from applications)
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    applicant_ref_id VARCHAR(50),
    application_code VARCHAR(20),
    document_category VARCHAR(100),
    original_filename VARCHAR(255),
    stored_filename VARCHAR(255),
    storage_key TEXT,
    mime_type VARCHAR(100),
    file_size INT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_documents_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_application_id ON documents(application_id);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_applicant_ref_id ON documents(applicant_ref_id);
CREATE INDEX IF NOT EXISTS idx_documents_application_code ON documents(application_code);
CREATE INDEX IF NOT EXISTS idx_documents_storage_key ON documents(storage_key);

-- Inspections table
CREATE TABLE inspections (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    staff_id INT NOT NULL,
    scheduled_date TIMESTAMP,
    result VARCHAR(50) DEFAULT 'pending' CHECK (result IN ('pending', 'compliant', 'deviation')),
    observations TEXT,
    report_document_id INT,
    recommendation VARCHAR(20) CHECK (recommendation IN ('approve', 'conditional', 'reject')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_inspections_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_inspections_staff FOREIGN KEY (staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_inspections_report FOREIGN KEY (report_document_id) REFERENCES documents(id) ON DELETE SET NULL
);

-- Fines table (3NF: separate from inspections)
CREATE TABLE fines (
    id SERIAL PRIMARY KEY,
    inspection_id INT NOT NULL,
    staff_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    imposed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_fines_inspection FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
    CONSTRAINT fk_fines_staff FOREIGN KEY (staff_id) REFERENCES staff_accounts(id) ON DELETE RESTRICT
);

-- COC (Certificate of Conformity) requests table
CREATE TABLE coc_requests (
    id SERIAL PRIMARY KEY,
    coc_id VARCHAR(30) UNIQUE,
    application_id INT NOT NULL UNIQUE,
    applicant_id INT,
    applicant_email VARCHAR(255),
    applicant_name VARCHAR(255),
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(80) DEFAULT 'requested' CHECK (status IN (
        'requested', 'fee-calculated', 'paid', 'assigned-to-to',
        'inspection-complete', 'coc-approved', 'coc-collected',
        'coc-violations-found', 'coc-rectification-in-progress',
        'reinspection-requested', 'coc-fine-paid-regularization-pending',
        'pending', 'inspection_scheduled', 'inspected', 'compliant', 'deviation', 'issued'
    )),
    declarations JSONB,
    fee_amount DECIMAL(10, 2) CHECK (fee_amount IS NULL OR fee_amount >= 0),
    fee_calculated_at TIMESTAMP,
    paid_at TIMESTAMP,
    assigned_to INT,
    assigned_at TIMESTAMP,
    inspection_id INT,
    inspection_completed_at TIMESTAMP,
    violation_report JSONB,
    deviation_fine DECIMAL(10, 2) CHECK (deviation_fine IS NULL OR deviation_fine >= 0),
    rectification_chosen_at TIMESTAMP,
    rectification_confirmed_at TIMESTAMP,
    reinspection_requested_at TIMESTAMP,
    reinspection_completed_at TIMESTAMP,
    reinspection_rounds INT DEFAULT 0 CHECK (reinspection_rounds >= 0),
    regularization_status VARCHAR(30) CHECK (regularization_status IN ('rectify', 'fine-paid', 'regularized', 'rejected') OR regularization_status IS NULL),
    fine_paid_at TIMESTAMP,
    certificate_url TEXT,
    approved_by_committee_at TIMESTAMP,
    issued_at TIMESTAMP,
    valid_until TIMESTAMP,
    collected_at TIMESTAMP,
    notes TEXT,
    
    CONSTRAINT fk_coc_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_coc_inspection FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL,
    CONSTRAINT fk_coc_assigned_to FOREIGN KEY (assigned_to) REFERENCES staff_accounts(id) ON DELETE SET NULL,
    CONSTRAINT fk_coc_applicant FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE SET NULL
);

-- Permit lifecycle state (building permit issuance, collection, validity, and extensions)
CREATE TABLE permit_workflow (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL UNIQUE,
    permit_reference VARCHAR(50) UNIQUE,
    permit_type VARCHAR(30) NOT NULL DEFAULT 'building' CHECK (permit_type = 'building'),
    issued_at TIMESTAMP,
    valid_until TIMESTAMP,
    permit_collected BOOLEAN DEFAULT FALSE,
    permit_collected_at TIMESTAMP,
    issued_by INT,
    collected_by INT,
    max_years INT NOT NULL DEFAULT 5 CHECK (max_years >= 1 AND max_years <= 10),
    extensions_used INT NOT NULL DEFAULT 0 CHECK (extensions_used >= 0),
    extension_history JSONB,
    verification JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_permit_valid_dates CHECK (valid_until IS NULL OR issued_at IS NULL OR valid_until >= issued_at),
    CONSTRAINT fk_permit_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_permit_issued_by FOREIGN KEY (issued_by) REFERENCES staff_accounts(id) ON DELETE SET NULL,
    CONSTRAINT fk_permit_collected_by FOREIGN KEY (collected_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

CREATE TABLE permit_extensions (
    id SERIAL PRIMARY KEY,
    permit_id INT NOT NULL,
    extension_no INT NOT NULL CHECK (extension_no >= 1),
    fee_amount DECIMAL(10, 2) NOT NULL DEFAULT 5000 CHECK (fee_amount >= 0),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed')),
    payment_reference VARCHAR(100),
    payment_method VARCHAR(30),
    previous_valid_until TIMESTAMP NOT NULL,
    extended_valid_until TIMESTAMP NOT NULL,
    approved_by INT,
    approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    CONSTRAINT chk_extension_window CHECK (extended_valid_until > previous_valid_until),
    CONSTRAINT uq_permit_extension_round UNIQUE (permit_id, extension_no),
    CONSTRAINT fk_permit_extensions_permit FOREIGN KEY (permit_id) REFERENCES permit_workflow(id) ON DELETE CASCADE,
    CONSTRAINT fk_permit_extensions_approved_by FOREIGN KEY (approved_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

-- Document corrections table (3NF: separate correction tracking)
CREATE TABLE document_corrections (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    original_document_id INT NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    rejection_reason TEXT NOT NULL,
    requested_by INT NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resubmitted_document_id INT,
    resubmitted_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'resubmitted', 'accepted', 'rejected')),
    verified_by INT,
    verified_at TIMESTAMP,
    
    CONSTRAINT fk_corrections_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_corrections_original_doc FOREIGN KEY (original_document_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_corrections_resubmitted_doc FOREIGN KEY (resubmitted_document_id) REFERENCES documents(id) ON DELETE SET NULL,
    CONSTRAINT fk_corrections_requested_by FOREIGN KEY (requested_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_corrections_verified_by FOREIGN KEY (verified_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

-- Payments table (3NF: separate payment tracking with exclusive FK)
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    application_id INT,
    coc_request_id INT,
    fine_id INT,
    payment_type VARCHAR(50) NOT NULL CHECK (payment_type IN ('application_fee', 'coc_fee', 'deviation_fine', 'permit_extension_fee')),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    transaction_id VARCHAR(50),
    payment_method VARCHAR(50),
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Exclusive FK: payment must be for ONE entity only
    CONSTRAINT chk_payment_exclusive_fk CHECK (
        (application_id IS NOT NULL AND coc_request_id IS NULL AND fine_id IS NULL) OR
        (application_id IS NULL AND coc_request_id IS NOT NULL AND fine_id IS NULL) OR
        (application_id IS NULL AND coc_request_id IS NULL AND fine_id IS NOT NULL)
    ),
    
    CONSTRAINT fk_payments_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_payments_coc FOREIGN KEY (coc_request_id) REFERENCES coc_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_payments_fine FOREIGN KEY (fine_id) REFERENCES fines(id) ON DELETE CASCADE
);

-- Notifications table (NEW - for real-time user notifications)
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('applicant', 'staff')),
    applicant_id INT,
    staff_id INT,
    notification_type VARCHAR(80) NOT NULL CHECK (notification_type IN (
        'application_submitted', 'application_status', 'document_request',
        'document_correction', 'inspection_scheduled', 'inspection_completed',
        'fine_imposed', 'payment_received', 'payment_pending',
        'committee_decision', 'coc_issued', 'coc_request',
        'assignment_received', 'review_completed',
        'permit_approved', 'permit_collected', 'permit_expiring_soon',
        'permit_expired', 'permit_extension_approved',
        'coc_violation_reported', 'coc_reinspection_requested', 'coc_collection_ready',
        'appeal_submitted', 'appeal_update', 'hold_placed', 'hold_resolved',
        'non_indemnification_requested', 'non_indemnification_signed'
    )),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    related_application_id INT,
    related_entity_type VARCHAR(50) CHECK (related_entity_type IN (
        'application', 'inspection', 'payment', 'fine',
        'coc_request', 'document_correction', 'document',
        'appeal_case', 'appeal_version', 'application_hold', 'committee_decision',
        'non_indemnification', 'permit_extension'
    )),
    related_entity_id INT,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    action_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Exclusive user: notification for applicant OR staff, not both
    CONSTRAINT chk_notification_user CHECK (
        (applicant_id IS NOT NULL AND staff_id IS NULL) OR 
        (applicant_id IS NULL AND staff_id IS NOT NULL)
    ),
    
    CONSTRAINT fk_notifications_applicant FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_staff FOREIGN KEY (staff_id) REFERENCES staff_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_application FOREIGN KEY (related_application_id) REFERENCES applications(id) ON DELETE SET NULL
);

-- Application assignments table (NEW - for assignment workflow and history)
CREATE TABLE application_assignments (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    assigned_to INT NOT NULL,
    assigned_by INT NOT NULL,
    assignment_type VARCHAR(50) NOT NULL CHECK (assignment_type IN (
        'initial_review', 're_review', 'technical_review', 'committee_review'
    )),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending', 'accepted', 'in_progress', 'completed', 'reassigned', 'rejected'
    )),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    completed_at TIMESTAMP,
    due_date TIMESTAMP,
    notes TEXT,
    rejection_reason TEXT,
    workload_count INT DEFAULT 0,
    
    -- Business rule: cannot assign to self
    CONSTRAINT chk_assignment_not_self CHECK (assigned_to != assigned_by),
    
    CONSTRAINT fk_assignments_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_assignments_assigned_to FOREIGN KEY (assigned_to) REFERENCES staff_accounts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES staff_accounts(id) ON DELETE RESTRICT
);

-- Application status change audit trail (3NF workflow history)
CREATE TABLE application_status_history (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    status VARCHAR(60) NOT NULL,
    changed_by INT,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    source_stage VARCHAR(50),
    CONSTRAINT fk_status_history_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_status_history_changed_by FOREIGN KEY (changed_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

-- Hold lifecycle used by Planning/TO/SW workflows
CREATE TABLE application_holds (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    hold_type VARCHAR(30) NOT NULL CHECK (hold_type IN ('complaint', 'clearance', 'technical-deficiency')),
    hold_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (hold_status IN ('active', 'resolved')),
    reason TEXT NOT NULL,
    clearance_authority VARCHAR(255),
    requested_by INT,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_by INT,
    resolved_at TIMESTAMP,
    resolution_note TEXT,
    CONSTRAINT fk_holds_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_holds_requested_by FOREIGN KEY (requested_by) REFERENCES staff_accounts(id) ON DELETE SET NULL,
    CONSTRAINT fk_holds_resolved_by FOREIGN KEY (resolved_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

-- Committee decision trail with appeal-aware outcomes
CREATE TABLE committee_decisions (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    decision_no INT NOT NULL CHECK (decision_no >= 1),
    decision_type VARCHAR(40) NOT NULL CHECK (decision_type IN ('approved', 'not-granted', 'more-info', 'referred-back', 'appeal-upheld', 'appeal-denied')),
    decision_reason TEXT,
    decision_notes TEXT,
    decided_by INT,
    decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requires_non_indemnification BOOLEAN DEFAULT FALSE,
    recommendation_snapshot VARCHAR(20),
    sw_note_snapshot TEXT,
    CONSTRAINT uq_committee_decision_round UNIQUE (application_id, decision_no),
    CONSTRAINT fk_committee_decisions_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_committee_decisions_decided_by FOREIGN KEY (decided_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

-- Non-indemnification agreement lifecycle after approvals
CREATE TABLE non_indemnification_agreements (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    agreement_no INT NOT NULL CHECK (agreement_no >= 1),
    requested_by INT,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applicant_id INT,
    status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'agreed', 'rejected')),
    agreed_at TIMESTAMP,
    recorded_by INT,
    document_id INT,
    note TEXT,
    CONSTRAINT uq_non_indemnification_round UNIQUE (application_id, agreement_no),
    CONSTRAINT fk_non_indemnification_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_non_indemnification_requested_by FOREIGN KEY (requested_by) REFERENCES staff_accounts(id) ON DELETE SET NULL,
    CONSTRAINT fk_non_indemnification_applicant FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE SET NULL,
    CONSTRAINT fk_non_indemnification_recorded_by FOREIGN KEY (recorded_by) REFERENCES staff_accounts(id) ON DELETE SET NULL,
    CONSTRAINT fk_non_indemnification_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

-- Appeal case header (one active chain per application)
CREATE TABLE appeal_cases (
    id SERIAL PRIMARY KEY,
    application_id INT NOT NULL UNIQUE,
    route VARCHAR(30) NOT NULL DEFAULT 'committee' CHECK (route IN ('committee', 'planning-section', 'technical-officer', 'superintendent')),
    status VARCHAR(30) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under-review', 'routed-to-to', 'forwarded-to-committee', 'resubmit-required', 'resolved', 'rejected')),
    portal_open BOOLEAN DEFAULT TRUE,
    additional_fee DECIMAL(10, 2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appeal_cases_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE appeal_versions (
    id SERIAL PRIMARY KEY,
    appeal_case_id INT NOT NULL,
    appeal_no INT NOT NULL CHECK (appeal_no >= 1),
    summary TEXT,
    corrections_category VARCHAR(20) CHECK (corrections_category IN ('documents', 'plans', 'mixed')),
    special_circumstances TEXT,
    contains_new_plans BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    planning_assessment TEXT,
    required_actions TEXT,
    CONSTRAINT uq_appeal_version UNIQUE (appeal_case_id, appeal_no),
    CONSTRAINT fk_appeal_versions_case FOREIGN KEY (appeal_case_id) REFERENCES appeal_cases(id) ON DELETE CASCADE
);

CREATE TABLE appeal_documents (
    id SERIAL PRIMARY KEY,
    appeal_version_id INT NOT NULL,
    document_id INT,
    label VARCHAR(255) NOT NULL,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('corrected', 'additional')),
    required BOOLEAN DEFAULT TRUE,
    CONSTRAINT fk_appeal_documents_version FOREIGN KEY (appeal_version_id) REFERENCES appeal_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_appeal_documents_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE TABLE appeal_member_notes (
    id SERIAL PRIMARY KEY,
    appeal_case_id INT NOT NULL,
    noted_by INT,
    note TEXT NOT NULL,
    noted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appeal_notes_case FOREIGN KEY (appeal_case_id) REFERENCES appeal_cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_appeal_notes_staff FOREIGN KEY (noted_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

-- COC declarations separated for 3NF (no declaration arrays/blobs)
CREATE TABLE coc_declarations (
    id SERIAL PRIMARY KEY,
    coc_request_id INT NOT NULL,
    declaration_type VARCHAR(40) NOT NULL CHECK (declaration_type IN ('construction_complete', 'ready_for_inspection', 'understands_enforcement')),
    accepted BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    CONSTRAINT uq_coc_declaration UNIQUE (coc_request_id, declaration_type),
    CONSTRAINT fk_coc_declarations_request FOREIGN KEY (coc_request_id) REFERENCES coc_requests(id) ON DELETE CASCADE
);

CREATE TABLE coc_violations (
    id SERIAL PRIMARY KEY,
    coc_request_id INT NOT NULL,
    inspection_id INT,
    deviation_type VARCHAR(80) NOT NULL,
    comments TEXT,
    fine_amount DECIMAL(10, 2) NOT NULL CHECK (fine_amount >= 0),
    no_appeal BOOLEAN DEFAULT TRUE,
    inspection_type VARCHAR(30) NOT NULL DEFAULT 'initial-inspection' CHECK (inspection_type IN ('initial-inspection', 'reinspection')),
    reported_by INT,
    reported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_coc_violations_request FOREIGN KEY (coc_request_id) REFERENCES coc_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_coc_violations_inspection FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL,
    CONSTRAINT fk_coc_violations_reported_by FOREIGN KEY (reported_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

CREATE TABLE coc_reinspections (
    id SERIAL PRIMARY KEY,
    coc_request_id INT NOT NULL,
    round_no INT NOT NULL CHECK (round_no >= 1),
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    result VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'compliant', 'deviation')),
    technical_officer_id INT,
    notes TEXT,
    CONSTRAINT uq_coc_reinspection_round UNIQUE (coc_request_id, round_no),
    CONSTRAINT fk_coc_reinspections_request FOREIGN KEY (coc_request_id) REFERENCES coc_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_coc_reinspections_officer FOREIGN KEY (technical_officer_id) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

-- Permit physical issuance checklist items normalized from JSON verification blobs
CREATE TABLE permit_collection_checks (
    id SERIAL PRIMARY KEY,
    permit_id INT NOT NULL,
    check_type VARCHAR(60) NOT NULL CHECK (check_type IN ('applicant_identity_verified', 'official_permit_signed_and_sealed', 'handover_register_signed', 'permit_copy_retained')),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    checked_at TIMESTAMP,
    note TEXT,
    CONSTRAINT uq_permit_collection_check UNIQUE (permit_id, check_type),
    CONSTRAINT fk_permit_collection_checks_permit FOREIGN KEY (permit_id) REFERENCES permit_workflow(id) ON DELETE CASCADE
);

-- Indexes for performance optimization
CREATE INDEX idx_applications_applicant ON applications(applicant_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_assigned_to ON applications(assigned_to);
CREATE INDEX idx_applications_submission_date ON applications(submission_date DESC);

CREATE INDEX idx_documents_application ON documents(application_id);
CREATE INDEX idx_documents_type ON documents(doc_type);

CREATE INDEX idx_inspections_application ON inspections(application_id);
CREATE INDEX idx_inspections_staff ON inspections(staff_id);
CREATE INDEX idx_inspections_scheduled ON inspections(scheduled_date);

CREATE INDEX idx_fines_inspection ON fines(inspection_id);
CREATE INDEX idx_fines_staff ON fines(staff_id);

CREATE INDEX idx_coc_application ON coc_requests(application_id);
CREATE INDEX idx_coc_status ON coc_requests(status);
CREATE INDEX idx_coc_applicant_email ON coc_requests(applicant_email);

CREATE INDEX idx_permit_workflow_application ON permit_workflow(application_id);
CREATE INDEX idx_permit_workflow_valid_until ON permit_workflow(valid_until);
CREATE INDEX idx_permit_workflow_collected ON permit_workflow(permit_collected);
CREATE INDEX idx_permit_extensions_permit ON permit_extensions(permit_id);
CREATE INDEX idx_permit_extensions_payment_status ON permit_extensions(payment_status);

CREATE INDEX idx_corrections_application ON document_corrections(application_id);
CREATE INDEX idx_corrections_status ON document_corrections(status);

CREATE INDEX idx_payments_application ON payments(application_id) WHERE application_id IS NOT NULL;
CREATE INDEX idx_payments_coc ON payments(coc_request_id) WHERE coc_request_id IS NOT NULL;
CREATE INDEX idx_payments_fine ON payments(fine_id) WHERE fine_id IS NOT NULL;
CREATE INDEX idx_payments_status ON payments(status);

CREATE INDEX idx_notifications_applicant ON notifications(applicant_id) WHERE applicant_id IS NOT NULL;
CREATE INDEX idx_notifications_staff ON notifications(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX idx_notifications_unread ON notifications(applicant_id, is_read) WHERE is_read = FALSE AND applicant_id IS NOT NULL;
CREATE INDEX idx_notifications_unread_staff ON notifications(staff_id, is_read) WHERE is_read = FALSE AND staff_id IS NOT NULL;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_notifications_application ON notifications(related_application_id);

CREATE INDEX idx_assignments_application ON application_assignments(application_id);
CREATE INDEX idx_assignments_assigned_to ON application_assignments(assigned_to);
CREATE INDEX idx_assignments_assigned_by ON application_assignments(assigned_by);
CREATE INDEX idx_assignments_status ON application_assignments(status);
CREATE INDEX idx_assignments_due_date ON application_assignments(due_date);
CREATE INDEX idx_assignments_active ON application_assignments(assigned_to, status) 
    WHERE status IN ('pending', 'accepted', 'in_progress');

CREATE INDEX idx_status_history_application ON application_status_history(application_id);
CREATE INDEX idx_status_history_changed_at ON application_status_history(changed_at DESC);

CREATE INDEX idx_holds_application ON application_holds(application_id);
CREATE INDEX idx_holds_active ON application_holds(application_id, hold_status) WHERE hold_status = 'active';

CREATE INDEX idx_committee_decisions_application ON committee_decisions(application_id);
CREATE INDEX idx_committee_decisions_type ON committee_decisions(decision_type);

CREATE INDEX idx_non_indemnification_application ON non_indemnification_agreements(application_id);
CREATE INDEX idx_non_indemnification_status ON non_indemnification_agreements(status);

CREATE INDEX idx_appeal_cases_application ON appeal_cases(application_id);
CREATE INDEX idx_appeal_cases_status ON appeal_cases(status);
CREATE INDEX idx_appeal_versions_case ON appeal_versions(appeal_case_id);
CREATE INDEX idx_appeal_documents_version ON appeal_documents(appeal_version_id);
CREATE INDEX idx_appeal_notes_case ON appeal_member_notes(appeal_case_id);

CREATE INDEX idx_coc_declarations_request ON coc_declarations(coc_request_id);
CREATE INDEX idx_coc_violations_request ON coc_violations(coc_request_id);
CREATE INDEX idx_coc_reinspections_request ON coc_reinspections(coc_request_id);

CREATE INDEX idx_permit_collection_checks_permit ON permit_collection_checks(permit_id);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Schema update completed successfully!';
    RAISE NOTICE 'Created tables: applications, documents, inspections, fines, coc_requests, permit_workflow, permit_extensions, document_corrections, payments, notifications, application_assignments, application_status_history, application_holds, committee_decisions, non_indemnification_agreements, appeal_cases, appeal_versions, appeal_documents, appeal_member_notes, coc_declarations, coc_violations, coc_reinspections, permit_collection_checks';
    RAISE NOTICE 'Preserved tables with test data: applicants, staff_accounts, password_resets';
END $$;
