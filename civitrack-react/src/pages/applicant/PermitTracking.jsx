import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import PaymentModal from '../../components/ui/PaymentModal.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { loadPlanningQueue } from '../../data/planningWorkflowStore';
import {
  applyPermitExtension,
  canExtendPermit,
  getPermitDaysUntilExpiry,
  isBuildingPermit,
  isPermitExpired,
  loadPermitWorkflow,
  savePermitWorkflow,
} from '../../data/permitWorkflowStore';
import { formatApplicationCode } from '../../utils/applicationCode';
import { formatDate, formatDateTime } from '../../utils/locale';

const COMMITTEE_DECISION_OUTCOMES_KEY = 'committee_decision_outcomes';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const toIso = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const plusYearsIso = (iso, years = 1) => {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return toIso();
  return new Date(base.getTime() + years * 365 * 24 * 60 * 60 * 1000).toISOString();
};

const getPermitStatus = (permit) => {
  if (!isBuildingPermit(permit)) {
    return { tone: 'info', label: 'Plan Approval Issued' };
  }

  if (isPermitExpired(permit)) {
    return canExtendPermit(permit)
      ? { tone: 'warning', label: 'Expired - Extendable' }
      : { tone: 'danger', label: 'Expired - New Application Required' };
  }

  const days = getPermitDaysUntilExpiry(permit);
  if (typeof days === 'number' && days <= 30) {
    return { tone: 'warning', label: 'Expiring Soon' };
  }

  return { tone: 'success', label: 'Active' };
};

