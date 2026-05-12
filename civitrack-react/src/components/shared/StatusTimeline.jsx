/**
 * StatusTimeline.jsx
 * Renders a vertical timeline of application status history entries.
 * Used inside ApplicationDetailDrawer.
 */
import React from 'react';
import { CheckCircle, AlertCircle, Clock, XCircle, ArrowRight } from 'lucide-react';
import { getStatusLabel } from '../../utils/statusLabels';

const STATUS_META = {
  submitted:         { color: 'bg-blue-500',    icon: Clock,        label: 'Submitted' },
  verified:          { color: 'bg-cyan-500',    icon: CheckCircle,  label: 'Verified' },
  payment_pending:   { color: 'bg-yellow-500',  icon: Clock,        label: 'Payment Pending' },
  under_review:      { color: 'bg-indigo-500',  icon: Clock,        label: 'Under Review' },
  hold_complaint:    { color: 'bg-red-500',     icon: AlertCircle,  label: 'On Hold - Complaint' },
  hold_clearance:    { color: 'bg-amber-500',   icon: AlertCircle,  label: 'On Hold - Clearance' },
  correction:        { color: 'bg-amber-500',   icon: AlertCircle,  label: 'Correction Required' },
  sw_review_pending: { color: 'bg-purple-500',  icon: Clock,        label: 'SW Review Pending' },
  endorsed:          { color: 'bg-teal-500',    icon: CheckCircle,  label: 'Endorsed' },
  committee_review:  { color: 'bg-fuchsia-500', icon: Clock,        label: 'Committee Review' },
  approved:          { color: 'bg-emerald-500', icon: CheckCircle,  label: 'Approved' },
  permit_approved:   { color: 'bg-emerald-500', icon: CheckCircle,  label: 'Permit Approved' },
  permit_collected:  { color: 'bg-emerald-600', icon: CheckCircle,  label: 'Permit Collected' },
  coc_pending:       { color: 'bg-sky-500',     icon: Clock,        label: 'COC Pending' },
  coc_issued:        { color: 'bg-sky-600',     icon: CheckCircle,  label: 'COC Issued' },
  appeal_submitted:  { color: 'bg-orange-500',  icon: Clock,        label: 'Appeal Submitted' },
  not_granted_appeal_required: { color: 'bg-amber-600', icon: AlertCircle, label: 'Appeal Required' },
  rejected:          { color: 'bg-red-500',     icon: XCircle,      label: 'Rejected' },
  closed:            { color: 'bg-slate-400',   icon: CheckCircle,  label: 'Closed' },
};

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-LK', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function StatusTimeline({ history = [] }) {
  if (!history.length) {
    return (
      <p className="text-sm text-slate-400 italic py-4 text-center">No status history available.</p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {history.map((entry, idx) => {
        const meta = STATUS_META[entry.status] || {
          color: 'bg-slate-400', icon: ArrowRight, label: getStatusLabel(entry.status)
        };
        const Icon = meta.icon;
        const isLast = idx === history.length - 1;

        return (
          <li key={entry.id || idx} className="flex gap-3 group">
            {/* Connector line + dot */}
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${meta.color} text-white ring-4 ring-white z-10`}>
                <Icon className="w-4 h-4" strokeWidth={2} />
              </div>
              {!isLast && (
                <div className="w-px flex-1 bg-slate-200 my-1" />
              )}
            </div>

            {/* Content */}
            <div className={`pb-5 ${isLast ? '' : ''}`}>
              <p className="text-sm font-bold text-slate-800 leading-tight">{meta.label}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {formatDateTime(entry.changed_at)}
                {entry.changed_by_name && (
                  <> · <span className="text-slate-500">{entry.changed_by_name}</span></>
                )}
                {entry.changed_by_role && (
                  <> <span className="text-slate-300">({getStatusLabel(entry.changed_by_role)})</span></>
                )}
              </p>
              {entry.reason && (
                <p className="mt-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
                  {entry.reason}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
