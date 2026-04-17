-- Fix constraint violations by addressing application status values
-- This fixes the root issue where application status defaults don't match constraint values

-- Step 0: Remove legacy overlapping CHECK constraints that narrow valid values
-- Keeping both old and new constraints causes the effective allowed set to be their intersection.
ALTER TABLE applications
DROP CONSTRAINT IF EXISTS applications_status_check;

ALTER TABLE notifications
DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE notifications
DROP CONSTRAINT IF EXISTS notifications_related_entity_type_check;

ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_payment_type_check;

-- Step 1: Update applications table constraint to include all valid statuses
ALTER TABLE applications
DROP CONSTRAINT IF EXISTS chk_applications_status;

ALTER TABLE applications
ADD CONSTRAINT chk_applications_status
CHECK (status IN (
    'draft','submitted', 'under_review', 'approved', 'rejected',
    'payment_pending', 'correction', 'coc_pending', 'coc_issued',
    'committee_review', 'not_granted_appeal_required', 'appeal_submitted',
    'approved_awaiting_agreement', 'agreement_completed',
    'permit_approved', 'permit_collected', 'closed',
    'pending', 'endorsed', 'certified'
));

-- Step 2: Update coc_requests table constraint to match allowed values
ALTER TABLE coc_requests
DROP CONSTRAINT IF EXISTS chk_coc_status;

ALTER TABLE coc_requests
ADD CONSTRAINT chk_coc_status
CHECK (status IN (
    'requested', 'fee-calculated', 'paid', 'assigned-to-to',
    'inspection-complete', 'coc-approved', 'coc-collected',
    'coc-violations-found', 'coc-rectification-in-progress',
    'reinspection-requested', 'coc-fine-paid-regularization-pending',
    'pending', 'inspection_scheduled', 'inspected', 'compliant',
    'deviation', 'issued', 'rejected'
));

-- Step 3: Ensure status DEFAULT values are in the constraint list
-- Since 'draft' is in the constraint, the DEFAULT 'draft' for applications is valid
-- Since 'requested' is in the constraint, the DEFAULT 'requested' for coc_requests is valid

-- Step 4: Add missing columns to coc_requests if not present
-- These should already exist from ALTER TABLE statements in migration_new_tables.sql
ALTER TABLE coc_requests
ADD COLUMN IF NOT EXISTS coc_id VARCHAR(30) UNIQUE;

ALTER TABLE coc_requests  
ADD COLUMN IF NOT EXISTS applicant_id INT REFERENCES applicants(id) ON DELETE SET NULL;

ALTER TABLE coc_requests
ADD COLUMN IF NOT EXISTS applicant_email VARCHAR(255);

ALTER TABLE coc_requests
ADD COLUMN IF NOT EXISTS applicant_name VARCHAR(255);

-- Verify the constraints are now correct
SELECT
    constraint_name,
    constraint_type,
    table_name
FROM information_schema.table_constraints
WHERE (table_name = 'applications' OR table_name = 'coc_requests')
    AND constraint_type = 'CHECK'
ORDER BY table_name;
