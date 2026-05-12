import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Logo from '../../assets/logo.svg';
import { prefetchRoute } from '../../utils/routePrefetch';
import {
  LayoutDashboard,
  FolderOpen,
  Award,
  UserCircle2,
  FileText,
  ClipboardList,
  BarChart3,
  Camera,
  CheckSquare,
  Users,
  Settings,
  TrendingUp,
} from 'lucide-react';

const navByRole = {
  applicant: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', primary: true },
    { to: '/applications', icon: FolderOpen, label: 'My Applications' },
    { to: '/appeals', icon: FileText, label: 'Appeals' },
    { to: '/fine-pay', icon: BarChart3, label: 'Fine Tracking' },
    { to: '/permit-tracking', icon: Award, label: 'Permit Tracking' },
    { to: '/coc-requests', icon: Award, label: 'My COC Requests' },
    { to: '/profile', icon: UserCircle2, label: 'Profile Settings' },
  ],
  planning_officer: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', primary: true },
    { to: '/queue', icon: ClipboardList, label: 'Application Queue' },
    { to: '/coc-queue', icon: Award, label: 'COC Requests' },
    { to: '/appeal-queue', icon: FileText, label: 'Appeals' },
    { to: '/permits', icon: CheckSquare, label: 'Permit Issuance' },
    { to: '/feedback-inbox', icon: Users, label: 'Feedback Inbox' },
    { to: '/analytics', icon: BarChart3, label: 'Reports & Analytics' },
  ],
  technical_officer: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', primary: true },
    { to: '/inspections', icon: Camera, label: 'Site Inspections' },
    { to: '/coc-inspections', icon: Award, label: 'COC Inspections' },
    { to: '/feedback-inbox', icon: Users, label: 'Feedback Inbox' },
    { to: '/analytics', icon: BarChart3, label: 'Reports & Analytics' },
  ],
  superintendent: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', primary: true },
    { to: '/reviews', icon: CheckSquare, label: 'Superintendent Review' },
    { to: '/endorsed', icon: Award, label: 'Endorsed Applications' },
    { to: '/feedback-inbox', icon: Users, label: 'Feedback Inbox' },
    { to: '/analytics', icon: TrendingUp, label: 'Analytics' },
  ],
  committee: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', primary: true },
    { to: '/approvals', icon: CheckSquare, label: 'Planning Committee Review' },
    { to: '/feedback-inbox', icon: Users, label: 'Feedback Inbox' },
    { to: '/analytics', icon: BarChart3, label: 'Decision History' },
  ],
  admin: [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Admin Overview' },
    { to: '/admin/users', icon: Users, label: 'User Management' },
    { to: '/admin/logs', icon: FileText, label: 'System Logs' },
    { to: '/admin/settings', icon: Settings, label: 'Admin Settings' },
    { to: '/feedback-inbox', icon: Users, label: 'Feedback Inbox' },
    { to: '/analytics', icon: BarChart3, label: 'Reports & Analytics' },
  ],
};

const Sidebar = ({ role = 'applicant', onNavigate }) => {
  const items = navByRole[role] || navByRole.applicant;
  const homeRoute = role === 'admin' ? '/admin/dashboard' : '/dashboard';
  const location = useLocation();

  return (
    <div className="h-full w-64 glass-sidebar flex flex-col z-40">
      {/* Logo/Header */}
      <div className="h-20 flex items-center px-8 border-b border-white/20">
        <NavLink to={homeRoute} onClick={onNavigate} className="flex items-center group transition-transform hover:scale-105">
          <img src={Logo} alt="CiviTrack" className="h-10 w-auto filter drop-shadow-sm" />
        </NavLink>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
        {items.map(({ to, icon: Icon, label, primary }) => (
          <NavLink
            key={to}
            to={to}
            onMouseEnter={() => prefetchRoute(to, role)}
            onFocus={() => prefetchRoute(to, role)}
            onTouchStart={() => prefetchRoute(to, role)}
            className={({ isActive }) =>
              `flex items-center px-4 py-2.5 rounded-xl transition-all duration-300 group ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200/50 font-bold scale-[1.02]'
                  : 'text-slate-500 hover:bg-white/60 hover:text-blue-600 hover:translate-x-1'
              }`.trim()
            }
            onClick={onNavigate}
          >
            <Icon className={`h-5 w-5 mr-3 transition-colors ${primary ? 'text-blue-500' : ''} group-hover:text-current`} />
            <span className="text-[13px] tracking-wide">{label}</span>
            {primary && !location.pathname.includes(to) && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Optional: User Footer or decorative element */}
      <div className="p-4 border-t border-white/20">
        <div className="bg-slate-100/50 rounded-xl p-3 border border-white/40 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white shadow-sm uppercase">
            {role.charAt(0)}
          </div>
          <div className="overflow-hidden">
            <p className="text-[11px] font-bold text-slate-800 uppercase truncate">{role.replace('_', ' ')}</p>
            <p className="text-[9px] text-slate-500 truncate">Workspace Active</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

