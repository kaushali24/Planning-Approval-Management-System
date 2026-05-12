import React, { useCallback, useEffect, useState } from 'react';
import { Search, Filter, Download, FileText, Award, Clock, CreditCard, Info, Upload } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import PaymentModal from '../../components/ui/PaymentModal.jsx';
import CorrectionPortalModal from '../../components/applicant/CorrectionPortalModal.jsx';
import InvestigationPortalModal from '../../components/applicant/InvestigationPortalModal.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { formatDate, formatCurrencyLKR } from '../../utils/locale';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { loadCocWorkflow, saveCocWorkflow } from '../../data/cocWorkflowStore';
import {
  notifyPermitExtended,
} from '../../utils/notificationService';
import {
  appendAppealVersion,
  getLatestAppeal,
  inferAppealRoute,
  loadAppealSubmissions,
  saveAppealSubmissions,
} from '../../data/appealWorkflowStore';
import {
  applyPermitExtension,
  canExtendPermit,
  getPermitByApplicationId,
  getPermitDaysUntilExpiry,
  getPermitExtensionAvailableFrom,
  isBuildingPermit,
  isPermitExpired,
  loadPermitWorkflow,
  savePermitWorkflow,
} from '../../data/permitWorkflowStore';
import { getDisplayApplicationCode } from '../../utils/applicationCode';
import {
  getPlanningPaymentReceiptForPreview,
  loadPlanningQueue,
  savePlanningQueue,
  setPlanningFilesForPreview,
  setPlanningPaymentReceiptForPreview,
} from '../../data/planningWorkflowStore';

const NON_INDEMNIFICATION_KEY = 'committee_non_indemnification_requests';
const TECHNICAL_INVESTIGATION_UPDATES_KEY = 'technical_investigation_updates';
const COMMITTEE_NOT_GRANTED_KEY = 'committee_not_granted_reasons';
const COMMITTEE_DECISION_OUTCOMES_KEY = 'committee_decision_outcomes';
const COMMITTEE_CORRECTION_NOTES_KEY = 'committee_correction_notes';
const API_BASE = 'http://localhost:5000/api';
const APPLICANT_RESPONSE_DOC_TYPE = 'photo';

const mapApiApplicationTypeToLabel = (applicationType) => (
  applicationType === 'subdivision' ? 'Land Subdivision' : 'Building Permit'
);

const mapApiApplicationToPlanningRow = (app) => {
  const holdStatus = app.hold_status === 'active'
    ? (app.hold_type === 'clearance' ? 'clearance-hold' : 'complaint-hold')
    : null;

  const prelimStatus = app.status === 'correction'
    ? 'pending-corrections'
    : ['approved', 'rejected', 'not_granted_appeal_required', 'appeal_submitted', 'committee_review', 'endorsed'].includes(app.status)
    ? 'verified'
    : 'pending';

  const toWorkStatus = app.latest_inspection_result
    ? 'report-submitted'
    : app.latest_inspection_scheduled_date
    ? 'inspection-scheduled'
    : app.latest_inspection_id
    ? 'report-pending'
    : 'inspection-pending';

  const paymentStatusMap = {
    completed: 'paid-verified',
    processing: 'receipt-submitted',
    pending: 'pending-payment',
    failed: 'pending-payment',
  };
  const feeStatus = paymentStatusMap[app.latest_payment_status] || app.fee_status || 'not-entered';

  let prelimData = app.preliminary_check_data;
  if (typeof prelimData === 'string') {
    try {
      prelimData = JSON.parse(prelimData);
    } catch (e) {
      prelimData = {};
    }
  }

  return {
    id: app.application_code || `PENDING-${app.id}`,
    displayCode: getDisplayApplicationCode(app.application_code),
    dbId: app.id,
    applicationDbId: app.id,
    type: mapApiApplicationTypeToLabel(app.application_type),
    date: app.submission_date || null,
    submittedAt: app.submission_date || null,
    status: (app.status || '').replace(/_/g, '-'),
    backendStatus: app.status,
    prelimStatus,
    deficiencyNote: prelimData?.notes || (app.status === 'correction' ? 'Corrections requested by reviewing authority.' : ''),
    deficientDocuments: prelimData?.deficientDocuments || [],
    correctionResubmissions: {},
    inspectionFee: app.latest_payment_amount || app.fee_amount || null,
    feeStatus,
    paymentMethod: app.latest_payment_method || app.fee_payment_method || null,
    paymentReceiptRef: app.latest_payment_reference || app.fee_payment_reference || '',
    paymentReceiptSubmission: app.latest_payment_paid_at
      ? {
          fileName: 'backend-record',
          mimeType: 'text/plain',
          submittedAt: app.latest_payment_paid_at,
          channel: app.latest_payment_method || app.fee_payment_method || 'online',
          referenceNo: app.latest_payment_reference || app.fee_payment_reference || '',
        }
      : null,
    correctionsRequestedAt: app.status === 'correction' ? (app.last_updated || app.submission_date || null) : null,
    prelimVerifiedAt: prelimStatus === 'verified' ? (app.last_updated || null) : null,
    feeEnteredAt: app.fee_published_at || null,
    receiptSubmittedAt: app.latest_payment_paid_at || app.latest_payment_created_at || app.fee_paid_at || null,
    paymentPaidAt: app.latest_payment_paid_at || app.fee_paid_at || null,
    paymentVerifiedAt: feeStatus === 'paid-verified' ? (app.latest_payment_paid_at || app.fee_verified_at || null) : null,
    toWorkStatus,
    siteInspectionScheduledAt: app.latest_inspection_scheduled_date || null,
    siteInspectionScheduleNote: '',
    inspectionEmailNotifiedAt: null,
    reminderPhoneCallShownAt: null,
    holdStatus,
    holdReason: app.hold_reason || '',
    holdResolutionNote: app.resolution_note || '',
    clearanceAuthority: app.clearance_authority || '',
    clearanceRequired: holdStatus === 'clearance-hold',
    clearancePortal: { status: 'not-opened', requirements: [], submission: null, comments: [] },
    technicalDeficiencyPortal: { status: 'not-opened', issues: [], submission: null, comments: [] },
    reportRecommendation: app.latest_inspection_recommendation || '',
    reportSummary: app.latest_inspection_observations || '',
    swReviewPending: app.status === 'sw_review_pending',
    latestHoldType: app.hold_type || null,
  };
};