const PermitTracking = () => {
  const { user } = useAuth();
  const { success } = useNotifications();
  const [permits, setPermits] = useState([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const persistApplicantPermits = (nextApplicantPermits) => {
    const current = loadPermitWorkflow();
    const applicantEmail = normalizeEmail(user?.email);
    const applicantCodes = new Set(nextApplicantPermits.map((row) => formatApplicationCode(row.applicationId || row.applicationCode)));

    const retained = current.filter((row) => {
      const rowCode = formatApplicationCode(row.applicationId || row.applicationCode);
      const rowEmail = normalizeEmail(row.applicantEmail);
      const belongsToApplicant = (applicantEmail && rowEmail === applicantEmail) || applicantCodes.has(rowCode);
      return !belongsToApplicant;
    });

    savePermitWorkflow([...retained, ...nextApplicantPermits]);
  };

  useEffect(() => {
    const applicantEmail = normalizeEmail(user?.email);
    if (!applicantEmail) {
      setPermits([]);
      return;
    }

    const storedPermits = loadPermitWorkflow();
    const permitByCode = new Map(
      storedPermits.map((permit) => [formatApplicationCode(permit.applicationCode || permit.applicationId), permit])
    );

    const planningRows = loadPlanningQueue([]);
    const applicantRows = planningRows.filter((row) => normalizeEmail(row.applicantEmail) === applicantEmail);

    let outcomes = {};
    try {
      outcomes = JSON.parse(localStorage.getItem(COMMITTEE_DECISION_OUTCOMES_KEY) || '{}');
    } catch {
      outcomes = {};
    }

    const approvedRows = applicantRows.filter((row) => {
      const outcome = outcomes?.[row.id];
      const outcomeApproved = outcome?.decision === 'approved';
      return row.status === 'approved' || row.status === 'issued' || row.status === 'completed' || outcomeApproved;
    });

    const applicantPermits = approvedRows.map((row) => {
      const appCode = formatApplicationCode(row.id);
      const existing = permitByCode.get(appCode) || {};
      const buildingPermit = isBuildingPermit(row.type || existing.type);
      const issuedAt = existing.issuedAt || toIso(row.prelimVerifiedAt || row.paymentVerifiedAt || row.submittedAt || row.date);

      return {
        ...existing,
        applicationId: appCode,
        applicationCode: appCode,
        applicantEmail,
        type: row.type || existing.type || 'Permit Application',
        issuedAt,
        validUntil: buildingPermit ? (existing.validUntil || plusYearsIso(issuedAt, 1)) : null,
        permitCollected: existing.permitCollected ?? true,
        extensionsUsed: buildingPermit ? (existing.extensionsUsed || 0) : 0,
        extensionHistory: buildingPermit ? (Array.isArray(existing.extensionHistory) ? existing.extensionHistory : []) : [],
        maxYears: buildingPermit ? (existing.maxYears || 5) : 0,
      };
    });

    setPermits(applicantPermits);
    persistApplicantPermits(applicantPermits);
  }, [user?.email]);

  const stats = useMemo(() => {
    const total = permits.length;
    const buildingPermits = permits.filter((permit) => isBuildingPermit(permit));
    const approvedPlans = permits.filter((permit) => !isBuildingPermit(permit)).length;
    const expired = buildingPermits.filter((permit) => isPermitExpired(permit)).length;
    const expiringSoon = permits.filter((permit) => {
      if (!isBuildingPermit(permit)) return false;
      const days = getPermitDaysUntilExpiry(permit);
      return typeof days === 'number' && days >= 0 && days <= 30;
    }).length;
    const extendable = buildingPermits.filter((permit) => canExtendPermit(permit)).length;
    return { total, expired, expiringSoon, extendable, approvedPlans };
  }, [permits]);

  const selectedPermit = permits.find((permit) => permit.applicationId === selectedApplicationId) || null;

  const requestExtension = (applicationId) => {
    setSelectedApplicationId(applicationId);
    setShowPaymentModal(true);
  };

  const handleExtensionPaid = () => {
    if (!selectedApplicationId) return;

    const next = permits.map((permit) => (
      permit.applicationId === selectedApplicationId
        ? applyPermitExtension(permit, 5000)
        : permit
    ));

    setPermits(next);
    persistApplicantPermits(next);
    success(`Permit for ${selectedApplicationId} extended by one year.`);
    setShowPaymentModal(false);
    setSelectedApplicationId(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Permit Tracking</h1>
        <p className="text-sm text-slate-500">Monitor validity periods, extension eligibility, and permit history.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Total Records</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4">
          <p className="text-xs font-medium text-blue-600">Expiring in 30 Days</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{stats.expiringSoon}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <p className="text-xs font-medium text-amber-700">Expired</p>
          <p className="text-2xl font-bold text-amber-800 mt-1">{stats.expired}</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <p className="text-xs font-medium text-emerald-700">Extendable</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{stats.extendable}</p>
        </div>
        <div className="bg-white rounded-xl border border-indigo-200 p-4 md:col-span-4 lg:col-span-1">
          <p className="text-xs font-medium text-indigo-700">Approved Plans (No Permit Validity)</p>
          <p className="text-2xl font-bold text-indigo-800 mt-1">{stats.approvedPlans}</p>
        </div>
      </div>

      <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Permit Records</h2>
        </div>

        {permits.length === 0 ? (
          <p className="text-sm text-slate-500">No permits found.</p>
        ) : (
          permits.map((permit) => {
            const meta = getPermitStatus(permit);
            const days = getPermitDaysUntilExpiry(permit);
            return (
              <div key={permit.applicationId} className="rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{formatApplicationCode(permit.applicationCode || permit.applicationId)} ({permit.type})</p>
                    <p className="text-xs text-slate-500">Issued: {permit.issuedAt ? formatDate(permit.issuedAt) : 'N/A'}</p>
                  </div>
                  <StatusBadge status={meta.tone}>{meta.label}</StatusBadge>
                </div>

                {isBuildingPermit(permit) ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Valid Until</p>
                      <p className="font-semibold text-slate-800">{permit.validUntil ? formatDate(permit.validUntil) : 'N/A'}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Days Remaining</p>
                      <p className="font-semibold text-slate-800">{typeof days === 'number' ? days : 'N/A'}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">Extension Usage</p>
                      <p className="font-semibold text-slate-800">{permit.extensionsUsed || 0} / {permit.maxYears || 5}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-sm">
                    <p className="font-semibold text-indigo-900">Survey Plan Approval</p>
                    <p className="text-indigo-800">Land subdivision approvals do not have permit validity dates or extension cycles. Use the approved plan after committee approval.</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {isBuildingPermit(permit) && canExtendPermit(permit) ? (
                    <Button size="sm" onClick={() => requestExtension(permit.applicationId)}>
                      Extend Permit (LKR 5000)
                    </Button>
                  ) : isBuildingPermit(permit) ? (
                    <StatusBadge status="pending">No further extensions available</StatusBadge>
                  ) : null}
                </div>

                {isBuildingPermit(permit) && Array.isArray(permit.extensionHistory) && permit.extensionHistory.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-700 mb-2">Extension History</p>
                    <div className="space-y-1">
                      {permit.extensionHistory.map((item, index) => (
                        <p key={`${permit.applicationId}-${index}`} className="text-xs text-slate-600">
                          Year {item.year || index + 2}: {item.from ? formatDate(item.from) : 'N/A'} to {item.to ? formatDate(item.to) : 'N/A'} · Paid {item.paidAt ? formatDateTime(item.paidAt) : 'N/A'}
                        </p>
                      ))}
                    </div>
                  </div>
                  )}
              </div>
            );
          })
        )}
      </section>

      <PaymentModal
        open={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedApplicationId(null);
        }}
        applicationFee={5000}
        onPaymentSuccess={handleExtensionPaid}
      />

      {selectedPermit && (
        <p className="text-xs text-slate-500">
          Extension payment is being prepared for {selectedPermit.applicationId}.
        </p>
      )}
    </div>
  );
};

export default PermitTracking;
