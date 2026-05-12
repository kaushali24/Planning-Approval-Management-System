const KEYS = {
  forwardedReports: 'committee_forwarded_reports',
  decisionOutcomes: 'committee_decision_outcomes',
  appealSubmissions: 'appeal_submissions',
  technicalUpdates: 'technical_investigation_updates',
  nonIndemnification: 'committee_non_indemnification_requests',
  notGrantedReasons: 'committee_not_granted_reasons',
  planningQueue: 'planning_applications_state',
};

const readJsonStore = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const toIsoDay = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

export const getWorkflowSnapshot = () => {
  const forwardedReports = readJsonStore(KEYS.forwardedReports, []);
  const decisionOutcomes = readJsonStore(KEYS.decisionOutcomes, {});
  const appealSubmissions = readJsonStore(KEYS.appealSubmissions, {});
  const technicalUpdates = readJsonStore(KEYS.technicalUpdates, {});
  const nonIndemnification = readJsonStore(KEYS.nonIndemnification, {});
  const notGrantedReasons = readJsonStore(KEYS.notGrantedReasons, {});
  const planningQueue = readJsonStore(KEYS.planningQueue, []);

  const allIds = new Set([
    ...forwardedReports.map((r) => r.id),
    ...Object.keys(decisionOutcomes),
    ...Object.keys(appealSubmissions),
    ...Object.keys(technicalUpdates),
    ...Object.keys(nonIndemnification),
    ...Object.keys(notGrantedReasons),
  ]);

  const cases = Array.from(allIds).map((id) => {
    const forwarded = forwardedReports.find((r) => r.id === id) || {};
    const outcome = decisionOutcomes[id] || {};
    const appeal = appealSubmissions[id] || {};
    const technical = technicalUpdates[id] || {};
    const nonIndemn = nonIndemnification[id] || {};

    let status = 'under-review';
    if (technical.status === 'on-hold' && technical.holdType === 'complaint') status = 'complaint-hold';
    if (technical.status === 'on-hold' && technical.holdType === 'clearance') status = 'clearance-hold';
    if (appeal.status === 'submitted' || appeal.status === 'under-review') status = 'appeal-submitted';
    if (outcome.decision === 'not-granted') status = 'not-granted';
    if (outcome.decision === 'more-info') status = 'correction';

    const approved = outcome.decision === 'approved';
    const needsAgreement = approved && nonIndemn.requested && !nonIndemn.agreed;
    if (approved) status = needsAgreement ? 'approved' : 'issued';

    const timestamps = [
      forwarded.forwardedAt,
      outcome.decidedAt,
      appeal.submittedAt,
      appeal.reviewStartedAt,
      appeal.resolvedAt,
      technical.updatedAt,
      technical.requestedAt,
      technical.resolvedAt,
      nonIndemn.requestedAt,
      nonIndemn.agreedAt,
    ].filter(Boolean);

    const latestAt = timestamps.length > 0
      ? timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : new Date().toISOString();

    return {
      id,
      type: forwarded.type || appeal.type || 'Building Permit',
      status,
      latestAt,
      latestDay: toIsoDay(latestAt),
      reason: notGrantedReasons[id]?.reason || outcome.reason || technical.holdReason || '',
    };
  });

  const now = new Date();
  const thisMonthCases = cases.filter((c) => {
    const date = new Date(c.latestAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });

  const summary = {
    total: cases.length,
    planningNewSubmissions: planningQueue.filter((a) => !a.assigned).length,
    planningPaymentPending: planningQueue.filter((a) => a.feeStatus === 'pending-payment').length,
    planningPaidVerified: planningQueue.filter((a) => a.feeStatus === 'paid-verified').length,
    pendingReview: cases.filter((c) => c.status === 'under-review').length,
    actionRequired: cases.filter((c) => (
      c.status === 'complaint-hold' ||
      c.status === 'clearance-hold' ||
      c.status === 'correction' ||
      c.status === 'not-granted' ||
      c.status === 'approved'
    )).length,
    approved: cases.filter((c) => c.status === 'issued').length,
    appealsPending: cases.filter((c) => c.status === 'appeal-submitted').length,
    holds: cases.filter((c) => c.status === 'complaint-hold' || c.status === 'clearance-hold').length,
    notGranted: cases.filter((c) => c.status === 'not-granted').length,
    thisMonth: thisMonthCases.length,
  };

  const recentActivity = cases
    .slice()
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      status: c.status,
      type: c.type,
      timestamp: c.latestAt,
      message: c.reason || `${c.type} is currently ${c.status.replace('-', ' ')}.`,
    }));

  return {
    forwardedReports,
    decisionOutcomes,
    appealSubmissions,
    technicalUpdates,
    nonIndemnification,
    notGrantedReasons,
    planningQueue,
    cases,
    summary,
    recentActivity,
  };
};
