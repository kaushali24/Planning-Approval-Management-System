const APPEAL_SUBMISSIONS_KEY = 'appeal_submissions';

const buildDocEntry = (doc, index = 0, kind = 'corrected') => {
  if (!doc) {
    return {
      id: `${kind}-${index + 1}`,
      label: `${kind === 'additional' ? 'Additional' : 'Corrected'} Document ${index + 1}`,
      kind,
      required: true,
    };
  }

  if (typeof doc === 'string') {
    return {
      id: `${kind}-${index + 1}`,
      label: doc,
      kind,
      required: true,
    };
  }

  return {
    id: doc.id || `${kind}-${index + 1}`,
    label: doc.label || doc.name || doc.fileName || `Document ${index + 1}`,
    kind: doc.kind || kind,
    required: doc.required !== false,
  };
};

const normalizeHistoryItem = (item = {}, index = 0) => {
  const correctedDocs = (item.correctedDocuments || []).map((doc, docIndex) => buildDocEntry(doc, docIndex, 'corrected'));
  const additionalDocs = (item.additionalDocuments || []).map((doc, docIndex) => buildDocEntry(doc, docIndex, 'additional'));

  return {
    appealNo: item.appealNo || (index + 1),
    summary: item.summary || '',
    submittedAt: item.submittedAt || null,
    route: item.route || 'committee',
    correctionsCategory: item.correctionsCategory || 'documents',
    specialCircumstances: item.specialCircumstances || '',
    acknowledgements: item.acknowledgements || { addressedAll: false, understandsWorkflow: false },
    correctedDocuments: correctedDocs,
    additionalDocuments: additionalDocs,
    containsNewPlans: !!item.containsNewPlans,
    planningAssessment: item.planningAssessment || null,
  };
};

const normalizeLegacyAppeal = (entry) => {
  if (!entry) return null;
  if (Array.isArray(entry.history)) {
    return {
      ...entry,
      status: entry.status || 'submitted',
      type: entry.type || 'Building Permit',
      summary: entry.summary || '',
      route: entry.route || 'committee',
      submittedAt: entry.submittedAt || null,
      requiredActions: Array.isArray(entry.requiredActions) ? entry.requiredActions : [],
      requiredDocuments: Array.isArray(entry.requiredDocuments)
        ? entry.requiredDocuments.map((doc, index) => buildDocEntry(doc, index, 'corrected'))
        : [],
      portalOpen: entry.portalOpen !== false,
      history: entry.history.map((item, index) => normalizeHistoryItem(item, index)),
      memberNotes: Array.isArray(entry.memberNotes) ? entry.memberNotes : [],
      additionalFee: entry.additionalFee || null,
    };
  }

  return {
    status: entry.status || 'submitted',
    type: entry.type || 'Building Permit',
    summary: entry.summary || '',
    route: entry.route || 'committee',
    submittedAt: entry.submittedAt || null,
    requiredActions: Array.isArray(entry.requiredActions) ? entry.requiredActions : [],
    requiredDocuments: Array.isArray(entry.requiredDocuments)
      ? entry.requiredDocuments.map((doc, index) => buildDocEntry(doc, index, 'corrected'))
      : [],
    portalOpen: entry.portalOpen !== false,
    memberNotes: Array.isArray(entry.memberNotes) ? entry.memberNotes : [],
    additionalFee: entry.additionalFee || null,
    history: entry.submittedAt
      ? [
          {
            appealNo: 1,
            summary: entry.summary || '',
            submittedAt: entry.submittedAt,
            route: entry.route || 'committee',
            correctionsCategory: entry.correctionsCategory || 'documents',
            specialCircumstances: entry.specialCircumstances || '',
            acknowledgements: {
              addressedAll: true,
              understandsWorkflow: true,
            },
            correctedDocuments: [],
            additionalDocuments: [],
            containsNewPlans: entry.correctionsCategory === 'plans',
            planningAssessment: null,
          },
        ]
      : [],
  };
};

