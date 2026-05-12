import { DEFAULT_DOCUMENT_CHECKLIST, getConfiguredCommonDocuments } from '../utils/documentChecklistConfig.js';

const PLANNING_QUEUE_KEY = 'planning_applications_state';

const planningFileVault = new Map();
const planningPaymentReceiptVault = new Map();

const documentCatalog = {
  building: [
    { id: 'building_plan', label: 'Building Plan (prepared by qualified architect/professional) - PDF', required: true },
    { id: 'approved_subdivision_plan', label: 'Approved Land Subdivision Plan (1:1000 or 1:500 scale) - PDF', required: true },
    { id: 'existing_building_plan', label: 'If existing building on land: copy of approved building plan - PDF (optional)', required: false },
  ],
  boundaryWall: [
    { id: 'boundary_wall_plan', label: 'Boundary Wall Plan by qualified draftsman/surveyor (showing length, height, thickness/materials, and boundary position) - PDF', required: true },
    { id: 'existing_building_plan', label: 'If existing building on land: copy of approved building plan - PDF (optional)', required: false },
  ],
  subdivision: [
    { id: 'subdivision_plan', label: 'Survey Plan at 1:1000 minimum scale - PDF', required: true },
    { id: 'master_plan_copy', label: 'Master Plan Copy (if surveyed after 2001, must be approved copy) - PDF', required: true },
    { id: 'existing_building_plan', label: 'If existing building: copy of approved building plan - PDF (optional)', required: false },
  ],
};

const getCommonDocuments = () => {
  const configured = getConfiguredCommonDocuments();
  if (configured.length > 0) {
    return configured;
  }
  return DEFAULT_DOCUMENT_CHECKLIST;
};

export const getRequiredDocumentsByType = (applicationType) => {
  const permitTypes = Array.isArray(applicationType) ? applicationType : [applicationType].filter(Boolean);
  const required = new Map(
    getCommonDocuments().map((doc) => [
      doc.id,
      {
        id: doc.id,
        label: doc.label,
        required: doc.required !== false,
      },
    ])
  );
  permitTypes.forEach((permitType) => {
    (documentCatalog[permitType] || []).forEach((doc) => {
      if (!required.has(doc.id)) {
        required.set(doc.id, doc);
        return;
      }

      // If same doc appears in multiple permit paths, keep it required if any path requires it.
      const existing = required.get(doc.id);
      required.set(doc.id, {
        ...existing,
        ...doc,
        required: (existing?.required !== false) || (doc.required !== false),
      });
    });
  });
  return [
    ...required.values(),
  ];
};

export const getDocumentLabelById = (applicationType, docId) => {
  const entry = getRequiredDocumentsByType(applicationType).find((doc) => doc.id === docId);
  return entry?.label || docId;
};

const formatRelativeDate = (isoDate) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Just now';
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
};

