import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Search, RotateCcw, CheckCheck, Clock3, AlertCircle, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDateTime } from '../../utils/locale';

const STATUS_OPTIONS = [
  { value: '', label: 'All Feedback' },
  { value: 'new', label: 'New' },
  { value: 'in_review', label: 'In Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const FeedbackInbox = () => {
  const { token, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 20 });

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const loadFeedback = async ({ nextPage = page, nextSearch = search, nextStatus = status } = {}) => {
    if (!token) {
      setError('You must be signed in to view feedback.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: '20' });
      if (nextSearch.trim()) params.set('q', nextSearch.trim());
      if (nextStatus) params.set('status', nextStatus);

      const response = await fetch(`http://localhost:5000/api/feedback?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || 'Failed to load feedback');
      }

      setItems(Array.isArray(data.feedback) ? data.feedback : []);
      setPagination(data.pagination || { total: 0, pages: 1, limit: 20 });
      setPage(nextPage);
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to load feedback');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadFeedback({ nextPage: 1, nextSearch: search, nextStatus: status });
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, token]);

  const refresh = () => loadFeedback({ nextPage: page, nextSearch: search, nextStatus: status });

  const markAsRead = async (feedbackId) => {
    if (!token) return;
    setMarkingId(feedbackId);
    setError('');

    try {
      const response = await fetch(`http://localhost:5000/api/feedback/${feedbackId}/read`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || 'Failed to mark feedback as read');
      }

      setItems((current) => current.map((item) => (item.id === feedbackId ? { ...item, is_read: true, read_at: new Date().toISOString() } : item)));
    } catch (markError) {
      setError(markError.message || 'Failed to mark feedback as read');
    } finally {
      setMarkingId(null);
    }
  };

  const visibleItems = items;
  const totalPages = Math.max(pagination.pages || 1, 1);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-blue-700 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.22),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(196,181,253,0.18),transparent_35%)]" />
        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100">
                <MessageSquare className="h-3.5 w-3.5" />
                Staff inbox
              </div>
              <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight">Citizen Feedback Inbox</h1>
              <p className="mt-3 max-w-3xl text-blue-100 text-sm sm:text-base leading-relaxed">
                All active staff members can review citizen feedback. Use this inbox to read submissions, track response state, and keep service issues visible across the Pradeshiya Sabha.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <div className="text-xs text-blue-100/95">Visible to staff</div>
                <div className="mt-1 text-2xl font-bold">{user?.role ? 'Yes' : '—'}</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <div className="text-xs text-blue-100/95">Unread in page</div>
                <div className="mt-1 text-2xl font-bold">{unreadCount}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-lg border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, subject, or message"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <RotateCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="rounded-2xl bg-white shadow-lg border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 px-4 sm:px-6 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Feedback Records</h2>
            <p className="text-sm text-slate-500">{pagination.total} total submissions</p>
          </div>
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            Sorted by unread first, newest first
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading feedback...</div>
        ) : visibleItems.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No feedback found for the current filter.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {visibleItems.map((item) => (
              <article key={item.id} className={`p-4 sm:p-6 ${item.is_read ? 'bg-white' : 'bg-blue-50/40'}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">#{item.id}</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.is_read ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                        {item.is_read ? 'Read' : 'Unread'}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{item.status}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{item.subject}</h3>
                      <div className="mt-1 text-sm text-slate-500">
                        From {item.citizen_name} · {item.citizen_email}
                      </div>
                    </div>
                    <p className="max-w-4xl whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {item.message}
                    </p>
                    <div className="text-xs text-slate-500">
                      Submitted {formatDateTime(item.submitted_at)}
                      {item.read_at ? ` · Read ${formatDateTime(item.read_at)}` : ''}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 lg:items-end">
                    {!item.is_read ? (
                      <button
                        type="button"
                        onClick={() => markAsRead(item.id)}
                        disabled={markingId === item.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
                      >
                        <CheckCheck className="h-4 w-4" />
                        {markingId === item.id ? 'Updating...' : 'Mark as read'}
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
                        <CheckCheck className="h-4 w-4" />
                        Already read
                      </div>
                    )}
                    {item.delivered_at ? (
                      <div className="text-xs text-slate-500">Delivered {formatDateTime(item.delivered_at)}</div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 sm:px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadFeedback({ nextPage: Math.max(page - 1, 1), nextSearch: search, nextStatus: status })}
              disabled={page <= 1 || loading}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => loadFeedback({ nextPage: Math.min(page + 1, totalPages), nextSearch: search, nextStatus: status })}
              disabled={page >= totalPages || loading}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default FeedbackInbox;
