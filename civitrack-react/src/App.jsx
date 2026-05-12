import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { forceRefreshDocumentChecklistConfig, refreshDocumentChecklistConfig } from './utils/documentChecklistConfig.js';

const lazyWithSuspense = (importFunc) => {
  const LazyComp = lazy(importFunc);
  return (props) => (
    <Suspense fallback={<RouteLoader />}>
      <LazyComp {...props} />
    </Suspense>
  );
};

const DashboardLayout = lazyWithSuspense(() => import('./layouts/DashboardLayout'));
const PublicLayout = lazyWithSuspense(() => import('./layouts/PublicLayout.jsx'));
const Dashboard = lazyWithSuspense(() => import('./pages/applicant/Dashboard'));
const NewApplication = lazyWithSuspense(() => import('./pages/applicant/NewApplication.jsx'));
const Applications = lazyWithSuspense(() => import('./pages/applicant/Applications'));
const CocRequests = lazyWithSuspense(() => import('./pages/applicant/CocRequests'));
const AppealsPage = lazyWithSuspense(() => import('./pages/applicant/AppealsPage.jsx'));
const FinePay = lazyWithSuspense(() => import('./pages/applicant/FinePay.jsx'));
const PermitTracking = lazyWithSuspense(() => import('./pages/applicant/PermitTracking.jsx'));
const NotificationsPage = lazyWithSuspense(() => import('./pages/shared/Notifications.jsx'));
const Profile = lazyWithSuspense(() => import('./pages/applicant/Profile'));
const Login = lazyWithSuspense(() => import('./pages/auth/Login.jsx'));
const Register = lazyWithSuspense(() => import('./pages/auth/Register.jsx'));
const Landing = lazyWithSuspense(() => import('./pages/public/Landing.jsx'));
const Info = lazyWithSuspense(() => import('./pages/public/Info.jsx'));
const Feedback = lazyWithSuspense(() => import('./pages/public/Feedback.jsx'));
const About = lazyWithSuspense(() => import('./pages/public/About.jsx'));
const PlanningOfficerDashboard = lazyWithSuspense(() => import('./pages/staff/PlanningOfficerDashboard.jsx'));
const TechnicalOfficerDashboard = lazyWithSuspense(() => import('./pages/staff/TechnicalOfficerDashboard.jsx'));
const SuperintendentDashboard = lazyWithSuspense(() => import('./pages/staff/SuperintendentDashboard.jsx'));
const CommitteeDashboard = lazyWithSuspense(() => import('./pages/staff/CommitteeDashboard.jsx'));
const AdminDashboard = lazyWithSuspense(() => import('./pages/admin/AdminDashboard.jsx'));
const ReportsAnalytics = lazyWithSuspense(() => import('./pages/reports/ReportsAnalytics.jsx'));
const FeedbackInbox = lazyWithSuspense(() => import('./pages/staff/FeedbackInbox.jsx'));

const RouteLoader = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-slate-600 text-sm">
    Loading page...
  </div>
);

const roleHomePath = (role) => {
  switch (role) {
    case 'planning_officer':
      return '/queue';
    case 'technical_officer':
      return '/inspections';
    case 'superintendent':
      return '/reviews';
    case 'committee':
      return '/approvals';
    case 'admin':
      return '/admin';
    case 'applicant':
    default:
      return '/dashboard';
  }
};

const Protected = ({ children, allowedRoles = null }) => {
  const { token, user } = useAuth();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (Array.isArray(allowedRoles) && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }

  return children;
};

const RoleDashboardHome = () => {
  const { user } = useAuth();

  switch (user?.role) {
    case 'planning_officer':
      return <PlanningOfficerDashboard view="dashboard" />;
    case 'technical_officer':
      return <TechnicalOfficerDashboard initialTab="dashboard" />;
    case 'superintendent':
      return <SuperintendentDashboard />;
    case 'committee':
      return <CommitteeDashboard />;
    case 'admin':
      return <AdminDashboard />;
    case 'applicant':
    default:
      return <Dashboard />;
  }
};

const App = () => {
  useEffect(() => {
    refreshDocumentChecklistConfig().catch(() => {
      // Keep fallback checklist behavior if the config endpoint is unavailable.
    });

    const intervalId = window.setInterval(() => {
      refreshDocumentChecklistConfig().catch(() => {
        // Ignore transient refresh failures and keep last known cache.
      });
    }, 60000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        forceRefreshDocumentChecklistConfig().catch(() => {
          // Ignore transient refresh failures and keep last known cache.
        });
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="/info" element={<Info />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/about" element={<About />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        element={(
          <Protected>
            <DashboardLayout />
          </Protected>
        )}
      >
        <Route path="/dashboard" element={<RoleDashboardHome />} />
        <Route path="/new-application" element={<NewApplication />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/coc-requests" element={<CocRequests />} />
        <Route path="/appeals" element={<AppealsPage />} />
        <Route path="/fine-pay" element={<FinePay />} />
        <Route path="/permit-tracking" element={<PermitTracking />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/queue" element={<Protected allowedRoles={['planning_officer', 'admin']}><PlanningOfficerDashboard view="queue" /></Protected>} />
        <Route path="/coc-queue" element={<Protected allowedRoles={['planning_officer', 'admin']}><PlanningOfficerDashboard view="coc" /></Protected>} />
        <Route path="/appeal-queue" element={<Protected allowedRoles={['planning_officer', 'admin']}><PlanningOfficerDashboard view="appeals" /></Protected>} />
        <Route path="/permits" element={<Protected allowedRoles={['planning_officer', 'admin']}><PlanningOfficerDashboard view="permits" /></Protected>} />
        <Route path="/assign" element={<Protected allowedRoles={['planning_officer', 'admin']}><PlanningOfficerDashboard view="queue" /></Protected>} />
        <Route path="/inspections" element={<Protected allowedRoles={['technical_officer', 'admin']}><TechnicalOfficerDashboard initialTab="inspections" /></Protected>} />
        <Route path="/coc-inspections" element={<Protected allowedRoles={['technical_officer', 'admin']}><TechnicalOfficerDashboard initialTab="coc" /></Protected>} />
        <Route path="/reports" element={<Navigate to="/analytics" replace />} />
        <Route path="/reviews" element={<Protected allowedRoles={['superintendent', 'admin']}><SuperintendentDashboard /></Protected>} />
        <Route path="/endorsed" element={<Protected allowedRoles={['superintendent', 'admin']}><SuperintendentDashboard /></Protected>} />
        <Route path="/approvals" element={<Protected allowedRoles={['committee', 'admin']}><CommitteeDashboard /></Protected>} />
        <Route path="/admin" element={<Protected allowedRoles={['admin']}><AdminDashboard /></Protected>} />
        <Route path="/admin/dashboard" element={<Protected allowedRoles={['admin']}><AdminDashboard /></Protected>} />
        <Route path="/admin/users" element={<Protected allowedRoles={['admin']}><AdminDashboard /></Protected>} />
        <Route path="/admin/logs" element={<Protected allowedRoles={['admin']}><AdminDashboard /></Protected>} />
        <Route path="/admin/settings" element={<Protected allowedRoles={['admin']}><AdminDashboard /></Protected>} />
        <Route path="/feedback-inbox" element={<Protected allowedRoles={['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']}><FeedbackInbox /></Protected>} />
        <Route path="/analytics" element={<Protected allowedRoles={['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']}><ReportsAnalytics /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default App;
