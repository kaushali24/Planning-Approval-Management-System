import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE_URL } from '../utils/apiBase.js';
import { fetchFeedbackSummary } from '../utils/feedbackService';
import { loadCocWorkflow } from '../data/cocWorkflowStore';
import {
  canExtendPermit,
  getPermitDaysUntilExpiry,
  isBuildingPermit,
  loadPermitWorkflow,
  savePermitWorkflow,
} from '../data/permitWorkflowStore';
import { notifyPermitExpired, notifyPermitExpiringSoon } from '../utils/notificationService';

const getHeaderMeta = (pathname, role) => {
  const defaultByRole = {
    applicant: { section: 'Applicant Portal', title: 'My Dashboard' },
    planning_officer: { section: 'Planning Section', title: 'Planning Section Dashboard' },
    technical_officer: { section: 'Technical Office', title: 'Technical Officer Dashboard' },
    superintendent: { section: 'Superintendent Review', title: 'Superintendent of Works Dashboard' },
    committee: { section: 'Planning Committee', title: 'Planning Committee Dashboard' },
    admin: { section: 'Administration', title: 'Admin Dashboard' },
  };

  const byPath = {
    '/dashboard': defaultByRole[role] || defaultByRole.applicant,
    '/queue': { section: 'Planning Section', title: 'Planning Section Dashboard' },
    '/assign': { section: 'Planning Section', title: 'Planning Section Dashboard' },
    '/coc-queue': { section: 'Planning Section', title: 'COC Requests Queue' },
    '/appeal-queue': { section: 'Planning Section', title: 'Appeals Queue' },
    '/permits': { section: 'Planning Section', title: 'Permit Issuance' },
    '/inspections': { section: 'Technical Office', title: 'Site Inspections' },
    '/coc-inspections': { section: 'Technical Office', title: 'COC Inspections' },
    '/reviews': { section: 'Superintendent Review', title: 'Superintendent Review Queue' },
    '/endorsed': { section: 'Superintendent Review', title: 'Endorsed Applications' },
    '/approvals': { section: 'Planning Committee', title: 'Committee Review' },
    '/admin': { section: 'Administration', title: 'Admin Settings' },
    '/admin/dashboard': { section: 'Administration', title: 'Admin Overview' },
    '/admin/users': { section: 'Administration', title: 'User Management' },
    '/admin/logs': { section: 'Administration', title: 'System Logs' },
    '/admin/settings': { section: 'Administration', title: 'Admin Settings' },
    '/applications': { section: 'Applicant Portal', title: 'My Applications' },
    '/new-application': { section: 'Applicant Portal', title: 'Start New Application' },
    '/appeals': { section: 'Applicant Portal', title: 'Appeals' },
    '/coc-requests': { section: 'Applicant Portal', title: 'COC Requests' },
    '/fine-pay': { section: 'Applicant Portal', title: 'Fine Tracking' },
    '/permit-tracking': { section: 'Applicant Portal', title: 'Permit Tracking' },
    '/profile': { section: 'Account', title: 'Profile Settings' },
    '/notifications': { section: 'Notifications', title: 'Notification Center' },
    '/feedback-inbox': { section: 'Feedback', title: 'Feedback Inbox' },
    '/analytics': { section: 'Reports', title: 'Reports & Analytics' },
  };

  return byPath[pathname] || defaultByRole[role] || defaultByRole.applicant;
};

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingFinesCount, setPendingFinesCount] = useState(0);
  const [feedbackUnreadCount, setFeedbackUnreadCount] = useState(0);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const headerMeta = getHeaderMeta(location.pathname, user?.role);

  useEffect(() => {
    const recalcPendingFines = () => {
      if (user?.role !== 'applicant') {
        setPendingFinesCount(0);
        return;
      }

      const applicantEmail = String(user?.email || '').trim().toLowerCase();
      const rows = loadCocWorkflow();
      const count = rows
        .filter((row) => String(row.applicantEmail || '').trim().toLowerCase() === applicantEmail)
        .filter((row) => (row.status === 'coc-violations-found' || row.status === 'coc-rejected-non-rectifiable'))
        .filter((row) => row.violationReport?.fineRequired !== false)
        .filter((row) => !row.finePaidAt)
        .length;

      setPendingFinesCount(count);
    };

    recalcPendingFines();
    window.addEventListener('storage', recalcPendingFines);
    return () => window.removeEventListener('storage', recalcPendingFines);
  }, [user]);

  useEffect(() => {
    const loadFeedbackSummary = async () => {
      if (!user || user.role === 'applicant') {
        setFeedbackUnreadCount(0);
        return;
      }

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setFeedbackUnreadCount(0);
        return;
      }

      try {
        const summary = await fetchFeedbackSummary(token);
        setFeedbackUnreadCount(summary.unreadCount);
      } catch {
        setFeedbackUnreadCount(0);
      }
    };

    loadFeedbackSummary();
  }, [user, location.pathname]);

  useEffect(() => {
    const runPermitReminders = async () => {
      if (user?.role !== 'applicant' || !user?.email) return;

      const permits = loadPermitWorkflow();
      if (!permits.length) return;

      const applicantName = user.fullName || user.name || 'Applicant';
      let changed = false;
      const next = [...permits];

      for (let i = 0; i < next.length; i += 1) {
        const permit = next[i];
        if (!isBuildingPermit(permit) || !permit?.validUntil) continue;

        const daysRemaining = getPermitDaysUntilExpiry(permit);
        if (daysRemaining === null) continue;

        const reminders = permit.reminderFlags || {};
        const currentYear = (permit.extensionsUsed || 0) + 1;
        const maxYears = permit.maxYears || 5;
        const expiryDate = new Date(permit.validUntil).toISOString().slice(0, 10);
        const reference = permit.applicationId;

        if (daysRemaining <= 30 && daysRemaining > 7 && !reminders.sent30DayAt) {
          const result = await notifyPermitExpiringSoon(
            user.email,
            applicantName,
            reference,
            expiryDate,
            daysRemaining,
            currentYear,
            maxYears
          );
          if (result.success) {
            next[i] = {
              ...permit,
              reminderFlags: { ...reminders, sent30DayAt: new Date().toISOString() },
            };
            changed = true;
          }
        }

        if (daysRemaining <= 7 && daysRemaining >= 0 && !next[i].reminderFlags?.sent7DayAt) {
          const result = await notifyPermitExpiringSoon(
            user.email,
            applicantName,
            reference,
            expiryDate,
            daysRemaining,
            currentYear,
            maxYears
          );
          if (result.success) {
            next[i] = {
              ...next[i],
              reminderFlags: { ...(next[i].reminderFlags || {}), sent7DayAt: new Date().toISOString() },
            };
            changed = true;
          }
        }

        if (daysRemaining < 0 && !next[i].reminderFlags?.sentExpiredAt) {
          const result = await notifyPermitExpired(
            user.email,
            applicantName,
            reference,
            expiryDate,
            canExtendPermit(next[i]),
            maxYears
          );
          if (result.success) {
            next[i] = {
              ...next[i],
              reminderFlags: { ...(next[i].reminderFlags || {}), sentExpiredAt: new Date().toISOString() },
            };
            changed = true;
          }
        }
      }

      if (changed) {
        savePermitWorkflow(next);
      }
    };

    runPermitReminders();
  }, [user, location.pathname]);

  return (
    <div className="flex h-screen bg-slate-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed z-40 lg:static h-full w-64 bg-white border-r border-slate-200 flex-shrink-0 transform transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar role={user?.role} onNavigate={() => setSidebarOpen(false)} />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          user={user}
          pageSection={headerMeta.section}
          pageTitle={headerMeta.title}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
          onLogout={logout}
          pendingFinesCount={pendingFinesCount}
          feedbackUnreadCount={feedbackUnreadCount}
          onNotificationsClick={() => {
            navigate('/notifications');
          }}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-100 p-4 sm:p-6 lg:p-8">
          <div className="h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
