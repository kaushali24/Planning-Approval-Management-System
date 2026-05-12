import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, FileText, FileWarning, Mail, ShieldAlert } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { loadCocWorkflow } from '../../data/cocWorkflowStore';
import { loadPermitWorkflow, isBuildingPermit, getPermitDaysUntilExpiry, canExtendPermit } from '../../data/permitWorkflowStore';
import { formatDate } from '../../utils/locale';
import { fetchFeedbackSummary } from '../../utils/feedbackService';

const FINE_NOTIFICATIONS_KEY = 'applicant_fine_notifications';

const loadFineNotifications = (email) => {
  try {
    const raw = localStorage.getItem(FINE_NOTIFICATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!email) return [];
    return Array.isArray(parsed[email]) ? parsed[email] : [];
  } catch {
    return [];
  }
};

const Notifications = () => {
  const { user, token } = useAuth();
  const role = user?.role || 'applicant';
  const applicantEmail = String(user?.email || '').trim().toLowerCase();
  const [unreadFeedbackCount, setUnreadFeedbackCount] = useState(0);

  const applicantFineNotifications = useMemo(() => {
    return loadFineNotifications(applicantEmail).filter((item) => !item.resolvedAt);
  }, [applicantEmail]);

  const applicantFineCases = useMemo(() => {
    const rows = loadCocWorkflow();
    return rows
      .filter((row) => String(row.applicantEmail || '').trim().toLowerCase() === applicantEmail)
      .filter((row) => row.status === 'coc-violations-found' || row.status === 'coc-rejected-non-rectifiable')
      .filter((row) => row.violationReport?.fineRequired !== false)
      .filter((row) => !row.finePaidAt)
      .map((row) => ({
        cocId: row.cocId,
        applicationId: row.applicationId,
        amount: Number(row.deviationFine || row.violationReport?.fineAmount || 0),
        issuedAt: row.violationReportedAt || row.inspectionCompletedAt || row.requestedAt,
      }));
  }, [applicantEmail]);

  const permitExpiryAlerts = useMemo(() => {
    return loadPermitWorkflow()
      .filter((permit) => isBuildingPermit(permit))
      .map((permit) => {
        const daysRemaining = getPermitDaysUntilExpiry(permit);
        if (typeof daysRemaining !== 'number' || daysRemaining > 30 || !permit.validUntil) return null;

        let tone = 'info';
        let label = 'Upcoming';
        if (daysRemaining < 0) {
          tone = 'error';
          label = 'Expired';
        } else if (daysRemaining <= 7) {
          tone = 'warning';
          label = 'Urgent';
        }

        return {
          applicationId: permit.applicationId,
          validUntil: permit.validUntil,
          daysRemaining,
          canExtend: canExtendPermit(permit),
          tone,
          label,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 5);
  }, []);

  useEffect(() => {
    const loadFeedbackSummary = async () => {
      if (!token || role === 'applicant') {
        setUnreadFeedbackCount(0);
        return;
      }

      try {
        const summary = await fetchFeedbackSummary(token);
        setUnreadFeedbackCount(summary.unreadCount);
      } catch {
        setUnreadFeedbackCount(0);
      }
    };

    loadFeedbackSummary();
  }, [role, token]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-700 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.2),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(196,181,253,0.16),transparent_35%)]" />
        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-cyan-100">
                <Bell className="h-3.5 w-3.5" />
                Notifications
              </div>
              <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight">Notification Center</h1>
              <p className="mt-3 max-w-3xl text-cyan-100 text-sm sm:text-base leading-relaxed">
                This page collects the actions that need your attention so the bell always lands in one predictable place.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <div className="text-xs text-cyan-100/95">Role</div>
                <div className="mt-1 text-2xl font-bold capitalize">{role.replace(/_/g, ' ')}</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <div className="text-xs text-cyan-100/95">Open items</div>
                <div className="mt-1 text-2xl font-bold">
                  {applicantFineNotifications.length + applicantFineCases.length + permitExpiryAlerts.length + unreadFeedbackCount}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg xl:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Action Required</h2>
              <p className="text-sm text-slate-500">Items that need attention right now.</p>
            </div>
            <StatusBadge status={applicantFineNotifications.length + permitExpiryAlerts.length > 0 ? 'warning' : 'success'}>
              {applicantFineNotifications.length + permitExpiryAlerts.length > 0 ? 'Attention Needed' : 'All Clear'}
            </StatusBadge>
          </div>

          <div className="space-y-4">
            {role === 'applicant' && applicantFineNotifications.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-amber-900 font-semibold">
                  <FileWarning className="h-4 w-4" />
                  Fine alerts
                </div>
                <div className="mt-3 space-y-2">
                  {applicantFineNotifications.slice(0, 3).map((item) => (
                    <p key={item.id} className="text-sm text-amber-800">{item.message}</p>
                  ))}
                </div>
                <div className="mt-4">
                  <Link to="/fine-pay">
                    <Button size="sm">Open Fine Tracking</Button>
                  </Link>
                </div>
              </div>
            )}

            {role === 'applicant' && applicantFineCases.length > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 text-red-900 font-semibold">
                  <ShieldAlert className="h-4 w-4" />
                  Pending fines
                </div>
                <div className="mt-3 space-y-2">
                  {applicantFineCases.slice(0, 3).map((fine) => (
                    <div key={fine.cocId} className="text-sm text-red-800">
                      {fine.cocId} · {fine.applicationId} · LKR {fine.amount.toLocaleString('en-LK')}
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Link to="/fine-pay">
                    <Button size="sm" variant="secondary">Pay Fine</Button>
                  </Link>
                </div>
              </div>
            )}

            {permitExpiryAlerts.length > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center gap-2 text-blue-900 font-semibold">
                  <FileText className="h-4 w-4" />
                  Permit reminders
                </div>
                <div className="mt-3 space-y-2">
                  {permitExpiryAlerts.map((alert) => (
                    <div key={`${alert.applicationId}-${alert.daysRemaining}`} className="text-sm text-blue-800">
                      {alert.applicationId} · {alert.daysRemaining} day(s) remaining · Valid until {formatDate(alert.validUntil)}
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Link to="/permit-tracking">
                    <Button size="sm" variant="secondary">Open Permit Tracking</Button>
                  </Link>
                </div>
              </div>
            )}

            {role !== 'applicant' && unreadFeedbackCount === 0 && permitExpiryAlerts.length === 0 && applicantFineNotifications.length === 0 && applicantFineCases.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                No pending notifications at the moment.
              </div>
            )}

            {role !== 'applicant' && unreadFeedbackCount > 0 && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex items-center gap-2 text-sky-900 font-semibold">
                  <Mail className="h-4 w-4" />
                  Feedback inbox updates
                </div>
                <p className="mt-3 text-sm text-sky-800">You have {unreadFeedbackCount} unread feedback item(s).</p>
                <div className="mt-4">
                  <Link to="/feedback-inbox">
                    <Button size="sm" variant="secondary">Open Feedback Inbox</Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Quick Links</h2>
            <p className="text-sm text-slate-500">Jump directly to the workflow pages behind each notification.</p>
          </div>

          <div className="space-y-3">
            <Link to="/dashboard">
              <Button variant="secondary" className="w-full">Dashboard</Button>
            </Link>
            {role === 'applicant' && (
              <>
                <Link to="/fine-pay">
                  <Button variant="secondary" className="w-full">Fine Tracking</Button>
                </Link>
                <Link to="/permit-tracking">
                  <Button variant="secondary" className="w-full">Permit Tracking</Button>
                </Link>
                <Link to="/coc-requests">
                  <Button variant="secondary" className="w-full">COC Requests</Button>
                </Link>
              </>
            )}
            {role !== 'applicant' && (
              <Link to="/feedback-inbox">
                <Button variant="secondary" className="w-full">Feedback Inbox</Button>
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-2">
            <p className="font-semibold text-slate-800">Why this page exists</p>
            <p>The bell should always open a notifications hub. That keeps navigation predictable and avoids routing directly into a single workflow section.</p>
          </div>
        </div>
      </section>

      {role !== 'applicant' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <h2 className="text-lg font-bold text-slate-800">Staff Notice</h2>
          <p className="mt-2 text-sm text-slate-500">
            Use the feedback inbox for citizen submissions. If you want this page to show staff notification records from the backend, I can wire it to a dedicated API next.
          </p>
        </section>
      )}
    </div>
  );
};

export default Notifications;