export const loadPlanningQueue = (fallback = []) => {
  try {
    const raw = localStorage.getItem(PLANNING_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed.map(normalizePlanningRow) : fallback.map(normalizePlanningRow);
  } catch {
    return fallback.map(normalizePlanningRow);
  }
};

export const savePlanningQueue = (data) => {
  localStorage.setItem(PLANNING_QUEUE_KEY, JSON.stringify(data));
};

export const updatePlanningApplication = (applicationId, updater) => {
  const queue = loadPlanningQueue([]);
  const next = queue.map((app) => (app.id === applicationId ? normalizePlanningRow(updater(app)) : normalizePlanningRow(app)));
  savePlanningQueue(next);
  return next;
};

const normalizePlanningRow = (row = {}) => ({
  ...row,
  prelimStatus: row.prelimStatus || 'pending',
  deficiencyNote: row.deficiencyNote || '',
  deficientDocuments: row.deficientDocuments || [],
  correctionResubmissions: row.correctionResubmissions || {},
  recheckStatus: row.recheckStatus || {},
  documentMeta: row.documentMeta || [],
  feeStatus: row.feeStatus || 'not-entered',
  paymentMethod: row.paymentMethod || null,
  paymentReceiptRef: row.paymentReceiptRef || '',
  paymentReceiptSubmission: row.paymentReceiptSubmission || null,
  correctionsRequestedAt: row.correctionsRequestedAt || null,
  prelimVerifiedAt: row.prelimVerifiedAt || null,
  feeEnteredAt: row.feeEnteredAt || null,
  receiptSubmittedAt: row.receiptSubmittedAt || null,
  paymentTransactionId: row.paymentTransactionId || null,
  paymentPaidAt: row.paymentPaidAt || null,
  paymentVerifiedAt: row.paymentVerifiedAt || null,
  docs: row.docs || 'Complete',
  applicantContact: row.applicantContact || '',
  applicantEmail: row.applicantEmail || '',
  propertyLocation: row.propertyLocation || '',
  planningOfficerNotes: row.planningOfficerNotes || '',
  assignmentPackage: row.assignmentPackage || null,
  assignmentHistory: Array.isArray(row.assignmentHistory) ? row.assignmentHistory : [],
  toWorkStatus: row.toWorkStatus || 'inspection-pending',
  reportSubmittedAt: row.reportSubmittedAt || null,
  reportSummary: row.reportSummary || '',
  reportRecommendation: row.reportRecommendation || '',
  reportFileName: row.reportFileName || '',
  toReportForm: row.toReportForm || null,
  siteInspectionScheduledAt: row.siteInspectionScheduledAt || null,
  siteInspectionScheduleNote: row.siteInspectionScheduleNote || '',
  toContactNumber: row.toContactNumber || '',
  inspectionEmailNotifiedAt: row.inspectionEmailNotifiedAt || null,
  reminderPhoneCallShownAt: row.reminderPhoneCallShownAt || null,
  holdStatus: row.holdStatus || null,
  holdReason: row.holdReason || '',
  holdResolutionNote: row.holdResolutionNote || '',
  clearanceAuthority: row.clearanceAuthority || '',
  clearanceRequired: !!row.clearanceRequired,
  clearancePortal: row.clearancePortal || {
    isOpen: false,
    requiredClearances: [],
    status: 'pending',
    submissionComment: '',
    lastModified: null,
  },
  technicalDeficiencyPortal: row.technicalDeficiencyPortal || {
    isOpen: false,
    issues: [],
    status: 'pending',
    submissionComment: '',
    resubmissions: {},
    lastModified: null,
    fineAmount: null,
    fineReason: '',
  },
  forwardedToSWAt: row.forwardedToSWAt || null,
  forwardedToSWBy: row.forwardedToSWBy || '',
  swReviewStatus: row.swReviewStatus || 'not-reviewed',
  swReviewHistory: Array.isArray(row.swReviewHistory) ? row.swReviewHistory : [],
  swEndorsementNotes: row.swEndorsementNotes || '',
  swReferral: row.swReferral || null,
  swReviewedAt: row.swReviewedAt || null,
  swReviewedBy: row.swReviewedBy || '',
  forwardedToCommittee: !!row.forwardedToCommittee,
  forwardedToCommitteeAt: row.forwardedToCommitteeAt || null,
  swEndorsedAt: row.swEndorsedAt || null,
  status: row.status || 'new',
  assigned: !!row.assigned,
});

const normalizeSubmissionDocuments = (submissionData) => {
  const requiredDocs = getRequiredDocumentsByType(submissionData.selectedPermitTypes || submissionData.applicationType);
  const docs = submissionData.documents || {};
  const customNames = submissionData.documentCustomNames || {};

  return requiredDocs.map((doc) => {
    const file = docs?.[doc.id]?.[0];
    return {
      id: doc.id,
      label: doc.label,
      fileName: file?.name || '',
      customName: customNames?.[doc.id] || '',
      mimeType: file?.type || '',
      uploaded: !!file,
    };
  });
};

const mapApplicationTypeLabel = (applicationType) => {
  if (Array.isArray(applicationType)) {
    const labels = applicationType.map((item) => mapApplicationTypeLabel(item)).filter(Boolean);
    return labels.length > 0 ? labels.join(' + ') : 'Permit Application';
  }
  if (applicationType === 'building') return 'Building Permit';
  if (applicationType === 'boundaryWall' || applicationType === 'boundary-wall') return 'Boundary Wall Permit';
  if (applicationType === 'subdivision') return 'Land Subdivision';
  return 'Permit Application';
};

export const queuePlanningSubmission = (submissionData) => {
  const queue = loadPlanningQueue([]);
  const nextRow = normalizePlanningRow({
    id: submissionData.applicationId,
    applicant: submissionData.applicantName || 'Applicant',
    type: mapApplicationTypeLabel(submissionData.selectedPermitTypes || submissionData.applicationType),
    applicationType: submissionData.applicationType,
    selectedPermitTypes: submissionData.selectedPermitTypes || [],
    date: formatRelativeDate(submissionData.submittedAt),
    submittedAt: submissionData.submittedAt,
    status: 'new',
    prelimStatus: 'pending',
    deficiencyNote: '',
    deficientDocuments: [],
    correctionResubmissions: {},
    recheckStatus: {},
    inspectionFee: null,
    feeStatus: 'not-entered',
    paymentMethod: null,
    paymentReceiptRef: '',
    paymentReceiptSubmission: null,
    correctionsRequestedAt: null,
    prelimVerifiedAt: null,
    feeEnteredAt: null,
    receiptSubmittedAt: null,
    paymentTransactionId: null,
    paymentPaidAt: null,
    paymentVerifiedAt: null,
    docs: 'Complete',
    applicantContact: submissionData.phone || submissionData.contact || '',
    applicantEmail: submissionData.email || '',
    propertyLocation: submissionData.address || submissionData.location || '',
    planningOfficerNotes: '',
    assignmentPackage: null,
    assignmentHistory: [],
    toWorkStatus: 'inspection-pending',
    reportSubmittedAt: null,
    reportSummary: '',
    reportRecommendation: '',
    reportFileName: '',
    toReportForm: null,
    siteInspectionScheduledAt: null,
    siteInspectionScheduleNote: '',
    toContactNumber: '',
    inspectionEmailNotifiedAt: null,
    reminderPhoneCallShownAt: null,
    holdStatus: null,
    holdReason: '',
    holdResolutionNote: '',
    clearanceAuthority: '',
    clearanceRequired: false,
    clearancePortal: {
      isOpen: false,
      requiredClearances: [],
      status: 'pending',
      submissionComment: '',
      lastModified: null,
    },
    technicalDeficiencyPortal: {
      isOpen: false,
      issues: [],
      status: 'pending',
      submissionComment: '',
      resubmissions: {},
      lastModified: null,
      fineAmount: null,
      fineReason: '',
    },
    forwardedToSWAt: null,
    forwardedToSWBy: '',
    swReviewStatus: 'not-reviewed',
    swReviewHistory: [],
    swEndorsementNotes: '',
    swReferral: null,
    swReviewedAt: null,
    swReviewedBy: '',
    forwardedToCommittee: false,
    forwardedToCommitteeAt: null,
    swEndorsedAt: null,
    assigned: false,
    documentMeta: normalizeSubmissionDocuments(submissionData),
  });

  const filtered = queue.filter((item) => item.id !== submissionData.applicationId);
  const next = [nextRow, ...filtered];
  savePlanningQueue(next);

  const filesByDoc = {};
  Object.entries(submissionData.documents || {}).forEach(([docId, files]) => {
    if (files?.[0]) filesByDoc[docId] = files[0];
  });
  planningFileVault.set(submissionData.applicationId, filesByDoc);

  return nextRow;
};

export const getPlanningFileForPreview = (applicationId, docId) => {
  return planningFileVault.get(applicationId)?.[docId] || null;
};

export const setPlanningFilesForPreview = (applicationId, filesByDoc = {}, merge = true) => {
  const current = merge ? (planningFileVault.get(applicationId) || {}) : {};
  planningFileVault.set(applicationId, { ...current, ...filesByDoc });
};

export const getPlanningPaymentReceiptForPreview = (applicationId) => {
  return planningPaymentReceiptVault.get(applicationId) || null;
};

export const setPlanningPaymentReceiptForPreview = (applicationId, file) => {
  if (!file) {
    planningPaymentReceiptVault.delete(applicationId);
    return;
  }
  planningPaymentReceiptVault.set(applicationId, file);
};

const hoursAgo = (hours) => new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

export const seedPlanningStage3DemoData = () => {
  const existing = loadPlanningQueue([]);
  const demoRows = [
    {
      id: 'PS-DEMO-301',
      applicant: 'Nimal Jayasuriya',
      type: 'Building Permit',
      applicationType: 'building',
      date: '2 hours ago',
      submittedAt: hoursAgo(2),
      status: 'in-review',
      prelimStatus: 'verified',
      prelimVerifiedAt: hoursAgo(1.5),
      deficiencyNote: '',
      deficientDocuments: [],
      correctionResubmissions: {},
      recheckStatus: {},
      documentMeta: getRequiredDocumentsByType('building').map((doc) => ({
        id: doc.id,
        label: doc.label,
        fileName: `${doc.id}.pdf`,
        customName: '',
        mimeType: 'application/pdf',
        uploaded: true,
      })),
      inspectionFee: 3750,
      feeStatus: 'pending-payment',
      feeEnteredAt: hoursAgo(1.2),
      paymentMethod: 'online',
      paymentReceiptRef: '',
      paymentReceiptSubmission: null,
      correctionsRequestedAt: null,
      receiptSubmittedAt: null,
      paymentTransactionId: null,
      paymentPaidAt: null,
      paymentVerifiedAt: null,
      docs: 'Complete',
      assigned: false,
    },
    {
      id: 'PS-DEMO-302',
      applicant: 'Dilani Perera',
      type: 'Land Subdivision',
      applicationType: 'subdivision',
      date: '6 hours ago',
      submittedAt: hoursAgo(6),
      status: 'in-review',
      prelimStatus: 'verified',
      prelimVerifiedAt: hoursAgo(5),
      deficiencyNote: '',
      deficientDocuments: [],
      correctionResubmissions: {},
      recheckStatus: {},
      documentMeta: getRequiredDocumentsByType('subdivision').map((doc) => ({
        id: doc.id,
        label: doc.label,
        fileName: `${doc.id}.pdf`,
        customName: '',
        mimeType: 'application/pdf',
        uploaded: true,
      })),
      inspectionFee: 5200,
      feeStatus: 'receipt-submitted',
      feeEnteredAt: hoursAgo(4.5),
      paymentMethod: 'bank',
      paymentReceiptRef: 'BNK-44782',
      paymentReceiptSubmission: {
        fileName: 'bank-slip-demo.pdf',
        mimeType: 'application/pdf',
        submittedAt: hoursAgo(3.8),
        channel: 'bank',
        referenceNo: 'BNK-44782',
      },
      correctionsRequestedAt: null,
      receiptSubmittedAt: hoursAgo(3.8),
      paymentTransactionId: null,
      paymentPaidAt: hoursAgo(3.8),
      paymentVerifiedAt: null,
      docs: 'Complete',
      assigned: false,
    },
    {
      id: 'PS-DEMO-303',
      applicant: 'Ayesha Fernando',
      type: 'Building Permit',
      applicationType: 'building',
      date: '1 day ago',
      submittedAt: hoursAgo(24),
      status: 'in-review',
      prelimStatus: 'verified',
      prelimVerifiedAt: hoursAgo(22),
      deficiencyNote: '',
      deficientDocuments: [],
      correctionResubmissions: {},
      recheckStatus: {},
      documentMeta: getRequiredDocumentsByType('building').map((doc) => ({
        id: doc.id,
        label: doc.label,
        fileName: `${doc.id}.pdf`,
        customName: '',
        mimeType: 'application/pdf',
        uploaded: true,
      })),
      inspectionFee: 4800,
      feeStatus: 'paid-verified',
      feeEnteredAt: hoursAgo(21),
      paymentMethod: 'counter',
      paymentReceiptRef: 'CTR-18821',
      paymentReceiptSubmission: {
        fileName: 'counter-receipt-demo.jpg',
        mimeType: 'image/jpeg',
        submittedAt: hoursAgo(20),
        channel: 'counter',
        referenceNo: 'CTR-18821',
      },
      correctionsRequestedAt: null,
      receiptSubmittedAt: hoursAgo(20),
      paymentTransactionId: null,
      paymentPaidAt: hoursAgo(20),
      paymentVerifiedAt: hoursAgo(18),
      docs: 'Complete',
      assigned: false,
      assignedTo: null,
      assignedAt: null,
    },
    {
      id: 'PS-DEMO-304',
      applicant: 'Kasun Abeywickrama',
      type: 'Building Permit',
      applicationType: 'building',
      date: '2 days ago',
      submittedAt: hoursAgo(48),
      status: 'in-review',
      prelimStatus: 'pending-corrections',
      prelimVerifiedAt: null,
      deficiencyNote: 'Boundary dimensions mismatch in revised plan. Please resubmit building plan and survey annex.',
      deficientDocuments: [
        { id: 'building_plan', label: 'Building/Boundary Plan Prepared by Qualified Architect/Professional', reason: 'Dimension mismatch' },
        { id: 'survey', label: 'Attested Copy of Survey Plan', reason: 'Updated scale needed' },
      ],
      correctionResubmissions: {
        building_plan: { fileName: 'building-plan-v2.pdf', customName: 'Revised Boundary Plan', uploadedAt: hoursAgo(43) },
      },
      recheckStatus: { building_plan: 'pending', survey: 'pending' },
      documentMeta: getRequiredDocumentsByType('building').map((doc) => ({
        id: doc.id,
        label: doc.label,
        fileName: `${doc.id}.pdf`,
        customName: '',
        mimeType: 'application/pdf',
        uploaded: true,
      })),
      inspectionFee: null,
      feeStatus: 'not-entered',
      feeEnteredAt: null,
      paymentMethod: null,
      paymentReceiptRef: '',
      paymentReceiptSubmission: null,
      correctionsRequestedAt: hoursAgo(44),
      receiptSubmittedAt: null,
      paymentTransactionId: null,
      paymentPaidAt: null,
      paymentVerifiedAt: null,
      docs: 'Complete',
      assigned: false,
    },
  ].map(normalizePlanningRow);

  const demoIds = new Set(demoRows.map((row) => row.id));
  const withoutOldDemos = existing.filter((row) => !demoIds.has(row.id));
  const next = [...demoRows, ...withoutOldDemos].map(normalizePlanningRow);
  savePlanningQueue(next);
  return next;
};

export const clearPlanningStage3DemoData = () => {
  const existing = loadPlanningQueue([]);
  const next = existing.filter((row) => !String(row.id || '').startsWith('PS-DEMO-'));
  savePlanningQueue(next);

  Array.from(planningFileVault.keys()).forEach((key) => {
    if (String(key).startsWith('PS-DEMO-')) planningFileVault.delete(key);
  });
  Array.from(planningPaymentReceiptVault.keys()).forEach((key) => {
    if (String(key).startsWith('PS-DEMO-')) planningPaymentReceiptVault.delete(key);
  });

  return next;
};

// Stage 6 Demo Data
export const seedPlanningStage6DemoData = () => {
  const existing = loadPlanningQueue([]);

  const toReportFormTemplate = (applicant, recommendation) => ({
    submittedAt: hoursAgo(3),
    technicalOfficer: 'Tech Officer Demo',
    recommendation,
    observations: `Comprehensive site inspection completed. All boundary markings verified and cross-checked with survey plan. Structural measurements align with approved building plan. Soil conditions suitable for proposed use. Drainage system adequate. No environmental concerns observed. Site access and utilities verified.`,
    photoCount: 8,
    reportFileName: `TO-Report-${applicant}-${new Date().getTime()}.pdf`,
    swReferralResolved: false,
    checklist: {
      documentsReviewed: true,
      clearancesReviewed: true,
      paymentRecordsReviewed: true,
      fieldMeasurementsVerified: true,
    },
  });

  const demoRows = [
    // Stage 6 State 1: Pending Review (TO forwarded, waiting for SW review)
    {
      id: 'PS-DEMO-601',
      applicant: 'Rajith Kumar',
      type: 'Building Permit',
      applicationType: 'building',
      date: '4 hours ago',
      submittedAt: hoursAgo(96),
      status: 'in-review',
      prelimStatus: 'verified',
      prelimVerifiedAt: hoursAgo(90),
      documentMeta: getRequiredDocumentsByType('building').map((doc) => ({
        id: doc.id,
        label: doc.label,
        fileName: `${doc.id}.pdf`,
        customName: '',
        mimeType: 'application/pdf',
        uploaded: true,
      })),
      inspectionFee: 4500,
      feeStatus: 'paid-verified',
      paymentMethod: 'online',
      paymentVerifiedAt: hoursAgo(85),
      paymentPaidAt: hoursAgo(85),
      docs: 'Complete',
      assigned: true,
      toWorkStatus: 'forwarded-sw',
      forwardedToSWAt: hoursAgo(4),
      forwardedToSWBy: 'Tech Officer Demo',
      swReviewStatus: 'not-reviewed',
      swReviewHistory: [],
      swEndorsementNotes: '',
      swReferral: null,
      forwardedToCommittee: false,
      toReportForm: toReportFormTemplate('Rajith Kumar', 'approve'),
      reportSubmittedAt: hoursAgo(5),
      reportSummary: 'Recommended for approval',
      reportRecommendation: 'approve',
    },
    // Stage 6 State 2: Endorsed to Committee (SW endorsed, forwarded)
    {
      id: 'PS-DEMO-602',
      applicant: 'Priya Seneviratne',
      type: 'Land Subdivision',
      applicationType: 'subdivision',
      date: '8 hours ago',
      submittedAt: hoursAgo(120),
      status: 'in-review',
      prelimStatus: 'verified',
      prelimVerifiedAt: hoursAgo(115),
      documentMeta: getRequiredDocumentsByType('subdivision').map((doc) => ({
        id: doc.id,
        label: doc.label,
        fileName: `${doc.id}.pdf`,
        customName: '',
        mimeType: 'application/pdf',
        uploaded: true,
      })),
      inspectionFee: 6200,
      feeStatus: 'paid-verified',
      paymentMethod: 'bank',
      paymentVerifiedAt: hoursAgo(110),
      paymentPaidAt: hoursAgo(110),
      docs: 'Complete',
      assigned: true,
      toWorkStatus: 'forwarded-sw',
      forwardedToSWAt: hoursAgo(6),
      forwardedToSWBy: 'Tech Officer Demo',
      swReviewStatus: 'endorsed',
      swReviewHistory: [
        {
          action: 'endorsed',
          by: 'Super Demo',
          at: hoursAgo(2),
        },
      ],
      swEndorsementNotes: 'All technical requirements met. Subdivision plan properly verified. Recommended for approval.',
      swReferral: null,
      forwardedToCommittee: true,
      forwardedToCommitteeAt: hoursAgo(2),
      swReviewedAt: hoursAgo(2),
      swReviewedBy: 'Super Demo',
      swEndorsedAt: hoursAgo(2),
      toReportForm: toReportFormTemplate('Priya Seneviratne', 'approve'),
      reportSubmittedAt: hoursAgo(7),
      reportSummary: 'Recommended for approval',
      reportRecommendation: 'approve',
    },
    // Stage 6 State 3: Referred Back (SW referred back to TO for revision)
    {
      id: 'PS-DEMO-603',
      applicant: 'Sanjaya Bandara',
      type: 'Building Permit',
      applicationType: 'building',
      date: '3 hours ago',
      submittedAt: hoursAgo(72),
      status: 'in-review',
      prelimStatus: 'verified',
      prelimVerifiedAt: hoursAgo(68),
      documentMeta: getRequiredDocumentsByType('building').map((doc) => ({
        id: doc.id,
        label: doc.label,
        fileName: `${doc.id}.pdf`,
        customName: '',
        mimeType: 'application/pdf',
        uploaded: true,
      })),
      inspectionFee: 3900,
      feeStatus: 'paid-verified',
      paymentMethod: 'counter',
      paymentVerifiedAt: hoursAgo(65),
      paymentPaidAt: hoursAgo(65),
      docs: 'Complete',
      assigned: true,
      toWorkStatus: 'referred-back-to-to',
      forwardedToSWAt: null,
      forwardedToSWBy: '',
      swReviewStatus: 'referred-back',
      swReviewHistory: [
        {
          action: 'referred-back',
          by: 'Super Demo',
          requestType: 'report-correction',
          note: 'Please clarify the structural dimensions in the building plan. The height measurement conflicts with the architectural certificate. Kindly provide updated technical notes explaining the discrepancy.',
          at: hoursAgo(3),
        },
      ],
      swEndorsementNotes: '',
      swReferral: {
        active: true,
        requestType: 'report-correction',
        reason: 'Please clarify the structural dimensions in the building plan. The height measurement conflicts with the architectural certificate. Kindly provide updated technical notes explaining the discrepancy.',
        referredBy: 'Super Demo',
        referredAt: hoursAgo(3),
      },
      forwardedToCommittee: false,
      swReviewedAt: hoursAgo(3),
      swReviewedBy: 'Super Demo',
      toReportForm: toReportFormTemplate('Sanjaya Bandara', 'conditional-approval'),
      reportSubmittedAt: hoursAgo(5),
      reportSummary: 'Conditional approval - pending',
      reportRecommendation: 'conditional-approval',
    },
  ].map(normalizePlanningRow);

  const demoIds = new Set(demoRows.map((row) => row.id));
  const withoutOldDemos = existing.filter((row) => !demoIds.has(row.id));
  const next = [...demoRows, ...withoutOldDemos].map(normalizePlanningRow);
  savePlanningQueue(next);
  return next;
};

export const clearPlanningStage6DemoData = () => {
  const existing = loadPlanningQueue([]);
  const next = existing.filter(
    (row) => !['PS-DEMO-601', 'PS-DEMO-602', 'PS-DEMO-603'].includes(row.id)
  );
  savePlanningQueue(next);
  return next;
};
