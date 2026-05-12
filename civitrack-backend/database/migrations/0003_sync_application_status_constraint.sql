-- Authoritative list of allowed `applications.status` values at the DB layer.
-- When adding a status in application code (`utils/applicationValidation.js`), extend this CHECK
-- in a new migration so API validation and the database cannot disagree.
ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS chk_applications_status;

ALTER TABLE applications
  ADD CONSTRAINT chk_applications_status CHECK (
    status IN (
      'draft',
      'submitted',
      'payment_pending',
      'under_review',
      'correction',
      'sw_review_pending',
      'endorsed',
      'approved',
      'rejected',
      'closed',
      'committee_review',
      'verified',
      'accepted',
      'pending',
      'certified',
      'not_granted_appeal_required',
      'appeal_submitted',
      'approved_awaiting_agreement',
      'agreement_completed',
      'permit_approved',
      'permit_collected',
      'coc_pending',
      'coc_issued'
    )
  );
