import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  Info,
  FileText,
  Clock,
  IdCard,
  Copy,
  Plus,
  Activity,
  Bell,
} from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge';
import PaymentModal from '../../components/ui/PaymentModal.jsx';
import CorrectionPortalModal from '../../components/applicant/CorrectionPortalModal.jsx';
import {
  canExtendPermit,
  getPermitDaysUntilExpiry,
  isPermitExpired,
  isBuildingPermit,
} from '../../data/permitWorkflowStore';
import { formatDate, formatDateTime } from '../../utils/locale';
import { formatApplicationCode } from '../../utils/applicationCode';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { API_BASE_URL, SIMPLE_API_BASE_URL } from '../../utils/apiBase.js';

const APPLICANT_FINE_NOTIFICATIONS_KEY = 'applicant_fine_notifications';
const API_BASE = `${API_BASE_URL}/api`;

const mapApiApplicationTypeToLabel = (applicationType) => (
  applicationType === 'subdivision' ? 'Land Subdivision' : 'Building Permit'
);

const getApplicationCodePrefix = (applicationType) => (
  String(applicationType || '').toLowerCase() === 'subdivision' ? 'SV' : 'BD'
);

const buildFallbackApplicationCode = (id, applicationType) => (
  `${getApplicationCodePrefix(applicationType)}/${new Date().getFullYear()}/${String(id || '').padStart(5, '0')}`
);

const deriveCocUiStatus = (row) => {
  const backendStatus = row.status || 'requested';
  const violationReport = row.violation_report || null;
  const isFixable = violationReport?.isFixable !== false;
  const fineRequired = violationReport?.fineRequired !== false;

  if (backendStatus === 'coc-violations-found') {
    if (!isFixable) return 'coc-rejected-non-rectifiable';
    if (!fineRequired) return 'coc-correction-required';
    return 'coc-violations-found';
  }

  if (backendStatus === 'coc-rectification-in-progress') {
    if (row.reinspection_requested_at) return 'reinspection-requested';
    if (row.rectification_confirmed_at) return 'correction-submitted';
    if (row.fine_paid_at) return 'coc-fine-paid-awaiting-correction';
    return 'coc-correction-required';
  }

  return backendStatus;
};

const loadFineNotifications = (email) => {
  try {
    const raw = localStorage.getItem(APPLICANT_FINE_NOTIFICATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!email) return [];
    return Array.isArray(parsed[email]) ? parsed[email] : [];
  } catch {
    return [];
  }
};