export const inferAppealRoute = ({ summary = '', correctionsCategory = 'documents', correctedDocuments = [], additionalDocuments = [] } = {}) => {
  const text = String(summary || '').toLowerCase();
  const hasPlanKeywords = /plan|architect|survey|drawing|setback|far|layout/.test(text);
  const hasPlanDocument = [...correctedDocuments, ...additionalDocuments].some((doc) => {
    const label = String(doc?.label || doc?.name || doc?.fileName || '').toLowerCase();
    return /plan|architect|survey|drawing|layout|elevation/.test(label);
  });

  if (correctionsCategory === 'plans' || hasPlanKeywords || hasPlanDocument) return 'planning-section';
  return 'committee';
};

export const loadAppealSubmissions = () => {
  try {
    const raw = localStorage.getItem(APPEAL_SUBMISSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return Object.fromEntries(
      Object.entries(parsed || {}).map(([appId, entry]) => [appId, normalizeLegacyAppeal(entry)])
    );
  } catch {
    return {};
  }
};

export const saveAppealSubmissions = (data) => {
  localStorage.setItem(APPEAL_SUBMISSIONS_KEY, JSON.stringify(data));
};

export const appendAppealVersion = (existing, payload) => {
  const current = normalizeLegacyAppeal(existing) || {
    status: 'submitted',
    type: payload.type || 'Building Permit',
    summary: '',
    route: 'committee',
    submittedAt: null,
    requiredActions: [],
    requiredDocuments: [],
    portalOpen: true,
    memberNotes: [],
    additionalFee: null,
    history: [],
  };

  const nextNo = (current.history?.length || 0) + 1;
  const correctedDocuments = (payload.correctedDocuments || []).map((doc, index) => buildDocEntry(doc, index, 'corrected'));
  const additionalDocuments = (payload.additionalDocuments || []).map((doc, index) => buildDocEntry(doc, index, 'additional'));

  const item = {
    appealNo: nextNo,
    summary: payload.summary || '',
    submittedAt: payload.submittedAt || new Date().toISOString(),
    route: payload.route || 'committee',
    correctionsCategory: payload.correctionsCategory || 'documents',
    specialCircumstances: payload.specialCircumstances || '',
    acknowledgements: payload.acknowledgements || { addressedAll: false, understandsWorkflow: false },
    correctedDocuments,
    additionalDocuments,
    containsNewPlans: !!payload.containsNewPlans,
    planningAssessment: payload.planningAssessment || null,
  };

  return {
    ...current,
    type: payload.type || current.type,
    status: payload.status || 'submitted',
    route: payload.route || current.route,
    summary: payload.summary || current.summary,
    submittedAt: payload.submittedAt || current.submittedAt,
    requiredActions: Array.isArray(payload.requiredActions) ? payload.requiredActions : current.requiredActions,
    requiredDocuments: Array.isArray(payload.requiredDocuments)
      ? payload.requiredDocuments.map((doc, index) => buildDocEntry(doc, index, 'corrected'))
      : current.requiredDocuments,
    portalOpen: payload.portalOpen !== undefined ? payload.portalOpen : current.portalOpen,
    memberNotes: Array.isArray(payload.memberNotes) ? payload.memberNotes : current.memberNotes,
    additionalFee: payload.additionalFee !== undefined ? payload.additionalFee : current.additionalFee,
    history: [...(current.history || []), item],
  };
};

export const addAppealMemberNote = (existing, notePayload) => {
  const current = normalizeLegacyAppeal(existing);
  if (!current) return existing;
  const nextNote = {
    by: notePayload.by || 'Committee Member',
    at: notePayload.at || new Date().toISOString(),
    note: (notePayload.note || '').trim(),
  };
  if (!nextNote.note) return current;

  return {
    ...current,
    memberNotes: [...(current.memberNotes || []), nextNote],
  };
};

export const getLatestAppeal = (entry) => {
  if (!entry) return null;
  const normalized = normalizeLegacyAppeal(entry);
  if (!normalized) return null;
  if (!normalized.history?.length) return null;
  return normalized.history[normalized.history.length - 1];
};
