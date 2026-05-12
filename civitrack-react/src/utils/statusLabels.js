export const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  verified: 'Verified',
  payment_pending: 'Payment Pending',
  under_review: 'Under Review',
  hold_complaint: 'On Hold - Complaint',
  hold_clearance: 'On Hold - Clearance',
  correction: 'Correction Required',
  sw_review_pending: 'SW Review Pending',
  endorsed: 'Endorsed',
  committee_review: 'Committee Review',
  approved: 'Approved',
  rejected: 'Rejected',
  not_granted_appeal_required: 'Appeal Required',
  appeal_submitted: 'Appeal Submitted',
  approved_awaiting_agreement: 'Approved - Awaiting Agreement',
  agreement_completed: 'Agreement Completed',
  permit_approved: 'Permit Approved',
  permit_collected: 'Permit Collected',
  coc_pending: 'COC Pending',
  coc_issued: 'COC Issued',
  requested: 'COC Requested - Pending Fee Calculation',
  fee_calculated: 'COC Fee Calculated - Awaiting Payment',
  paid: 'COC Fee Paid - Ready for TO Assignment',
  'assigned_to_to': 'Assigned to Technical Officer',
  inspection_complete: 'COC Inspection Complete - Forwarded to Committee',
  'coc_violations_found': 'COC - Violations Found',
  'coc_correction_required': 'Corrections Required - No Fine',
  'coc_rectification_in_progress': 'Rectification In Progress',
  'coc_fine_paid_awaiting_correction': 'Fine Paid - Submit Corrections',
  'correction_submitted': 'Correction Submitted - TO Review Pending',
  'reinspection_eligible': 'Eligible for Re-Inspection Request',
  'reinspection_requested': 'Re-Inspection Requested',
  'coc_fine_paid_regularization_pending': 'Fine Paid - Regularization Pending',
  'coc_rejected_non_rectifiable': 'COC Rejected - Non-Rectifiable Violation',
  'coc_approved': 'COC Approved',
  'coc_collected': 'COC Collected',
  closed: 'Closed',
  pending: 'Pending',
  accepted: 'Accepted',
  certified: 'Certified',
  completed: 'Completed',
};

export const toCanonicalStatusKey = (status) => String(status || '')
  .trim()
  .toLowerCase()
  .replace(/-/g, '_')
  .replace(/\s+/g, '_');

export const toKebabStatusKey = (status) => toCanonicalStatusKey(status).replace(/_/g, '-');

export const getStatusLabel = (status) => {
  const key = toCanonicalStatusKey(status);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};
