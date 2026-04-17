-- Drop existing tables if they exist (order matters for FK constraints)
DROP TABLE IF EXISTS document_checklist_audit_log CASCADE;
DROP TABLE IF EXISTS document_checklist_config CASCADE;
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS staff_accounts CASCADE;
DROP TABLE IF EXISTS applicants CASCADE;

-- Applicants table (self-registration only)
CREATE TABLE applicants (
    id SERIAL PRIMARY KEY,
    applicant_ref_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., APP/2026/00001
    full_name VARCHAR(255) NOT NULL,
    nic_number VARCHAR(12) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    contact_number VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(6),
    verification_code_expires TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Staff accounts (created by admin only)
CREATE TABLE staff_accounts (
    id SERIAL PRIMARY KEY,
    staff_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., STF-01, STF-02, STF-03
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin')),
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_staff_created_by FOREIGN KEY (created_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
);

-- Document checklist configuration (admin configurable, no code changes required)
CREATE TABLE document_checklist_config (
    id SERIAL PRIMARY KEY,
    doc_type_key VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_checklist_audit_log (
    id SERIAL PRIMARY KEY,
    doc_type_key VARCHAR(100) NOT NULL,
    changed_by INT REFERENCES staff_accounts(id) ON DELETE SET NULL,
    change_summary JSONB,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO document_checklist_config (doc_type_key, display_name, description, is_required, is_active, sort_order)
VALUES
    ('deed', 'Copy of Deed', 'Land ownership proof document. Accepted formats: PDF/JPG.', TRUE, TRUE, 10),
    ('assessment_tax_bill', 'Paid Assessment Tax Bill', 'Latest paid assessment tax bill. Accepted formats: PDF/JPG.', TRUE, TRUE, 20);

-- Password reset requests
CREATE TABLE password_resets (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
CREATE INDEX IF NOT EXISTS idx_applicants_applicant_ref_id ON applicants(applicant_ref_id);
CREATE INDEX IF NOT EXISTS idx_applicants_nic ON applicants(nic_number);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff_accounts(email);
CREATE INDEX IF NOT EXISTS idx_staff_staff_id ON staff_accounts(staff_id);
CREATE INDEX IF NOT EXISTS idx_document_checklist_config_active ON document_checklist_config(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_document_checklist_audit_log_doc_type_key ON document_checklist_audit_log(doc_type_key);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);