const loadNonIndemnificationRequests = () => {
  try {
    const raw = localStorage.getItem(NON_INDEMNIFICATION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveNonIndemnificationRequests = (data) => {
  localStorage.setItem(NON_INDEMNIFICATION_KEY, JSON.stringify(data));
};

const loadTechnicalInvestigationUpdates = () => {
  try {
    const raw = localStorage.getItem(TECHNICAL_INVESTIGATION_UPDATES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const loadNotGrantedReasons = () => {
  try {
    const raw = localStorage.getItem(COMMITTEE_NOT_GRANTED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const loadDecisionOutcomes = () => {
  try {
    const raw = localStorage.getItem(COMMITTEE_DECISION_OUTCOMES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const loadCommitteeCorrectionNotes = () => {
  try {
    const raw = localStorage.getItem(COMMITTEE_CORRECTION_NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const legacyApplications = [
  {
    id: 'APP/2025/00018',
    type: 'Building Permit',
    date: '2025-10-15',
    status: 'draft',
    label: 'In Draft',
    requiresBoundaryWallPermission: true,
    wallLength: '60',
    wallHeight: '6',
    wallMaterials: 'Brick and cement'
  },
  {
    id: 'APP/2025/00017',
    type: 'Building Permit',
    date: '2025-10-12',
    status: 'correction',
    label: 'Requires Correction',
    requiresBoundaryWallPermission: true,
    wallLength: '',
    wallHeight: '',
    wallMaterials: ''
  },
  { id: 'APP/2025/00016', type: 'Land Subdivision', date: '2025-10-10', status: 'under-review', label: 'Pending SW Review' },
  {
    id: 'APP/2025/00015',
    type: 'Building Permit',
    date: '2025-09-28',
    status: 'complaint-hold',
    label: 'Investigation Hold - Complaint',
    requiresBoundaryWallPermission: true,
    wallLength: '45',
    wallHeight: '5',
    wallMaterials: 'Block wall'
  },
  {
    id: 'APP/2025/00012',
    type: 'Building Permit',
    date: '2025-08-15',
    status: 'not-granted',
    label: 'Not Granted - Appeal Required',
    requiresBoundaryWallPermission: true,
    wallLength: '50',
    wallHeight: '6',
    wallMaterials: 'Brick wall'
  },
  {
    id: 'APP/2025/00011',
    type: 'Building Permit',
    date: '2025-07-02',
    status: 'completed',
    label: 'Completed - Permit Issued',
    requiresBoundaryWallPermission: false,
    wallLength: '',
    wallHeight: '',
    wallMaterials: ''
  },
];

const Applications = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();
  const { success, error } = useNotifications();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [showCorrectionPortal, setShowCorrectionPortal] = useState(false);
  const [selectedCorrectionApp, setSelectedCorrectionApp] = useState(null);
  const [showInvestigationPortal, setShowInvestigationPortal] = useState(false);
  const [selectedInvestigationApp, setSelectedInvestigationApp] = useState(null);
  const [selectedApplicationFee, setSelectedApplicationFee] = useState(0);
  const [showPermitExtensionPayment, setShowPermitExtensionPayment] = useState(false);
  const [showPermitExtensionFlowModal, setShowPermitExtensionFlowModal] = useState(false);
  const [showOfflinePaymentModal, setShowOfflinePaymentModal] = useState(false);
  const [showPaymentChoiceModal, setShowPaymentChoiceModal] = useState(false);
  const [paymentFlowContext, setPaymentFlowContext] = useState({ type: 'inspection', row: null });
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [selectedFeeApp, setSelectedFeeApp] = useState(null);
  const [selectedPermitAppId, setSelectedPermitAppId] = useState(null);
  const [extensionAgreeTerms, setExtensionAgreeTerms] = useState(false);
  const [extensionPaymentMethod, setExtensionPaymentMethod] = useState('online');
  const [extensionReceiptRef, setExtensionReceiptRef] = useState('');
  const [extensionReceiptFile, setExtensionReceiptFile] = useState(null);
  const [extensionPaymentError, setExtensionPaymentError] = useState('');

  const [offlinePaymentChannel, setOfflinePaymentChannel] = useState('bank');
  const [offlinePaymentRef, setOfflinePaymentRef] = useState('');
  const [offlinePaymentFile, setOfflinePaymentFile] = useState(null);
  const [offlinePaymentError, setOfflinePaymentError] = useState('');
  const [nonIndemnificationRequests, setNonIndemnificationRequests] = useState({});
  const [technicalUpdates, setTechnicalUpdates] = useState({});
  const [notGrantedReasons, setNotGrantedReasons] = useState({});
  const [appealDrafts, setAppealDrafts] = useState({});
  const [cocRequests, setCocRequests] = useState([]);
  const [decisionOutcomes, setDecisionOutcomes] = useState({});
  const [committeeCorrectionNotes, setCommitteeCorrectionNotes] = useState({});
  const [permits, setPermits] = useState([]);
  const [appealPrompt, setAppealPrompt] = useState({ open: false, appId: null, value: '', error: '' });
  const [appealCategory, setAppealCategory] = useState('documents');
  const [appealSpecialCircumstances, setAppealSpecialCircumstances] = useState('');
  const [appealAcknowledgements, setAppealAcknowledgements] = useState({ addressedAll: false, understandsWorkflow: false });
  const [appealCorrectedUploads, setAppealCorrectedUploads] = useState({});
  const [appealAdditionalUploads, setAppealAdditionalUploads] = useState([]);
  const [agreementConfirm, setAgreementConfirm] = useState({ open: false, row: null });
  const [planningQueue, setPlanningQueue] = useState([]);
  const [detailsAppId, setDetailsAppId] = useState(null);
  const [activeClearanceAppId, setActiveClearanceAppId] = useState(null);
  const [clearanceCommentDraft, setClearanceCommentDraft] = useState('');
  const [clearanceDocsDraft, setClearanceDocsDraft] = useState([]);
  const [activeDeficiencyAppId, setActiveDeficiencyAppId] = useState(null);
  const [deficiencyCommentDraft, setDeficiencyCommentDraft] = useState('');
  const [deficiencyDocsDraft, setDeficiencyDocsDraft] = useState([]);
  const [isLiveDataActive, setIsLiveDataActive] = useState(false);

  const normalizeFilterValue = (value) => String(value || '').trim().toLowerCase().replace(/_/g, '-');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const statusParam = params.get('status');
    const typeParam = params.get('type');
    if (statusParam) setFilterStatus(normalizeFilterValue(statusParam));
    if (typeParam) setFilterType(typeParam);
    if (statusParam || typeParam) setShowFilters(true);
  }, [location.search]);

  const getApplicationCode = (row) => getDisplayApplicationCode(
    row?.applicationCode || row?.application_code || row?.displayCode
  );

  const getApplicationDbId = (row) => {
    const direct = Number(row?.dbId || row?.applicationDbId || row?.application_id || row?.id);
    if (Number.isInteger(direct) && direct > 0) return direct;

    const code = String(getApplicationCode(row) || row?.id || '');
    const trailingDigits = code.match(/(\d+)$/);
    if (!trailingDigits) return null;

    const parsed = Number.parseInt(trailingDigits[1], 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };

  const fetchAuthedJson = useCallback(async (url, options = {}) => {
    if (!token) {
      throw new Error('Authentication token is missing');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.error || payload?.message || 'Request failed');
    }

    return payload;
  }, [token]);

  const loadLiveApplicationData = useCallback(async () => {
    if (!token) return;

    try {
      const [applicationsPayload, appealsPayload, cocPayload] = await Promise.all([
        fetchAuthedJson(`${API_BASE}/applications?limit=100&sort=submission_date:DESC`),
        fetchAuthedJson(`${API_BASE}/appeals?limit=100`),
        fetchAuthedJson(`${API_BASE}/coc?limit=100`),
      ]);

      const mappedPlanningQueue = (applicationsPayload.applications || []).map((app) => mapApiApplicationToPlanningRow(app));
      const appCodeByDbId = new Map(mappedPlanningQueue.map((row) => [Number(row.dbId), row.id]));
      const appTypeByCode = new Map(mappedPlanningQueue.map((row) => [row.id, row.type]));

      const appealDetails = await Promise.all(
        (appealsPayload.appealCases || []).map(async (appealCase) => {
          try {
            return await fetchAuthedJson(`${API_BASE}/appeals/${appealCase.id}`);
          } catch {
            return null;
          }
        })
      );

      const mappedAppeals = {};
      for (const detail of appealDetails.filter(Boolean)) {
        const appCode = appCodeByDbId.get(Number(detail.application_id));
        if (!appCode) continue;

        const versions = Array.isArray(detail.versions)
          ? [...detail.versions].sort((a, b) => Number(a.appeal_no || 0) - Number(b.appeal_no || 0))
          : [];

        const history = versions.map((version) => ({
          appealNo: version.appeal_no,
          summary: version.summary || '',
          submittedAt: version.created_at || detail.created_at || null,
          route: detail.route || 'committee',
          correctionsCategory: version.corrections_category || 'documents',
          specialCircumstances: version.special_circumstances || '',
          acknowledgements: { addressedAll: true, understandsWorkflow: true },
          correctedDocuments: [],
          additionalDocuments: [],
          containsNewPlans: !!version.contains_new_plans,
          planningAssessment: null,
        }));

        const latestVersion = history.length > 0 ? history[history.length - 1] : null;
        mappedAppeals[appCode] = {
          status: detail.status || 'submitted',
          route: detail.route || latestVersion?.route || 'committee',
          submittedAt: detail.updated_at || detail.created_at || latestVersion?.submittedAt || null,
          summary: latestVersion?.summary || '',
          type: appTypeByCode.get(appCode) || 'Building Permit',
          requiredActions: [],
          requiredDocuments: [],
          portalOpen: detail.portal_open !== false,
          history,
          memberNotes: Array.isArray(detail.member_notes) ? detail.member_notes : [],
          appealCaseId: detail.id,
          applicationDbId: detail.application_id,
        };
      }

      const mappedCocRequests = (cocPayload.cocRequests || []).map((row) => ({
        id: row.id,
        cocId: row.coc_id,
        applicationId: appCodeByDbId.get(Number(row.application_id)) || getDisplayApplicationCode(row.application_code),
        type: mapApiApplicationTypeToLabel(row.application_type),
        applicant: row.applicant_name || 'Applicant',
        applicantEmail: row.applicant_email || null,
        requestedAt: row.request_date || null,
        status: row.status || 'requested',
        feeAmount: row.fee_amount || null,
        assignedTo: row.assigned_to || null,
        issuedDate: row.issued_at ? String(row.issued_at).slice(0, 10) : null,
        validUntil: row.issued_at
          ? new Date(new Date(row.issued_at).getTime() + (2 * 365 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
          : null,
        declarations: null,
        violationReport: null,
        deviationFine: null,
        regularizationStatus: null,
      }));

      const liveDecisionOutcomes = {};
      const liveNotGrantedReasons = {};
      for (const row of mappedPlanningQueue) {
        const backendStatus = row.backendStatus;
        if (backendStatus === 'approved') {
          liveDecisionOutcomes[row.id] = {
            id: row.id,
            decision: 'approved',
            decidedBy: 'Planning Committee',
            decidedAt: row.prelimVerifiedAt || row.submittedAt || null,
            closed: true,
            statusLabel: 'Approved by Planning Committee',
          };
        } else if (backendStatus === 'correction') {
          liveDecisionOutcomes[row.id] = {
            id: row.id,
            decision: 'more-info',
            decidedBy: 'Planning Committee',
            decidedAt: row.correctionsRequestedAt || row.submittedAt || null,
            closed: false,
            statusLabel: 'Corrections Required by Planning Committee',
          };
        } else if (backendStatus === 'not_granted_appeal_required' || backendStatus === 'rejected') {
          liveDecisionOutcomes[row.id] = {
            id: row.id,
            decision: 'not-granted',
            decidedBy: 'Planning Committee',
            decidedAt: row.prelimVerifiedAt || row.submittedAt || null,
            closed: false,
            statusLabel: 'Not Granted - Appeal Required',
          };
          liveNotGrantedReasons[row.id] = {
            reason: row.holdReason || 'Application was not granted. Please submit an appeal with corrected evidence.',
            updatedAt: row.prelimVerifiedAt || row.submittedAt || null,
          };
        }
      }

      const mergedDecisionOutcomes = {
        ...loadDecisionOutcomes(),
        ...liveDecisionOutcomes,
      };
      const mergedNotGrantedReasons = {
        ...loadNotGrantedReasons(),
        ...liveNotGrantedReasons,
      };

      setPlanningQueue(mappedPlanningQueue);
      savePlanningQueue(mappedPlanningQueue);
      setAppealDrafts((prev) => {
        const next = { ...prev };
        for (const [appCode, entry] of Object.entries(mappedAppeals)) {
          const existing = prev[appCode] || {};
          next[appCode] = {
            ...existing,
            ...entry,
            history: entry.history?.length ? entry.history : (existing.history || []),
          };
        }
        saveAppealSubmissions(next);
        return next;
      });
      setCocRequests(mappedCocRequests);
      saveCocWorkflow(mappedCocRequests);
      setDecisionOutcomes(mergedDecisionOutcomes);
      setNotGrantedReasons(mergedNotGrantedReasons);
      localStorage.setItem(COMMITTEE_DECISION_OUTCOMES_KEY, JSON.stringify(mergedDecisionOutcomes));
      localStorage.setItem(COMMITTEE_NOT_GRANTED_KEY, JSON.stringify(mergedNotGrantedReasons));
      setIsLiveDataActive(true);
    } catch (loadError) {
      setNonIndemnificationRequests(loadNonIndemnificationRequests());
      setTechnicalUpdates(loadTechnicalInvestigationUpdates());
      setNotGrantedReasons(loadNotGrantedReasons());
      setAppealDrafts(loadAppealSubmissions());
      setCocRequests(loadCocWorkflow());
      setDecisionOutcomes(loadDecisionOutcomes());
      setCommitteeCorrectionNotes(loadCommitteeCorrectionNotes());
      setPermits(loadPermitWorkflow());
      setPlanningQueue(loadPlanningQueue([]));
      setIsLiveDataActive(false);
      error(`${loadError.message || 'Live API unavailable'}. Showing cached applicant workflow data.`);
    }
  }, [token, fetchAuthedJson, error]);

  useEffect(() => {
    if (token) {
      loadLiveApplicationData();
      return;
    }

    setNonIndemnificationRequests(loadNonIndemnificationRequests());
    setTechnicalUpdates(loadTechnicalInvestigationUpdates());
    setNotGrantedReasons(loadNotGrantedReasons());
    setAppealDrafts(loadAppealSubmissions());
    setCocRequests(loadCocWorkflow());
    setDecisionOutcomes(loadDecisionOutcomes());
    setCommitteeCorrectionNotes(loadCommitteeCorrectionNotes());
    setPermits(loadPermitWorkflow());
    setPlanningQueue(loadPlanningQueue([]));
    setIsLiveDataActive(false);
  }, [token, loadLiveApplicationData]);

  useEffect(() => {
    if (token) return undefined;

    const syncFromStorage = () => {
      setCocRequests(loadCocWorkflow());
      setAppealDrafts(loadAppealSubmissions());
      setDecisionOutcomes(loadDecisionOutcomes());
      setCommitteeCorrectionNotes(loadCommitteeCorrectionNotes());
      setPermits(loadPermitWorkflow());
      setPlanningQueue(loadPlanningQueue([]));
    };
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, [token]);

  const hasCompleteBoundaryWallDetails = (row) => (
    !!row.requiresBoundaryWallPermission &&
    !!row.wallLength &&
    !!row.wallHeight &&
    !!row.wallMaterials?.trim()
  );

  const queueMappedApplications = planningQueue.map((row) => {
    const feeMethodLabel = row.paymentMethod === 'counter' ? 'Counter' : row.paymentMethod === 'bank' ? 'Bank' : 'Online';
    const hasClearanceHold = row.holdStatus === 'clearance-hold';
    const hasComplaintHold = row.holdStatus === 'complaint-hold';
    const hasTechnicalDeficiencyPortal = row.technicalDeficiencyPortal && row.technicalDeficiencyPortal.status && row.technicalDeficiencyPortal.status !== 'not-opened';
    const status = hasComplaintHold
      ? 'complaint-hold'
      : hasClearanceHold
      ? 'clearance-hold'
      : hasTechnicalDeficiencyPortal
      ? 'correction'
      : row.prelimStatus === 'pending-corrections'
      ? 'correction'
      : row.prelimStatus !== 'verified'
      ? 'under-review'
      : (row.feeStatus === 'pending-payment' || row.feeStatus === 'receipt-submitted')
      ? 'payment-pending'
      : row.toWorkStatus === 'inspection-scheduled' || row.toWorkStatus === 'inspection-pending' || row.toWorkStatus === 'report-pending'
      ? 'under-review'
      : 'under-review';

    let label = 'Verified - Fee Processing';
    if (hasComplaintHold) {
      label = `Investigation Hold - Complaint${row.holdReason ? ` (${row.holdReason})` : ''}`;
    } else if (hasClearanceHold) {
      label = 'Investigation Hold - Special Clearances Required';
    } else if (hasTechnicalDeficiencyPortal) {
      if (row.technicalDeficiencyPortal?.status === 'awaiting-resubmission') {
        label = 'Technical Corrections Required - Resubmit to TO';
      } else if (row.technicalDeficiencyPortal?.status === 'submitted') {
        label = 'Technical Resubmission Submitted - Awaiting TO Validation';
      } else {
        label = 'Technical Deficiency Portal Active';
      }
    } else if (row.prelimStatus === 'pending-corrections') {
      label = 'Pending Corrections';
    } else if (row.prelimStatus !== 'verified') {
      label = 'Under Preliminary Review';
    } else if (row.feeStatus === 'pending-payment') {
      label = `Fee Payment Pending (${feeMethodLabel})`;
    } else if (row.feeStatus === 'receipt-submitted') {
      label = 'Payment Proof Submitted - Awaiting Verification';
    } else if (row.feeStatus === 'paid-verified') {
      if (row.toWorkStatus === 'inspection-scheduled' && row.siteInspectionScheduledAt) {
        label = `Site Inspection Scheduled (${formatDate(row.siteInspectionScheduledAt)})`;
      } else if (row.toWorkStatus === 'report-pending') {
        label = 'TO Investigation Ongoing';
      } else if (row.status === 'sw-review-pending') {
        label = 'Investigation Completed - Awaiting Superintendent Review';
      } else if (row.toWorkStatus === 'report-submitted') {
        label = 'Investigation Completed - Pending Finalization';
      } else {
        label = 'Payment Verified - Ready for TO Assignment';
      }
    }

    return {
      id: row.id,
      type: row.type,
      date: row.submittedAt ? formatDate(row.submittedAt) : row.date,
      status,
      label,
      requiresBoundaryWallPermission: !!row.requiresBoundaryWallPermission,
      wallLength: row.wallLength || '',
      wallHeight: row.wallHeight || '',
      wallMaterials: row.wallMaterials || '',
      deficiencyNote: row.deficiencyNote || '',
      deficientDocuments: row.deficientDocuments || [],
      correctionResubmissions: row.correctionResubmissions || {},
      inspectionFee: row.inspectionFee || null,
      feeStatus: row.feeStatus || 'not-entered',
      paymentMethod: row.paymentMethod || null,
      paymentReceiptRef: row.paymentReceiptRef || '',
      paymentReceiptSubmission: row.paymentReceiptSubmission || null,
      correctionsRequestedAt: row.correctionsRequestedAt || null,
      prelimVerifiedAt: row.prelimVerifiedAt || null,
      feeEnteredAt: row.feeEnteredAt || null,
      receiptSubmittedAt: row.receiptSubmittedAt || null,
      paymentPaidAt: row.paymentPaidAt || null,
      paymentVerifiedAt: row.paymentVerifiedAt || null,
      toWorkStatus: row.toWorkStatus || 'inspection-pending',
      siteInspectionScheduledAt: row.siteInspectionScheduledAt || null,
      siteInspectionScheduleNote: row.siteInspectionScheduleNote || '',
      inspectionEmailNotifiedAt: row.inspectionEmailNotifiedAt || null,
      reminderPhoneCallShownAt: row.reminderPhoneCallShownAt || null,
      holdStatus: row.holdStatus || null,
      holdReason: row.holdReason || '',
      holdResolutionNote: row.holdResolutionNote || '',
      clearanceAuthority: row.clearanceAuthority || '',
      clearanceRequired: !!row.clearanceRequired,
      clearancePortal: row.clearancePortal || { status: 'not-opened', requirements: [], submission: null, comments: [] },
      technicalDeficiencyPortal: row.technicalDeficiencyPortal || { status: 'not-opened', issues: [], submission: null, comments: [] },
      reportSubmittedAt: row.reportSubmittedAt || null,
      reportRecommendation: row.reportRecommendation || '',
      reportSummary: row.reportSummary || '',
      applicationDbId: row.applicationDbId || row.dbId || row.id,
      latestHoldType: row.latestHoldType || null,
    };
  });

  const allApplications = isLiveDataActive
    ? queueMappedApplications
    : [
        ...queueMappedApplications,
        ...legacyApplications.filter((legacy) => !queueMappedApplications.some((q) => q.id === legacy.id)),
      ];

  const submitCorrections = async (applicationId, payload, filesByDoc) => {
    const targetRow = allApplications.find((row) => row.id === applicationId);
    const applicationDbId = getApplicationDbId(targetRow);
    const fileEntries = Object.entries(filesByDoc || {}).filter(([, file]) => !!file);

    if (token && applicationDbId && fileEntries.length > 0) {
      try {
        const formData = new FormData();
        fileEntries.forEach(([docType, file]) => {
          formData.append('files', file);
          formData.append('doc_types', docType);
        });

        const uploadResponse = await fetch(`${API_BASE}/applications/${applicationDbId}/documents`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const uploadPayload = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(uploadPayload?.error?.message || uploadPayload?.error || uploadPayload?.message || 'Failed to upload corrections');
        }

        success(`Corrections uploaded for ${applicationId}. Waiting for Planning Officer recheck.`);
        await loadLiveApplicationData();
        return;
      } catch (submitError) {
        error(`${submitError.message || 'Failed to upload corrections'}. Saving corrections in local workflow mode.`);
      }
    }

    const next = loadPlanningQueue([]).map((row) => {
      if (row.id !== applicationId) return row;

      const pendingStatuses = Object.fromEntries(Object.keys(payload).map((docId) => [docId, 'pending']));

      return {
        ...row,
        prelimStatus: 'pending-corrections',
        correctionPortalOpen: true,
        correctionLastSubmittedAt: new Date().toISOString(),
        correctionResubmissions: {
          ...(row.correctionResubmissions || {}),
          ...payload,
        },
        recheckStatus: {
          ...(row.recheckStatus || {}),
          ...pendingStatuses,
        },
      };
    });

    savePlanningQueue(next);
    setPlanningQueue(next);
    setPlanningFilesForPreview(applicationId, filesByDoc, true);
    success(`Corrections submitted for ${applicationId}. Waiting for Planning Officer recheck.`);
  };

  const openClearancePortalSubmission = (row) => {
    setActiveClearanceAppId(row.id);
    setClearanceCommentDraft(row.clearancePortal?.submission?.comment || '');
    setClearanceDocsDraft(row.clearancePortal?.submission?.documents || []);
  };

  const openDeficiencyPortalSubmission = (row) => {
    setActiveDeficiencyAppId(row.id);
    setDeficiencyCommentDraft(row.technicalDeficiencyPortal?.submission?.comment || '');
    setDeficiencyDocsDraft(row.technicalDeficiencyPortal?.submission?.documents || []);
  };

  const appendDraftDocuments = (setter, files) => {
    const docs = Array.from(files || []).map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      addedAt: new Date().toISOString(),
      file,
    }));
    setter((prev) => [...prev, ...docs]);
  };

  const removeDraftDocument = (setter, docId) => {
    setter((prev) => prev.filter((doc) => doc.id !== docId));
  };

  const submitClearancePortalResponse = async () => {
    if (!activeClearanceAppId) return;
    if (clearanceDocsDraft.length === 0) {
      error('Please upload at least one clearance document before submitting.');
      return;
    }

    const row = withLifecycleStatus.find((item) => item.id === activeClearanceAppId);
    const applicationDbId = getApplicationDbId(row);
    const filesToUpload = clearanceDocsDraft.filter((doc) => !!doc?.file);

    if (token && applicationDbId && filesToUpload.length > 0) {
      try {
        const formData = new FormData();
        filesToUpload.forEach((doc) => {
          formData.append('files', doc.file);
          formData.append('doc_types', APPLICANT_RESPONSE_DOC_TYPE);
        });

        const uploadResponse = await fetch(`${API_BASE}/applications/${applicationDbId}/documents`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const uploadPayload = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(uploadPayload?.error?.message || uploadPayload?.error || uploadPayload?.message || 'Failed to upload clearance response');
        }

        success(`Clearance submission sent for ${activeClearanceAppId}. Awaiting TO verification.`);
        setActiveClearanceAppId(null);
        setClearanceCommentDraft('');
        setClearanceDocsDraft([]);
        await loadLiveApplicationData();
        return;
      } catch (submitError) {
        error(`${submitError.message || 'Failed to upload clearance response'}. Saving response in local workflow mode.`);
      }
    }

    const submittedAt = new Date().toISOString();
    const next = loadPlanningQueue([]).map((row) => {
      if (row.id !== activeClearanceAppId) return row;
      const comments = row.clearancePortal?.comments || [];
      const serializableDocs = clearanceDocsDraft.map((doc) => ({
        id: doc.id,
        name: doc.name,
        size: doc.size,
        type: doc.type,
        addedAt: doc.addedAt,
      }));
      return {
        ...row,
        clearancePortal: {
          ...(row.clearancePortal || {}),
          status: 'submitted',
          submission: {
            documents: serializableDocs,
            comment: clearanceCommentDraft.trim(),
            submittedAt,
          },
          comments: [
            ...comments,
            {
              by: 'Applicant',
              text: clearanceCommentDraft.trim() || 'Clearance documents submitted.',
              at: submittedAt,
            },
          ],
        },
      };
    });

    savePlanningQueue(next);
    setPlanningQueue(next);
    success(`Clearance submission sent for ${activeClearanceAppId}. Awaiting TO verification.`);
    setActiveClearanceAppId(null);
    setClearanceCommentDraft('');
    setClearanceDocsDraft([]);
  };

  const submitDeficiencyPortalResponse = async () => {
    if (!activeDeficiencyAppId) return;
    if (!deficiencyCommentDraft.trim() && deficiencyDocsDraft.length === 0) {
      error('Add at least one correction note or upload document before submitting.');
      return;
    }

    const row = withLifecycleStatus.find((item) => item.id === activeDeficiencyAppId);
    const applicationDbId = getApplicationDbId(row);
    const filesToUpload = deficiencyDocsDraft.filter((doc) => !!doc?.file);

    if (token && applicationDbId && filesToUpload.length > 0) {
      try {
        const formData = new FormData();
        filesToUpload.forEach((doc) => {
          formData.append('files', doc.file);
          formData.append('doc_types', APPLICANT_RESPONSE_DOC_TYPE);
        });

        const uploadResponse = await fetch(`${API_BASE}/applications/${applicationDbId}/documents`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const uploadPayload = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(uploadPayload?.error?.message || uploadPayload?.error || uploadPayload?.message || 'Failed to upload technical correction response');
        }

        success(`Technical correction response submitted for ${activeDeficiencyAppId}.`);
        setActiveDeficiencyAppId(null);
        setDeficiencyCommentDraft('');
        setDeficiencyDocsDraft([]);
        await loadLiveApplicationData();
        return;
      } catch (submitError) {
        error(`${submitError.message || 'Failed to upload technical correction response'}. Saving response in local workflow mode.`);
      }
    }

    const submittedAt = new Date().toISOString();
    const next = loadPlanningQueue([]).map((row) => {
      if (row.id !== activeDeficiencyAppId) return row;
      const comments = row.technicalDeficiencyPortal?.comments || [];
      const serializableDocs = deficiencyDocsDraft.map((doc) => ({
        id: doc.id,
        name: doc.name,
        size: doc.size,
        type: doc.type,
        addedAt: doc.addedAt,
      }));
      return {
        ...row,
        technicalDeficiencyPortal: {
          ...(row.technicalDeficiencyPortal || {}),
          status: 'submitted',
          submission: {
            documents: serializableDocs,
            comment: deficiencyCommentDraft.trim(),
            submittedAt,
          },
          comments: [
            ...comments,
            {
              by: 'Applicant',
              text: deficiencyCommentDraft.trim() || 'Technical corrections resubmitted.',
              at: submittedAt,
            },
          ],
        },
      };
    });

    savePlanningQueue(next);
    setPlanningQueue(next);
    success(`Technical correction response submitted for ${activeDeficiencyAppId}.`);
    setActiveDeficiencyAppId(null);
    setDeficiencyCommentDraft('');
    setDeficiencyDocsDraft([]);
  };

  const openInspectionFeePayment = (row) => {
    if (!row.inspectionFee || row.feeStatus !== 'pending-payment') {
      error('Inspection fee is not currently payable for this application.');
      return;
    }

    setSelectedFeeApp(row);
    setSelectedAppId(row.id);

    // If paymentMethod is 'any' (from PO) or not set, show choices
    if (row.paymentMethod === 'any' || !row.paymentMethod) {
      setPaymentFlowContext({ type: 'inspection', row });
      setShowPaymentChoiceModal(true);
      return;
    }

    if (row.paymentMethod === 'online') {
      setShowPaymentModal(true);
      return;
    }

    setOfflinePaymentChannel(row.paymentMethod === 'counter' ? 'counter' : 'bank');
    setOfflinePaymentRef(row.paymentReceiptRef || '');
    setOfflinePaymentFile(null);
    setOfflinePaymentError('');
    setShowOfflinePaymentModal(true);
  };

  const openCocFeePayment = (coc) => {
    if (!coc.feeAmount) {
      error('COC fee has not been calculated yet.');
      return;
    }

    // Reuse selectedFeeApp state for COC fee display
    const pseudoAppRow = {
      id: coc.applicationId,
      cocId: coc.id,
      inspectionFee: coc.feeAmount,
      type: `COC for ${coc.applicationId}`,
      feeStatus: 'pending-payment',
    };

    setSelectedFeeApp(pseudoAppRow);
    setSelectedAppId(coc.applicationId);
    setPaymentFlowContext({ type: 'coc', row: coc });
    setShowPaymentChoiceModal(true);
  };

  const closeOfflinePaymentModal = () => {
    setShowOfflinePaymentModal(false);
    setOfflinePaymentChannel('bank');
    setOfflinePaymentRef('');
    setOfflinePaymentFile(null);
    setOfflinePaymentError('');
  };

  const submitOfflinePaymentProof = async () => {
    if (!selectedFeeApp) return;
    if (!offlinePaymentFile) {
      setOfflinePaymentError('Please upload a payment receipt file.');
      return;
    }

    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(offlinePaymentFile.type)) {
      setOfflinePaymentError('Receipt must be PDF, JPG, JPEG, or PNG.');
      return;
    }
    if (offlinePaymentFile.size > 10 * 1024 * 1024) {
      setOfflinePaymentError('Receipt file must be 10MB or less.');
      return;
    }

    const submissionAt = new Date().toISOString();

    const applicationDbId = getApplicationDbId(selectedFeeApp);
    if (token && applicationDbId && selectedFeeApp.inspectionFee) {
      try {
        const paymentPayload = await fetchAuthedJson(`${API_BASE}/applications/${applicationDbId}/payment-proof`, {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(selectedFeeApp.inspectionFee),
            payment_method: offlinePaymentChannel,
            reference_no: offlinePaymentRef.trim() || null,
            submitted_at: submissionAt,
          }),
        });

        setPlanningPaymentReceiptForPreview(selectedFeeApp.id, offlinePaymentFile);
        success(`Payment proof submitted for ${selectedFeeApp.id}. Planning Officer verification is pending.`);
        closeOfflinePaymentModal();
        setSelectedFeeApp(null);
        setSelectedAppId(null);
        await loadLiveApplicationData();
        return paymentPayload;
      } catch (submitError) {
        setOfflinePaymentError(submitError.message || 'Failed to submit payment proof to backend. Falling back to local workflow.');
      }
    }

    const next = loadPlanningQueue([]).map((row) => {
      if (row.id !== selectedFeeApp.id) return row;
      return {
        ...row,
        paymentMethod: offlinePaymentChannel,
        paymentReceiptRef: offlinePaymentRef.trim(),
        paymentPaidAt: submissionAt,
        receiptSubmittedAt: submissionAt,
        feeStatus: 'receipt-submitted',
        paymentReceiptSubmission: {
          fileName: offlinePaymentFile.name,
          mimeType: offlinePaymentFile.type,
          submittedAt: submissionAt,
          channel: offlinePaymentChannel,
          referenceNo: offlinePaymentRef.trim(),
        },
      };
    });

    savePlanningQueue(next);
    setPlanningQueue(next);
    setPlanningPaymentReceiptForPreview(selectedFeeApp.id, offlinePaymentFile);
    success(`Payment proof submitted for ${selectedFeeApp.id}. Planning Officer verification is pending.`);

    closeOfflinePaymentModal();
    setSelectedFeeApp(null);
    setSelectedAppId(null);
  };

  const onInspectionFeePaidOnline = async (paymentData) => {
    if (!selectedFeeApp) return;

    const applicationDbId = getApplicationDbId(selectedFeeApp);
    if (token && applicationDbId && selectedFeeApp.inspectionFee) {
      try {
        const isCoc = paymentFlowContext.type === 'coc';
        const endpoint = isCoc 
          ? `${API_BASE}/coc/${paymentFlowContext.row.id}/status`
          : `${API_BASE}/applications/${applicationDbId}/payment`;
        
        const payload = isCoc
          ? { status: 'paid', paid_at: paymentData.paidAt, transaction_id: paymentData.transactionId }
          : { amount: Number(selectedFeeApp.inspectionFee), transaction_id: paymentData.transactionId, receipt_id: paymentData.receiptId || null, paid_at: paymentData.paidAt };

        await fetchAuthedJson(endpoint, {
          method: isCoc ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });

        success(`Payment successful for ${selectedFeeApp.id}.`);
        setShowPaymentModal(false);
        setSelectedFeeApp(null);
        setSelectedAppId(null);
        await loadLiveApplicationData();
        return;
      } catch {
        error('Failed to notify backend of payment. Please contact support.');
      }
    }

    const next = loadPlanningQueue([]).map((row) => {
      if (row.id !== selectedFeeApp.id) return row;
      return {
        ...row,
        feeStatus: 'paid-verified',
        paymentMethod: 'online',
        paymentTransactionId: paymentData.transactionId,
        paymentReceiptRef: paymentData.receiptId || row.paymentReceiptRef || '',
        receiptSubmittedAt: paymentData.paidAt,
        paymentPaidAt: paymentData.paidAt,
        paymentVerifiedAt: paymentData.paidAt,
        paymentReceiptSubmission: {
          fileName: `${paymentData.receiptId || paymentData.transactionId}.txt`,
          mimeType: 'text/plain',
          submittedAt: paymentData.paidAt,
          channel: 'online',
          referenceNo: paymentData.receiptId || paymentData.transactionId,
        },
      };
    });

    savePlanningQueue(next);
    setPlanningQueue(next);
    success(`Online payment recorded for ${selectedFeeApp.id}. Application is now ready for assignment.`);
  };

  const previewUploadedPaymentReceipt = (applicationId) => {
    const file = getPlanningPaymentReceiptForPreview(applicationId);
    if (!file) {
      error('Receipt preview is unavailable in current session.');
      return;
    }
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  };

  const downloadPaymentReceiptFromRow = (row) => {
    const receipt = row.paymentReceiptSubmission || {};
    const lines = [
      'CiviTrack - Inspection Fee Receipt',
      '----------------------------------',
      `Application Code: ${getApplicationCode(row)}`,
      `Payment Method: ${row.paymentMethod || receipt.channel || 'N/A'}`,
      `Amount (LKR): ${row.inspectionFee || 'N/A'}`,
      `Reference: ${receipt.referenceNo || row.paymentReceiptRef || 'N/A'}`,
      `Submitted/Paid At: ${receipt.submittedAt ? new Date(receipt.submittedAt).toLocaleString() : 'N/A'}`,
      `Verified At: ${row.paymentVerifiedAt ? new Date(row.paymentVerifiedAt).toLocaleString() : 'Pending'}`,
      '',
      'This receipt is generated from application payment history.',
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getApplicationCode(row)}-payment-history-receipt.txt`;
    a.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 3000);
  };

  const withLifecycleStatus = allApplications.map((row) => {
    const outcome = decisionOutcomes[row.id];
    const appeal = appealDrafts[row.id];
    const latestAppeal = getLatestAppeal(appeal);
    const nonIndemnification = nonIndemnificationRequests[row.id];
    const permit = getPermitByApplicationId(permits, row.id);
    const expired = isPermitExpired(permit);

    if (appeal?.status === 'submitted' || appeal?.status === 'under-review' || appeal?.status === 'forwarded-to-committee' || appeal?.status === 'routed-to-to' || appeal?.status === 'routed-to-sw') {
      const routeLabel =
        appeal.route === 'planning-section'
          ? 'Planning Section'
          : appeal.route === 'technical-officer'
          ? 'Technical Officer'
          : appeal.route === 'superintendent'
          ? 'Superintendent'
          : 'Planning Committee';
      const submittedSuffix = latestAppeal ? ` (#${latestAppeal.appealNo})` : '';
      const stageLabel = appeal.status === 'under-review'
        ? `Appeal Under Re-Review (${routeLabel})`
        : appeal.status === 'routed-to-to'
        ? 'Appeal Routed to Technical Officer Review'
        : appeal.status === 'routed-to-sw'
        ? 'Appeal Routed to Superintendent Review'
        : appeal.status === 'forwarded-to-committee'
        ? 'Appeal Returned to Committee'
        : `Appeal Submitted${submittedSuffix} (${routeLabel})`;
      return {
        ...row,
        status: 'appeal-submitted',
        label: stageLabel,
      };
    }

    if (outcome?.decision === 'not-granted') {
      return {
        ...row,
        status: 'not-granted',
        label: 'Not Granted - Appeal Required',
      };
    }

    if (outcome?.decision === 'more-info') {
      return {
        ...row,
        status: 'correction',
        label: 'More Information Requested',
      };
    }

    if (outcome?.decision === 'approved') {
      const needsAgreement = row.type === 'Building Permit' && row.requiresBoundaryWallPermission && nonIndemnification?.requested && !nonIndemnification?.agreed;
      const awaitingPhysicalDocs = !outcome?.permitCollected;
      if (awaitingPhysicalDocs) {
        return {
          ...row,
          status: 'approved',
          label: 'Approved - Awaiting Physical Documents',
        };
      }
      return {
        ...row,
        status: needsAgreement ? 'approved' : (expired ? 'expired' : 'issued'),
        label: needsAgreement
          ? 'Approved - Awaiting Non-Indemnification Record'
          : expired
          ? 'Permit Expired'
          : 'Permit Issued',
      };
    }

    return row;
  });

  const filteredApplications = withLifecycleStatus.filter(app => {
    const appCode = getApplicationCode(app).toLowerCase();
    const matchesSearch = appCode.includes(searchTerm.toLowerCase()) ||
                          app.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all'
      || normalizeFilterValue(app.type) === normalizeFilterValue(filterType);
    const matchesStatus = filterStatus === 'all'
      || normalizeFilterValue(app.status) === normalizeFilterValue(filterStatus);
    return matchesSearch && matchesType && matchesStatus;
  });

  const hasActiveFilters = searchTerm.trim() !== '' || filterType !== 'all' || filterStatus !== 'all';

  const applicationNeedsAction = (row) => {
    if (row.status === 'payment-pending' && row.feeStatus === 'pending-payment') return true;
    if (row.status === 'correction' || row.status === 'needs_correction') return true;
    if (row.status === 'not-granted') return true;
    if (row.status === 'approved' && !decisionOutcomes[row.id]?.permitCollected) return true;
    if (row.status === 'expired') return true;
    return false;
  };

  const getApplicantActionHint = (row) => {
    if (row.status === 'payment-pending' && row.feeStatus === 'pending-payment') {
      return { label: 'Action Needed: Pay Fee', tone: 'amber' };
    }
    if (row.status === 'payment-pending' && row.feeStatus === 'receipt-submitted') {
      return { label: 'Waiting for Payment Verification', tone: 'blue' };
    }
    if ((row.status === 'correction' || row.status === 'needs_correction') && decisionOutcomes[row.id]?.decision === 'more-info') {
      return { label: 'Action Needed: Committee Corrections', tone: 'amber' };
    }
    if (row.status === 'correction' || row.status === 'needs_correction') {
      return { label: 'Action Needed: Upload Corrections', tone: 'amber' };
    }
    if (row.status === 'not-granted') {
      return { label: 'Action Needed: Submit Appeal', tone: 'red' };
    }
    if (row.status === 'approved' && !decisionOutcomes[row.id]?.permitCollected) {
      return { label: 'Action Needed: Physical Documents', tone: 'amber' };
    }
    if (row.status === 'expired') {
      const permit = getPermitByApplicationId(permits, row.id);
      if (permit && canExtendPermit(permit)) {
        return { label: 'Action Needed: Extend Permit', tone: 'amber' };
      }
      return { label: 'Action Needed: Start New Application', tone: 'red' };
    }
    if (row.status === 'under-review' || row.status === 'complaint-hold' || row.status === 'clearance-hold') {
      return { label: 'In Progress: Under Review', tone: 'blue' };
    }
    return { label: 'No Immediate Action Required', tone: 'green' };
  };

  const actionHintClass = (tone) => {
    if (tone === 'amber') return 'bg-amber-50 border-amber-200 text-amber-800';
    if (tone === 'red') return 'bg-red-50 border-red-200 text-red-800';
    if (tone === 'blue') return 'bg-blue-50 border-blue-200 text-blue-800';
    return 'bg-green-50 border-green-200 text-green-800';
  };

  const actionRequiredCount = filteredApplications.filter(applicationNeedsAction).length;
  const inReviewCount = filteredApplications.filter((app) => (
    app.status === 'under-review' || app.status === 'complaint-hold' || app.status === 'clearance-hold'
  )).length;
  const completedCount = filteredApplications.filter((app) => (
    app.status === 'issued' || app.status === 'completed'
  )).length;

  const resetFilters = () => {
    setSearchTerm('');
    setFilterType('all');
    setFilterStatus('all');
    setShowFilters(false);
  };

  const handleExport = () => {
    const csv = [
      ['Application Code', 'Type', 'Date', 'Status'],
      ...filteredApplications.map((app) => [getApplicationCode(app), app.type, app.date, app.label])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applications-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const openAppealPrompt = (row) => {
    const latest = getLatestAppeal(appealDrafts[row.id]);
    const requirements = getAppealRequirements(row.id);

    setAppealPrompt({
      open: true,
      appId: row.id,
      value: latest?.summary || appealDrafts[row.id]?.summary || 'Updated plans and compliance clarifications attached for committee re-review.',
      error: '',
    });
    setAppealCategory(requirements.requiredDocuments.some((doc) => /plan|drawing|survey|architect/i.test(doc.label)) ? 'plans' : 'documents');
    setAppealSpecialCircumstances(latest?.specialCircumstances || '');
    setAppealAcknowledgements({ addressedAll: false, understandsWorkflow: false });
    setAppealCorrectedUploads({});
    setAppealAdditionalUploads([]);
  };

  const getAppealRequirements = (appId) => {
    const note = committeeCorrectionNotes[appId] || {};
    const outcome = decisionOutcomes[appId] || {};
    const requiredActions = Array.isArray(outcome.requiredActions)
      ? outcome.requiredActions
      : Array.isArray(note.requiredActions)
      ? note.requiredActions
      : [];

    const requiredDocumentsRaw = Array.isArray(outcome.requiredDocuments)
      ? outcome.requiredDocuments
      : Array.isArray(note.requiredDocuments)
      ? note.requiredDocuments
      : [];

    const requiredDocuments = requiredDocumentsRaw.map((doc, index) => {
      if (typeof doc === 'string') {
        return {
          id: `required-${index + 1}`,
          label: doc,
          kind: 'corrected',
          required: true,
        };
      }
      return {
        id: doc.id || `required-${index + 1}`,
        label: doc.label || doc.name || `Required Document ${index + 1}`,
        kind: doc.kind || 'corrected',
        required: doc.required !== false,
      };
    });

    return {
      finalNote: note.note || outcome.correctionRequestNote || 'Please address committee concerns and submit your appeal package.',
      requiredActions,
      requiredDocuments,
      portalOpen: outcome.appealPortalOpen ?? note.appealPortalOpen ?? true,
    };
  };

  const updateAppealCorrectedUpload = (requiredDoc, file) => {
    if (!requiredDoc?.id || !file) return;
    setAppealCorrectedUploads((prev) => ({
      ...prev,
      [requiredDoc.id]: {
        id: requiredDoc.id,
        label: requiredDoc.label,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadedAt: new Date().toISOString(),
        kind: 'corrected',
        file,
      },
    }));
  };

  const removeAppealCorrectedUpload = (requiredDocId) => {
    setAppealCorrectedUploads((prev) => {
      const next = { ...prev };
      delete next[requiredDocId];
      return next;
    });
  };

  const appendAppealAdditionalUploads = (files) => {
    const docs = Array.from(files || []).map((file) => ({
      id: `appeal-additional-${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: file.name,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
      kind: 'additional',
      required: false,
      file,
    }));
    setAppealAdditionalUploads((prev) => [...prev, ...docs]);
  };

  const removeAppealAdditionalUpload = (docId) => {
    setAppealAdditionalUploads((prev) => prev.filter((item) => item.id !== docId));
  };

  const submitAppeal = async () => {
    const appId = appealPrompt.appId;
    if (!appId) return;
    const summary = (appealPrompt.value || '').trim();
    if (!summary) {
      setAppealPrompt((prev) => ({ ...prev, error: 'Appeal summary is required.' }));
      return;
    }

    if (!appealAcknowledgements.addressedAll || !appealAcknowledgements.understandsWorkflow) {
      setAppealPrompt((prev) => ({ ...prev, error: 'Please confirm both acknowledgements before submitting appeal.' }));
      return;
    }

    const row = withLifecycleStatus.find((item) => item.id === appId);
    if (!row) return;

    const requirements = getAppealRequirements(appId);
    const requiredDocIds = requirements.requiredDocuments.filter((doc) => doc.required !== false).map((doc) => doc.id);
    const missingRequiredUploads = requiredDocIds.filter((docId) => !appealCorrectedUploads[docId]);
    if (missingRequiredUploads.length > 0) {
      setAppealPrompt((prev) => ({ ...prev, error: `Upload all required corrected documents before submitting (${missingRequiredUploads.length} missing).` }));
      return;
    }

    if (Object.keys(appealCorrectedUploads).length === 0 && appealAdditionalUploads.length === 0) {
      setAppealPrompt((prev) => ({ ...prev, error: 'Upload at least one corrected or additional document for the appeal.' }));
      return;
    }

    const containsNewPlans =
      appealCategory === 'plans'
      || Object.values(appealCorrectedUploads).some((doc) => /plan|drawing|survey|architect/i.test(doc.label || doc.fileName || ''))
      || appealAdditionalUploads.some((doc) => /plan|drawing|survey|architect/i.test(doc.label || doc.fileName || ''));

    const suggestedRoute = inferAppealRoute({
      summary,
      correctionsCategory: appealCategory,
      correctedDocuments: Object.values(appealCorrectedUploads),
      additionalDocuments: appealAdditionalUploads,
    });

    const route = 'committee';
    const applicationDbId = getApplicationDbId(row);
    let persistedAppealCaseId = appealDrafts[appId]?.appealCaseId || null;

    if (token && applicationDbId) {
      try {
        if (persistedAppealCaseId) {
          const versionResponse = await fetch(`${API_BASE}/appeals/${persistedAppealCaseId}/versions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              summary,
              corrections_category: appealCategory,
              special_circumstances: appealSpecialCircumstances.trim().slice(0, 500),
              contains_new_plans: containsNewPlans,
              documents: [],
            }),
          });

          const versionPayload = await versionResponse.json();
          if (!versionResponse.ok) {
            throw new Error(versionPayload?.error?.message || versionPayload?.error || versionPayload?.message || 'Failed to add appeal version');
          }
        } else {
          const createResponse = await fetch(`${API_BASE}/appeals`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              application_id: applicationDbId,
              route,
              summary,
              corrections_category: appealCategory,
              special_circumstances: appealSpecialCircumstances.trim().slice(0, 500),
              contains_new_plans: containsNewPlans,
              documents: [],
            }),
          });

          const createPayload = await createResponse.json();
          if (!createResponse.ok) {
            throw new Error(createPayload?.error?.message || createPayload?.error || createPayload?.message || 'Failed to create appeal case');
          }

          persistedAppealCaseId = createPayload?.appealCase?.id || null;
        }
      } catch (submitError) {
        setAppealPrompt((prev) => ({ ...prev, error: submitError.message || 'Failed to submit appeal.' }));
        return;
      }
    }

    const submittedAt = new Date().toISOString();
    const correctedDocuments = Object.values(appealCorrectedUploads).map((doc) => ({
      ...doc,
      version: (appealDrafts[appId]?.history?.length || 0) + 2,
    }));

    const additionalDocuments = appealAdditionalUploads.map((doc) => ({
      ...doc,
      version: (appealDrafts[appId]?.history?.length || 0) + 2,
    }));

    const nextEntry = appendAppealVersion(appealDrafts[appId], {
      summary,
      submittedAt,
      type: row.type,
      route,
      suggestedRoute,
      correctionsCategory: appealCategory,
      specialCircumstances: appealSpecialCircumstances.trim().slice(0, 500),
      acknowledgements: { ...appealAcknowledgements },
      correctedDocuments,
      additionalDocuments,
      containsNewPlans,
      requiredActions: requirements.requiredActions,
      requiredDocuments: requirements.requiredDocuments,
      portalOpen: false,
    });

    const nextAppeals = {
      ...appealDrafts,
      [appId]: {
        ...nextEntry,
        appealCaseId: persistedAppealCaseId || nextEntry?.appealCaseId || null,
        applicationDbId: applicationDbId || nextEntry?.applicationDbId || null,
      },
    };

    const filesByDoc = {};
    correctedDocuments.forEach((doc) => {
      if (doc.file) filesByDoc[doc.id] = doc.file;
    });
    additionalDocuments.forEach((doc) => {
      if (doc.file) filesByDoc[doc.id] = doc.file;
    });

    const nextQueue = loadPlanningQueue([]).map((item) => (
      item.id === appId
        ? {
            ...item,
            appealPortalOpen: false,
            appealLastSubmittedAt: submittedAt,
            appealSpecialCircumstances: appealSpecialCircumstances.trim().slice(0, 500),
          }
        : item
    ));

    setAppealDrafts(nextAppeals);
    saveAppealSubmissions(nextAppeals);
    savePlanningQueue(nextQueue);
    setPlanningQueue(nextQueue);
    setPlanningFilesForPreview(appId, filesByDoc, true);
    setAppealPrompt({ open: false, appId: null, value: '', error: '' });
    setAppealSpecialCircumstances('');
    setAppealAcknowledgements({ addressedAll: false, understandsWorkflow: false });
    setAppealCorrectedUploads({});
    setAppealAdditionalUploads([]);

    if (token) {
      await loadLiveApplicationData();
    }

    success(`Appeal initiated for ${appId}. Routed to Planning Committee for initial review.`);
  };

  const requestAgreementRecord = (row) => {
    if (!hasCompleteBoundaryWallDetails(row)) {
      error('Cannot record agreement. Required boundary wall fields are incomplete in the application.');
      return;
    }
    setAgreementConfirm({ open: true, row });
  };

  const confirmAgreementRecord = () => {
    const row = agreementConfirm.row;
    if (!row) return;

    const updated = {
      ...nonIndemnificationRequests,
      [row.id]: {
        ...nonIndemnificationRequests[row.id],
        agreed: true,
        agreedAt: new Date().toISOString(),
        mode: 'physical',
        status: 'agreed',
      },
    };
    setNonIndemnificationRequests(updated);
    saveNonIndemnificationRequests(updated);
    setAgreementConfirm({ open: false, row: null });
    success(`Non-indemnification agreement recorded for ${getApplicationCode(row)}. Permit is now granted.`);
  };

  const requestPermitExtension = (appId) => {
    const permit = getPermitByApplicationId(permits, appId);
    if (!permit) {
      error('Permit record not found for this application.');
      return;
    }
    if (!isBuildingPermit(permit)) {
      error('Permit extension is available only for Building Permit applications.');
      return;
    }
    if (!canExtendPermit(permit)) {
      error('Maximum permit extension period reached. Submit a new application.');
      return;
    }
    setSelectedPermitAppId(appId);
    setExtensionAgreeTerms(false);
    setExtensionPaymentMethod('online');
    setExtensionReceiptRef('');
    setExtensionReceiptFile(null);
    setExtensionPaymentError('');
    setShowPermitExtensionFlowModal(true);
  };

  const applyExtensionAndPersist = async (appId) => {
    const permit = getPermitByApplicationId(permits, appId);
    if (!permit) return;

    const previousExpiry = permit.validUntil;
    const updatedPermit = applyPermitExtension(permit, 5000);
    const next = permits.map((row) => (row.applicationId === appId ? updatedPermit : row));

    setPermits(next);
    savePermitWorkflow(next);

    if (user?.email) {
      const currentYear = (updatedPermit.extensionsUsed || 0) + 1;
      await notifyPermitExtended(
        user.email,
        user.fullName || user.name || 'Applicant',
        appId,
        new Date(previousExpiry).toISOString().slice(0, 10),
        new Date(updatedPermit.validUntil).toISOString().slice(0, 10),
        currentYear,
        updatedPermit.maxYears || 5
      );
    }

    success(`Permit for ${appId} extended by one year. New validity: ${formatDate(updatedPermit.validUntil)}.`);
  };

  const proceedPermitExtension = async () => {
    if (!selectedPermitAppId) return;
    if (!extensionAgreeTerms) {
      setExtensionPaymentError('You must agree to terms and conditions before proceeding.');
      return;
    }

    if (extensionPaymentMethod === 'online') {
      setShowPermitExtensionFlowModal(false);
      setShowPermitExtensionPayment(true);
      return;
    }

    if (!extensionReceiptFile) {
      setExtensionPaymentError('Upload payment receipt for bank/counter payments.');
      return;
    }

    await applyExtensionAndPersist(selectedPermitAppId);
    setShowPermitExtensionFlowModal(false);
    setSelectedPermitAppId(null);
    setExtensionReceiptFile(null);
    setExtensionReceiptRef('');
    setExtensionPaymentError('');
  };

  const onPermitExtensionPaid = () => {
    if (!selectedPermitAppId) return;
    applyExtensionAndPersist(selectedPermitAppId);
    setShowPermitExtensionPayment(false);
    setSelectedPermitAppId(null);
  };

  const getLatestCoc = (appId) => {
    const related = cocRequests.filter((row) => row.applicationId === appId);
    if (related.length === 0) return null;
    return [...related].sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime())[0];
  };

  const getLifecycleSnapshot = (row, permit, permitExpired, outcome, appeal, coc) => {
    const committeeStage = outcome?.decision
      ? outcome.decision === 'approved'
        ? 'Approved'
        : outcome.decision === 'not-granted'
        ? 'Not Granted'
        : 'More Info Requested'
      : 'Pending';

    const appealStage = !appeal
      ? 'Not Started'
      : appeal.status === 'under-review'
      ? 'Under Re-Review'
      : appeal.status === 'routed-to-to'
      ? 'Routed to Technical Officer'
      : appeal.status === 'routed-to-sw'
      ? 'Routed to Superintendent'
      : appeal.status === 'forwarded-to-committee'
      ? 'Returned to Committee'
      : appeal.status === 'submitted'
      ? 'Submitted'
      : 'Resolved';

    const cocStage = !coc
      ? 'Not Requested'
      : coc.status === 'requested'
      ? 'Requested'
      : coc.status === 'fee-calculated'
      ? 'Fee Calculated'
      : coc.status === 'paid'
      ? 'Paid'
      : coc.status === 'assigned-to-to'
      ? 'Assigned to TO'
      : coc.status === 'inspection-complete'
      ? 'Inspection Complete'
      : coc.status === 'coc-approved'
      ? 'Approved'
      : 'Collected';

    const permitStage = !permit
      ? 'No Permit Record'
      : permitExpired
      ? (canExtendPermit(permit) ? 'Expired - Extendable' : 'Expired - New Application Needed')
      : outcome?.permitCollected
      ? 'Active - Physically Collected'
      : 'Approved - Awaiting Physical Collection';

    const lastUpdatedCandidates = [
      outcome?.permitCollectedAt,
      outcome?.decidedAt,
      appeal?.forwardedToCommitteeAt,
      appeal?.reviewStartedAt,
      appeal?.resolvedAt,
      appeal?.submittedAt,
      coc?.collectedAt,
      coc?.approvedByCommitteeAt,
      coc?.inspectionCompletedAt,
      coc?.assignedAt,
      coc?.paidAt,
      coc?.feeCalculatedAt,
      coc?.requestedAt,
      permit?.validUntil,
      row.date,
    ]
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());

    const lastUpdated = lastUpdatedCandidates.length > 0 ? lastUpdatedCandidates[0].toISOString() : null;

    return { committeeStage, appealStage, cocStage, permitStage, lastUpdated };
  };

  const getApplicantStage2FlowSteps = (row) => {
    const hasCorrectionTrail =
      row.status === 'correction'
      || (row.deficientDocuments || []).length > 0
      || Object.keys(row.correctionResubmissions || {}).length > 0;

    const pendingCheckState = row.status === 'under-review' || row.status === 'correction' || row.status === 'payment-pending' ? 'done' : 'todo';
    const correctionState = hasCorrectionTrail
      ? (row.status === 'correction' ? 'current' : 'done')
      : 'na';
    const verifiedState = (row.status === 'under-review' || row.status === 'payment-pending') && !hasCorrectionTrail
      ? 'current'
      : (row.status === 'correction' ? 'todo' : 'done');

    return [
      { label: 'Pending Check', state: pendingCheckState },
      { label: 'Pending Corrections', state: correctionState },
      { label: 'Verified', state: verifiedState },
    ];
  };

  const applicantFlowChipClass = (state) => {
    if (state === 'done') return 'bg-green-50 border-green-200 text-green-700';
    if (state === 'current') return 'bg-blue-50 border-blue-200 text-blue-700';
    if (state === 'na') return 'bg-slate-50 border-slate-200 text-slate-400';
    return 'bg-slate-50 border-slate-200 text-slate-500';
  };

  const getPaymentMethodLabel = (method) => {
    if (method === 'online') return 'Online';
    if (method === 'bank') return 'Bank Transfer';
    if (method === 'counter') return 'Counter Payment';
    return 'N/A';
  };

  const getFeeStatusLabel = (status) => {
    if (status === 'pending-payment') return 'Pending Payment';
    if (status === 'receipt-submitted') return 'Receipt Submitted';
    if (status === 'paid-verified') return 'Paid & Verified';
    return 'Not Entered';
  };

  const detailsRow = withLifecycleStatus.find((row) => row.id === detailsAppId) || null;
  const appealTarget = withLifecycleStatus.find((row) => row.id === appealPrompt.appId) || null;
  const appealRequirements = appealPrompt.appId
    ? getAppealRequirements(appealPrompt.appId)
    : { finalNote: '', requiredActions: [], requiredDocuments: [], portalOpen: true };

  const getApplicantStage3FlowSteps = (row) => {
    const hasFee = !!row.inspectionFee;
    const pendingState = hasFee
      ? (row.feeStatus === 'pending-payment' ? 'current' : 'done')
      : 'todo';
    const receiptState = row.feeStatus === 'receipt-submitted'
      ? 'current'
      : row.feeStatus === 'paid-verified'
      ? 'done'
      : hasFee && row.paymentMethod !== 'online'
      ? 'todo'
      : 'na';
    const verifiedState = row.feeStatus === 'paid-verified' ? 'done' : (hasFee ? 'todo' : 'na');

    return [
      { label: 'Fee Pending', state: pendingState },
      { label: 'Receipt Review', state: receiptState },
      { label: 'Paid Verified', state: verifiedState },
    ];
  };

  const buildApplicationAuditTimeline = (row) => {
    const entries = [
      { label: 'Application submitted', at: row.submittedAt || null, state: row.submittedAt ? 'done' : 'todo' },
      {
        label: row.status === 'correction' ? 'Corrections requested by Planning Section' : 'Preliminary check in progress/complete',
        at: row.correctionsRequestedAt || row.prelimVerifiedAt || null,
        state: row.status === 'correction' ? 'current' : (row.status === 'under-review' || row.status === 'payment-pending' ? 'done' : 'todo'),
      },
      {
        label: row.inspectionFee ? 'Fee published to applicant' : 'Awaiting fee entry',
        at: row.feeEnteredAt || null,
        state: row.inspectionFee ? 'done' : 'todo',
      },
      {
        label: row.feeStatus === 'receipt-submitted' ? 'Payment proof submitted' : row.feeStatus === 'paid-verified' ? 'Payment completed' : 'Payment pending',
        at: row.receiptSubmittedAt || row.paymentReceiptSubmission?.submittedAt || row.paymentPaidAt || null,
        state: row.feeStatus === 'pending-payment' ? 'current' : row.feeStatus === 'not-entered' ? 'todo' : 'done',
      },
      {
        label: row.feeStatus === 'paid-verified' ? 'Payment verified by Planning Section' : 'Awaiting payment verification',
        at: row.paymentVerifiedAt || null,
        state: row.feeStatus === 'paid-verified' ? 'done' : 'todo',
      },
      {
        label: row.siteInspectionScheduledAt ? 'Site inspection scheduled by TO' : 'Awaiting TO inspection scheduling',
        at: row.siteInspectionScheduledAt || null,
        state: row.siteInspectionScheduledAt ? 'done' : 'todo',
      },
      {
        label: row.holdStatus === 'complaint-hold'
          ? 'Investigation paused due to public complaint'
          : row.holdStatus === 'clearance-hold'
          ? 'Investigation paused pending external clearances'
          : 'No active investigation hold',
        at: row.holdStatus ? (technicalUpdates[row.id]?.updatedAt || row.siteInspectionScheduledAt || null) : null,
        state: row.holdStatus ? 'current' : 'done',
      },
      {
        label: row.clearancePortal?.status === 'submitted'
          ? 'Clearance package submitted by applicant'
          : row.clearancePortal?.status === 'awaiting-resubmission'
          ? 'Clearance package returned for correction'
          : row.clearancePortal?.status === 'validated'
          ? 'Clearance package validated by TO'
          : 'Clearance portal not active',
        at: row.clearancePortal?.submission?.submittedAt || null,
        state: row.clearancePortal?.status === 'awaiting-resubmission'
          ? 'current'
          : row.clearancePortal?.status === 'validated'
          ? 'done'
          : row.clearancePortal?.status === 'submitted'
          ? 'done'
          : 'na',
      },
      {
        label: row.technicalDeficiencyPortal?.status === 'submitted'
          ? 'Technical correction resubmission submitted'
          : row.technicalDeficiencyPortal?.status === 'awaiting-resubmission'
          ? 'Technical correction requested by TO'
          : row.technicalDeficiencyPortal?.status === 'validated'
          ? 'Technical correction accepted by TO'
          : 'Technical deficiency portal not active',
        at: row.technicalDeficiencyPortal?.submission?.submittedAt || null,
        state: row.technicalDeficiencyPortal?.status === 'awaiting-resubmission'
          ? 'current'
          : row.technicalDeficiencyPortal?.status === 'validated'
          ? 'done'
          : row.technicalDeficiencyPortal?.status === 'submitted'
          ? 'done'
          : 'na',
      },
    ];
    return entries;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-3xl font-bold text-slate-800">My Applications</h1>
        <Button onClick={handleExport} variant="secondary" className="flex items-center gap-2">
          <Download size={18} />
          Export to CSV
        </Button>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-[24px] shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              id="applications-search"
              type="text"
              placeholder="Search by Application Code or Type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search applications by code or type"
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-slate-800 transition-colors placeholder:font-normal placeholder:text-slate-400"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls="applications-advanced-filters"
            className="flex items-center gap-2 px-6 py-3 rounded-xl border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-all text-slate-700 font-medium whitespace-nowrap"
          >
            <Filter size={18} />
            Filters
          </Button>
        </div>

        {showFilters && (
          <div id="applications-advanced-filters" className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-100">
            <div>
              <label htmlFor="applications-filter-type" className="block text-sm font-semibold text-slate-700 mb-2">Application Type</label>
              <select
                id="applications-filter-type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-slate-700"
              >
                <option value="all">All Types</option>
                <option value="Building Permit">Building Permit</option>
                <option value="Land Subdivision">Land Subdivision</option>
              </select>
            </div>
            <div>
              <label htmlFor="applications-filter-status" className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
              <select
                id="applications-filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-slate-700"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="under-review">Under Review</option>
                <option value="complaint-hold">Complaint Hold</option>
                <option value="clearance-hold">Special Clearance Hold</option>
                <option value="correction">Correction Required</option>
                <option value="approved">Approved</option>
                <option value="not-granted">Not Granted</option>
                <option value="appeal-submitted">Appeal Submitted</option>
                <option value="payment-pending">Payment Pending</option>
                <option value="issued">Permit Issued</option>
                <option value="expired">Permit Expired</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm font-medium text-slate-500">
            Showing <span className="text-slate-800 font-semibold">{filteredApplications.length}</span> of {allApplications.length} applications
          </p>
          {hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={resetFilters} className="text-slate-500 hover:text-slate-800">
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Alerts Area */}
      {filteredApplications.some((app) => app.status === 'payment-pending') && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 flex items-start gap-4">
          <div className="p-2 bg-amber-100 rounded-full text-amber-600 shrink-0 mt-0.5">
            <CreditCard size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-900">Fee Notification Center</p>
            <p className="text-sm text-amber-800 mt-1 leading-relaxed">
              You have <span className="font-semibold">{filteredApplications.filter((app) => app.status === 'payment-pending').length}</span> application(s) awaiting inspection fee payment or verification. Please review your active queue below.
            </p>
          </div>
        </div>
      )}

      {/* Grid of Applications */}
      <div className="space-y-6">
        {filteredApplications.length > 0 ? (
          filteredApplications.map((row) => (
            <div key={row.id} className="bg-white rounded-[24px] shadow-sm border border-slate-200 p-6 sm:p-8 flex flex-col xl:flex-row gap-6 sm:gap-8 transition-shadow hover:shadow-md">
              
              {/* Card Left: Meta Data & Stages */}
              <div className="xl:w-2/5 flex flex-col gap-5 border-b xl:border-b-0 xl:border-r border-slate-100 pb-6 xl:pb-0 xl:pr-8">
                <div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="text-sm font-bold font-mono text-slate-800 bg-slate-100/80 px-3 py-1 rounded-md border border-slate-200/60 shadow-sm">{getApplicationCode(row)}</span>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{row.type}</span>
                  </div>
                  <p className="text-sm text-slate-500 font-medium">Submitted on {row.date}</p>
                </div>
            
                <div>
                  <StatusBadge status={row.status}>{row.label}</StatusBadge>
                </div>

                <div className="space-y-3 mt-1 bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Clock size={12}/> Workflow Progress</p>
                  {getApplicantStage2FlowSteps(row).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {getApplicantStage2FlowSteps(row).map((step) => (
                        <span key={`${row.id}-${step.label}`} className={`text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border bg-white ${applicantFlowChipClass(step.state)}`}>
                          {step.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {getApplicantStage3FlowSteps(row).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200/60">
                      {getApplicantStage3FlowSteps(row).map((step) => (
                        <span key={`${row.id}-${step.label}-stage3`} className={`text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border bg-white ${applicantFlowChipClass(step.state)}`}>
                          {step.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Right: Action Panel */}
              <div className="xl:w-3/5 flex flex-col">
                <div className="flex justify-between items-start mb-5 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 mb-1">Current Action Required</p>
                    <p className={`text-[11px] px-3 py-1 rounded-full font-bold uppercase tracking-widest border inline-flex items-center gap-1.5 shadow-sm bg-white ${actionHintClass(getApplicantActionHint(row).tone)}`}>
                      <Info size={12} />
                      {getApplicantActionHint(row).label}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setDetailsAppId(row.id)} className="text-blue-600 font-bold hover:bg-blue-50 border border-transparent hover:border-blue-100 shrink-0">View Details</Button>
                </div>
                
                <div className="flex-1">
                      {(() => {
                        const permit = getPermitByApplicationId(permits, row.id);
                        const permitExpired = isPermitExpired(permit);
                        const permitExtendable = canExtendPermit(permit);
                        const appeal = appealDrafts[row.id];
                        const outcome = decisionOutcomes[row.id];
                        const coc = getLatestCoc(row.id);
                        const lifecycle = getLifecycleSnapshot(row, permit, permitExpired, outcome, appeal, coc);
                        const actionHint = getApplicantActionHint(row);
                        return (
                      <div className="flex flex-col gap-3">


                        {row.status === 'payment-pending' && row.feeStatus === 'pending-payment' && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => openInspectionFeePayment(row)}
                          >
                            {row.paymentMethod === 'online' ? 'Pay Online' : 'Submit Payment Proof'}
                          </Button>
                        )}
                        {row.status === 'payment-pending' && row.feeStatus === 'receipt-submitted' && (
                          <div className="w-full w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left space-y-2">
                            <p className="text-xs text-amber-800">
                              Receipt submitted on {formatDate(row.paymentReceiptSubmission?.submittedAt || new Date())}. Awaiting Planning Officer verification.
                            </p>
                            <div className="flex gap-2">
                              <Button size="sm" variant="secondary" onClick={() => previewUploadedPaymentReceipt(row.id)}>
                                View Uploaded Receipt
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => downloadPaymentReceiptFromRow(row)}>
                                Download Summary
                              </Button>
                            </div>
                          </div>
                        )}
                        {row.feeStatus === 'paid-verified' && row.paymentReceiptSubmission && (
                          <div className="w-full w-full rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-left space-y-2">
                            <p className="text-xs text-green-800">
                              Payment verified on {formatDate(row.paymentVerifiedAt || row.paymentReceiptSubmission.submittedAt)}.
                            </p>
                            <Button size="sm" variant="secondary" onClick={() => downloadPaymentReceiptFromRow(row)}>
                              Download Receipt Record
                            </Button>
                          </div>
                        )}
                        {(row.status === 'correction' || row.status === 'needs_correction') && (
                          <div className="space-y-2 w-full w-full text-left">
                            {decisionOutcomes[row.id]?.decision === 'more-info' ? (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
                                <p className="text-xs font-semibold text-amber-900">Committee Decision: Corrections Required</p>
                                <p className="text-xs text-amber-800">
                                  {committeeCorrectionNotes[row.id]?.note || decisionOutcomes[row.id]?.correctionRequestNote || 'Please review and correct the listed issues before re-submission.'}
                                </p>
                                {getAppealRequirements(row.id).requiredActions.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-amber-900">Required Actions:</p>
                                    <ol className="mt-1 text-xs text-amber-900 list-decimal list-inside space-y-0.5">
                                      {getAppealRequirements(row.id).requiredActions.map((action, index) => (
                                        <li key={`${row.id}-required-action-${index}`}>{action}</li>
                                      ))}
                                    </ol>
                                  </div>
                                )}
                                {getAppealRequirements(row.id).portalOpen ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
                                    disabled={
                                      appealDrafts[row.id]?.status === 'submitted'
                                      || appealDrafts[row.id]?.status === 'under-review'
                                      || appealDrafts[row.id]?.status === 'forwarded-to-committee'
                                      || appealDrafts[row.id]?.status === 'routed-to-to'
                                      || appealDrafts[row.id]?.status === 'routed-to-sw'
                                    }
                                    onClick={() => openAppealPrompt(row)}
                                  >
                                    Submit Appeal
                                  </Button>
                                ) : (
                                  <p className="text-xs text-amber-800">Appeal upload portal is currently closed. Wait for committee to open submissions.</p>
                                )}
                              </div>
                            ) : row.deficiencyNote && (
                              <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                                <p className="text-xs font-semibold text-red-800">Deficiency Note</p>
                                <p className="text-xs text-red-700 mt-1">{row.deficiencyNote}</p>
                                {row.deficientDocuments?.length > 0 && (
                                  <ul className="mt-1 text-xs text-red-700 list-disc list-inside">
                                    {row.deficientDocuments.map((doc) => (
                                      <li key={doc.id}>{doc.label}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              className="bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                              onClick={() => {
                                setSelectedCorrectionApp({
                                  ...row,
                                  dbId: row.applicationDbId
                                });
                                setShowCorrectionPortal(true);
                              }}
                            >
                              Upload Corrections
                            </Button>
                            {row.correctionVerified && (
                              <p className="text-xs text-green-600 font-medium">✓ Verified by Technical Officer</p>
                            )}
                          </div>
                        )}
                        {row.status === 'not-granted' && (
                          <div className="w-full w-full rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-left space-y-2">
                            <p className="text-xs font-semibold text-yellow-900">Committee Decision: Not Granted</p>
                            <p className="text-xs text-yellow-800">
                              {notGrantedReasons[row.id]?.reason || 'Appeal required. Please provide corrected plans and supporting clarifications.'}
                            </p>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="bg-white border border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                              disabled={
                                appealDrafts[row.id]?.status === 'submitted'
                                || appealDrafts[row.id]?.status === 'under-review'
                                || appealDrafts[row.id]?.status === 'forwarded-to-committee'
                                || appealDrafts[row.id]?.status === 'routed-to-to'
                                || appealDrafts[row.id]?.status === 'routed-to-sw'
                              }
                              onClick={() => openAppealPrompt(row)}
                            >
                              Start Appeal
                            </Button>
                            {appealDrafts[row.id]?.history?.length > 0 && (
                              <p className="text-xs text-slate-600">Appeal count: {appealDrafts[row.id].history.length}</p>
                            )}
                            {appealDrafts[row.id]?.route && (
                              <p className="text-xs text-slate-600">
                                Current route: {appealDrafts[row.id].route === 'planning-section' ? 'Planning Section' : appealDrafts[row.id].route === 'technical-officer' ? 'Technical Officer' : appealDrafts[row.id].route === 'superintendent' ? 'Superintendent' : 'Planning Committee'}
                              </p>
                            )}
                            {appealDrafts[row.id]?.submittedAt && (
                              <p className="text-xs text-green-700">
                                Appeal {appealDrafts[row.id].status === 'under-review' ? 'under review' : 'submitted'} on {formatDate(appealDrafts[row.id].submittedAt)}
                              </p>
                            )}
                            {appealDrafts[row.id]?.forwardedToCommitteeAt && (
                              <p className="text-xs text-blue-700">
                                Returned to Committee on {formatDate(appealDrafts[row.id].forwardedToCommitteeAt)}
                              </p>
                            )}
                          </div>
                        )}
                        {row.status === 'approved' && !decisionOutcomes[row.id]?.permitCollected && (
                          <div className="w-full w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-left space-y-2">
                            <p className="text-sm font-semibold text-emerald-900">Application Approved</p>
                            <p className="text-xs text-emerald-800">Reference Number: {getApplicationCode(row)}</p>
                            <p className="text-xs text-emerald-800">Approved Date: {formatDate(decisionOutcomes[row.id]?.decidedAt || new Date())}</p>
                            <p className="text-xs text-emerald-800 font-medium">Status: Awaiting Physical Documents</p>
                            <div className="rounded border border-emerald-200 bg-white/70 p-2">
                              <p className="text-xs font-semibold text-emerald-900">Bring these original documents:</p>
                              <ul className="mt-1 text-xs text-emerald-900 list-disc list-inside space-y-0.5">
                                <li>Original Deed</li>
                                <li>Original Approved Plans (all sheets)</li>
                                <li>Original External Clearances (if applicable)</li>
                                <li>National Identity Card (original)</li>
                                <li>2 passport-size photographs</li>
                              </ul>
                            </div>
                            <p className="text-xs text-emerald-800">Visit: Kelaniya Pradeshiya Sabha - Planning Section</p>
                            <p className="text-xs text-emerald-800">Hours: Mon-Fri, 8:30 AM - 4:00 PM</p>
                            <p className="text-xs text-emerald-800">Contact: 011 2914110</p>
                          </div>
                        )}
                        {(row.status === 'under-review' || row.status === 'complaint-hold' || row.status === 'clearance-hold') && (technicalUpdates[row.id] || row.holdReason) && (
                          <div className="w-full w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left space-y-3 shadow-inner">
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <Info size={12} />
                                    Technical Investigation Update
                                </p>
                                <p className="text-sm text-amber-800 mt-1 italic">
                                    "{row.holdReason || technicalUpdates[row.id]?.publicMessage || 'Application is currently under technical investigation.'}"
                                </p>
                                {(row.clearanceAuthority || technicalUpdates[row.id]?.clearanceAuthority) && (
                                <p className="text-xs text-amber-900 mt-2 font-bold bg-amber-100/50 px-2 py-1 rounded inline-block">
                                    Required clearance: {row.clearanceAuthority || technicalUpdates[row.id]?.clearanceAuthority}
                                </p>
                                )}
                            </div>
                            
                            {(row.status === 'complaint-hold' || row.status === 'clearance-hold') && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="bg-white text-amber-800 hover:bg-amber-100 border border-amber-300 w-full justify-center gap-2 font-bold shadow-sm"
                                    onClick={() => {
                                        setSelectedInvestigationApp({
                                            ...row,
                                            dbId: row.applicationDbId || row.dbId,
                                        });
                                        setShowInvestigationPortal(true);
                                    }}
                                >
                                    <Upload size={14} />
                                    Submit Response / Clearance Docs
                                </Button>
                            )}

                            {technicalUpdates[row.id]?.resolvedAt && (
                              <p className="text-xs text-green-700 mt-1 font-medium">
                                ✓ Resolved on {formatDate(technicalUpdates[row.id].resolvedAt)}
                              </p>
                            )}
                          </div>
                        )}
                        {row.siteInspectionScheduledAt && (
                          <div className="w-full w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left space-y-1">
                            <p className="text-xs font-semibold text-blue-900">Site Inspection Schedule</p>
                            <p className="text-xs text-blue-800">Scheduled: {formatDate(row.siteInspectionScheduledAt)}</p>
                            {row.siteInspectionScheduleNote && (
                              <p className="text-xs text-blue-800">Note: {row.siteInspectionScheduleNote}</p>
                            )}
                            <p className="text-xs text-blue-700">Please stay attentive to TO calls in the next 3 days for coordination and confirmation.</p>
                          </div>
                        )}
                        {!row.siteInspectionScheduledAt && row.feeStatus === 'paid-verified' && row.status === 'under-review' && (
                          <div className="w-full w-full rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-left space-y-2 shadow-inner">
                            <div className="flex items-center gap-2">
                                <span className="p-1 rounded-full bg-indigo-100 text-indigo-700">
                                    <Info size={14} />
                                </span>
                                <p className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                                    Inspection Scheduling in Progress
                                </p>
                            </div>
                            <p className="text-sm text-indigo-800">
                                Your inspection fee payment has been verified. A Technical Officer will review your file and contact you via your registered mobile number shortly to coordinate a site visit.
                            </p>
                            <p className="text-[10px] text-indigo-600 font-medium italic">
                                Note: Scheduling typically occurs within 48-72 hours of fee verification.
                            </p>
                          </div>
                        )}
                        {row.clearancePortal?.status && row.clearancePortal.status !== 'not-opened' && (
                          <div className="w-full w-full rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-left space-y-2">
                            <p className="text-xs font-semibold text-cyan-900">Special Clearance Portal</p>
                            {row.clearancePortal.requirements?.length > 0 && (
                              <ul className="text-xs text-cyan-900 list-disc list-inside">
                                {row.clearancePortal.requirements.map((item, idx) => (
                                  <li key={`${row.id}-clr-req-${idx}`}>{item}</li>
                                ))}
                              </ul>
                            )}
                            {row.clearancePortal.submission?.submittedAt && (
                              <p className="text-xs text-cyan-800">Last submission: {formatDate(row.clearancePortal.submission.submittedAt)}</p>
                            )}
                            <p className="text-xs text-cyan-800">
                              Status: {row.clearancePortal.status === 'awaiting-resubmission' ? 'Resubmission Required' : row.clearancePortal.status === 'submitted' ? 'Submitted' : row.clearancePortal.status === 'validated' ? 'Validated' : 'Open'}
                            </p>
                            {row.clearancePortal.status !== 'validated' && (
                              <Button size="sm" variant="secondary" onClick={() => openClearancePortalSubmission(row)}>
                                {row.clearancePortal.submission ? 'Edit / Resubmit Clearances' : 'Submit Clearances'}
                              </Button>
                            )}
                          </div>
                        )}
                        {row.technicalDeficiencyPortal?.status && row.technicalDeficiencyPortal.status !== 'not-opened' && (
                          <div className="w-full w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left space-y-2">
                            <p className="text-xs font-semibold text-rose-900">Technical Deficiency Portal</p>
                            {row.technicalDeficiencyPortal.issues?.length > 0 && (
                              <ul className="text-xs text-rose-900 list-disc list-inside">
                                {row.technicalDeficiencyPortal.issues.map((issue, idx) => (
                                  <li key={`${row.id}-def-issue-${idx}`}>{issue}</li>
                                ))}
                              </ul>
                            )}
                            {row.technicalDeficiencyPortal.submission?.submittedAt && (
                              <p className="text-xs text-rose-800">Last resubmission: {formatDate(row.technicalDeficiencyPortal.submission.submittedAt)}</p>
                            )}
                            <p className="text-xs text-rose-800">
                              Status: {row.technicalDeficiencyPortal.status === 'awaiting-resubmission' ? 'Resubmission Required' : row.technicalDeficiencyPortal.status === 'submitted' ? 'Submitted' : row.technicalDeficiencyPortal.status === 'validated' ? 'Validated' : 'Open'}
                            </p>
                            {row.technicalDeficiencyPortal.status !== 'validated' && (
                              <Button size="sm" variant="secondary" onClick={() => openDeficiencyPortalSubmission(row)}>
                                {row.technicalDeficiencyPortal.submission ? 'Edit / Resubmit Corrections' : 'Submit Corrections'}
                              </Button>
                            )}
                          </div>
                        )}
                        {row.type === 'Building Permit' && row.requiresBoundaryWallPermission && (row.status === 'approved' || row.status === 'completed' || row.status === 'issued') && (
                          <div className="space-y-1 w-full w-full text-left">
                            {nonIndemnificationRequests[row.id]?.requested && !nonIndemnificationRequests[row.id]?.agreed ? (
                              <>
                                <p className="text-xs text-amber-800">
                                  Committee requested non-indemnification agreement.
                                </p>
                                <p className="text-xs text-slate-600">
                                  Reason: {nonIndemnificationRequests[row.id]?.reason}
                                </p>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                                  onClick={() => requestAgreementRecord(row)}
                                >
                                  Record Non-Indemnification (Physical)
                                </Button>
                              </>
                            ) : nonIndemnificationRequests[row.id]?.agreed ? (
                              <p className="text-xs text-green-700 font-medium">
                                ✓ Agreement recorded physically ({formatDate(nonIndemnificationRequests[row.id].agreedAt)}) - Permit Granted
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500">No committee request for non-indemnification agreement.</p>
                            )}
                          </div>
                        )}

                        {permit && (row.status === 'issued' || row.status === 'expired' || row.status === 'approved') && (
                          <div className="w-full w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left space-y-1">
                            <p className="text-xs font-semibold text-slate-800">Permit Status</p>
                            <p className="text-xs text-slate-600">Reference: {getApplicationCode(row)}</p>
                            <p className="text-xs text-slate-600">Issued: {formatDate(permit.issuedAt || decisionOutcomes[row.id]?.permitIssuedAt || permit.validUntil)}</p>
                            <p className="text-xs text-slate-600">Physical collection: {decisionOutcomes[row.id]?.permitCollected ? 'Completed' : 'Pending'}</p>

                            {isBuildingPermit(permit) && (
                              <>
                                <p className="text-xs text-slate-600">Permit Valid Until: {formatDate(permit.validUntil)}</p>
                                <p className="text-xs text-slate-600">Extension available from: {getPermitExtensionAvailableFrom(permit) ? formatDate(getPermitExtensionAvailableFrom(permit)) : 'N/A'}</p>
                                <p className="text-xs text-slate-700">Current: Year {(permit.extensionsUsed || 0) + 1} of {permit.maxYears || 5}</p>
                                <p className="text-xs text-slate-700">Remaining extensions: {Math.max((permit.maxYears || 5) - ((permit.extensionsUsed || 0) + 1), 0)} year(s)</p>

                                {permitExpired && permitExtendable && (
                                  <div className="rounded border border-amber-200 bg-amber-50 p-2 space-y-1">
                                    <p className="text-xs font-semibold text-amber-900">Permit Expired</p>
                                    <p className="text-xs text-amber-800">You can still extend this permit for Rs. 5,000/year.</p>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="bg-white text-amber-800 hover:bg-amber-100 border border-amber-300"
                                      onClick={() => requestPermitExtension(row.id)}
                                    >
                                      Extend Permit
                                    </Button>
                                  </div>
                                )}

                                {!permitExpired && permitExtendable && getPermitDaysUntilExpiry(permit) !== null && getPermitDaysUntilExpiry(permit) <= 30 && (
                                  <div className="rounded border border-amber-200 bg-amber-50 p-2 space-y-1">
                                    <p className="text-xs font-semibold text-amber-900">Permit expiring soon</p>
                                    <p className="text-xs text-amber-800">Expires in {getPermitDaysUntilExpiry(permit)} day(s). Fee: Rs. 5,000 per year.</p>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="bg-white text-amber-800 hover:bg-amber-100 border border-amber-300"
                                      onClick={() => requestPermitExtension(row.id)}
                                    >
                                      Extend Permit
                                    </Button>
                                  </div>
                                )}

                                {permitExpired && !permitExtendable && (
                                  <div className="rounded border border-red-200 bg-red-50 p-2 space-y-1">
                                    <p className="text-xs font-semibold text-red-900">Permit Expired - Maximum Reached</p>
                                    <p className="text-xs text-red-800">Maximum validity period reached. Extension not possible.</p>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="bg-white text-red-800 hover:bg-red-100 border border-red-300"
                                      onClick={() => navigate('/new-application')}
                                    >
                                      Start New Application
                                    </Button>
                                  </div>
                                )}

                                <div className="rounded border border-slate-200 bg-white p-2 space-y-1">
                                  <p className="text-xs font-semibold text-slate-800">Permit Extension History</p>
                                  <p className="text-xs text-slate-700">
                                    Year 1: {formatDate(permit.issuedAt || permit.validUntil)} to {formatDate(permit.extensionHistory?.[0]?.from || permit.validUntil)} (Original)
                                  </p>
                                  {(permit.extensionHistory || []).map((entry, idx) => (
                                    <p key={`${row.id}-permit-history-${idx}`} className="text-xs text-slate-700">
                                      Year {entry.year || idx + 2}: {formatDate(entry.from || permit.validUntil)} to {formatDate(entry.to || permit.validUntil)} (Extended - Rs. {(entry.amount || 5000).toLocaleString()})
                                    </p>
                                  ))}
                                </div>
                              </>
                            )}

                            {!isBuildingPermit(permit) && (
                              <div className="rounded border border-slate-200 bg-white p-2">
                                <p className="text-xs text-slate-700">Survey plan approvals do not have a permit validity period or extension cycle.</p>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="w-full w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-left space-y-1">
                          <p className="text-xs font-semibold text-indigo-900">Lifecycle Timeline</p>
                          <p className="text-xs text-indigo-900">Committee: {lifecycle.committeeStage}</p>
                          <p className="text-xs text-indigo-900">Appeal: {lifecycle.appealStage}</p>
                          <p className="text-xs text-indigo-900">COC: {lifecycle.cocStage}</p>
                          {lifecycle.cocStage === 'Fee Calculated' && (
                            <Button 
                              size="sm" 
                              variant="primary" 
                              className="mt-1 h-7 text-[10px] bg-indigo-600"
                              onClick={() => openCocFeePayment(getLatestCoc(row.id))}
                            >
                              Pay COC Fee
                            </Button>
                          )}
                          <p className="text-xs text-indigo-900">Permit: {lifecycle.permitStage}</p>
                          <p className="text-xs text-indigo-700">Last update: {lifecycle.lastUpdated ? formatDate(lifecycle.lastUpdated) : '—'}</p>
                        </div>
                      </div>
                        );
                      })()}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-[24px] shadow-sm border border-slate-200 p-12 lg:p-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 border border-slate-100 mb-4 shadow-inner">
              <FileText size={28} className="text-slate-400" />
            </div>
            <p className="text-lg font-bold text-slate-800 mb-2">No applications found</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              We couldn't find any applications matching your current filters and search term.
            </p>
            {hasActiveFilters && (
              <Button onClick={resetFilters} className="mx-auto shadow-sm">
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>

      <Modal
        open={!!detailsRow}
        onClose={() => setDetailsAppId(null)}
        title={detailsRow ? `Application Details - ${getApplicationCode(detailsRow)}` : 'Application Details'}
        size="xl"
        footer={(
          <Button variant="secondary" onClick={() => setDetailsAppId(null)}>
            Close
          </Button>
        )}
      >
        {detailsRow && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Application Code</p>
                <p className="text-sm font-semibold text-slate-900">{getApplicationCode(detailsRow)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Application Type</p>
                <p className="text-sm font-semibold text-slate-900">{detailsRow.type}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Current Status</p>
                <p className="text-sm font-semibold text-slate-900">{detailsRow.label}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Submission Date</p>
                <p className="text-sm font-semibold text-slate-900">{detailsRow.date}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Stage 1 - Submission</p>
              <p className="text-sm text-slate-700">Application submitted and queued for preliminary planning review.</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Stage 2 - Preliminary Examination</p>
              <div className="flex flex-wrap gap-2">
                {getApplicantStage2FlowSteps(detailsRow).map((step) => (
                  <span
                    key={`detail-stage2-${detailsRow.id}-${step.label}`}
                    className={`text-xs px-2 py-1 rounded-full border ${applicantFlowChipClass(step.state)}`}
                  >
                    {step.label}
                  </span>
                ))}
              </div>
              {detailsRow.deficiencyNote && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-800">Deficiency Note</p>
                  <p className="text-sm text-red-700 mt-1">{detailsRow.deficiencyNote}</p>
                </div>
              )}
              {detailsRow.deficientDocuments?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1">Documents Marked for Correction</p>
                  <ul className="list-disc list-inside text-sm text-slate-700">
                    {detailsRow.deficientDocuments.map((doc) => (
                      <li key={`detail-doc-${detailsRow.id}-${doc.id}`}>{doc.label}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Stage 3 - Fee & Payment</p>
              <div className="flex flex-wrap gap-2">
                {getApplicantStage3FlowSteps(detailsRow).map((step) => (
                  <span
                    key={`detail-stage3-${detailsRow.id}-${step.label}`}
                    className={`text-xs px-2 py-1 rounded-full border ${applicantFlowChipClass(step.state)}`}
                  >
                    {step.label}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">Inspection Fee</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {detailsRow.inspectionFee ? `LKR ${detailsRow.inspectionFee.toLocaleString()}` : 'Not Entered'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">Fee Status</p>
                  <p className="text-sm font-semibold text-slate-900">{getFeeStatusLabel(detailsRow.feeStatus)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">Payment Method</p>
                  <p className="text-sm font-semibold text-slate-900">{getPaymentMethodLabel(detailsRow.paymentMethod)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">Reference No</p>
                  <p className="text-sm font-semibold text-slate-900">{detailsRow.paymentReceiptRef || 'N/A'}</p>
                </div>
              </div>

              {detailsRow.paymentReceiptSubmission && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-green-800">Payment Submission Details</p>
                  <p className="text-sm text-green-800">File: {detailsRow.paymentReceiptSubmission.fileName || 'N/A'}</p>
                  <p className="text-sm text-green-800">Submitted At: {formatDate(detailsRow.paymentReceiptSubmission.submittedAt || new Date())}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => downloadPaymentReceiptFromRow(detailsRow)}>
                      Download Receipt Record
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => previewUploadedPaymentReceipt(detailsRow.id)}
                      disabled={detailsRow.paymentMethod === 'online'}
                    >
                      View Uploaded Receipt
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Audit Timeline</p>
              <div className="space-y-2">
                {buildApplicationAuditTimeline(detailsRow).map((entry, index) => (
                  <div
                    key={`${detailsRow.id}-audit-${index}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{entry.label}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {entry.at ? formatDate(entry.at) : 'No timestamp yet'}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${applicantFlowChipClass(entry.state)}`}>
                      {entry.state === 'done' ? 'Done' : entry.state === 'current' ? 'Current' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!activeClearanceAppId}
        onClose={() => {
          setActiveClearanceAppId(null);
          setClearanceCommentDraft('');
          setClearanceDocsDraft([]);
        }}
        title={activeClearanceAppId ? `Submit Special Clearances - ${activeClearanceAppId}` : 'Submit Special Clearances'}
        size="lg"
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setActiveClearanceAppId(null);
                setClearanceCommentDraft('');
                setClearanceDocsDraft([]);
              }}
            >
              Cancel
            </Button>
            <Button onClick={submitClearancePortalResponse}>Submit to TO</Button>
          </>
        )}
      >
        {activeClearanceAppId && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">Upload all external authority clearances. You can remove/edit and resubmit when TO requests changes.</p>
            <input
              type="file"
              multiple
              onChange={(e) => appendDraftDocuments(setClearanceDocsDraft, e.target.files)}
              aria-label="Upload clearance documents"
              className="w-full rounded-lg border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {clearanceDocsDraft.length > 0 && (
              <div className="space-y-2">
                {clearanceDocsDraft.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="text-xs text-slate-700">{doc.name}</p>
                    <Button size="sm" variant="secondary" onClick={() => removeDraftDocument(setClearanceDocsDraft, doc.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              rows={4}
              value={clearanceCommentDraft}
              onChange={(e) => setClearanceCommentDraft(e.target.value)}
              aria-label="Clearance submission notes"
              className="w-full rounded-lg border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional comment for TO (e.g., authority references and notes)"
            />
          </div>
        )}
      </Modal>

      <Modal
        open={!!activeDeficiencyAppId}
        onClose={() => {
          setActiveDeficiencyAppId(null);
          setDeficiencyCommentDraft('');
          setDeficiencyDocsDraft([]);
        }}
        title={activeDeficiencyAppId ? `Submit Technical Corrections - ${activeDeficiencyAppId}` : 'Submit Technical Corrections'}
        size="lg"
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setActiveDeficiencyAppId(null);
                setDeficiencyCommentDraft('');
                setDeficiencyDocsDraft([]);
              }}
            >
              Cancel
            </Button>
            <Button onClick={submitDeficiencyPortalResponse}>Resubmit to TO</Button>
          </>
        )}
      >
        {activeDeficiencyAppId && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">Provide updated drawings/documents and correction notes addressing all TO remarks.</p>
            <input
              type="file"
              multiple
              onChange={(e) => appendDraftDocuments(setDeficiencyDocsDraft, e.target.files)}
              aria-label="Upload technical correction documents"
              className="w-full rounded-lg border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {deficiencyDocsDraft.length > 0 && (
              <div className="space-y-2">
                {deficiencyDocsDraft.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="text-xs text-slate-700">{doc.name}</p>
                    <Button size="sm" variant="secondary" onClick={() => removeDraftDocument(setDeficiencyDocsDraft, doc.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              rows={4}
              value={deficiencyCommentDraft}
              onChange={(e) => setDeficiencyCommentDraft(e.target.value)}
              aria-label="Technical correction notes"
              className="w-full rounded-lg border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe what was corrected and where supporting evidence is attached"
            />
          </div>
        )}
      </Modal>

      <PaymentModal
        open={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedFeeApp(null);
          setSelectedAppId(null);
        }}
        applicationFee={selectedFeeApp?.inspectionFee || 2500}
        applicationId={selectedAppId || ''}
        onPaymentSuccess={onInspectionFeePaidOnline}
      />

      {showPermitExtensionFlowModal && selectedPermitAppId && (
        <Modal
          open={showPermitExtensionFlowModal}
          onClose={() => {
            setShowPermitExtensionFlowModal(false);
            setExtensionPaymentError('');
          }}
          title={`Permit Extension - ${selectedPermitAppId}`}
          size="lg"
          footer={(
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowPermitExtensionFlowModal(false);
                  setExtensionPaymentError('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={proceedPermitExtension}>Proceed to Pay</Button>
            </>
          )}
        >
          {(() => {
            const permit = getPermitByApplicationId(permits, selectedPermitAppId);
            if (!permit) {
              return <p className="text-sm text-red-700">Permit record not found.</p>;
            }

            const currentExpiry = permit.validUntil;
            const projected = applyPermitExtension(permit, 5000);
            const newExpiry = projected?.validUntil || currentExpiry;
            const currentYear = (permit.extensionsUsed || 0) + 1;
            const maxYears = permit.maxYears || 5;

            return (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p><strong>Current Expiry:</strong> {formatDate(currentExpiry)}</p>
                  <p><strong>Extension Period:</strong> 1 year</p>
                  <p><strong>New Expiry:</strong> {formatDate(newExpiry)}</p>
                  <p className="mt-2"><strong>Extension Fee:</strong> Rs. 5,000.00</p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <p className="font-semibold text-amber-900">Terms and Conditions</p>
                  <ul className="list-disc list-inside text-amber-800 mt-1 space-y-0.5">
                    <li>Maximum {maxYears} years total validity.</li>
                    <li>Currently in Year {currentYear} of {maxYears}.</li>
                    <li>Construction must complete before expiry.</li>
                    <li>No refunds after payment.</li>
                  </ul>
                  <p className="mt-2 text-xs text-amber-800">Survey plan approvals are not time-limited; this extension flow applies only to issued building permits.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
                  <select
                    value={extensionPaymentMethod}
                    onChange={(e) => {
                      setExtensionPaymentMethod(e.target.value);
                      setExtensionPaymentError('');
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="online">Online payment (card/bank transfer)</option>
                    <option value="bank">Bank payment (upload receipt)</option>
                    <option value="counter">PS counter payment (upload receipt)</option>
                  </select>
                </div>

                {(extensionPaymentMethod === 'bank' || extensionPaymentMethod === 'counter') && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={extensionReceiptRef}
                      onChange={(e) => setExtensionReceiptRef(e.target.value)}
                      placeholder="Receipt/reference number"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      onChange={(e) => setExtensionReceiptFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                    <p className="text-xs text-slate-500">Upload proof for bank/counter payment before proceeding.</p>
                  </div>
                )}

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={extensionAgreeTerms}
                    onChange={(e) => setExtensionAgreeTerms(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  I agree to terms and conditions
                </label>
            {extensionPaymentError && <p className="text-xs text-red-700">{extensionPaymentError}</p>}
              </div>
            );
          })()}
        </Modal>
      )}

      <PaymentModal
        open={showPermitExtensionPayment}
        onClose={() => {
          setShowPermitExtensionPayment(false);
          setSelectedPermitAppId(null);
        }}
        applicationFee={5000}
        onPaymentSuccess={onPermitExtensionPaid}
      />

      <PaymentModal
        open={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedFeeApp(null);
          setSelectedAppId(null);
        }}
        applicationFee={selectedFeeApp?.inspectionFee || 2500}
        applicationId={selectedAppId || ''}
        onPaymentSuccess={onInspectionFeePaidOnline}
      />

      <Modal
        open={showPaymentChoiceModal}
        onClose={() => setShowPaymentChoiceModal(false)}
        title="Select Payment Method"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">Choose how you would like to pay the {paymentFlowContext.type === 'coc' ? 'COC' : 'inspection'} fee of <strong>{formatCurrencyLKR(selectedFeeApp?.inspectionFee || 0)}</strong>.</p>
          
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => {
                setShowPaymentChoiceModal(false);
                setShowPaymentModal(true);
              }}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 group-hover:text-blue-700">Online Payment</p>
                  <p className="text-xs text-slate-500">Credit/Debit Card, Immediate verification</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setShowPaymentChoiceModal(false);
                setOfflinePaymentChannel('bank');
                setShowOfflinePaymentModal(true);
              }}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 group-hover:text-blue-700">Bank Transfer</p>
                  <p className="text-xs text-slate-500">Upload bank slip/receipt for manual verification</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setShowPaymentChoiceModal(false);
                setOfflinePaymentChannel('counter');
                setShowOfflinePaymentModal(true);
              }}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 group-hover:text-blue-700">Municipal Counter</p>
                  <p className="text-xs text-slate-500">Pay cash at PS counter and upload receipt</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </Modal>

      {showOfflinePaymentModal && selectedFeeApp && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Submit Payment Receipt</h3>
                <p className="text-sm text-slate-600 mt-1">{selectedFeeApp.id} - {selectedFeeApp.type}</p>
              </div>
              <button
                type="button"
                onClick={closeOfflinePaymentModal}
                aria-label="Close offline payment modal"
                className="text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md px-2 py-1"
              >
                Close
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm text-slate-700">Inspection Fee: <strong>{selectedFeeApp.inspectionFee ? `LKR ${selectedFeeApp.inspectionFee.toLocaleString()}` : 'Not available'}</strong></p>
              <p className="text-xs text-slate-600 mt-1">Upload payment proof for Planning Officer verification.</p>
            </div>

            <div>
              <label htmlFor="offline-payment-channel" className="block text-sm font-medium text-slate-700 mb-2">Payment Channel</label>
              <select
                id="offline-payment-channel"
                value={offlinePaymentChannel}
                onChange={(e) => setOfflinePaymentChannel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="bank">Bank Transfer</option>
                <option value="counter">Municipal Counter Payment</option>
              </select>
            </div>

            <div>
              <label htmlFor="offline-payment-reference" className="block text-sm font-medium text-slate-700 mb-2">Reference Number (Optional)</label>
              <input
                id="offline-payment-reference"
                type="text"
                value={offlinePaymentRef}
                onChange={(e) => setOfflinePaymentRef(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Bank transfer reference or counter receipt no"
              />
            </div>

            <div>
              <label htmlFor="offline-payment-receipt" className="block text-sm font-medium text-slate-700 mb-2">Upload Receipt (PDF/JPG/PNG, max 10MB)</label>
              <input
                id="offline-payment-receipt"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setOfflinePaymentFile(file);
                  setOfflinePaymentError('');
                }}
                aria-label="Upload payment receipt"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {offlinePaymentError && <p className="text-xs text-red-600">{offlinePaymentError}</p>}

            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={closeOfflinePaymentModal}>Cancel</Button>
              <Button onClick={submitOfflinePaymentProof}>Submit Receipt</Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={appealPrompt.open}
        onClose={() => {
          setAppealPrompt({ open: false, appId: null, value: '', error: '' });
          setAppealSpecialCircumstances('');
          setAppealAcknowledgements({ addressedAll: false, understandsWorkflow: false });
          setAppealCorrectedUploads({});
          setAppealAdditionalUploads([]);
        }}
        title={appealTarget ? `Submit Appeal - ${appealTarget.id}` : 'Submit Appeal'}
        size="xl"
        footer={(
          <div className="w-full flex flex-col md:flex-row md:items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setAppealPrompt({ open: false, appId: null, value: '', error: '' });
                setAppealSpecialCircumstances('');
                setAppealAcknowledgements({ addressedAll: false, understandsWorkflow: false });
                setAppealCorrectedUploads({});
                setAppealAdditionalUploads([]);
              }}
            >
              Cancel
            </Button>
            <Button onClick={submitAppeal}>Submit Appeal</Button>
          </div>
        )}
      >
        {appealTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Corrections Required</p>
              <p className="text-sm text-amber-800 mt-1">{appealRequirements.finalNote}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Application Reference</p>
                <p className="font-semibold text-slate-900">{appealTarget.id}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Application Type</p>
                <p className="font-semibold text-slate-900">{appealTarget.type}</p>
              </div>
            </div>

            {appealRequirements.requiredActions.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">Required Actions</p>
                <ol className="list-decimal list-inside mt-2 text-sm text-slate-700 space-y-1">
                  {appealRequirements.requiredActions.map((action, index) => (
                    <li key={`${appealTarget.id}-appeal-action-${index}`}>{action}</li>
                  ))}
                </ol>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Appeal Summary</p>
              <textarea
                rows={4}
                value={appealPrompt.value}
                onChange={(e) => setAppealPrompt((prev) => ({ ...prev, value: e.target.value, error: '' }))}
                className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe corrections made and clarifications for committee review"
              />
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Appeal Category</p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="appealCategory"
                    value="documents"
                    checked={appealCategory === 'documents'}
                    onChange={(e) => setAppealCategory(e.target.value)}
                    className="h-4 w-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  />
                  Document corrections only
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="appealCategory"
                    value="plans"
                    checked={appealCategory === 'plans'}
                    onChange={(e) => setAppealCategory(e.target.value)}
                    className="h-4 w-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  />
                  New or revised plans
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Original Documents (View Only)</p>
              <div className="space-y-2">
                {(appealTarget.documentMeta || []).length === 0 && (
                  <p className="text-sm text-slate-500">No original document metadata available.</p>
                )}
                {(appealTarget.documentMeta || []).map((doc) => (
                  <div key={`${appealTarget.id}-original-${doc.id}`} className="rounded border border-slate-200 bg-slate-100 p-2 text-xs text-slate-600">
                    {doc.label || doc.id} - {doc.customName || doc.fileName || 'No file name'}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Corrected Documents (Version {(appealDrafts[appealTarget.id]?.history?.length || 0) + 2})</p>
              {appealRequirements.requiredDocuments.length === 0 && (
                <p className="text-xs text-slate-500">Committee did not specify mandatory document uploads. Add relevant corrected files if needed.</p>
              )}
              {appealRequirements.requiredDocuments.map((doc) => (
                <div key={`${appealTarget.id}-required-doc-${doc.id}`} className="rounded border border-slate-200 p-2 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">{doc.label}{doc.required !== false ? ' *' : ''}</p>
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file) updateAppealCorrectedUpload(doc, file);
                    }}
                    className="w-full text-xs"
                  />
                  {appealCorrectedUploads[doc.id] && (
                    <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded p-2">
                      <span>{appealCorrectedUploads[doc.id].fileName}</span>
                      <Button size="sm" variant="secondary" onClick={() => removeAppealCorrectedUpload(doc.id)}>Replace</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Additional Documents (Optional)</p>
              <input
                type="file"
                multiple
                onChange={(e) => appendAppealAdditionalUploads(e.target.files)}
                className="w-full text-xs"
              />
              {appealAdditionalUploads.length > 0 && (
                <div className="space-y-2">
                  {appealAdditionalUploads.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                      <span>{doc.fileName}</span>
                      <Button size="sm" variant="secondary" onClick={() => removeAppealAdditionalUpload(doc.id)}>Remove</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold text-slate-800">Special Circumstances (Optional, max 500 chars)</p>
              <textarea
                rows={3}
                maxLength={500}
                value={appealSpecialCircumstances}
                onChange={(e) => setAppealSpecialCircumstances(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional: Explain any special situation or urgency related to your corrections (e.g., why there was a delay, what was fixed now, and why faster review is needed). Example: 'Architect was unavailable and revised plans were delayed. Updated certified plans are now uploaded. Request expedited review due to project timeline.'"
              />
              <p className="text-xs text-slate-500">{appealSpecialCircumstances.length}/500</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={appealAcknowledgements.addressedAll}
                  onChange={(e) => setAppealAcknowledgements((prev) => ({ ...prev, addressedAll: e.target.checked }))}
                  className="h-4 w-4"
                />
                I confirm that I have addressed all committee concerns.
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={appealAcknowledgements.understandsWorkflow}
                  onChange={(e) => setAppealAcknowledgements((prev) => ({ ...prev, understandsWorkflow: e.target.checked }))}
                  className="h-4 w-4"
                />
                I understand this appeal follows the same review workflow.
              </label>
            </div>

            {appealSpecialCircumstances.trim() && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
                Special circumstance included: this will be visible to Planning Officer, TO (if routed), and Committee.
              </div>
            )}

            {appealPrompt.error && (
              <p className="text-xs text-red-600">{appealPrompt.error}</p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={agreementConfirm.open}
        title="Confirm Physical Agreement"
        message="Confirm that the physical non-indemnification agreement has been signed and received at the office."
        confirmLabel="Record Agreement"
        onCancel={() => setAgreementConfirm({ open: false, row: null })}
        onConfirm={confirmAgreementRecord}
      />
      <CorrectionPortalModal
        open={showCorrectionPortal}
        onClose={() => {
          setShowCorrectionPortal(false);
          setSelectedCorrectionApp(null);
        }}
        application={selectedCorrectionApp}
        onSuccess={loadLiveApplicationData}
      />
      <InvestigationPortalModal
        open={showInvestigationPortal}
        onClose={() => {
          setShowInvestigationPortal(false);
          setSelectedInvestigationApp(null);
        }}
        application={selectedInvestigationApp}
        onSuccess={loadLiveApplicationData}
      />
    </div>
  );
};

export default Applications;
