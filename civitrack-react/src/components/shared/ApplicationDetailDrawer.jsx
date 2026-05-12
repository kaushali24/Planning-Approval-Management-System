/**
 * ApplicationDetailDrawer.jsx
 *
 * Slide-in right drawer showing full application detail.
 * Used across PO, SW, and Committee dashboards.
 *
 * Props:
 *   application     — row from /api/simple/dashboard (null → closed)
 *   detail          — full data from /api/simple/applications/:id (nullable while loading)
 *   detailLoading   — bool: show skeleton
 *   onClose()       — close drawer
 *   onAdvance(status, notes) → Promise  — delegate to parent
 *   allowedActions  — Array<{ label, toStatus, requiresNote, variant }>
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  X, FileText, ExternalLink, Loader2, CheckCircle, AlertCircle, Clock, XCircle,
  ChevronDown, ChevronUp, PauseCircle,
} from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import StatusTimeline from './StatusTimeline';
import { getStatusLabel, toKebabStatusKey } from '../../utils/statusLabels';
import { getDisplayApplicationCode } from '../../utils/applicationCode';

const TYPE_LABELS = {
  building: 'Building Permit',
  subdivision: 'Land Subdivision',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-LK', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch { return iso; }
}

const STATUS_META = {
  submitted:         { Icon: Clock,        color: 'text-blue-600',    bg: 'bg-blue-50' },
  under_review:      { Icon: Clock,        color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  hold_complaint:    { Icon: PauseCircle,  color: 'text-red-600',     bg: 'bg-red-50' },
  hold_clearance:    { Icon: PauseCircle,  color: 'text-amber-700',   bg: 'bg-amber-50' },
  correction:        { Icon: AlertCircle,  color: 'text-amber-600',   bg: 'bg-amber-50' },
  sw_review_pending: { Icon: Clock,        color: 'text-purple-600',  bg: 'bg-purple-50' },
  endorsed:          { Icon: CheckCircle,  color: 'text-teal-600',    bg: 'bg-teal-50' },
  approved:          { Icon: CheckCircle,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
  rejected:          { Icon: XCircle,      color: 'text-red-600',     bg: 'bg-red-50' },
  closed:            { Icon: CheckCircle,  color: 'text-slate-500',   bg: 'bg-slate-50' },
};

const VARIANT_CLASSES = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white border-transparent shadow-sm',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent shadow-sm',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white border-transparent shadow-sm',
  danger:  'bg-red-600 hover:bg-red-700 text-white border-transparent shadow-sm',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm',
};

export default function ApplicationDetailDrawer({
  application,
  detail,
  detailLoading = false,
  onClose,
  onAdvance,
  allowedActions = [],
}) {
  const [activeActionStatus, setActiveActionStatus] = useState(null);
  const [notes, setNotes] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);

  // Reset state when drawer opens for a new application
  useEffect(() => {
    setActiveActionStatus(null);
    setNotes('');
    setAdvanceError(null);
    setAdvancing(false);
    setShowTimeline(false);
  }, [application?.id]);

  const handleAdvance = useCallback(async () => {
    if (!activeActionStatus || advancing) return;
    setAdvancing(true);
    setAdvanceError(null);
    try {
      await onAdvance(activeActionStatus, notes);
      setActiveActionStatus(null);
      setNotes('');
    } catch (err) {
      setAdvanceError(err.message || 'Failed to update status. Please try again.');
    } finally {
      setAdvancing(false);
    }
  }, [activeActionStatus, notes, onAdvance, advancing]);

  // ── Closed state ────────────────────────────────────────────────────────
  if (!application) return null;

  const status = application.status;
  const statusMeta = STATUS_META[status] || { Icon: Clock, color: 'text-slate-500', bg: 'bg-slate-50' };
  const StatusIcon = statusMeta.Icon;
  const activeHold = detail?.activeHold || null;
  const isHold = status === 'hold_complaint' || status === 'hold_clearance' || activeHold?.hold_status === 'active';

  const effectiveAllowedActions = isHold ? [] : allowedActions;
  const activeActionDef = effectiveAllowedActions.find((a) => a.toStatus === activeActionStatus);

  // ── Overlay + Drawer ─────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className="fixed top-0 right-0 h-full w-full max-w-xl bg-white z-50 shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-label="Application Detail"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-0.5">
              Application Detail
            </p>
            <h2 className="text-lg font-bold text-slate-900 font-mono tracking-tight">
              {getDisplayApplicationCode(application.application_code)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Status hero */}
          <div className={`flex items-center gap-4 p-4 rounded-2xl border ${statusMeta.bg} border-current/10`}>
            <div className={`p-3 rounded-xl bg-white/70 shadow-sm ${statusMeta.color}`}>
              <StatusIcon className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Current Status</p>
              <StatusBadge status={toKebabStatusKey(status)}>
                {getStatusLabel(status)}
              </StatusBadge>
            </div>
          </div>

          {/* Hold details */}
          {isHold && (
            <section className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <PauseCircle className="h-4 w-4 text-slate-400" />
                Hold Details
              </h3>

              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-900">
                  This application is paused while the hold is active. It should be resolved by the Technical Officer before continuing workflow decisions.
                </p>
              </div>

              {detailLoading ? (
                <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              ) : !activeHold ? (
                <p className="text-sm text-slate-500">
                  This application is marked as on hold, but no active hold record was found.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Hold Type', value: getStatusLabel(activeHold.hold_type) },
                    { label: 'Hold Status', value: getStatusLabel(activeHold.hold_status) },
                    { label: 'Requested At', value: formatDate(activeHold.requested_at) },
                    { label: 'Requested By', value: activeHold.requested_by_name || activeHold.requested_by },
                    { label: 'Clearance Authority', value: activeHold.clearance_authority || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-xl px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                      <p className="font-semibold text-slate-800 whitespace-pre-wrap break-words">{value ?? '—'}</p>
                    </div>
                  ))}
                  <div className="sm:col-span-2 bg-slate-50 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Reason</p>
                    <p className="font-semibold text-slate-800 whitespace-pre-wrap break-words">{activeHold.reason || '—'}</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Applicant info */}
          <section>
            <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Applicant Info</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Name',    value: application.submitted_applicant_name },
                { label: 'Email',   value: application.submitted_email },
                { label: 'Type',    value: TYPE_LABELS[application.application_type] || application.application_type },
                { label: 'Submitted', value: formatDate(application.submission_date) },
                { label: 'Last Updated', value: formatDate(application.last_updated) },
                { label: 'Documents', value: application.document_count ?? (detail?.documents?.length ?? '—') },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                  <p className="font-semibold text-slate-800 truncate">{value ?? '—'}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Documents */}
          <section>
            <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
              Documents
              {detail?.documents && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold normal-case tracking-normal">
                  {detail.documents.length}
                </span>
              )}
            </h3>

            {detailLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !detail?.documents?.length ? (
              <p className="text-sm text-slate-400 italic">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.documents.map((doc) => {
                  const docUrl = doc.file_url
                    ? `http://localhost:5000/uploads/${doc.file_url.replace(/^\/?(uploads\/)?/, '')}`
                    : null;
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <div className="p-2 bg-blue-50 rounded-lg text-blue-500 shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {doc.original_filename || doc.doc_type?.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium capitalize">
                          {doc.doc_type?.replace(/_/g, ' ')}
                          {doc.document_category && ` · ${doc.document_category}`}
                        </p>
                      </div>
                      {docUrl && (
                        <a
                          href={docUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors shrink-0"
                          title="Open document"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Status Timeline (collapsible) */}
          <section>
            <button
              onClick={() => setShowTimeline((p) => !p)}
              className="flex items-center justify-between w-full text-left group"
            >
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">
                Status History
              </h3>
              {showTimeline
                ? <ChevronUp className="h-4 w-4 text-slate-400" />
                : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>

            {showTimeline && (
              <div className="mt-3">
                {detailLoading
                  ? <div className="h-20 bg-slate-100 rounded-xl animate-pulse mt-2" />
                  : <StatusTimeline history={detail?.history || []} />}
              </div>
            )}
          </section>
        </div>

        {/* ── Action panel (sticky footer) ────────────────────────────── */}
        {effectiveAllowedActions.length > 0 && (
          <div className="border-t border-slate-100 px-6 py-4 bg-white shrink-0 space-y-3">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Actions</p>

            {/* Action buttons */}
            {!activeActionStatus && (
              <div className="flex flex-wrap gap-2">
                {effectiveAllowedActions.map((action) => (
                  <button
                    key={action.toStatus}
                    onClick={() => setActiveActionStatus(action.toStatus)}
                    className={`flex-1 min-w-[120px] px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${VARIANT_CLASSES[action.variant] || VARIANT_CLASSES.secondary}`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Confirmation panel */}
            {activeActionStatus && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Confirm: <em className="not-italic text-blue-700">
                      {activeActionDef?.label || activeActionStatus}
                    </em>
                  </span>
                  <button
                    onClick={() => { setActiveActionStatus(null); setNotes(''); setAdvanceError(null); }}
                    className="ml-auto text-[11px] text-slate-400 hover:text-slate-700 font-bold uppercase tracking-widest transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    activeActionDef?.requiresNote
                      ? '⚠ Note is required for this action (min 5 chars)…'
                      : 'Optional: add a note for this action…'
                  }
                  rows={3}
                  className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 resize-none transition-all placeholder:text-slate-300"
                />

                {advanceError && (
                  <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {advanceError}
                  </p>
                )}

                <button
                  onClick={handleAdvance}
                  disabled={advancing || (activeActionDef?.requiresNote && notes.trim().length < 5)}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2
                    ${(advancing || (activeActionDef?.requiresNote && notes.trim().length < 5))
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : VARIANT_CLASSES[activeActionDef?.variant] || VARIANT_CLASSES.primary}`}
                >
                  {advancing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {advancing ? 'Updating…' : `Confirm — ${activeActionDef?.label}`}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
