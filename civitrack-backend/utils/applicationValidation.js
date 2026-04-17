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
];

const APPLICATION_STATUS_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['under_review', 'correction', 'rejected', 'committee_review'],
  under_review: ['correction', 'committee_review', 'approved', 'rejected', 'not_granted_appeal_required'],
  correction: ['submitted', 'under_review'],
  committee_review: ['endorsed', 'approved', 'certified', 'rejected', 'not_granted_appeal_required'],
  not_granted_appeal_required: ['appeal_submitted', 'closed'],
  appeal_submitted: ['under_review', 'approved_awaiting_agreement', 'rejected'],
  approved: ['approved_awaiting_agreement', 'permit_approved'],
  endorsed: ['certified', 'rejected', 'approved_awaiting_agreement'],
  certified: ['approved_awaiting_agreement', 'permit_approved'],
  approved_awaiting_agreement: ['agreement_completed'],
  agreement_completed: ['permit_approved'],
  permit_approved: ['permit_collected'],
  permit_collected: ['closed'],
  pending: ['under_review', 'rejected'],
  rejected: ['closed'],
  closed: [],
};

const STATUS_ROLE_PERMISSIONS = {
  planning_officer: ['under_review', 'correction', 'pending'],
  technical_officer: ['under_review', 'correction', 'pending'],
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