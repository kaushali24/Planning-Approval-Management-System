const APPLICATION_TYPES = ['building', 'subdivision'];

// Boundary wall is tracked via selected permit codes, not as a standalone application_type.
const APPLICATION_PERMIT_CODES = ['building', 'boundary_wall', 'subdivision'];

const APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'correction',
  'committee_review',
  'not_granted_appeal_required',
  'appeal_submitted',
  'approved_awaiting_agreement',
  'agreement_completed',
  'permit_approved',
  'permit_collected',
  'closed',
  'pending',
  'endorsed',
  'approved',
  'certified',
  'rejected',
  'accepted',
  'coc_pending',
  'coc_issued',
  'verified',
  'payment_pending',
];

const APPLICATION_STATUS_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['under_review', 'accepted', 'correction', 'rejected', 'committee_review', 'verified'],
  under_review: ['accepted', 'correction', 'committee_review', 'approved', 'rejected', 'not_granted_appeal_required', 'verified'],
  verified: ['payment_pending', 'under_review', 'correction', 'accepted'],
  payment_pending: ['under_review', 'correction', 'accepted', 'committee_review'],
  accepted: ['under_review', 'correction', 'committee_review', 'approved', 'certified', 'permit_approved', 'coc_pending', 'payment_pending'],
  correction: ['submitted', 'under_review', 'accepted'],
  committee_review: ['endorsed', 'approved', 'certified', 'rejected', 'not_granted_appeal_required', 'accepted'],
  not_granted_appeal_required: ['appeal_submitted', 'closed'],
  appeal_submitted: ['under_review', 'approved_awaiting_agreement', 'rejected', 'accepted'],
  approved: ['approved_awaiting_agreement', 'permit_approved', 'accepted', 'coc_pending'],
  endorsed: ['certified', 'rejected', 'approved_awaiting_agreement', 'accepted'],
  certified: ['approved_awaiting_agreement', 'permit_approved', 'accepted', 'coc_pending'],
  approved_awaiting_agreement: ['agreement_completed'],
  agreement_completed: ['permit_approved'],
  permit_approved: ['permit_collected', 'accepted', 'coc_pending'],
  permit_collected: ['closed', 'accepted'],
  coc_pending: ['accepted', 'coc_issued', 'under_review'],
  coc_issued: ['closed', 'accepted'],
  pending: ['under_review', 'rejected', 'accepted'],
  rejected: ['closed'],
  closed: [],
};

const STATUS_ROLE_PERMISSIONS = {
  planning_officer: ['under_review', 'correction', 'pending', 'accepted', 'verified', 'payment_pending'],
  technical_officer: ['under_review', 'correction', 'pending', 'accepted'],
  superintendent: [
    'under_review',
    'correction',
    'committee_review',
    'approved_awaiting_agreement',
    'agreement_completed',
    'permit_approved',
    'permit_collected',
    'closed',
    'pending',
    'verified',
    'payment_pending',
  ],
  committee: [
    'committee_review',
    'endorsed',
    'approved',
    'certified',
    'rejected',
    'not_granted_appeal_required',
    'approved_awaiting_agreement',
  ],
  admin: APPLICATION_STATUSES.filter((status) => status !== 'draft'),
};

const STATUSES_REQUIRING_REASON = ['rejected', 'correction', 'not_granted_appeal_required'];

const SRI_LANKA_NIC_REGEX = /^([0-9]{9}[VvXx]|[0-9]{12})$/;

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : value);

const isValidApplicationType = (value) => APPLICATION_TYPES.includes(value);
const isValidApplicationStatus = (value) => APPLICATION_STATUSES.includes(value);

const getAllowedNextStatuses = (fromStatus, userRole) => {
  const roleAllowed = STATUS_ROLE_PERMISSIONS[userRole] || [];
  const workflowAllowed = APPLICATION_STATUS_TRANSITIONS[fromStatus] || [];

  if (userRole === 'admin' && fromStatus !== 'closed') {
    return roleAllowed;
  }

  return workflowAllowed.filter((status) => roleAllowed.includes(status));
};

const validateApplicationStatusTransition = ({ fromStatus, toStatus, userRole }) => {
  if (!isValidApplicationStatus(fromStatus) || !isValidApplicationStatus(toStatus)) {
    return { allowed: false, reason: 'Invalid source or target status' };
  }

  if (fromStatus === toStatus) {
    return { allowed: false, reason: 'Application is already in this status' };
  }

  if (fromStatus === 'closed') {
    return { allowed: false, reason: 'Closed applications cannot transition to another status' };
  }

  const roleAllowed = STATUS_ROLE_PERMISSIONS[userRole] || [];
  if (!roleAllowed.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Role ${userRole} is not allowed to set status ${toStatus}`,
      allowedByRole: roleAllowed,
    };
  }

  if (userRole === 'admin') {
    return { allowed: true };
  }

  const workflowAllowed = APPLICATION_STATUS_TRANSITIONS[fromStatus] || [];
  if (!workflowAllowed.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Transition ${fromStatus} -> ${toStatus} is not allowed by workflow`,
      allowedNextStatuses: workflowAllowed,
    };
  }

  return { allowed: true };
};

module.exports = {
  APPLICATION_TYPES,
  APPLICATION_PERMIT_CODES,
  APPLICATION_STATUSES,
  APPLICATION_STATUS_TRANSITIONS,
  STATUS_ROLE_PERMISSIONS,
  STATUSES_REQUIRING_REASON,
  SRI_LANKA_NIC_REGEX,
  normalizeString,
  isValidApplicationType,
  isValidApplicationStatus,
  getAllowedNextStatuses,
  validateApplicationStatusTransition,
};