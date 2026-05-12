/**
 * PlanningOfficerDashboard.jsx — SIMPLIFIED
 *
 * view="queue"  — /api/simple/dashboard (main application pipeline)
 * view="coc"    — /api/coc-requests (full PO queue; TO list remains assignment-scoped on API)
 * view="appeals"— /api/appeals
 * view="permits"— /api/permits/planning-queue
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import {
  FileText, CheckSquare, AlertTriangle, RefreshCw,
  ClipboardList, ArrowRight, TrendingUp, Users, Search, Calendar, ChevronRight,
  PauseCircle,
} from 'lucide-react';
import { useSimpleDashboard } from '../../hooks/useSimpleDashboard';
import ApplicationTable from '../../components/shared/ApplicationTable';
import ApplicationDetailDrawer from '../../components/shared/ApplicationDetailDrawer';
import { API_BASE_URL, SIMPLE_API_BASE_URL } from '../../utils/apiBase.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

async function apiFetchJson(path, token, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(data.error || data.message || data?.error?.message || `HTTP ${res.status}`);
  }
  return data;
}

function formatDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-LK', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Stat card helper ──────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bg, border }) {
  return (
    <div className={`bg-white rounded-2xl border ${border} p-5 flex items-center gap-4 shadow-sm hover:-translate-y-0.5 transition-transform duration-200`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${bg} ${color}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{value ?? 0}</p>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  );
}

// ── PO specific actions ───────────────────────────────────────────────────────
const PO_ACTIONS_BY_STATUS = {
  submitted: [
    { label: 'Request Correction', toStatus: 'correction', requiresNote: true, variant: 'warning' },
    { label: 'Reject', toStatus: 'rejected', requiresNote: true, variant: 'danger' },
  ],
  payment_pending: [
    { label: 'Request Correction', toStatus: 'correction', requiresNote: true, variant: 'warning' },
    { label: 'Reject', toStatus: 'rejected', requiresNote: true, variant: 'danger' },
  ],
  under_review: [
    { label: 'Request Correction', toStatus: 'correction', requiresNote: true, variant: 'warning' },
    // "Assign TO" is handled via custom drawer footer
    { label: 'Send to Superintendent Manually', toStatus: 'sw_review_pending', requiresNote: false, variant: 'success' },
    { label: 'Reject', toStatus: 'rejected', requiresNote: true, variant: 'danger' },
  ],
  correction: [
    { label: 'Mark Reviewed', toStatus: 'under_review', requiresNote: false, variant: 'primary' },
  ],
};

// ── Main queue (applications pipeline) ────────────────────────────────────────
function PlanningOfficerMainQueue() {
  const { user } = useAuth();
  const { success: notifySuccess, error: notifyError } = useNotifications();
  const { applications, counts, loading, error, reload, advance, fetchDetail, authFetch } = useSimpleDashboard();

  const [selectedApp, setSelectedApp] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // TO Assignment
  const [toList, setToList] = useState([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningTo, setAssigningTo] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [feeAmount, setFeeAmount] = useState('');
  const [feeNotes, setFeeNotes] = useState('');
  const [feeSubmitting, setFeeSubmitting] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  // Fetch TO List
  useEffect(() => {
    const fetchTOs = async () => {
      try {
        const data = await authFetch('/staff/to-list');
        setToList(data.technical_officers || []);
      } catch (err) {
        console.error('Failed to fetch TO list', err);
      }
    };
    if (authFetch) fetchTOs();
  }, [authFetch]);

  const handleSelect = useCallback(async (app) => {
    setSelectedApp(app);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await fetchDetail(app.id);
      setDetail(d);
    } catch (e) {
      console.error('Detail fetch error:', e);
    } finally {
      setDetailLoading(false);
    }
  }, [fetchDetail]);

  const handleAdvance = useCallback(async (status, notes) => {
    if (!selectedApp) return;
    await advance(selectedApp.id, status, notes);
    setSelectedApp(null);
    setDetail(null);
  }, [selectedApp, advance]);

  const handleClose = useCallback(() => {
    setSelectedApp(null);
    setDetail(null);
  }, []);

  // ── Assign TO Action ──────────────────────────────────────────────────────
  const handleAssignSubmit = async () => {
    if (!selectedApp || !assigningTo) return;
    setAssignSubmitting(true);
    try {
      await authFetch(`/applications/${selectedApp.id}/assign-to`, {
        method: 'POST',
        body: JSON.stringify({ toStaffId: assigningTo })
      });
      notifySuccess('Assigned to Technical Officer successfully.');
      setIsAssignModalOpen(false);
      setAssigningTo('');
      
      // Update local state without closing drawer
      const d = await fetchDetail(selectedApp.id);
      setDetail(d);
      setSelectedApp({ ...selectedApp, assigned_to_staff_id: assigningTo });
      
      await reload(); // refresh background list
    } catch (err) {
      notifyError(err.message || 'Failed to assign Technical Officer');
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleSetFee = async () => {
    if (!selectedApp || feeAmount === '') return;
    setFeeSubmitting(true);
    try {
      await authFetch(`/applications/${selectedApp.id}/set-fee`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number.parseFloat(feeAmount),
          notes: feeNotes || undefined,
        }),
      });
      setIsFeeModalOpen(false);
      setFeeAmount('');
      setFeeNotes('');
      const d = await fetchDetail(selectedApp.id);
      setDetail(d);
      setSelectedApp((prev) => (prev ? { ...prev, status: 'payment_pending' } : prev));
      await reload();
    } catch (err) {
      notifyError(err.message || 'Failed to set fee');
    } finally {
      setFeeSubmitting(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!selectedApp) return;
    setConfirmingPayment(true);
    try {
      await authFetch(`/applications/${selectedApp.id}/confirm-payment`, {
        method: 'POST',
      });
      const d = await fetchDetail(selectedApp.id);
      setDetail(d);
      setSelectedApp((prev) => (prev ? { ...prev, status: 'under_review' } : prev));
      await reload();
    } catch (err) {
      notifyError(err.message || 'Failed to confirm payment');
    } finally {
      setConfirmingPayment(false);
    }
  };

  const liveStatus = detail?.status || selectedApp?.status;
  const allowedActions = useMemo(() => {
    const base = liveStatus ? (PO_ACTIONS_BY_STATUS[liveStatus] || []) : [];
    if (liveStatus === 'under_review' && user?.role !== 'admin') {
      return base.filter((a) => a.toStatus !== 'sw_review_pending');
    }
    return base;
  }, [liveStatus, user?.role]);

  return (
    <div className="min-h-screen bg-slate-50 relative pb-12">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-700 px-6 py-8 sm:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-1">Planning Officer</p>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Application Queue</h1>
              <p className="text-blue-200 text-sm mt-1">Review submitted applications, set fees, and assign to TO.</p>
            </div>
            <button
              onClick={reload}
              disabled={loading}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl border border-white/20 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">Failed to load applications</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard label="New Submissions" value={counts.submitted} icon={FileText}
            color="text-blue-600" bg="bg-blue-50" border="border-blue-100" />
          <StatCard label="Under Review" value={counts.under_review} icon={ClipboardList}
            color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-100" />
          <StatCard label="Payment Pending" value={counts.payment_pending ?? 0} icon={CheckSquare}
            color="text-cyan-600" bg="bg-cyan-50" border="border-cyan-100" />
          <StatCard label="Correction Pending" value={counts.correction} icon={AlertTriangle}
            color="text-amber-600" bg="bg-amber-50" border="border-amber-100" />
          <StatCard
            label="On Hold"
            value={(counts.hold_complaint ?? 0) + (counts.hold_clearance ?? 0)}
            icon={PauseCircle}
            color="text-rose-700"
            bg="bg-rose-50"
            border="border-rose-100"
          />
        </div>

        {/* ── Workflow tip ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 px-6 py-4 flex items-center gap-3 shadow-sm">
          <TrendingUp className="h-5 w-5 text-blue-500 shrink-0" />
          <p className="text-sm text-slate-600">
            <span className="font-bold text-slate-800">Workflow: </span>
            Submitted
            <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
            <span className="text-blue-700 font-bold">PO Review (You)</span>
            <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
            TO Inspection
            <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
            Superintendent
            <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
            Committee
          </p>
        </div>

        {/* ── Application table ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Applications</h2>
            <span className="text-xs text-slate-400 font-medium bg-slate-100 px-3 py-1 rounded-full">
              {applications.length} total
            </span>
          </div>
          <ApplicationTable
            applications={applications}
            onSelect={handleSelect}
            loading={loading}
            emptyMessage="No applications in your queue right now."
          />
        </div>
      </div>

      {/* ── Detail drawer ────────────────────────────────────────────────────── */}
      <ApplicationDetailDrawer
        application={selectedApp}
        detail={detail}
        detailLoading={detailLoading}
        onClose={handleClose}
        onAdvance={handleAdvance}
        allowedActions={allowedActions}
        customFooter={
          selectedApp?.status === 'under_review' ? (
            <div className="flex flex-col gap-3">
              {detail?.assignments?.length > 0 && detail.assignments.some(a => a.status === 'in_progress') && (
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center gap-3">
                  <CheckSquare className="h-5 w-5 text-blue-600 shrink-0" />
                  <p className="text-sm text-blue-800 font-medium tracking-tight">Currently assigned to TO: <span className="font-bold">{detail.assignments.find(a => a.status === 'in_progress').assigned_to_name}</span></p>
                </div>
              )}
              <button 
                onClick={() => setIsAssignModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white transition-colors rounded-xl text-sm font-bold shadow-sm focus:ring-4 focus:ring-indigo-100"
              >
                <Users className="h-4 w-4" />
                {detail?.assignments?.length > 0 && detail.assignments.some(a => a.status === 'in_progress') ? 'Reassign Technical Officer' : 'Assign to Technical Officer'}
              </button>
            </div>
          ) : selectedApp?.status === 'submitted' ? (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setIsFeeModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 text-white transition-colors rounded-xl text-sm font-bold shadow-sm focus:ring-4 focus:ring-cyan-100"
              >
                Set Inspection Fee
              </button>
            </div>
          ) : selectedApp?.status === 'payment_pending' ? (
            <div className="flex flex-col gap-3">
              <button
                onClick={handleConfirmPayment}
                disabled={confirmingPayment}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white transition-colors rounded-xl text-sm font-bold shadow-sm focus:ring-4 focus:ring-emerald-100"
              >
                {confirmingPayment ? 'Confirming Payment...' : 'Confirm Payment and Continue'}
              </button>
            </div>
          ) : null
        }
      />

      {/* ── Assign TO Modal ─────────────────────────────────────────────────── */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Assign Technical Officer</h3>
                <p className="text-sm text-slate-500 mt-1">Application {selectedApp?.application_code}</p>
              </div>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {toList.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No active Technical Officers found.</p>
              ) : (
                <div className="space-y-3">
                  {toList.map(to => (
                    <label 
                      key={to.id} 
                      className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        assigningTo == to.id ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input 
                          type="radio" 
                          name="assignedTo" 
                          value={to.id}
                          checked={assigningTo == to.id}
                          onChange={(e) => setAssigningTo(e.target.value)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <p className="text-sm font-bold text-slate-800">{to.full_name}</p>
                          <p className="text-xs text-slate-500">{to.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${to.load_count > 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {to.load_count} active
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-2xl">
              <button 
                type="button" 
                onClick={() => setIsAssignModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={assignSubmitting}
              >
                Cancel
              </button>
              <button 
                onClick={handleAssignSubmit}
                disabled={assignSubmitting || !assigningTo}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {assignSubmitting ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isFeeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">Set Inspection Fee</h3>
              <p className="text-sm text-slate-500 mt-1">Application {selectedApp?.application_code}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Amount (LKR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Notes (optional)</label>
                <textarea
                  value={feeNotes}
                  onChange={(e) => setFeeNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsFeeModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={feeSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSetFee}
                disabled={feeSubmitting || feeAmount === ''}
                className="px-6 py-2.5 bg-cyan-600 text-white text-sm font-bold rounded-xl hover:bg-cyan-700 disabled:opacity-50 transition-colors"
              >
                {feeSubmitting ? 'Saving...' : 'Save Fee'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── COC requests (full list for planning / admin) ─────────────────────────────
function PlanningOfficerCocQueue() {
  const { token } = useAuth();
  const { error: notifyError } = useNotifications();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson('/api/coc-requests?limit=100', token);
      setRows(data.cocRequests || []);
    } catch (e) {
      setError(e.message || 'Failed to load COC requests');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openApplication = async (applicationId) => {
    if (!token) return;
    setDetailLoading(true);
    setSelectedApp({ id: applicationId });
    setDetail(null);
    try {
      const res = await fetch(`${SIMPLE_API_BASE_URL}/applications/${applicationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || d.message || `HTTP ${res.status}`);
      setDetail(d);
      setSelectedApp({
        id: d.id,
        application_code: d.application_code,
        status: d.status,
        submitted_applicant_name: d.submitted_applicant_name,
        application_type: d.application_type,
        submission_date: d.submission_date,
      });
    } catch (e) {
      console.error(e);
      setSelectedApp(null);
      setDetail(null);
      notifyError(e.message || 'Could not load application');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 relative pb-12">
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-700 px-6 py-8 sm:px-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-1">Planning Officer</p>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">COC requests</h1>
            <p className="text-blue-200 text-sm mt-1">Certificate of Conformity queue (fees, assignment, follow-up).</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl border border-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-6 text-sm text-red-800">{error}</div>
        )}
        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-slate-500 py-12">No COC requests found.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
            <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 gap-2">
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">COC ID</span>
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">App ID</span>
              <span className="col-span-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Applicant</span>
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hidden sm:block">Requested</span>
              <span className="col-span-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Status</span>
            </div>
            {rows.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => openApplication(r.application_id)}
                className="w-full grid grid-cols-12 px-5 py-4 text-left hover:bg-blue-50/60 transition-colors items-center gap-2"
              >
                <div className="col-span-2 font-mono text-sm font-bold text-slate-800">{r.coc_id || `#${r.id}`}</div>
                <div className="col-span-2 text-sm text-slate-600">{r.application_code || r.application_id}</div>
                <div className="col-span-3 text-sm text-slate-700 truncate">{r.applicant_name || r.submitted_applicant_name || '—'}</div>
                <div className="col-span-2 text-xs text-slate-500 hidden sm:block">{formatDateShort(r.request_date)}</div>
                <div className="col-span-3 flex items-center justify-between">
                  <StatusBadge status={String(r.status || '').replace(/_/g, '-')}>{String(r.status || '').replace(/-/g, ' ')}</StatusBadge>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <ApplicationDetailDrawer
        application={selectedApp}
        detail={detail}
        detailLoading={detailLoading}
        onClose={() => { setSelectedApp(null); setDetail(null); }}
        onAdvance={async () => {}}
        allowedActions={[]}
      />
    </div>
  );
}

// ── Appeals (staff-wide list for planning counter) ────────────────────────────
function PlanningOfficerAppealQueue() {
  const { token } = useAuth();
  const { error: notifyError } = useNotifications();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson('/api/appeals?limit=100', token);
      setRows(data.appealCases || []);
    } catch (e) {
      setError(e.message || 'Failed to load appeals');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        String(r.id).includes(q) ||
                String(r.application_code || r.application_id).includes(q) ||
        (r.submitted_applicant_name || '').toLowerCase().includes(q) ||
        (r.submitted_email || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const openAppeal = async (id) => {
    if (!token) return;
    setSelected({ id });
    setDetailLoading(true);
    try {
      const row = await apiFetchJson(`/api/appeals/${id}`, token);
      setSelected(row);
    } catch (e) {
      notifyError(e.message || 'Failed to load appeal');
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 relative pb-12">
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-700 px-6 py-8 sm:px-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-1">Planning Officer</p>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Appeals</h1>
            <p className="text-blue-200 text-sm mt-1">Appeal cases across the authority (use route and status to triage).</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl border border-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-800">{error}</div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by appeal id, application id, name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
          />
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-500 py-12">No appeal cases found.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
            <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 gap-2">
              <span className="col-span-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">ID</span>
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Application</span>
              <span className="col-span-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Applicant</span>
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hidden md:block">Route</span>
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hidden sm:block">Updated</span>
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Status</span>
            </div>
            {filtered.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => openAppeal(r.id)}
                className="w-full grid grid-cols-12 px-5 py-4 text-left hover:bg-blue-50/60 transition-colors items-center gap-2"
              >
                <div className="col-span-1 text-sm font-bold text-slate-800">{r.id}</div>
                <div className="col-span-2 text-sm font-mono text-slate-600">{r.application_code || r.application_id}</div>
                <div className="col-span-3 text-sm text-slate-700 truncate">{r.submitted_applicant_name || '—'}</div>
                <div className="col-span-2 text-xs text-slate-600 hidden md:block">{r.route || '—'}</div>
                <div className="col-span-2 text-xs text-slate-500 hidden sm:block">{formatDateShort(r.updated_at)}</div>
                <div className="col-span-2 flex items-center justify-between gap-2">
                  <StatusBadge status={String(r.status || '').replace(/_/g, '-')}>{r.status}</StatusBadge>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/40">
          <button
            type="button"
            aria-label="Close panel"
            className="flex-1 cursor-default bg-transparent border-0"
            onClick={() => setSelected(null)}
          />
          <div className="w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Appeal #{selected.id}</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            {detailLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <div className="space-y-3 text-sm">
                <p><span className="font-semibold text-slate-600">Application:</span> {selected.application_code || selected.application_id}</p>
                <p><span className="font-semibold text-slate-600">Status:</span> {selected.status}</p>
                <p><span className="font-semibold text-slate-600">Route:</span> {selected.route || '—'}</p>
                <p><span className="font-semibold text-slate-600">Portal open:</span> {selected.portal_open ? 'Yes' : 'No'}</p>
                {selected.versions && Array.isArray(selected.versions) && (
                  <div>
                    <p className="font-semibold text-slate-600 mb-1">Versions</p>
                    <ul className="list-disc pl-5 text-slate-700 space-y-1">
                      {selected.versions.slice(0, 5).map((v) => (
                        <li key={v.id}>#{v.appeal_no} — {formatDateShort(v.submitted_at)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.member_notes && Array.isArray(selected.member_notes) && selected.member_notes.length > 0 && (
                  <div>
                    <p className="font-semibold text-slate-600 mb-1">Notes</p>
                    <ul className="space-y-2 text-slate-700">
                      {selected.member_notes.slice(0, 5).map((n) => (
                        <li key={n.id} className="border border-slate-100 rounded-lg p-2 text-xs">{n.note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Permits (issued / collection queue) ───────────────────────────────────────
function PlanningOfficerPermitQueue() {
  const { token } = useAuth();
  const { error: notifyError } = useNotifications();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson('/api/permits/planning-queue?limit=100', token);
      setRows(data.permits || []);
    } catch (e) {
      setError(e.message || 'Failed to load permits');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openApplication = async (applicationId) => {
    if (!token) return;
    setDetailLoading(true);
    setSelectedApp({ id: applicationId });
    setDetail(null);
    try {
      const res = await fetch(`${SIMPLE_API_BASE_URL}/applications/${applicationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || d.message || `HTTP ${res.status}`);
      setDetail(d);
      setSelectedApp({
        id: d.id,
        application_code: d.application_code,
        status: d.status,
        submitted_applicant_name: d.submitted_applicant_name,
        application_type: d.application_type,
        submission_date: d.submission_date,
      });
    } catch (e) {
      console.error(e);
      setSelectedApp(null);
      setDetail(null);
      notifyError(e.message || 'Could not load application');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 relative pb-12">
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-700 px-6 py-8 sm:px-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-1">Planning Officer</p>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Permit issuance</h1>
            <p className="text-blue-200 text-sm mt-1">Issued permits — not collected first, then collected history.</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl border border-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-6 text-sm text-red-800">{error}</div>
        )}
        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-slate-500 py-12">No permits on file yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
            <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 gap-2">
              <span className="col-span-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Reference</span>
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Application</span>
              <span className="col-span-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Applicant</span>
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hidden sm:block">Valid until</span>
              <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Collected</span>
            </div>
            {rows.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => openApplication(r.application_id)}
                className="w-full grid grid-cols-12 px-5 py-4 text-left hover:bg-blue-50/60 transition-colors items-center gap-2"
              >
                <div className="col-span-3 font-mono text-sm font-bold text-slate-800 truncate">{r.permit_reference || '—'}</div>
                <div className="col-span-2 text-sm text-slate-600">{r.application_code || r.application_id}</div>
                <div className="col-span-3 text-sm text-slate-700 truncate">{r.submitted_applicant_name || '—'}</div>
                <div className="col-span-2 text-xs text-slate-500 hidden sm:flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDateShort(r.valid_until)}
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">{r.permit_collected ? 'Yes' : 'No'}</span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <ApplicationDetailDrawer
        application={selectedApp}
        detail={detail}
        detailLoading={detailLoading}
        onClose={() => { setSelectedApp(null); setDetail(null); }}
        onAdvance={async () => {}}
        allowedActions={[]}
      />
    </div>
  );
}

export default function PlanningOfficerDashboard({ view = 'queue' }) {
  if (view === 'coc') return <PlanningOfficerCocQueue />;
  if (view === 'appeals') return <PlanningOfficerAppealQueue />;
  if (view === 'permits') return <PlanningOfficerPermitQueue />;
  return <PlanningOfficerMainQueue />;
}
