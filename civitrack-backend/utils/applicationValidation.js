/**
 * Application type + status workflow rules shared by HTTP controllers.
 *
 * Invariants reviewers should know:
 * - **Legacy vs simple**: `workflow === 'simple'` uses `SIMPLE_*` graphs (8 statuses) for `/api/simple/*`;
 *   everything else uses the larger legacy graph. Both must stay consistent with the DB `CHECK` on
 *   `applications.status` (see `database/migrations/0003_sync_application_status_constraint.sql`).
 * - **Terminal `closed`**: no further transitions except what the graph encodes as empty.
 * - **Admin**: `validateStatusTransition` short-circuits to allowed when `userRole === 'admin'` so ops
 *   can recover stuck rows; non-admin paths must satisfy both role permissions and the transition graph.
 */
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
  'sw_review_pending',
  'hold_complaint',
  'hold_clearance',
];

const APPLICATION_STATUS_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['under_review', 'accepted', 'correction', 'rejected', 'committee_review', 'verified'],
  under_review: ['accepted', 'correction', 'committee_review', 'approved', 'rejected', 'not_granted_appeal_required', 'verified', 'sw_review_pending', 'hold_complaint', 'hold_clearance'],
  hold_complaint: ['under_review'],
  hold_clearance: ['under_review'],
  verified: ['payment_pending', 'under_review', 'correction', 'accepted'],
  payment_pending: ['under_review', 'correction', 'accepted', 'committee_review', 'sw_review_pending'],
  sw_review_pending: ['endorsed', 'committee_review', 'under_review', 'correction', 'rejected'],
  accepted: ['under_review', 'correction', 'committee_review', 'approved', 'certified', 'permit_approved', 'coc_pending', 'payment_pending', 'sw_review_pending'],
  correction: ['submitted', 'under_review', 'accepted'],
  committee_review: ['endorsed', 'approved', 'certified', 'rejected', 'not_granted_appeal_required', 'accepted'],
  not_granted_appeal_required: ['appeal_submitted', 'closed'],
  appeal_submitted: ['under_review', 'approved_awaiting_agreement', 'rejected', 'accepted'],
  approved: ['approved_awaiting_agreement', 'permit_approved', 'accepted', 'coc_pending'],
  endorsed: ['certified', 'rejected', 'approved', 'approved_awaiting_agreement', 'accepted', 'correction', 'committee_review'],
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

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLIFIED WORKFLOW — 8 statuses only
// These are used exclusively by /api/simple/* routes and the rebuilt dashboards.
// The existing APPLICATION_STATUS_TRANSITIONS above remains untouched.
// ─────────────────────────────────────────────────────────────────────────────

const SIMPLE_STATUS_TRANSITIONS = {
  submitted:         ['verified', 'under_review', 'payment_pending', 'correction', 'rejected'],
  verified:          ['payment_pending', 'under_review', 'correction', 'rejected'],
  payment_pending:   ['under_review', 'correction', 'rejected'],
  under_review:      ['correction', 'sw_review_pending', 'rejected'],
  hold_complaint:    ['under_review'],
  hold_clearance:    ['under_review'],
  correction:        ['under_review', 'submitted'],
  sw_review_pending: ['endorsed', 'under_review', 'correction', 'rejected'],
  endorsed:          ['approved_awaiting_agreement', 'rejected', 'under_review'],
  approved_awaiting_agreement: ['agreement_completed'],
  agreement_completed: ['closed'],
  rejected:          ['closed'],
  closed:            [],
};

const SIMPLE_ROLE_PERMISSIONS = {
  // PO must not skip TO; only Technical Officer (submitTOReport) or admin advance may enter SW review.
  planning_officer: ['verified', 'under_review', 'payment_pending', 'correction', 'rejected'],
  superintendent:   ['endorsed', 'under_review', 'correction', 'sw_review_pending', 'rejected'],
  committee:        ['approved', 'approved_awaiting_agreement', 'rejected'],
  admin:            [...new Set([...Object.keys(SIMPLE_STATUS_TRANSITIONS), 'approved'])],
};

// Notes are mandatory when setting these statuses
const SIMPLE_STATUSES_REQUIRING_NOTE = ['correction', 'rejected'];


