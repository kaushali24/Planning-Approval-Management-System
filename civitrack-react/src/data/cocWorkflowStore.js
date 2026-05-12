import { cocRequests as mockCocRequests } from './cocMock';

const COC_WORKFLOW_KEY = 'coc_workflow_state';

const mapLegacyStatus = (status) => {
  if (status === 'approved') return 'coc-approved';
  if (status === 'inspection') return 'assigned-to-to';
  return 'requested';
};

const buildSeed = () => (
  (mockCocRequests || []).map((item) => ({
    cocId: item.id,
    applicationId: item.applicationId,
    type: item.type,
    applicant: item.applicant || 'Applicant',
    applicantEmail: item.applicantEmail || null,
    requestedAt: item.requestDate,
    status: mapLegacyStatus(item.status),
    feeAmount: item.feeAmount || null,
    assignedTo: item.assignedTo || null,
    issuedDate: item.issuedDate || null,
    validUntil: item.validUntil || null,
    declarations: null,
    violationReport: null,
    deviationFine: null,
    regularizationStatus: null,
  }))
);

const normalizeRow = (row) => ({
  ...row,
  status: row.status || 'requested',
  applicant: row.applicant || 'Applicant',
  applicantEmail: row.applicantEmail || null,
  feeAmount: row.feeAmount ?? null,
  assignedTo: row.assignedTo || null,
  declarations: row.declarations || null,
  violationReport: row.violationReport || null,
  deviationFine: row.deviationFine ?? null,
  regularizationStatus: row.regularizationStatus || null,
  correctionEvidenceNote: row.correctionEvidenceNote || '',
  correctionEvidenceSubmittedAt: row.correctionEvidenceSubmittedAt || null,
  correctionReviewedByTOAt: row.correctionReviewedByTOAt || null,
  reinspectionEligible: !!row.reinspectionEligible,
});

export const loadCocWorkflow = () => {
  try {
    const raw = localStorage.getItem(COC_WORKFLOW_KEY);
    if (!raw) return buildSeed();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((row) => normalizeRow(row)) : buildSeed();
  } catch {
    return buildSeed();
  }
};

export const saveCocWorkflow = (requests) => {
  localStorage.setItem(COC_WORKFLOW_KEY, JSON.stringify(requests));
};

export const nextCocId = (requests) => {
  const maxNum = (requests || []).reduce((max, item) => {
    const n = Number(String(item.cocId || '').split('-').pop());
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  return `COC-${new Date().getFullYear()}-${String(maxNum + 1).padStart(3, '0')}`;
};

export const summarizeCocWorkflow = (requests) => {
  return (requests || []).reduce(
    (acc, item) => {
      if (item.status === 'coc-approved' || item.status === 'coc-collected') acc.issued += 1;
      else if (item.status === 'assigned-to-to' || item.status === 'inspection-complete' || item.status === 'reinspection-requested' || item.status === 'reinspection-eligible' || item.status === 'correction-submitted' || item.status === 'coc-fine-paid-awaiting-correction' || item.status === 'coc-correction-required') acc.inInspection += 1;
      else acc.pending += 1;
      return acc;
    },
    { pending: 0, inInspection: 0, issued: 0 }
  );
};
