/**
 * SuperintendentDashboard.jsx — SIMPLIFIED
 *
 * SW reviews the Technical Officer's inspection report for sw_review_pending applications.
 * 
 * SW can:
 *   - Endorse & Forward to Committee
 *   - Send Back to TO (under_review)
 *   - Reject
 */
import React, { useState, useCallback } from 'react';
import {
  ShieldCheck, ArrowLeft, XCircle, RefreshCw, AlertTriangle, TrendingUp, ArrowRight,
  ClipboardCheck, PauseCircle,
} from 'lucide-react';
import { useSimpleDashboard } from '../../hooks/useSimpleDashboard';
import ApplicationTable from '../../components/shared/ApplicationTable';
import ApplicationDetailDrawer from '../../components/shared/ApplicationDetailDrawer';

// ── Stat card ─────────────────────────────────────────────────────────────────
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

// ── SW Actions ────────────────────────────────────────────────────────────────
const SW_ACTIONS_BY_STATUS = {
  sw_review_pending: [
    { label: 'Endorse & Forward', toStatus: 'endorsed', requiresNote: false, variant: 'success' },
    { label: 'Send Back to TO', toStatus: 'under_review', requiresNote: true, variant: 'warning' },
    { label: 'Reject', toStatus: 'rejected', requiresNote: true, variant: 'danger' },
  ],
  under_review: [
    { label: 'Request Correction', toStatus: 'correction', requiresNote: true, variant: 'warning' },
  ],
  correction: [
    { label: 'Mark Reviewed', toStatus: 'under_review', requiresNote: false, variant: 'primary' },
  ],
  endorsed: [],   // Terminal for SW
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SuperintendentDashboard() {
  const { applications, counts, loading, error, reload, advance, fetchDetail } = useSimpleDashboard();

  const [selectedApp, setSelectedApp] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleSelect = useCallback(async (app) => {
    setSelectedApp(app);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await fetchDetail(app.id);
      setDetail(d);
    } catch (e) {
      console.error('Detail fetch failed:', e);
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

  const liveStatus = detail?.status || selectedApp?.status;
  const allowedActions = liveStatus
    ? (SW_ACTIONS_BY_STATUS[liveStatus] || [])
    : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-700 px-6 py-8 sm:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-purple-300 text-xs font-bold uppercase tracking-widest mb-1">Superintendent of Works</p>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Review & Endorsement</h1>
              <p className="text-purple-200 text-sm mt-1">
                Review TO inspection reports and endorse applications for committee.
              </p>
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

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">Failed to load applications</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard label="Awaiting Review" value={counts.sw_review_pending} icon={ClipboardCheck}
            color="text-purple-600" bg="bg-purple-50" border="border-purple-100" />
          <StatCard label="Endorsed" value={counts.endorsed} icon={ShieldCheck}
            color="text-teal-600" bg="bg-teal-50" border="border-teal-100" />
          <StatCard label="In Correction" value={counts.correction ?? 0} icon={ArrowLeft}
            color="text-amber-600" bg="bg-amber-50" border="border-amber-100" />
          <StatCard label="Rejected" value={counts.rejected ?? 0} icon={XCircle}
            color="text-red-600" bg="bg-red-50" border="border-red-100" />
          <StatCard
            label="On Hold"
            value={(counts.hold_complaint ?? 0) + (counts.hold_clearance ?? 0)}
            icon={PauseCircle}
            color="text-rose-700"
            bg="bg-rose-50"
            border="border-rose-100"
          />
        </div>

        {/* Workflow guide */}
        <div className="bg-white rounded-2xl border border-slate-200 px-6 py-4 flex items-center gap-3 shadow-sm">
          <TrendingUp className="h-5 w-5 text-purple-500 shrink-0" />
          <p className="text-sm text-slate-600">
            <span className="font-bold text-slate-800">Workflow: </span>
            PO Review
            <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
            TO Inspection
            <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
            <span className="text-purple-700 font-bold">SW Review ← You are here</span>
            <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
            Committee
          </p>
        </div>

        {/* Application table */}
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
            emptyMessage="No applications currently require your attention."
          />
        </div>
      </div>

      <ApplicationDetailDrawer
        application={selectedApp}
        detail={detail}
        detailLoading={detailLoading}
        onClose={handleClose}
        onAdvance={handleAdvance}
        allowedActions={allowedActions}
      />
    </div>
  );
}
