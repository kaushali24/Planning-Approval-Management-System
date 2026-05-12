import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Eye } from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import PaymentModal from '../../components/ui/PaymentModal';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/locale';
import { canExtendPermit, getPermitByApplicationId, isPermitExpired } from '../../data/permitWorkflowStore';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { getStatusLabel } from '../../utils/statusLabels';
import { API_BASE_URL } from '../../utils/apiBase.js';

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

const CocRequests = () => {
  const { error, success } = useNotifications();
  const { user, token } = useAuth() || {};
  const navigate = useNavigate();
  const applicantName = useMemo(() => String(user?.full_name || user?.name || user?.fullName || 'Applicant').trim() || 'Applicant', [user]);
  const [showPreview, setShowPreview] = useState(false);
  const [showCocPaymentModal, setShowCocPaymentModal] = useState(false);
  const [selectedCoc, setSelectedCoc] = useState(null);
  const [selectedCocForPayment, setSelectedCocForPayment] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [correctionDraftByCoc, setCorrectionDraftByCoc] = useState({});
  const [declarations, setDeclarations] = useState({
    constructionComplete: false,
    readyForInspection: false,
    understandsEnforcement: false,
  });
  const [cocRequests, setCocRequests] = useState([]);
  const [permits, setPermits] = useState([]);
  const [approvedApplications, setApprovedApplications] = useState([]);
  const [isLiveDataActive, setIsLiveDataActive] = useState(false);

  const summary = useMemo(() => {
    const pendingStatuses = ['requested', 'fee-calculated', 'paid'];
    const inspectionStatuses = ['assigned-to-to', 'inspection-complete', 'reinspection-requested', 'coc-rectification-in-progress'];
    const issuedStatuses = ['coc-approved', 'coc-collected'];

    return {
      pending: cocRequests.filter((row) => pendingStatuses.includes(row.status)).length,
      inInspection: cocRequests.filter((row) => inspectionStatuses.includes(row.status)).length,
      issued: cocRequests.filter((row) => issuedStatuses.includes(row.status)).length,
    };
  }, [cocRequests]);
  const applicantEmail = String(user?.email || '').trim().toLowerCase();

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

  const loadLiveCocData = useCallback(async () => {
    if (!token) return;

    try {
      const [applicationsPayload, cocPayload] = await Promise.all([
        fetchAuthedJson(`${API_BASE}/applications?limit=100&sort=submission_date:DESC`),
        fetchAuthedJson(`${API_BASE}/coc?limit=100`),
      ]);

      const applications = applicationsPayload?.applications || [];
      const appCodeByDbId = new Map(
        applications.map((app) => [Number(app.id), app.application_code || buildFallbackApplicationCode(app.id, app.application_type)])
      );

      const permitCandidateApps = applications.filter((app) => (
        String(app.application_type || '').toLowerCase() === 'building'
        && ['approved', 'permit_approved', 'permit_collected', 'coc_pending', 'coc_issued'].includes(String(app.status || '').toLowerCase())
      ));

      const permitDetails = await Promise.all(
        permitCandidateApps.map(async (app) => {
          try {
            const permit = await fetchAuthedJson(`${API_BASE}/permits/${app.id}`);
            return {
              applicationId: app.application_code || buildFallbackApplicationCode(app.id, app.application_type),
              dbApplicationId: app.id,
              type: mapApiApplicationTypeToLabel(app.application_type),
              issuedAt: permit.issued_at || null,
              validUntil: permit.valid_until || null,
              permitCollected: !!permit.permit_collected,
              maxYears: permit.max_years || 5,
              extensionsUsed: permit.extensions_used || 0,
              extensionHistory: Array.isArray(permit.extensions)
                ? permit.extensions.map((ext) => ({
                    year: ext.extension_no,
                    paidAt: ext.approved_at || ext.created_at || null,
                    amount: ext.fee_amount || 0,
                    from: ext.previous_valid_until || null,
                    to: ext.extended_valid_until || null,
                    status: ext.payment_status || 'completed',
                  }))
                : [],
            };
          } catch {
            return null;
          }
        })
      );

      const mappedPermits = permitDetails.filter(Boolean);

      const mappedApprovedApplications = applications
        .filter((app) => ['approved', 'permit_approved', 'permit_collected', 'coc_pending', 'coc_issued'].includes(app.status))
        .map((app) => ({
          id: app.application_code || buildFallbackApplicationCode(app.id, app.application_type),
          dbId: app.id,
          type: mapApiApplicationTypeToLabel(app.application_type),
          approved: app.last_updated || app.submission_date || null,
        }));

      const mappedCocRequests = (cocPayload.cocRequests || [])
        .filter((row) => {
          // Defensive client-side scope guard in case backend filtering regresses.
          if (row.applicant_id && user?.userId) {
            return Number(row.applicant_id) === Number(user.userId);
          }
          if (applicantEmail) {
            return String(row.applicant_email || '').trim().toLowerCase() === applicantEmail;
          }
          return true;
        })
        .map((row) => ({
        id: row.id,
        cocId: row.coc_id,
        applicationId: row.application_code || appCodeByDbId.get(Number(row.application_id)) || buildFallbackApplicationCode(row.application_id, row.application_type),
        applicationDbId: row.application_id,
        type: mapApiApplicationTypeToLabel(row.application_type),
        applicant: row.applicant_name || applicantName,
        applicantEmail: row.applicant_email || applicantEmail || null,
        requestedAt: row.request_date || null,
        status: deriveCocUiStatus(row),
        backendStatus: row.status || 'requested',
        feeAmount: row.fee_amount || null,
        assignedTo: row.assigned_to || null,
        issuedDate: row.issued_at ? String(row.issued_at).slice(0, 10) : null,
        validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
        paidAt: row.paid_at || null,
        finePaidAt: row.fine_paid_at || null,
        violationReport: row.violation_report || null,
        deviationFine: row.deviation_fine || null,
        regularizationStatus: row.regularization_status || null,
        rectificationConfirmedAt: row.rectification_confirmed_at || null,
        collectedAt: row.collected_at || null,
        reinspectionRequestedAt: row.reinspection_requested_at || null,
        }));

      setPermits(mappedPermits);
      setApprovedApplications(mappedApprovedApplications);
      setCocRequests(mappedCocRequests);
      setIsLiveDataActive(true);
    } catch (loadError) {
      setIsLiveDataActive(false);
      error(`${loadError.message || 'Live COC API unavailable'}. Showing current in-memory data only.`);
    }
  }, [token, fetchAuthedJson, applicantName, applicantEmail, error, user]);

  useEffect(() => {
    if (token) {
      loadLiveCocData();
    }
  }, [token, loadLiveCocData]);

  const isPendingViolationStatus = (status) => ['coc-violations-found', 'coc-correction-required', 'coc-fine-paid-awaiting-correction', 'correction-submitted', 'reinspection-eligible', 'reinspection-requested', 'coc-fine-paid-regularization-pending', 'coc-rejected-non-rectifiable'].includes(status);

  const hasPendingViolationCase = (applicationId) => {
    return cocRequests.some((row) => (
      (
        row.applicationId === applicationId
        || (applicantEmail && String(row.applicantEmail || '').trim().toLowerCase() === applicantEmail)
      )
      && isPendingViolationStatus(row.status)
    ));
  };

  const isEligibleForNewCocRequest = (appId) => {
    const permit = getPermitByApplicationId(permits, appId);
    if (!permit) return false;
    if (!permit.permitCollected) return false;
    if (isPermitExpired(permit)) return false;
    if (hasPendingViolationCase(appId)) return false;
    return true;
  };

  const eligibleApprovedApplications = approvedApplications.filter((app) => isEligibleForNewCocRequest(app.id));

  const describeStage = (coc) => {
    if (coc.status === 'requested') return 'Waiting for Planning Section fee calculation.';
    if (coc.status === 'fee-calculated') return 'Fee entered. Please complete payment verification.';
    if (coc.status === 'paid') return 'Payment verified. Waiting for TO assignment.';
    if (coc.status === 'assigned-to-to') return `Assigned to TO${coc.assignedTo ? ` (${coc.assignedTo})` : ''}. Inspection pending.`;
    if (coc.status === 'inspection-complete') return 'Inspection complete. Waiting for Planning Committee approval.';
    if (coc.status === 'coc-violations-found') return coc.violationReport?.isFixable
      ? 'Violations found. Pay fine first, then submit corrections as instructed by TO.'
      : 'Violations are marked non-fixable by TO. Re-inspection path is not available.';
    if (coc.status === 'coc-correction-required') return 'Violations are fixable and no fine is required. Submit correction evidence as instructed by TO.';
    if (coc.status === 'coc-fine-paid-awaiting-correction') return 'Fine paid. Submit correction evidence as per TO instructions.';
    if (coc.status === 'correction-submitted') return 'Correction evidence submitted. Await TO eligibility review.';
    if (coc.status === 'reinspection-eligible') return 'TO approved corrections. You can now request re-inspection.';
    if (coc.status === 'reinspection-requested') return 'Re-inspection requested. Same Technical Officer will re-check the site.';
    if (coc.status === 'coc-fine-paid-regularization-pending') return 'Fine paid. Start a new regularization application with as-built plans.';
    if (coc.status === 'coc-rejected-non-rectifiable') return `COC rejected by TO as non-fixable. Next path: ${coc.violationReport?.nextLegalPath || 'manual review'}.`;
    if (coc.status === 'coc-approved') return 'Approved by Planning Committee. Visit Planning Section to collect the physical COC.';
    if (coc.status === 'coc-collected') return `Collected${coc.collectedAt ? ` on ${formatDate(coc.collectedAt)}` : ''}.`;
    return 'In progress.';
  };

  const getStageTimestamp = (coc) => {
    if (coc.status === 'coc-collected') return coc.collectedAt;
    if (coc.status === 'coc-approved') return coc.approvedByCommitteeAt || coc.issuedDate;
    if (coc.status === 'inspection-complete') return coc.inspectionCompletedAt;
    if (coc.status === 'coc-violations-found') return coc.violationReportedAt || coc.inspectionCompletedAt;
    if (coc.status === 'coc-correction-required') return coc.violationReportedAt || coc.inspectionCompletedAt;
    if (coc.status === 'coc-fine-paid-awaiting-correction') return coc.finePaidAt;
    if (coc.status === 'correction-submitted') return coc.correctionEvidenceSubmittedAt;
    if (coc.status === 'reinspection-eligible') return coc.correctionReviewedByTOAt;
    if (coc.status === 'reinspection-requested') return coc.reinspectionRequestedAt;
    if (coc.status === 'coc-fine-paid-regularization-pending') return coc.finePaidAt;
    if (coc.status === 'assigned-to-to') return coc.assignedAt;
    if (coc.status === 'paid') return coc.paidAt;
    if (coc.status === 'fee-calculated') return coc.feeCalculatedAt;
    return coc.requestedAt;
  };

  const handleRequestCoc = () => {
    if (!selectedApplication) {
      error('Please select an approved application.');
      return;
    }

    if (!declarations.constructionComplete || !declarations.readyForInspection || !declarations.understandsEnforcement) {
      error('Please complete all declaration checkboxes before submitting COC request.');
      return;
    }

    const appMeta = approvedApplications.find((row) => String(row.dbId) === String(selectedApplication));
    const appCode = appMeta?.id || selectedApplication;
    const permit = getPermitByApplicationId(permits, appCode);
    if (!permit) {
      error('Permit record not found for this application.');
      return;
    }
    if (!permit.permitCollected) {
      error('COC request is allowed only after permit status is Permit Collected.');
      return;
    }
    if (isPermitExpired(permit)) {
      if (canExtendPermit(permit)) {
        error('Permit has expired. Please extend permit validity before requesting COC.');
      } else {
        error('Permit has expired beyond maximum extension period. Start a new application before requesting COC.');
      }
      return;
    }

    if (hasPendingViolationCase(appCode)) {
      error('Cannot request a new COC while you have any pending violation/regularization action on your applications.');
      return;
    }

    if (cocRequests.some((row) => row.applicationId === appCode && row.status !== 'coc-collected')) {
      error('A COC workflow already exists for this application.');
      return;
    }

    const submitRequest = async () => {
      try {
        const declarationList = [
          declarations.constructionComplete ? 'construction_complete' : null,
          declarations.readyForInspection ? 'ready_for_inspection' : null,
          declarations.understandsEnforcement ? 'understands_enforcement' : null,
        ].filter(Boolean);

        if (token && appMeta?.dbId) {
          await fetchAuthedJson(`${API_BASE}/coc`, {
            method: 'POST',
            body: JSON.stringify({
              application_id: Number(appMeta.dbId),
              declarations: declarationList,
            }),
          });

          success(`COC request submitted for ${appCode}. A Technical Officer will schedule inspection.`);
          setShowModal(false);
          setSelectedApplication('');
          setDeclarations({ constructionComplete: false, readyForInspection: false, understandsEnforcement: false });
          await loadLiveCocData();
          return;
        }
      } catch (submitError) {
        error(`${submitError.message || 'Failed to submit COC request'}. Keeping local in-memory update.`);
      }

      const next = [
        ...cocRequests,
        {
          cocId: `COC-LOCAL-${Date.now()}`,
          applicationId: appCode,
          applicationDbId: appMeta?.dbId || null,
          type: appMeta?.type || 'Building Permit',
          applicant: applicantName,
          applicantEmail: applicantEmail || null,
          requestedAt: new Date().toISOString(),
          status: 'requested',
          feeAmount: null,
          assignedTo: null,
          issuedDate: null,
          validUntil: null,
          declarations: {
            ...declarations,
            acknowledgedAt: new Date().toISOString(),
          },
        },
      ];
      setCocRequests(next);
      success(`COC request submitted for ${appCode}. A Technical Officer will schedule inspection.`);
      setShowModal(false);
      setSelectedApplication('');
      setDeclarations({ constructionComplete: false, readyForInspection: false, understandsEnforcement: false });
    };

    submitRequest();
  };

  const submitCorrectionEvidence = async (cocId) => {
    const note = (correctionDraftByCoc[cocId] || '').trim();
    if (!note) {
      error('Please enter correction evidence details before submitting to TO.');
      return;
    }

    const target = cocRequests.find((row) => row.cocId === cocId);
    if (!target) return;

    if (token && target.id) {
      try {
        await fetchAuthedJson(`${API_BASE}/coc/${target.id}/corrections`, {
          method: 'POST',
          body: JSON.stringify({ evidence_note: note }),
        });
        success(`Correction evidence submitted for ${cocId}. Await TO review.`);
        await loadLiveCocData();
        return;
      } catch (submitError) {
        error(`${submitError.message || 'Failed to submit correction evidence'}. Keeping temporary in-memory update.`);
      }
    }

    const next = cocRequests.map((row) => (
      row.cocId === cocId
        ? {
            ...row,
            status: 'correction-submitted',
            correctionEvidenceNote: note,
            correctionEvidenceSubmittedAt: new Date().toISOString(),
            reinspectionEligible: false,
          }
        : row
    ));
    setCocRequests(next);
    success(`Correction evidence submitted for ${cocId}. Await TO review.`);
  };

  const requestReinspection = async (cocId) => {
    const target = cocRequests.find((row) => row.cocId === cocId);
    if (!target) return;
    if (!target.violationReport?.isFixable) {
      error('Re-inspection is not allowed. This violation was marked as non-fixable by TO.');
      return;
    }
    const fineRequired = target.violationReport?.fineRequired !== false;
    if (fineRequired && !target.finePaidAt) {
      error('Please pay the imposed fine before requesting re-inspection.');
      return;
    }
    if (!(target.correctionEvidenceSubmittedAt || target.rectificationConfirmedAt)) {
      error('Please submit correction evidence before requesting re-inspection.');
      return;
    }

    if (token && target.id) {
      try {
        await fetchAuthedJson(`${API_BASE}/coc/${target.id}/reinspection-request`, {
          method: 'POST',
        });
        success(`Re-inspection requested for ${cocId}. The same Technical Officer will inspect again.`);
        await loadLiveCocData();
        return;
      } catch (submitError) {
        error(`${submitError.message || 'Failed to request re-inspection'}. Keeping temporary in-memory update.`);
      }
    }

    const next = cocRequests.map((row) => (
      row.cocId === cocId
        ? {
            ...row,
            status: 'reinspection-requested',
            reinspectionRequestedAt: new Date().toISOString(),
          }
        : row
    ));
    setCocRequests(next);
    success(`Re-inspection requested for ${cocId}. The same Technical Officer will inspect again.`);
  };

  const handlePreview = (coc) => {
    setSelectedCoc(coc);
    setShowPreview(true);
  };

  const requestCocPayment = (coc) => {
    const isFineFlow = coc.status === 'coc-violations-found' || coc.status === 'coc-rejected-non-rectifiable';
    const fineRequired = coc.violationReport?.fineRequired !== false;
    const amount = Number(coc.feeAmount || coc.deviationFine || coc.violationReport?.fineAmount || 0);

    if (isFineFlow && !fineRequired) {
      error('No fine payment is required for this case. Please continue with correction/legal instructions.');
      return;
    }
    if ((coc.status === 'fee-calculated' || isFineFlow) && amount <= 0) {
      error('Payment amount is not available for this request.');
      return;
    }

    setSelectedCocForPayment(coc);
    setShowCocPaymentModal(true);
  };

  const onCocPaymentSuccess = () => {
    const submitPayment = async () => {
    if (!selectedCocForPayment) return;
    const isFineFlow = selectedCocForPayment.status === 'coc-violations-found' || selectedCocForPayment.status === 'coc-rejected-non-rectifiable';
    const fineRequired = selectedCocForPayment.violationReport?.fineRequired !== false;
    if (isFineFlow && !fineRequired) {
      error('No fine payment is required for this case. Payment was cancelled.');
      setShowCocPaymentModal(false);
      setSelectedCocForPayment(null);
      return;
    }

    if (token && selectedCocForPayment.id) {
      try {
        await fetchAuthedJson(`${API_BASE}/coc/${selectedCocForPayment.id}/payments`, {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(selectedCocForPayment.feeAmount || selectedCocForPayment.deviationFine || 0),
            payment_method: 'online',
            paid_at: new Date().toISOString(),
          }),
        });

        if (selectedCocForPayment.status === 'coc-violations-found') {
          if (selectedCocForPayment.violationReport?.isFixable) {
            success(`Fine payment submitted for ${selectedCocForPayment.cocId}. Submit correction evidence to continue re-inspection flow.`);
          } else {
            success(`Fine payment submitted for ${selectedCocForPayment.cocId}. Re-inspection remains closed for this non-fixable violation.`);
          }
        } else {
          success(`COC payment submitted for ${selectedCocForPayment.cocId}. Planning Section can now assign a Technical Officer.`);
        }

        setShowCocPaymentModal(false);
        setSelectedCocForPayment(null);
        await loadLiveCocData();
        return;
      } catch (submitError) {
        error(`${submitError.message || 'Failed to record COC payment'}. Keeping temporary in-memory update.`);
      }
    }

    const next = cocRequests.map((row) => (
      row.cocId === selectedCocForPayment.cocId
        ? {
            ...row,
            status: selectedCocForPayment.status === 'coc-violations-found'
              ? (selectedCocForPayment.violationReport?.isFixable ? 'coc-fine-paid-awaiting-correction' : 'coc-fine-paid-regularization-pending')
              : 'paid',
            paidAt: new Date().toISOString(),
            finePaidAt: selectedCocForPayment.status === 'coc-violations-found' ? new Date().toISOString() : row.finePaidAt,
            regularizationStatus: selectedCocForPayment.status === 'coc-violations-found'
              ? (selectedCocForPayment.violationReport?.isFixable ? 'correction-required' : 'fine-paid')
              : row.regularizationStatus,
          }
        : row
    ));
    setCocRequests(next);
    if (selectedCocForPayment.status === 'coc-violations-found') {
      if (selectedCocForPayment.violationReport?.isFixable) {
        success(`Fine payment submitted for ${selectedCocForPayment.cocId}. Submit correction evidence to continue re-inspection flow.`);
      } else {
        success(`Fine payment submitted for ${selectedCocForPayment.cocId}. Re-inspection remains closed for this non-fixable violation.`);
      }
    } else {
      success(`COC payment submitted for ${selectedCocForPayment.cocId}. Planning Section can now assign a Technical Officer.`);
    }
    setShowCocPaymentModal(false);
    setSelectedCocForPayment(null);
    };

    submitPayment();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Certificate of Compliance (COC)</h1>
          <p className="text-slate-600 mt-1">Request and manage COC for approved applications</p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          disabled={eligibleApprovedApplications.length === 0}
          className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileText size={18} />
          Request COC
        </Button>
      </div>

      {/* Summary Chips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-slate-500">Pending</p>
          <p className="text-2xl font-bold text-slate-800">{summary.pending}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-slate-500">In Inspection</p>
          <p className="text-2xl font-bold text-slate-800">{summary.inInspection}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-slate-500">Issued</p>
          <p className="text-2xl font-bold text-slate-800">{summary.issued}</p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900 mb-2">About Certificate of Compliance</h3>
        <p className="text-sm text-blue-800">
          After your application is approved, you must obtain a COC before commencing construction. 
          A Technical Officer will inspect the site to verify that construction follows the approved plans. 
          Valid for 2 years from issue date.
        </p>
      </div>

      {approvedApplications.some((app) => {
        const permit = getPermitByApplicationId(permits, app.id);
        return permit && isPermitExpired(permit) && !canExtendPermit(permit);
      }) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-red-900">Your permit has expired. You cannot apply for COC with an expired permit.</p>
          <p className="text-sm text-red-800">Please start a new application.</p>
          <Button size="sm" variant="secondary" onClick={() => navigate('/new-application')}>
            Start New Application
          </Button>
        </div>
      )}

      {eligibleApprovedApplications.length === 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-800">
            COC request is disabled because permit validity has expired beyond the maximum extension limit. Start a new application to continue.
          </p>
        </div>
      )}

      {/* COC Requests Table */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">Your COC Requests</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">COC requests table with current status and available actions</caption>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-slate-700 font-semibold">COC ID</th>
                <th scope="col" className="px-6 py-3 text-left text-slate-700 font-semibold">Application ID</th>
                <th scope="col" className="px-6 py-3 text-left text-slate-700 font-semibold">Type</th>
                <th scope="col" className="px-6 py-3 text-left text-slate-700 font-semibold">Request Date</th>
                <th scope="col" className="px-6 py-3 text-center text-slate-700 font-semibold">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-slate-700 font-semibold">Stage</th>
                <th scope="col" className="px-6 py-3 text-center text-slate-700 font-semibold">Updated</th>
                <th scope="col" className="px-6 py-3 text-center text-slate-700 font-semibold">Valid Until</th>
                <th scope="col" className="px-6 py-3 text-center text-slate-700 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cocRequests.length > 0 ? (
                cocRequests.map((coc) => (
                  <tr key={coc.cocId} className="border-b border-slate-200 hover:bg-slate-50">
                    <th scope="row" className="px-6 py-4 font-medium text-slate-900">{coc.cocId}</th>
                    <td className="px-6 py-4 text-slate-700">{coc.applicationId}</td>
                    <td className="px-6 py-4 text-slate-700">{coc.type}</td>
                    <td className="px-6 py-4 text-slate-700">{formatDate(coc.requestedAt)}</td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={coc.status}>{getStatusLabel(coc.status)}</StatusBadge>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {describeStage(coc)}
                    </td>
                    <td className="px-6 py-4 text-center text-slate-700">
                      {getStageTimestamp(coc) ? formatDate(getStageTimestamp(coc)) : '—'}
                    </td>
                    <td className="px-6 py-4 text-center text-slate-700">
                      {coc.validUntil || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2" role="group" aria-label={`Actions for COC ${coc.cocId}`}>
                        <button
                          type="button"
                          onClick={() => handlePreview(coc)}
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          aria-label={`Preview COC certificate ${coc.cocId}`}
                        >
                          <Eye size={16} />
                          <span className="text-sm">Preview</span>
                        </button>
                        {coc.status === 'coc-collected' && (
                          <span className="text-xs text-green-700 font-medium">Physical COC Collected</span>
                        )}
                        {coc.status === 'coc-approved' && (
                          <span className="text-xs text-amber-700 font-medium">Collect Physical COC First</span>
                        )}
                        {coc.status === 'fee-calculated' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => requestCocPayment(coc)}
                            disabled={Number(coc.feeAmount || 0) <= 0}
                          >
                            Pay Fee
                          </Button>
                        )}
                        {coc.status === 'coc-violations-found' && (
                          <>
                            {coc.violationReport?.toInstructions && (
                              <div className="text-[11px] text-left text-red-700 max-w-[230px]">
                                <strong>TO Instructions:</strong> {coc.violationReport.toInstructions}
                              </div>
                            )}
                            {coc.violationReport?.fineRequired !== false ? (
                              <Button size="sm" onClick={() => requestCocPayment({ ...coc, feeAmount: coc.deviationFine || coc.violationReport?.fineAmount || 0 })}>
                                Pay Fine
                              </Button>
                            ) : (
                              <span className="text-xs text-blue-700 font-medium">No fine required. Submit correction evidence below.</span>
                            )}
                          </>
                        )}
                        {coc.status === 'coc-correction-required' && (
                          <div className="flex flex-col items-center gap-2">
                            <textarea
                              aria-label={`Correction evidence for ${coc.cocId}`}
                              rows={3}
                              value={correctionDraftByCoc[coc.cocId] || coc.correctionEvidenceNote || ''}
                              onChange={(e) => setCorrectionDraftByCoc((prev) => ({ ...prev, [coc.cocId]: e.target.value }))}
                              className="w-56 rounded border border-slate-300 p-2 text-xs"
                              placeholder="Describe corrections made and uploaded evidence references"
                            />
                            <Button size="sm" onClick={() => submitCorrectionEvidence(coc.cocId)}>
                              Submit Correction Evidence
                            </Button>
                          </div>
                        )}
                        {coc.status === 'coc-fine-paid-awaiting-correction' && (
                          <div className="flex flex-col items-center gap-2">
                            <textarea
                              aria-label={`Correction evidence for ${coc.cocId}`}
                              rows={3}
                              value={correctionDraftByCoc[coc.cocId] || coc.correctionEvidenceNote || ''}
                              onChange={(e) => setCorrectionDraftByCoc((prev) => ({ ...prev, [coc.cocId]: e.target.value }))}
                              className="w-56 rounded border border-slate-300 p-2 text-xs"
                              placeholder="Describe corrections made and uploaded evidence references"
                            />
                            <Button size="sm" onClick={() => submitCorrectionEvidence(coc.cocId)}>
                              Submit Correction Evidence
                            </Button>
                          </div>
                        )}
                        {coc.status === 'correction-submitted' && (
                          <Button size="sm" onClick={() => requestReinspection(coc.cocId)}>
                            Request Re-Inspection
                          </Button>
                        )}
                        {coc.status === 'reinspection-eligible' && (
                          <Button size="sm" onClick={() => requestReinspection(coc.cocId)}>
                            Request Re-Inspection
                          </Button>
                        )}
                        {coc.status === 'coc-fine-paid-regularization-pending' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const params = new URLSearchParams({
                                type: 'regularization',
                                cocViolationRef: coc.cocId,
                                originalApplicationId: coc.applicationId,
                              });
                              navigate(`/new-application?${params.toString()}`);
                            }}
                          >
                            Start New Application (As-Built)
                          </Button>
                        )}
                        {coc.status === 'coc-rejected-non-rectifiable' && (
                          <div className="flex flex-col items-center gap-2">
                            {coc.violationReport?.nextLegalPath === 'new-application' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const params = new URLSearchParams({ type: 'regularization', cocViolationRef: coc.cocId, originalApplicationId: coc.applicationId });
                                  navigate(`/new-application?${params.toString()}`);
                                }}
                              >
                                Start New Application
                              </Button>
                            )}
                            {coc.violationReport?.nextLegalPath === 'appeal' && (
                              <Button size="sm" variant="secondary" onClick={() => navigate('/applications')}>
                                Proceed to Appeal
                              </Button>
                            )}
                            {coc.violationReport?.nextLegalPath === 'manual-enforcement' && (
                              <span className="text-xs text-red-700 font-medium">Contact Planning Section for enforcement actions</span>
                            )}
                            {coc.violationReport?.fineRequired !== false && (
                              <Button size="sm" onClick={() => requestCocPayment({ ...coc, feeAmount: coc.deviationFine || coc.violationReport?.fineAmount || 0 })}>
                                Pay Fine
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      {coc.status === 'coc-violations-found' && (
                        <p className="text-[11px] text-red-700 mt-2 text-center">
                          Fine is final and non-appealable. Follow TO instructions. Re-inspection is allowed only for fixable violations.
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="px-6 py-8 text-center text-slate-500">
                    No COC requests yet. Request COC for your approved applications.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request COC Modal */}
      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setDeclarations({ constructionComplete: false, readyForInspection: false, understandsEnforcement: false });
        }}
        title="Request Certificate of Compliance"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-slate-600">
            Select an approved application to request COC inspection and certificate issuance.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Approved Application *
            </label>
            <select
              value={selectedApplication}
              onChange={(e) => setSelectedApplication(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Application --</option>
              {eligibleApprovedApplications.map(app => (
                <option key={app.dbId || app.id} value={app.dbId || app.id}>
                  {app.id} - {app.type} (Approved: {formatDate(app.approved)})
                </option>
              ))}
            </select>
          </div>

          {!isLiveDataActive && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                Live backend sync is currently unavailable. COC changes in this view are temporary until API connectivity is restored.
              </p>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> A Technical Officer will schedule a site inspection to verify 
              compliance with approved plans before issuing the COC.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-slate-800">Declaration (Required)</p>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={declarations.constructionComplete}
                onChange={(e) => setDeclarations((prev) => ({ ...prev, constructionComplete: e.target.checked }))}
                className="mt-1 h-4 w-4"
              />
              Construction is complete as per approved plans.
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={declarations.readyForInspection}
                onChange={(e) => setDeclarations((prev) => ({ ...prev, readyForInspection: e.target.checked }))}
                className="mt-1 h-4 w-4"
              />
              Building is ready for inspection.
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={declarations.understandsEnforcement}
                onChange={(e) => setDeclarations((prev) => ({ ...prev, understandsEnforcement: e.target.checked }))}
                className="mt-1 h-4 w-4"
              />
              I understand that violations will result in fines or demolition actions.
            </label>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              No document re-upload is required. This COC request automatically links your approved plan set,
              deed, assessment records, and relevant clearances from the original application.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setDeclarations({ constructionComplete: false, readyForInspection: false, understandsEnforcement: false });
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button onClick={handleRequestCoc} className="flex-1">
              Submit Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* COC Preview Modal */}
      <Modal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title="Certificate of Compliance Preview"
        size="lg"
      >
        {selectedCoc && (
          <div className="space-y-6">
            {/* COC Document Preview */}
            <div className="border-2 border-slate-300 rounded-lg p-8 bg-white">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800">
                  KELANIYA PRADESHIYA SABHA
                </h2>
                <p className="text-lg font-semibold text-slate-700 mt-2">
                  Certificate of Compliance
                </p>
              </div>

              <div className="border-t border-b border-slate-200 py-4 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600">Certificate No:</p>
                    <p className="font-semibold text-slate-800">{selectedCoc.cocId}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Application ID:</p>
                    <p className="font-semibold text-slate-800">{selectedCoc.applicationId}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Issue Date:</p>
                    <p className="font-semibold text-slate-800">{selectedCoc.issuedDate || 'Pending'}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Valid Until:</p>
                    <p className="font-semibold text-slate-800">{selectedCoc.validUntil}</p>
                  </div>
                </div>
              </div>

              {(selectedCoc.status === 'coc-violations-found' || selectedCoc.violationReport) && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-semibold text-red-900 mb-2">Violation Details</h3>
                  <div className="space-y-1 text-sm text-red-800">
                    <p><strong>Deviation Type:</strong> {selectedCoc.violationReport?.deviationType || 'Not specified'}</p>
                    <p><strong>Fine Amount:</strong> LKR {selectedCoc.violationReport?.fineAmount || selectedCoc.deviationFine || 0}</p>
                    <p><strong>Remarks:</strong> {selectedCoc.violationReport?.comments || 'No additional remarks provided.'}</p>
                    <p><strong>Fixable:</strong> {selectedCoc.violationReport?.isFixable ? 'Yes' : 'No'}</p>
                    <p><strong>TO Instructions:</strong> {selectedCoc.violationReport?.toInstructions || 'No instructions provided.'}</p>
                    {!selectedCoc.violationReport?.isFixable && (
                      <p><strong>Next Legal Path:</strong> {selectedCoc.violationReport?.nextLegalPath || 'manual-enforcement'}</p>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-medium text-red-700">Fine is final and non-appealable.</p>
                </div>
              )}

              <div className="space-y-4 text-sm text-slate-700">
                <p>
                  This certifies that the construction plans for <strong>{selectedCoc.type}</strong> 
                  have been inspected and found to be in compliance with approved building regulations 
                  and subdivision guidelines.
                </p>
                <p>
                  The holder is authorized to commence construction as per the approved plans.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs text-slate-600">Authorized Signatory</p>
                    <p className="font-semibold text-slate-800 mt-1">Planning Officer</p>
                  </div>
                  <div className="text-right">
                    <div className="w-32 h-16 border-b border-slate-400"></div>
                    <p className="text-xs text-slate-600 mt-1">Official Seal</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowPreview(false)} className="flex-1">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <PaymentModal
        open={showCocPaymentModal}
        onClose={() => {
          setShowCocPaymentModal(false);
          setSelectedCocForPayment(null);
        }}
        applicationFee={selectedCocForPayment?.feeAmount || 0}
        onPaymentSuccess={onCocPaymentSuccess}
      />
    </div>
  );
};

export default CocRequests;