const STATUS_ROLE_PERMISSIONS = {
  planning_officer: ['under_review', 'correction', 'pending', 'accepted', 'verified', 'payment_pending'],
  technical_officer: ['under_review', 'correction', 'pending', 'accepted', 'hold_complaint', 'hold_clearance'],
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
    'sw_review_pending',
    'endorsed',
    'hold_complaint',
    'hold_clearance',
  ],
  committee: [
    'committee_review',
    'endorsed',
    'approved',
    'certified',
    'rejected',
    'not_granted_appeal_required',
    'approved_awaiting_agreement',
    'correction',
  ],
  admin: APPLICATION_STATUSES.filter((status) => status !== 'draft'),
};

const STATUSES_REQUIRING_REASON = ['rejected', 'correction', 'not_granted_appeal_required'];

const SRI_LANKA_NIC_REGEX = /^([0-9]{9}[VvXx]|[0-9]{12})$/;

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : value);

const isValidApplicationType = (value) => APPLICATION_TYPES.includes(value);
const isValidApplicationStatus = (value) => APPLICATION_STATUSES.includes(value);

const getWorkflowConfig = (workflow = 'legacy') => {
  if (workflow === 'simple') {
    return {
      statuses: Object.keys(SIMPLE_STATUS_TRANSITIONS),
      transitions: SIMPLE_STATUS_TRANSITIONS,
      rolePermissions: SIMPLE_ROLE_PERMISSIONS,
      statusesRequiringReason: SIMPLE_STATUSES_REQUIRING_NOTE,
    };
  }

  return {
    statuses: APPLICATION_STATUSES,
    transitions: APPLICATION_STATUS_TRANSITIONS,
    rolePermissions: STATUS_ROLE_PERMISSIONS,
    statusesRequiringReason: STATUSES_REQUIRING_REASON,
  };
};

const isValidStatusForWorkflow = (value, workflow = 'legacy') => {
  const config = getWorkflowConfig(workflow);
  return config.statuses.includes(value);
};

const getAllowedNextStatusesForWorkflow = ({ fromStatus, userRole, workflow = 'legacy' }) => {
  const config = getWorkflowConfig(workflow);
  const roleAllowed = config.rolePermissions[userRole] || [];
  const workflowAllowed = config.transitions[fromStatus] || [];

  if (userRole === 'admin' && fromStatus !== 'closed') {
    return roleAllowed;
  }

  return workflowAllowed.filter((status) => roleAllowed.includes(status));
};

const validateStatusTransition = ({ fromStatus, toStatus, userRole, workflow = 'legacy' }) => {
  const config = getWorkflowConfig(workflow);
  if (!config.statuses.includes(fromStatus) || !config.statuses.includes(toStatus)) {
    return { allowed: false, reason: 'Invalid source or target status' };
  }

  if (fromStatus === toStatus) {
    return { allowed: false, reason: 'Application is already in this status' };
  }

  if (fromStatus === 'closed') {
    return { allowed: false, reason: 'Closed applications cannot transition to another status' };
  }

  const roleAllowed = config.rolePermissions[userRole] || [];
  if (!roleAllowed.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Role ${userRole} is not allowed to set status ${toStatus}`,
      allowedByRole: roleAllowed,
    };
  }

  // Admin bypass of the transition graph (role list still applies for non-admin above).
  if (userRole === 'admin') {
    return { allowed: true };
  }

  const workflowAllowed = config.transitions[fromStatus] || [];
  if (!workflowAllowed.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Transition ${fromStatus} -> ${toStatus} is not allowed by workflow`,
      allowedNextStatuses: workflowAllowed,
    };
  }

  return { allowed: true };
};

const getAllowedNextStatuses = (fromStatus, userRole) => getAllowedNextStatusesForWorkflow({
  fromStatus,
  userRole,
  workflow: 'legacy',
});

const validateApplicationStatusTransition = ({ fromStatus, toStatus, userRole }) => validateStatusTransition({
  fromStatus,
  toStatus,
  userRole,
  workflow: 'legacy',
});

module.exports = {
  // ── Existing (unchanged) ──────────────────────────────────────────────────
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
  isValidStatusForWorkflow,
  getWorkflowConfig,
  getAllowedNextStatusesForWorkflow,
  validateStatusTransition,
  getAllowedNextStatuses,
  validateApplicationStatusTransition,

  // ── Simplified workflow (new) ─────────────────────────────────────────────
  SIMPLE_STATUS_TRANSITIONS,
  SIMPLE_ROLE_PERMISSIONS,
  SIMPLE_STATUSES_REQUIRING_NOTE,
};