const saveFineNotifications = (email, notifications) => {
  if (!email) return;
  try {
    const raw = localStorage.getItem(APPLICANT_FINE_NOTIFICATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[email] = notifications;
    localStorage.setItem(APPLICANT_FINE_NOTIFICATIONS_KEY, JSON.stringify(parsed));
  } catch {
    // no-op for local storage failures
  }
};

const Dashboard = () => {
  const { success, warning } = useNotifications();
  const { user, token } = useAuth();
  const [draft, setDraft] = useState(null);
  const [applications, setApplications] = useState([]);
  const [cocRequests, setCocRequests] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [permits, setPermits] = useState([]);
  const [fineNotifications, setFineNotifications] = useState([]);
  const [selectedFineCocId, setSelectedFineCocId] = useState(null);
  const [showFinePayment, setShowFinePayment] = useState(false);
  const [showCorrectionPortal, setShowCorrectionPortal] = useState(false);
  const [selectedCorrectionApp, setSelectedCorrectionApp] = useState(null);
  const [isLiveDataActive, setIsLiveDataActive] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const applicantEmail = String(user?.email || '').trim().toLowerCase();
  const applicantRefId = useMemo(() => {
    const u = user || {};
    const raw = u.externalId ?? u.applicantId ?? u.applicant_id ?? u.applicant_ref_id;
    const s = raw != null ? String(raw).trim() : '';
    return s.length ? s : null;
  }, [user]);
  const buildingPermits = useMemo(() => permits.filter((permit) => isBuildingPermit(permit)), [permits]);

  const copyApplicantRef = useCallback(async () => {
    if (!applicantRefId) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(applicantRefId);
        success('Applicant reference copied to clipboard.');
        return;
      }
      warning('Copy is not supported in this browser. Please select the reference and copy manually.');
    } catch {
      warning('Could not copy to clipboard.');
    }
  }, [applicantRefId, success, warning]);

  const cocSummary = useMemo(() => {
    const pendingStatuses = ['requested', 'fee-calculated', 'paid'];
    const inspectionStatuses = ['assigned-to-to', 'inspection-complete', 'reinspection-requested', 'coc-rectification-in-progress'];
    const issuedStatuses = ['coc-approved', 'coc-collected'];

    return {
      pending: cocRequests.filter((row) => pendingStatuses.includes(row.status)).length,
      inInspection: cocRequests.filter((row) => inspectionStatuses.includes(row.status)).length,
      issued: cocRequests.filter((row) => issuedStatuses.includes(row.status)).length,
    };
  }, [cocRequests]);

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

  const loadDashboardData = useCallback(async () => {
    if (!token) return;

    // Prevent concurrent calls
    if (loadDashboardData._isRunning) return;
    loadDashboardData._isRunning = true;

    try {
      // Single endpoint: /api/simple/dashboard returns role-filtered apps for this applicant
      const response = await fetch(`${SIMPLE_API_BASE_URL}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const payload = await response.json();
      const appRows = payload.applications || [];

      setApplications(
        appRows.map((app) => {
          // Parse preliminary_check_data if present (for correction portal)
          let prelimData = app.preliminary_check_data;
          if (typeof prelimData === 'string') {
            try { prelimData = JSON.parse(prelimData); } catch { prelimData = {}; }
          }
          return {
            id: app.application_code || buildFallbackApplicationCode(app.id, app.application_type),
            dbId: app.id,
            type: mapApiApplicationTypeToLabel(app.application_type),
            status: app.status,
            updatedAt: app.last_updated || app.submission_date || null,
            deficientDocuments: prelimData?.deficientDocuments || [],
            deficiencyNotes: prelimData?.notes || '',
            applicationType: app.application_type,
          };
        })
      );

      // Appeals, COC, permits are managed on dedicated pages — reset these to empty
      // so downstream useMemo calls remain stable without crashing.
      setAppeals([]);
      setCocRequests([]);
      setPermits([]);
      setIsLiveDataActive(true);
    } catch (loadError) {
      console.error('Dashboard load error:', loadError);
      setIsLiveDataActive(false);
      if (loadError.message !== 'Failed to fetch') {
        warning(`${loadError.message || 'Live API unavailable'}. Dashboard is showing limited data.`);
      }
    } finally {
      loadDashboardData._isRunning = false;
    }
  }, [token, warning]);


  const applicantCocRequests = useMemo(() => {
    if (!applicantEmail) return cocRequests;
    return cocRequests.filter((row) => String(row.applicantEmail || '').trim().toLowerCase() === applicantEmail);
  }, [cocRequests, applicantEmail]);

  const fineCases = useMemo(() => {
    return applicantCocRequests
      .filter((row) => (row.status === 'coc-violations-found' || row.status === 'coc-rejected-non-rectifiable' || row.status === 'coc-fine-paid-awaiting-correction' || row.status === 'coc-fine-paid-regularization-pending'))
      .filter((row) => row.violationReport?.fineRequired !== false)
      .map((row) => ({
        cocId: row.cocId,
        applicationId: row.applicationId,
        amount: Number(row.deviationFine || row.violationReport?.fineAmount || 0),
        deviationType: row.violationReport?.deviationType || 'Violation',
        status: row.status,
        issuedAt: row.violationReportedAt || row.inspectionCompletedAt || row.requestedAt,
        paidAt: row.finePaidAt || null,
      }));
  }, [applicantCocRequests]);

  const pendingFineCases = useMemo(() => fineCases.filter((row) => !row.paidAt && row.amount > 0), [fineCases]);

  const selectedFineCase = fineCases.find((row) => row.cocId === selectedFineCocId) || null;

  useEffect(() => {
    const saved = localStorage.getItem('applicationDraft');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setDraft({
        step: parsed.currentStep ?? 1,
        type: parsed.formData?.applicationType ?? 'Draft application',
        savedAt: parsed.savedAt,
      });
    } catch (err) {
      console.error('Failed to load draft summary', err);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadDashboardData();
    }
  }, [token, loadDashboardData]);

  useEffect(() => {
    if (!applicantEmail) return;
    const current = loadFineNotifications(applicantEmail);
    const existingByCoc = new Set(current.map((item) => item.cocId));
    let next = [...current];

    pendingFineCases.forEach((fine) => {
      if (!existingByCoc.has(fine.cocId)) {
        next = [
          {
            id: `${fine.cocId}-${Date.now()}`,
            cocId: fine.cocId,
            applicationId: fine.applicationId,
            amount: fine.amount,
            message: `Fine imposed for ${fine.cocId}: LKR ${fine.amount.toLocaleString('en-LK')}. Please complete payment.`,
            createdAt: new Date().toISOString(),
            read: false,
            resolvedAt: null,
          },
          ...next,
        ];
        warning(`Fine imposed for ${fine.cocId}. Please review and pay in the Fines section.`);
      }
    });

    const resolved = next.map((item) => {
      const paid = fineCases.some((fine) => fine.cocId === item.cocId && !!fine.paidAt);
      if (paid && !item.resolvedAt) {
        return {
          ...item,
          read: true,
          resolvedAt: new Date().toISOString(),
          message: `Fine paid for ${item.cocId}. Thank you.`,
        };
      }
      return item;
    });

    const resolvedString = JSON.stringify(resolved);
    const existingNotifications = loadFineNotifications(applicantEmail);
    const existingString = JSON.stringify(existingNotifications);

    if (next.length !== current.length || resolvedString !== existingString) {
      setFineNotifications(resolved);
      saveFineNotifications(applicantEmail, resolved);
    }
  }, [applicantEmail, pendingFineCases, fineCases]);

  useEffect(() => {
    if (!applicantEmail) return;
    setFineNotifications(loadFineNotifications(applicantEmail));
  }, [applicantEmail]);

  useEffect(() => {
    if (location.hash !== '#fines-section') return;
    const section = document.getElementById('fines-section');
    if (!section) return;
    window.requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.hash]);

  const markFineNotificationsRead = () => {
    if (!applicantEmail) return;
    const next = fineNotifications.map((item) => ({ ...item, read: true }));
    setFineNotifications(next);
    saveFineNotifications(applicantEmail, next);
  };

  const requestFinePayment = (cocId) => {
    setSelectedFineCocId(cocId);
    setShowFinePayment(true);
  };

  const onFinePaymentSuccess = () => {
    const submitFinePayment = async () => {
    if (!selectedFineCocId) return;
    const selectedFine = fineCases.find((row) => row.cocId === selectedFineCocId);
    if (!selectedFine) return;

    if (token && selectedFine.id) {
      try {
        await fetchAuthedJson(`${API_BASE}/coc/${selectedFine.id}/payments`, {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(selectedFine.amount),
            payment_method: 'online',
            paid_at: new Date().toISOString(),
          }),
        });
        success(`Fine payment submitted for ${selectedFineCocId}.`);
        setShowFinePayment(false);
        setSelectedFineCocId(null);
        await loadDashboardData();
        return;
      } catch (submitError) {
        warning(submitError.message || 'Failed to submit fine payment.');
      }
    }
    warning('Fine payment API is unavailable right now.');
    setShowFinePayment(false);
    setSelectedFineCocId(null);
    };

    submitFinePayment();
  };

  const unreadFineNotifications = fineNotifications.filter((item) => !item.read && !item.resolvedAt).length;

  const reqFineExt = () => { /* no-op */ };

  const openApplicationsWithFilter = (status = 'all') => {
    const qs = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    navigate(`/applications${qs}`);
  };

  const dashboardSummary = useMemo(() => {
    const pendingReviewStatuses = ['submitted', 'payment_pending', 'under_review', 'sw_review_pending', 'committee_review'];
    const approvedStatuses = [
      'approved', 'endorsed', 'permit_approved', 'permit_collected', 'agreement_completed',
      'approved_awaiting_agreement', 'certified', 'coc_issued', 'closed', 'verified', 'accepted',
    ];
    const serverDraftCount = applications.filter((app) => app.status === 'draft').length;
    const draftCount = serverDraftCount + (draft && serverDraftCount === 0 ? 1 : 0);
    return {
      draft: draftCount,
      pendingReview: applications.filter((app) => pendingReviewStatuses.includes(app.status)).length,
      actionRequired: applications.filter((app) => app.status === 'correction').length,
      approved: applications.filter((app) => approvedStatuses.includes(app.status)).length,
    };
  }, [applications, draft]);

  const recentActivity = useMemo(() => (
    applications
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        timestamp: item.updatedAt,
        message: `${item.type} is currently ${String(item.status || 'pending').replace(/_/g, ' ')}.`,
      }))
  ), [applications]);

  const permitExpiryAlerts = useMemo(() => {
    return permits
      .map((permit) => {
        const daysRemaining = getPermitDaysUntilExpiry(permit);
        if (!permit?.validUntil) return null;
        if (typeof daysRemaining !== 'number') return null;
        if (daysRemaining > 30) return null;

        let level = 'upcoming';
        let label = 'Expires Within 30 Days';
        if (daysRemaining < 0) {
          level = 'expired';
          label = 'Expired';
        } else if (daysRemaining <= 7) {
          level = 'urgent';
          label = 'Expires Within 7 Days';
        }

        return {
          applicationId: permit.applicationId,
          type: permit.type,
          validUntil: permit.validUntil,
          daysRemaining,
          level,
          label,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aDays = typeof a.daysRemaining === 'number' ? a.daysRemaining : Number.MAX_SAFE_INTEGER;
        const bDays = typeof b.daysRemaining === 'number' ? b.daysRemaining : Number.MAX_SAFE_INTEGER;
        return aDays - bDays;
      });
  }, [permits]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* 1. WELCOME HERO */}
      <div className="bg-gradient-to-br from-indigo-900 via-blue-800 to-blue-600 rounded-3xl shadow-xl border border-blue-500/30 p-6 sm:p-10 text-white relative overflow-hidden">
        {/* Abstract background shapes */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 opacity-20 pointer-events-none">
          <svg width="400" height="400" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <path fill="#ffffff" d="M44.7,-76.4C58.8,-69.2,71.8,-59.1,81.3,-46.3C90.8,-33.5,96.8,-18.1,95.5,-3.1C94.2,11.9,85.6,26.5,75.4,39.2C65.2,51.9,53.4,62.7,39.9,70.1C26.4,77.5,11.2,81.5,-4,87.3C-19.2,93.1,-34.4,100.7,-47.9,96.3C-61.4,91.9,-73.2,75.5,-81.4,58C-89.6,40.5,-94.2,21.9,-95.1,3.2C-96,-15.5,-93.2,-34.3,-84,-49.8C-74.8,-65.3,-59.2,-77.5,-43.8,-83.4C-28.4,-89.3,-13.2,-88.9,1.1,-90.6C15.4,-92.3,30.6,-83.6,44.7,-76.4Z" transform="translate(100 100) scale(1.1)" />
          </svg>
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-extrabold font-display tracking-tight text-white drop-shadow-md">
              Welcome back, {user?.full_name || user?.name || 'Applicant'}
            </h1>
            <p className="text-blue-100 text-base sm:text-lg max-w-xl font-medium drop-shadow-sm">
              Track your development applications, respond to requests, and manage your building permits seamlessly.
            </p>
          </div>
          
          {applicantRefId && (
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shrink-0 flex items-start gap-4 shadow-2xl transition-transform hover:scale-[1.02]">
              <div className="p-3 bg-white/20 rounded-xl text-white mt-0.5 shadow-sm">
                <IdCard className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-blue-100/80 mb-1">Applicant Reference</p>
                <div className="flex items-center gap-3">
                  <p className="font-mono text-base sm:text-lg font-bold tracking-tight break-all text-white">{applicantRefId}</p>
                  <button 
                    onClick={copyApplicantRef}
                    className="p-1.5 hover:bg-white/20 rounded-md transition-colors"
                    aria-label="Copy applicant reference"
                    title="Copy reference"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* MAIN CONTENT AREA */}
        <div className="lg:col-span-8 space-y-6 lg:space-y-8">
          
          {/* STATS ROW */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => openApplicationsWithFilter('draft')}
              className="text-left bg-white rounded-2xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.1)] border border-slate-100 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-slate-50 text-slate-600">
                <FileText className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="text-3xl font-extrabold text-slate-800 tracking-tight">{dashboardSummary.draft}</p>
              <p className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">In Draft</p>
            </button>
            <button
              type="button"
              onClick={() => openApplicationsWithFilter('under-review')}
              className="text-left bg-white rounded-2xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.1)] border border-blue-100 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-blue-50 text-blue-600">
                <ClipboardList className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="text-3xl font-extrabold text-slate-800 tracking-tight">{dashboardSummary.pendingReview}</p>
              <p className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Pending Review</p>
            </button>
            <button
              type="button"
              onClick={() => openApplicationsWithFilter('correction')}
              className="text-left bg-white rounded-2xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.1)] border border-amber-100 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="text-3xl font-extrabold text-slate-800 tracking-tight">{dashboardSummary.actionRequired}</p>
              <p className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Action Required</p>
            </button>
            <button
              type="button"
              onClick={() => openApplicationsWithFilter('approved')}
              className="text-left bg-white rounded-2xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.1)] border border-emerald-100 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-emerald-50 text-emerald-600">
                <CheckCircle className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="text-3xl font-extrabold text-slate-800 tracking-tight">{dashboardSummary.approved}</p>
              <p className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Approved</p>
            </button>
          </div>

          {/* ACTION REQUIRED: CORRECTIONS */}
          {applications.some(app => app.status === 'correction') && (
            <div className="bg-white rounded-3xl shadow-md border-0 overflow-hidden ring-2 ring-amber-400 ring-offset-4 ring-offset-slate-100">
              <div className="p-5 sm:p-6 border-b border-amber-100 flex items-center gap-4 bg-gradient-to-r from-amber-50 to-white">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-xl shadow-sm">
                  <AlertCircle className="h-6 w-6" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">Corrections Needed</h2>
                  <p className="text-sm text-slate-500 font-medium mt-0.5">Please review the flagged documents below to proceed.</p>
                </div>
              </div>
              <div className="p-5 sm:p-6 space-y-4">
                {applications.filter(app => app.status === 'correction').map(app => (
                  <div key={app.id} className="border border-slate-200 rounded-2xl p-5 hover:border-amber-300 transition-colors bg-white shadow-sm hover:shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-sm font-bold text-slate-900 font-mono bg-slate-100 px-3 py-1 rounded-md border border-slate-200">{app.id}</span>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{app.type}</span>
                        </div>
                        {app.deficiencyNotes && (
                          <p className="text-sm text-slate-600 mt-2 bg-amber-50/50 p-3 rounded-lg border border-amber-100"><span className="font-semibold text-slate-800">Officer Note:</span> {app.deficiencyNotes}</p>
                        )}
                      </div>
                      <Button onClick={() => {
                         setSelectedCorrectionApp(app);
                         setShowCorrectionPortal(true);
                      }} className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white border-transparent shadow-sm">
                         Open Resubmission Portal
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {app.deficientDocuments.map((doc) => (
                        <div key={doc.id} className="flex flex-col gap-2 p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/50 transition-colors">
                          <div className="flex items-start gap-4">
                            <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-400 shrink-0 shadow-sm">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{doc.label}</p>
                              <p className="text-xs text-red-600 font-semibold mt-1 leading-relaxed">{doc.reason}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FINES & DUES */}
          {pendingFineCases.length > 0 && (
            <div className="bg-white rounded-3xl shadow-sm border border-red-200 overflow-hidden">
               <div className="p-5 sm:p-6 border-b border-red-100 flex items-center justify-between bg-red-50/80">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-100 text-red-600 rounded-xl shadow-sm">
                     <AlertCircle className="h-6 w-6" strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-red-900 tracking-tight">Pending Dues & Fines</h2>
                    <p className="text-sm text-red-700 font-medium mt-0.5">Clear these dues to avoid processing delays.</p>
                  </div>
                </div>
                <span className="bg-red-600 shadow-sm text-white text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                  {pendingFineCases.length} Due
                </span>
              </div>
              <div className="p-5 sm:p-6 space-y-4">
                {pendingFineCases.map((fine) => (
                  <div key={fine.cocId} className="rounded-2xl border border-red-100 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5 hover:shadow-md hover:border-red-200 transition-all bg-white">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-bold text-slate-900 font-mono bg-slate-100 px-2 py-1 rounded-md">{fine.cocId}</span>
                        <span className="text-xs font-medium text-slate-500">Ref: {fine.applicationId}</span>
                      </div>
                      <p className="text-sm text-red-700 font-semibold bg-red-50 inline-block px-2 py-1 rounded-md">{fine.deviationType} Violation</p>
                    </div>
                    <div className="flex flex-row sm:flex-col lg:flex-row items-center gap-4 sm:gap-3 lg:gap-5 shrink-0 justify-between">
                       <p className="text-xl font-extrabold text-slate-800 tracking-tight">LKR {fine.amount.toLocaleString('en-LK')}</p>
                       <Button onClick={() => requestFinePayment(fine.cocId)} className="bg-red-600 hover:bg-red-700 border-transparent shadow-sm">
                         Pay Now
                       </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVE APPLICATIONS TRACKING */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-slate-50/50">
               <div>
                 <h2 className="text-xl font-bold text-slate-800 tracking-tight">Active Applications</h2>
               </div>
               <Button variant="secondary" size="sm" onClick={() => navigate('/applications')} className="font-semibold">View All</Button>
            </div>
            {applications.length === 0 ? (
               <div className="p-10 text-center bg-white">
                 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-slate-400 mb-4 ring-8 ring-slate-50">
                    <FileText className="h-8 w-8" />
                 </div>
                 <p className="text-base font-bold text-slate-700">No active applications</p>
                 <p className="text-sm text-slate-500 mt-1 font-medium">Start a new application from the quick actions.</p>
               </div>
            ) : (
               <div className="divide-y divide-slate-100 bg-white">
                 {applications.slice(0, 5).map(app => (
                    <div key={app.id} className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors">
                      <div className="space-y-2">
                         <div className="flex items-center gap-3">
                           <span className="text-sm font-bold font-mono text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">{app.id}</span>
                           <StatusBadge status={app.status?.replace(/_/g, '-')}>{app.status?.replace(/_/g, ' ')}</StatusBadge>
                         </div>
                         <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase">{app.type} <span className="mx-2 opacity-50">&bull;</span> Updated {app.updatedAt ? formatDate(app.updatedAt) : 'N/A'}</p>
                      </div>
                      <Button variant="secondary" size="sm" className="shrink-0 font-semibold" onClick={() => navigate('/applications')}>Details</Button>
                    </div>
                 ))}
               </div>
            )}
          </div>

          {/* LIFECYCLE SNAPSHOT & COC */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">Compliance (COC)</h2>
                <p className="text-xs text-slate-500 mt-1 font-medium">Certificates of Compliance oversight</p>
              </div>
              <div className="space-y-3">
                 <div className="flex items-center justify-between p-4 rounded-2xl bg-blue-50/80 border border-blue-100 transition-colors hover:bg-blue-50">
                    <span className="text-sm font-bold text-blue-900">Pending Actions</span>
                    <span className="bg-blue-600 text-white font-bold px-2.5 py-1 rounded-md text-xs shadow-sm">{cocSummary.pending + cocSummary.inInspection}</span>
                 </div>
                 <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-50/80 border border-emerald-100 transition-colors hover:bg-emerald-50">
                    <span className="text-sm font-bold text-emerald-900">Issued COCs</span>
                    <span className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-md text-xs shadow-sm">{cocSummary.issued}</span>
                 </div>
              </div>
              <Button variant="secondary" className="w-full mt-2 font-semibold" onClick={() => navigate('/coc-requests')}>Manage COCs</Button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6 flex flex-col">
               <div>
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">Permit Validity</h2>
                  <p className="text-xs text-slate-500 mt-1 font-medium">Active building permit tracking</p>
               </div>
               
               <div className="flex-1 space-y-3">
                 {buildingPermits.length === 0 ? (
                    <div className="h-full flex items-center justify-center py-4">
                       <p className="text-sm text-slate-400 font-medium">No active building permits found.</p>
                    </div>
                 ) : (
                   buildingPermits.map((permit) => (
                      <div key={permit.applicationId} className="p-4 rounded-2xl border border-slate-200 flex justify-between items-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
                         <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-800 font-mono">{formatApplicationCode(permit.applicationId)}</p>
                            <p className="text-[11px] font-semibold text-slate-500 tracking-wide uppercase">Valid until: {formatDate(permit.validUntil)}</p>
                         </div>
                         <Button size="sm" variant="secondary" className="font-semibold px-4" onClick={() => navigate('/permit-tracking')}>View</Button>
                      </div>
                   ))
                 )}
               </div>
            </div>
          </div>
        </div>

        {/* SIDEBAR AREA */}
        <div className="lg:col-span-4 space-y-6 lg:space-y-8">
          
          {/* QUICK ACTIONS */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
             <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-5">Quick Actions</h2>
             <div className="space-y-3">
                <Button className="w-full justify-start py-3.5 bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg transition-all rounded-xl font-bold" onClick={() => navigate('/new-application')}>
                   <Plus className="h-5 w-5 mr-3 opacity-90" /> Start New Application
                </Button>
                <Button variant="secondary" className="w-full justify-start py-3.5 rounded-xl font-bold border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm transition-all" onClick={() => navigate('/coc-requests')}>
                   <CheckCircle className="h-5 w-5 mr-3 text-emerald-600 opacity-90" /> Request COC
                </Button>
                {draft && (
                   <Button variant="secondary" className="w-full justify-start py-3.5 rounded-xl border-blue-200 hover:border-blue-300 hover:bg-blue-100 text-blue-700 bg-blue-50 font-bold shadow-sm transition-all mt-4" onClick={() => navigate('/new-application')}>
                     <Clock className="h-5 w-5 mr-3 opacity-90" /> Resume Draft Application
                   </Button>
                )}
             </div>
          </div>

          {/* ALERTS & NOTIFICATIONS */}
          {(permitExpiryAlerts.length > 0 || unreadFineNotifications > 0) && (
             <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-500" /> Action Alerts
                  </h2>
                  {(permitExpiryAlerts.length + unreadFineNotifications) > 0 && (
                     <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                       {permitExpiryAlerts.length + unreadFineNotifications} New
                     </span>
                  )}
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                   {permitExpiryAlerts.map((alert) => (
                     <div key={`${alert.applicationId}-${alert.level}`} className={`p-4 rounded-2xl border flex items-start gap-3 shadow-sm ${alert.level === 'expired' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                        <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${alert.level === 'expired' ? 'text-red-500' : 'text-amber-500'}`} />
                        <div>
                           <p className={`text-sm font-bold mb-1 ${alert.level === 'expired' ? 'text-red-900' : 'text-amber-900'}`}>{alert.label}</p>
                           <p className="text-xs font-medium text-slate-700 leading-relaxed"><span className="font-mono bg-white/50 px-1 py-0.5 rounded mr-1">{alert.applicationId}</span> validity ends {formatDate(alert.validUntil)}.</p>
                        </div>
                     </div>
                   ))}

                   {fineNotifications.filter(n => !n.read).map((item) => (
                     <div key={item.id} className="p-4 rounded-2xl border border-red-100 bg-red-50/80 flex flex-col gap-3 shadow-sm">
                        <div className="flex items-start gap-3">
                           <Info className="h-5 w-5 shrink-0 mt-0.5 text-red-500" />
                           <p className="text-xs text-red-900 font-semibold leading-relaxed">{item.message}</p>
                        </div>
                        <div className="flex justify-end mt-1">
                           <button onClick={markFineNotificationsRead} className="text-[10px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors">Dismiss</button>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          )}

          {/* RECENT ACTIVITY */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
             <div className="p-6 sm:p-8 pb-5 border-b border-slate-100 bg-slate-50/50">
               <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-blue-500" /> Activity Log
               </h2>
               <p className="text-lg font-bold text-slate-800 tracking-tight">Recent Updates</p>
             </div>
             <div className="p-4 flex-1">
               {recentActivity.length === 0 ? (
                 <div className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 text-slate-300 mb-3">
                      <Activity className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-500">No activity to show</p>
                 </div>
               ) : (
                 <div className="space-y-1 relative">
                   <div className="absolute left-[19px] top-4 bottom-4 w-px bg-slate-100 z-0"></div>
                   {recentActivity.map((activity) => (
                     <div key={activity.id} className="p-3 hover:bg-slate-50 transition-colors rounded-2xl flex items-start gap-4 relative z-10">
                       <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-2 shrink-0 ring-4 ring-white shadow-sm" />
                       <div>
                         <p className="text-sm font-bold text-slate-800 font-mono tracking-tight">{activity.id}</p>
                         <p className="text-xs font-medium text-slate-500 leading-relaxed mt-0.5">{activity.message}</p>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">{activity.timestamp ? formatDate(activity.timestamp) : 'N/A'}</p>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
             {!isLiveDataActive && (
               <div className="p-4 border-t border-amber-200 bg-amber-50">
                  <p className="text-xs text-center text-amber-800 font-semibold flex items-center justify-center gap-2">
                    <Info className="h-4 w-4" /> Live sync unavailable
                  </p>
               </div>
             )}
          </div>

        </div>
      </div>

      <PaymentModal
        open={showFinePayment}
        onClose={() => {
          setShowFinePayment(false);
          setSelectedFineCocId(null);
        }}
        applicationFee={selectedFineCase?.amount || 0}
        onPaymentSuccess={onFinePaymentSuccess}
      />

      <CorrectionPortalModal
        open={showCorrectionPortal}
        onClose={() => {
          setShowCorrectionPortal(false);
          setSelectedCorrectionApp(null);
        }}
        application={selectedCorrectionApp}
        onSuccess={loadDashboardData}
      />
    </div>
  );
};

export default Dashboard;
