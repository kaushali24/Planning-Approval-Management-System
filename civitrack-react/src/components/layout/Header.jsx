import React from 'react';
import { Bell, Menu } from 'lucide-react';

const roleConfig = {
  applicant: { label: 'Applicant', color: 'bg-blue-100 text-blue-700' },
  planning_officer: { label: 'Planning Officer', color: 'bg-blue-50 text-blue-700' },
  technical_officer: { label: 'Technical Officer', color: 'bg-blue-50 text-blue-700' },
  superintendent: { label: 'Superintendent', color: 'bg-blue-50 text-blue-700' },
  committee: { label: 'Committee Member', color: 'bg-blue-50 text-blue-700' },
  admin: { label: 'Administrator', color: 'bg-slate-100 text-slate-700' },
};

const Header = ({
  user = { full_name: 'User', role: 'applicant' },
  pageSection = '',
  pageTitle = '',
  onMenuToggle,
  onLogout,
  pendingFinesCount = 0,
  feedbackUnreadCount = 0,
  onNotificationsClick,
}) => {
  const roleInfo = roleConfig[user?.role] || roleConfig.applicant;
  const showPendingFinesBadge = user?.role === 'applicant' && pendingFinesCount > 0;
  const showFeedbackBadge = user?.role !== 'applicant' && feedbackUnreadCount > 0;
  const notificationLabel = user?.role === 'applicant'
    ? (showPendingFinesBadge ? `Notifications, ${pendingFinesCount} pending fines` : 'Notifications')
    : (showFeedbackBadge ? `Notifications, ${feedbackUnreadCount} unread feedback items` : 'Notifications');

  return (
  <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center h-16">
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="lg:hidden p-2 rounded-md hover:bg-slate-100"
            onClick={onMenuToggle}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5 text-slate-700" />
          </button>
          <div className="min-w-0">
            {pageSection ? (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 truncate">{pageSection}</p>
            ) : null}
            {pageTitle ? (
              <p className="text-sm sm:text-base font-semibold text-slate-800 truncate">{pageTitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <button
            className="relative text-slate-500 hover:text-slate-700 focus:outline-none"
            aria-label={notificationLabel}
            onClick={onNotificationsClick}
          >
            <Bell className="h-6 w-6" />
            {showPendingFinesBadge ? (
              <span className="absolute -top-2 -right-3 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white">
                {pendingFinesCount > 99 ? '99+' : pendingFinesCount}
              </span>
            ) : showFeedbackBadge ? (
              <span className="absolute -top-2 -right-3 min-w-[20px] h-5 px-1 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white">
                {feedbackUnreadCount > 99 ? '99+' : feedbackUnreadCount}
              </span>
            ) : (
              <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white" />
            )}
          </button>
          <div className="flex items-center space-x-4 pl-4 border-l border-slate-200">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{user?.full_name || 'User'}</p>
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${roleInfo.color}`}>
                {roleInfo.label}
              </span>
            </div>
            <button className="text-sm text-slate-600 hover:text-slate-800 font-medium" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
  );
};

export default Header;
