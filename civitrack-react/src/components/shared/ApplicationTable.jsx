/**
 * ApplicationTable.jsx
 * Reusable table for listing applications across all staff dashboards.
 *
 * Props:
 *   applications[]  — array from /api/simple/dashboard
 *   onSelect(app)   — called when a row is clicked
 *   loading         — shows skeleton rows
 *   emptyMessage    — custom text when list is empty
 */
import React, { useState, useMemo } from 'react';
import { Search, Filter, ChevronRight, Calendar, User } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import { getStatusLabel, toKebabStatusKey } from '../../utils/statusLabels';
import { getDisplayApplicationCode } from '../../utils/applicationCode';
import { getStatusFilterOptions } from '../../utils/statusPresentation';

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
  } catch {
    return iso;
  }
}

const STATUS_OPTIONS = getStatusFilterOptions();

export default function ApplicationTable({
  applications = [],
  onSelect,
  loading = false,
  emptyMessage = 'No applications found.',
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return applications.filter((app) => {
      const matchSearch =
        !q ||
        (app.application_code || app.displayCode || String(app.id || '')).toLowerCase().includes(q) ||
        (app.submitted_applicant_name || '').toLowerCase().includes(q) ||
        (app.submitted_email || '').toLowerCase().includes(q);
      const matchStatus = !statusFilter || app.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [applications, search, statusFilter]);

  // ── Skeleton rows for loading state ────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by code, name, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all appearance-none cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 text-slate-300 mb-4">
            <Search className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold text-slate-500">{emptyMessage}</p>
          {(search || statusFilter) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); }}
              className="mt-2 text-xs text-blue-500 hover:text-blue-700 font-medium underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Table rows ───────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-150 overflow-hidden bg-white shadow-sm">
          {/* Header */}
          <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100">
            <span className="col-span-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Code</span>
            <span className="col-span-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Applicant</span>
            <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hidden sm:block">Type</span>
            <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hidden md:block">Date</span>
            <span className="col-span-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Status</span>
          </div>

          {filtered.map((app) => (
            <button
              key={app.id}
              onClick={() => onSelect?.(app)}
              className="w-full grid grid-cols-12 px-5 py-4 text-left hover:bg-blue-50/60 transition-colors group items-center"
            >
              {/* Code */}
              <div className="col-span-3">
                <span className="font-mono text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
                  {getDisplayApplicationCode(app.application_code)}
                </span>
              </div>

              {/* Applicant */}
              <div className="col-span-3 flex items-center gap-2 min-w-0">
                <User className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <span className="text-sm text-slate-600 truncate font-medium">
                  {app.submitted_applicant_name || '—'}
                </span>
              </div>

              {/* Type */}
              <div className="col-span-2 hidden sm:block">
                <span className="text-xs text-slate-500 font-medium">
                  {TYPE_LABELS[app.application_type] || app.application_type || '—'}
                </span>
              </div>

              {/* Date */}
              <div className="col-span-2 hidden md:flex items-center gap-1.5 text-xs text-slate-400">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                {formatDate(app.submission_date)}
              </div>

              {/* Status + chevron */}
              <div className="col-span-2 flex items-center justify-between gap-2">
                <StatusBadge status={toKebabStatusKey(app.status)}>
                  {getStatusLabel(app.status)}
                </StatusBadge>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Row count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-right font-medium">
          Showing {filtered.length} of {applications.length} application{applications.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
