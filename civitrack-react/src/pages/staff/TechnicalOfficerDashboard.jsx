/**
 * TechnicalOfficerDashboard.jsx — SIMPLIFIED
 *
 * Uses /api/simple/dashboard to show under_review apps assigned to the TO.
 * TO can:
 *   - Schedule Inspection
 *   - Request Correction (send back to PO)
 *   - Submit Inspection Report → moves to sw_review_pending
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  RefreshCw, AlertTriangle, TrendingUp, ArrowRight, ClipboardCheck, Calendar, FileText, PauseCircle, ShieldCheck
} from 'lucide-react';
import { useSimpleDashboard } from '../../hooks/useSimpleDashboard';
import { useNotifications } from '../../context/NotificationContext.jsx';
import ApplicationTable from '../../components/shared/ApplicationTable';
import ApplicationDetailDrawer from '../../components/shared/ApplicationDetailDrawer';
import { SIMPLE_API_BASE_URL } from '../../utils/apiBase';

// ── Shared Stat Card Component ──────────────────────────────────────────────
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

// ── TO Specific Actions ─────────────────────────────────────────────────────
// The standard drawer has generic actions, but we also want custom ones:
// 1. Schedule Inspection (requires purely date, via custom UI later or just an extra option)
// 2. Submit Report (custom modal, just like SW used to have)
const TO_ACTIONS_BY_STATUS = {
  under_review: [
    { label: 'Request Correction', toStatus: 'correction', requiresNote: true, variant: 'warning' },
    // "Submit Report" is handled via a completely custom button rendered in the UI below
  ]
};

// ── Full Component ──────────────────────────────────────────────────────────
export default function TechnicalOfficerDashboard({ initialTab = 'inspections' }) {
  const { applications, counts, loading, error, reload, advance, fetchDetail, token, authFetch } = useSimpleDashboard();
  const { success: notifySuccess, error: notifyError } = useNotifications();

  const [selectedApp, setSelectedApp] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modal states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const reportFormRef = useRef(null);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);

  // Hold modal states
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [holdType, setHoldType] = useState('complaint');
  const [holdReason, setHoldReason] = useState('');
  const [holdClearanceAuthority, setHoldClearanceAuthority] = useState('');
  const [holdComplaintSource, setHoldComplaintSource] = useState('');
  const [holdResolutionSteps, setHoldResolutionSteps] = useState('');
  const [holdSubmitting, setHoldSubmitting] = useState(false);

  const [isResolveHoldModalOpen, setIsResolveHoldModalOpen] = useState(false);
  const [resolveHoldNote, setResolveHoldNote] = useState('');
  const [resolveHoldSubmitting, setResolveHoldSubmitting] = useState(false);

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

  const submitPlaceHold = async () => {
    if (!selectedApp) return;
    if (String(holdReason || '').trim().length < 3) return;

    setHoldSubmitting(true);
    try {
      await authFetch(`/applications/${selectedApp.id}/hold`, {
        method: 'POST',
        body: JSON.stringify({
          hold_type: holdType,
          reason: holdReason,
          clearance_authority: holdType === 'clearance' ? holdClearanceAuthority : undefined,
          complaint_source: holdType === 'complaint' ? holdComplaintSource : undefined,
          resolution_steps: holdType === 'complaint' ? holdResolutionSteps : undefined,
        }),
      });

      setIsHoldModalOpen(false);
      setHoldReason('');
      setHoldClearanceAuthority('');
      setHoldComplaintSource('');
      setHoldResolutionSteps('');
      reload();
      handleSelect(selectedApp);
    } catch (e) {
      notifyError(e.message || 'Failed to place hold');
    } finally {
      setHoldSubmitting(false);
    }
  };

  const submitResolveHold = async () => {
    if (!selectedApp) return;
    if (String(resolveHoldNote || '').trim().length < 3) return;

    setResolveHoldSubmitting(true);
    try {
      await authFetch(`/applications/${selectedApp.id}/resolve-hold`, {
        method: 'POST',
        body: JSON.stringify({ resolution_note: resolveHoldNote }),
      });

      setIsResolveHoldModalOpen(false);
      setResolveHoldNote('');
      reload();
      handleSelect(selectedApp);
    } catch (e) {
      notifyError(e.message || 'Failed to resolve hold');
    } finally {
      setResolveHoldSubmitting(false);
    }
  };

  // ── Scheduling Inspection ───────────────────────────────────────────────
  const submitSchedule = async () => {
    if (!scheduleDate || !selectedApp) return;
    setScheduleSubmitting(true);
    try {
      await authFetch(`/applications/${selectedApp.id}/schedule-inspection`, {
        method: 'POST',
        body: JSON.stringify({ scheduled_date: scheduleDate })
      });
      notifySuccess('Inspection scheduled successfully.');
      setIsScheduleModalOpen(false);
      setScheduleDate('');
      handleSelect(selectedApp); // reload detail
    } catch (e) {
      notifyError(e.message || 'Failed to schedule inspection');
    } finally {
      setScheduleSubmitting(false);
    }
  };

  // ── Submitting Repoort ──────────────────────────────────────────────────
  const submitReport = async (e) => {
    e.preventDefault();
    if (!selectedApp) return;

    const form = e.target;
    setReportSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('observations', form.observations.value);
      formData.append('recommendation', form.recommendation.value);
      formData.append('notes', form.notes.value);
      
      const fileInputs = form.querySelectorAll('input[type="file"]');
      fileInputs.forEach(input => {
        if (input.files && input.files.length > 0) {
          for (const f of input.files) {
            formData.append('files', f);
          }
        }
      });

      const res = await fetch(`${SIMPLE_API_BASE_URL}/applications/${selectedApp.id}/submit-to-report`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit report');

      // Success
      setIsReportModalOpen(false);
      setSelectedApp(null);
      setDetail(null);
      reload();
    } catch (e) {
      notifyError(e.message || 'Error submitting report');
    } finally {
      setReportSubmitting(false);
    }
  };

  const liveStatus = detail?.status || selectedApp?.status;
  const allowedActions = liveStatus
    ? (TO_ACTIONS_BY_STATUS[liveStatus] || [])
    : [];

  const inspectionRecord = detail?.inspections?.[0]; // Get the TO's active inspection run if any

  const isHoldStatus = liveStatus === 'hold_complaint' || liveStatus === 'hold_clearance';
  const assignedTotal = (counts.under_review || 0) + (counts.hold_complaint || 0) + (counts.hold_clearance || 0);
  const normalizedTab = initialTab === 'coc' ? 'coc' : 'inspections';
  const isCocTab = normalizedTab === 'coc';
  const activeInspections = applications.filter((a) => (
    isCocTab
      ? ['coc_pending', 'assigned-to-to', 'inspection_scheduled', 'reinspection-requested'].includes(String(a.status || '').toLowerCase())
      : a.status === 'under_review'
  ));
  const onHoldApplications = applications.filter((a) => a.status === 'hold_complaint' || a.status === 'hold_clearance');

  return (
    <div className="min-h-screen bg-slate-50 relative pb-12">
      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-800 px-6 py-8 sm:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">Technical Officer</p>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">{isCocTab ? 'COC Inspections' : 'My Inspections'}</h1>
              <p className="text-indigo-200 text-sm mt-1">
                {isCocTab ? 'Review assigned COC inspections and submit COC outcomes.' : 'Schedule site visits and submit technical reports.'}
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
        
        {/* ── ERROR ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {/* ── STATS ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Assigned to Me" value={assignedTotal} icon={FileText} color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-100" />
          <StatCard label="Inspections Completed" value={counts.sw_review_pending} icon={ClipboardCheck} color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-100" />
          <StatCard label="On Hold" value={(counts.hold_complaint ?? 0) + (counts.hold_clearance ?? 0)} icon={PauseCircle} color="text-rose-700" bg="bg-rose-50" border="border-rose-100" />
        </div>

        {/* ── WORKFLOW TIP ───────────────────────────────────────────────── */}
        <div className="bg-white/60 border border-indigo-100 rounded-2xl px-5 py-4 flex items-center gap-4 text-indigo-900 border-l-4 border-l-indigo-500 shadow-sm">
          <TrendingUp className="h-5 w-5 text-indigo-500 shrink-0" />
          <p className="text-sm font-medium">
            <span className="font-bold">Process:</span> Assigned from PO <ArrowRight className="inline h-3 w-3 opacity-50" /> Schedule Visit <ArrowRight className="inline h-3 w-3 opacity-50" /> Conduct Site Inspection <ArrowRight className="inline h-3 w-3 opacity-50" /> Submit TO Report to SW
          </p>
        </div>

        {/* ── APPLICATIONS TABLE ─────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 overflow-hidden">
          <h2 className="text-lg font-bold text-slate-800 mb-4">{isCocTab ? 'Pending COC Inspections' : 'Pending Inspections'}</h2>
          <ApplicationTable
            applications={activeInspections}
            onSelect={handleSelect}
            loading={loading}
            emptyMessage={isCocTab ? 'No COC inspections are currently assigned to you.' : 'No applications are currently assigned to you.'}
          />
        </div>

        {/* ── ON HOLD ───────────────────────────────────────────────────── */}
        {onHoldApplications.length > 0 && (
          <div className="bg-white rounded-3xl border border-rose-200 shadow-sm p-6 overflow-hidden">
            <h2 className="text-lg font-bold text-slate-800 mb-1">On Hold</h2>
            <p className="text-sm text-slate-500 mb-4">
              These applications are paused. Resolve the hold to continue the workflow.
            </p>
            <ApplicationTable
              applications={onHoldApplications}
              onSelect={handleSelect}
              loading={loading}
              emptyMessage="No applications are currently on hold."
            />
          </div>
        )}
      </div>

      {/* ── DRAWER ───────────────────────────────────────────────────────── */}
      <ApplicationDetailDrawer
        application={selectedApp}
        detail={detail}
        detailLoading={detailLoading}
        onClose={handleClose}
        onAdvance={handleAdvance}
        allowedActions={allowedActions}
        customFooter={
          liveStatus === 'under_review' ? (
            <div className="flex gap-2">
              <button 
                onClick={() => setIsScheduleModalOpen(true)}
                className="flex-1 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-sm font-bold hover:bg-indigo-100 focus:ring-4 focus:ring-indigo-100 transition-all flex items-center justify-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Schedule Visit
              </button>
              <button 
                onClick={() => setIsReportModalOpen(true)}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm shadow-emerald-200 hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-200 transition-all flex items-center justify-center gap-2"
              >
                Submit Report <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsHoldModalOpen(true)}
                className="flex-1 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm font-bold hover:bg-amber-100 focus:ring-4 focus:ring-amber-100 transition-all flex items-center justify-center gap-2"
              >
                <PauseCircle className="h-4 w-4" />
                Place Hold
              </button>
            </div>
          ) : isHoldStatus ? (
            <div className="flex gap-2">
              <button
                onClick={() => setIsResolveHoldModalOpen(true)}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm shadow-emerald-200 hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-200 transition-all flex items-center justify-center gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                Resolve Hold
              </button>
            </div>
          ) : null
        }
      />

      {/* ── PLACE HOLD MODAL ─────────────────────────────────────────────── */}
      {isHoldModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">Place Application Hold</h3>
              <p className="text-sm text-slate-500 mt-1">Application {selectedApp?.application_code}</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Hold type</label>
                <select
                  value={holdType}
                  onChange={(e) => setHoldType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                >
                  <option value="complaint">Complaint</option>
                  <option value="clearance">Clearance required</option>
                  <option value="technical-deficiency">Technical deficiency</option>
                </select>
              </div>

              {holdType === 'clearance' && (
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Clearance authority (optional)</label>
                  <input
                    value={holdClearanceAuthority}
                    onChange={(e) => setHoldClearanceAuthority(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="e.g., Environmental Authority / Road Development Authority"
                  />
                </div>
              )}

              {holdType === 'complaint' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Complaint source (optional)</label>
                    <input
                      value={holdComplaintSource}
                      onChange={(e) => setHoldComplaintSource(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      placeholder="e.g., Neighbor / Public / Internal"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Resolution steps (optional)</label>
                    <input
                      value={holdResolutionSteps}
                      onChange={(e) => setHoldResolutionSteps(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      placeholder="e.g., Site re-check / Call complainant"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="Explain why this application is being paused (minimum 3 characters)."
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsHoldModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={holdSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={submitPlaceHold}
                disabled={holdSubmitting || String(holdReason || '').trim().length < 3}
                className="px-6 py-2.5 bg-amber-600 text-white text-sm font-bold rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {holdSubmitting ? 'Placing...' : 'Place Hold'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESOLVE HOLD MODAL ────────────────────────────────────────────── */}
      {isResolveHoldModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">Resolve Hold</h3>
              <p className="text-sm text-slate-500 mt-1">Application {selectedApp?.application_code}</p>
            </div>

            <div className="p-6 space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Resolution note <span className="text-red-500">*</span></label>
              <textarea
                value={resolveHoldNote}
                onChange={(e) => setResolveHoldNote(e.target.value)}
                rows={3}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="Explain how the hold was resolved."
              />
              <p className="text-xs text-slate-500">
                This will restore the application to the last active stage (or Under Review if none is found).
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsResolveHoldModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={resolveHoldSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={submitResolveHold}
                disabled={resolveHoldSubmitting || String(resolveHoldNote || '').trim().length < 3}
                className="px-6 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {resolveHoldSubmitting ? 'Resolving...' : 'Resolve Hold'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULING MODAL ─────────────────────────────────────────────── */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Schedule Site Inspection</h3>
                <p className="text-sm text-slate-500 mt-1">Application {selectedApp?.application_code}</p>
              </div>
            </div>
            
            <div className="p-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Inspection Date & Time</label>
              <input 
                type="datetime-local" 
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                required 
              />
              <p className="text-xs text-slate-500 mt-2">
                This will automatically update the system and trigger an email to the applicant.
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-2xl">
              <button 
                type="button" 
                onClick={() => setIsScheduleModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={scheduleSubmitting}
              >
                Cancel
              </button>
              <button 
                onClick={submitSchedule}
                disabled={scheduleSubmitting || !scheduleDate}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {scheduleSubmitting ? 'Scheduling...' : 'Confirm Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REPORT SUBMISSION MODAL ───────────────────────────────────────── */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden relative border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Submit TO Inspection Report</h3>
                <p className="text-sm text-slate-500 mt-1">For {selectedApp?.application_code}</p>
              </div>
            </div>
            
            <form ref={reportFormRef} onSubmit={submitReport} className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
              
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Site Observations <span className="text-red-500">*</span></label>
                <textarea 
                  name="observations"
                  required minLength={10}
                  rows={4}
                  placeholder="Detail the findings from your site visit. E.g. Setbacks checked, structural footprint verified..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700">Technical Recommendation <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="border border-slate-200 p-4 rounded-xl cursor-pointer hover:bg-emerald-50 transition-colors flex items-start gap-3 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 has-[:checked]:ring-1 has-[:checked]:ring-emerald-500">
                    <input type="radio" required name="recommendation" value="approve" className="mt-1 sr-only" />
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center bg-white check-circle">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 scale-0 transition-transform"></div>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">Approve</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">Meets all requirements</p>
                    </div>
                  </label>

                  <label className="border border-slate-200 p-4 rounded-xl cursor-pointer hover:bg-amber-50 transition-colors flex items-start gap-3 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50 has-[:checked]:ring-1 has-[:checked]:ring-amber-500">
                    <input type="radio" required name="recommendation" value="conditional" className="mt-1 sr-only" />
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center bg-white check-circle">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500 scale-0 transition-transform"></div>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">Conditional</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">Approve with conditions</p>
                    </div>
                  </label>

                  <label className="border border-slate-200 p-4 rounded-xl cursor-pointer hover:bg-red-50 transition-colors flex items-start gap-3 has-[:checked]:border-red-500 has-[:checked]:bg-red-50 has-[:checked]:ring-1 has-[:checked]:ring-red-500">
                    <input type="radio" required name="recommendation" value="reject" className="mt-1 sr-only" />
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center bg-white check-circle">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 scale-0 transition-transform"></div>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">Reject</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">Does not comply</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" /> Report Scans (PDF)
                  </label>
                  <input type="file" name="report" accept="application/pdf" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" /> Site Photos
                  </label>
                  <input type="file" name="photos" accept="image/*" multiple className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Internal Notes (Optional)</label>
                <textarea 
                  name="notes"
                  rows={2}
                  placeholder="Additional notes for the PO or SW..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

            </form>

            <style>{`
              label:has(input[type="radio"]:checked) .check-circle { border-color: transparent !important; }
              label:has(input[type="radio"]:checked) .check-circle div { transform: scale(1) !important; }
            `}</style>
            
            <div className="px-8 py-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 rounded-b-3xl">
              <button 
                type="button" 
                onClick={() => setIsReportModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={reportSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit"
                onClick={(e) => {
                  e.preventDefault();
                  reportFormRef.current?.requestSubmit();
                }}
                disabled={reportSubmitting}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {reportSubmitting ? 'Submitting...' : 'Submit Report & Send to SW'} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
