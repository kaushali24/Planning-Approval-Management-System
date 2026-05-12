const prefetchedKeys = new Set();

const prefetchersByRoute = {
  '/applications': () => import('../pages/applicant/Applications'),
  '/coc-requests': () => import('../pages/applicant/CocRequests'),
  '/appeals': () => import('../pages/applicant/AppealsPage.jsx'),
  '/fine-pay': () => import('../pages/applicant/FinePay.jsx'),
  '/permit-tracking': () => import('../pages/applicant/PermitTracking.jsx'),
  '/profile': () => import('../pages/applicant/Profile'),
  '/new-application': () => import('../pages/applicant/NewApplication.jsx'),
  '/queue': () => import('../pages/staff/PlanningOfficerDashboard.jsx'),
  '/assign': () => import('../pages/staff/PlanningOfficerDashboard.jsx'),
  '/inspections': () => import('../pages/staff/TechnicalOfficerDashboard.jsx'),
  '/coc-inspections': () => import('../pages/staff/TechnicalOfficerDashboard.jsx'),
  '/reviews': () => import('../pages/staff/SuperintendentDashboard.jsx'),
  '/endorsed': () => import('../pages/staff/SuperintendentDashboard.jsx'),
  '/approvals': () => import('../pages/staff/CommitteeDashboard.jsx'),
  '/admin': () => import('../pages/admin/AdminDashboard.jsx'),
  '/analytics': () => import('../pages/reports/ReportsAnalytics.jsx'),
  '/login': () => import('../pages/auth/Login.jsx'),
  '/register': () => import('../pages/auth/Register.jsx'),
};

const dashboardByRole = {
  applicant: () => import('../pages/applicant/Dashboard'),
  planning_officer: () => import('../pages/staff/PlanningOfficerDashboard.jsx'),
  technical_officer: () => import('../pages/staff/TechnicalOfficerDashboard.jsx'),
  superintendent: () => import('../pages/staff/SuperintendentDashboard.jsx'),
  committee: () => import('../pages/staff/CommitteeDashboard.jsx'),
  admin: () => import('../pages/admin/AdminDashboard.jsx'),
};

const getPrefetcher = (route, role) => {
  if (route === '/dashboard') {
    return dashboardByRole[role] || dashboardByRole.applicant;
  }
  return prefetchersByRoute[route] || null;
};

export const prefetchRoute = (route, role = 'applicant') => {
  const prefetcher = getPrefetcher(route, role);
  if (!prefetcher) return;

  const key = `${role}:${route}`;
  if (prefetchedKeys.has(key)) return;
  prefetchedKeys.add(key);

  prefetcher().catch(() => {
    prefetchedKeys.delete(key);
  });
};
