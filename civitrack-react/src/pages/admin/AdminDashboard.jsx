import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Users, Settings, FileText, DollarSign, AlertCircle, FileSearch } from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatCurrencyLKR, formatDate } from '../../utils/locale';
import { useNotifications } from '../../context/NotificationContext.jsx';
import ReportSnapshotWidget from '../../components/reports/ReportSnapshotWidget.jsx';
import { saveCachedDocumentChecklistConfig } from '../../utils/documentChecklistConfig.js';

const API_BASE = 'http://localhost:5000/api';
const STAFF_ROLE_OPTIONS = [
  { value: 'planning_officer', label: 'Planning Officer' },
  { value: 'technical_officer', label: 'Technical Officer' },
  { value: 'superintendent', label: 'Superintendent of Works' },
  { value: 'committee', label: 'Planning Committee' },
];
const STAFF_ROLE_LABEL = Object.fromEntries(STAFF_ROLE_OPTIONS.map((option) => [option.value, option.label]));
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#]).{8,}$/;
const SYSTEM_SETTING_KEYS = {
  emailNotifications: 'email_notifications',
  autoAssignment: 'auto_assignment',
  dataBackup: 'data_backup',
};

const generateAdminTemporaryPassword = (length = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
};

const getActiveAdminView = (pathname) => {
  const path = (pathname || '').toLowerCase();
  if (path === '/admin/dashboard') return 'dashboard';
  if (path === '/admin/users') return 'user-management';
  if (path === '/admin/logs') return 'system-logs';
  if (path === '/admin/settings') return 'settings';
  return 'user-management';
};

const AdminDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { success, error } = useNotifications();
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    role: '',
    password: '',
    confirmPassword: '',
  });
  const [staffToReset, setStaffToReset] = useState(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({
    newPassword: generateAdminTemporaryPassword(12),
    confirmPassword: '',
    autoGenerate: true,
  });
  const [documentChecklist, setDocumentChecklist] = useState([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistBusyKey, setChecklistBusyKey] = useState('');
  const [staffMembers, setStaffMembers] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffBusyId, setStaffBusyId] = useState(null);
  const [resettingStaffPassword, setResettingStaffPassword] = useState(false);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [overviewStats, setOverviewStats] = useState({
    totalApplications: 0,
    activeStaff: 0,
    pendingReviews: 0,
  });
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [systemLogs, setSystemLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [feeConfig, setFeeConfig] = useState([]);
  const [feeDrafts, setFeeDrafts] = useState({});
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeSaving, setFeeSaving] = useState(false);
  const [systemSettings, setSystemSettings] = useState({
    emailNotifications: true,
    autoAssignment: false,
    dataBackup: true,
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsBusyKey, setSettingsBusyKey] = useState('');
  const activeView = getActiveAdminView(location.pathname);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const loadDocumentChecklist = useCallback(async () => {
    try {
      setChecklistLoading(true);
      const res = await fetch(`${API_BASE}/admin/config/documents`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load document checklist');
      }
      const items = Array.isArray(data.items) ? data.items : [];
      setDocumentChecklist(items);
      saveCachedDocumentChecklistConfig(items);
    } catch (err) {
      error(err.message || 'Failed to load document checklist configuration');
    } finally {
      setChecklistLoading(false);
    }
  }, [error, getAuthHeaders]);

  const loadStaffMembers = useCallback(async () => {
    try {
      setStaffLoading(true);
      const res = await fetch(`${API_BASE}/staff/admin/accounts`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load staff members');
      }
      const rows = Array.isArray(data.staffAccounts) ? data.staffAccounts : [];
      setStaffMembers(rows);
    } catch (err) {
      error(err.message || 'Failed to load staff members');
    } finally {
      setStaffLoading(false);
    }
  }, [error, getAuthHeaders]);

  const loadOverviewStats = useCallback(async () => {
    try {
      setOverviewLoading(true);
      const res = await fetch(`${API_BASE}/admin/config/overview-stats`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load overview stats');
      }
      setOverviewStats({
        totalApplications: Number(data.stats?.totalApplications || 0),
        activeStaff: Number(data.stats?.activeStaff || 0),
        pendingReviews: Number(data.stats?.pendingReviews || 0),
      });
    } catch (err) {
      error(err.message || 'Failed to load overview stats');
    } finally {
      setOverviewLoading(false);
    }
  }, [error, getAuthHeaders]);

  const loadSystemLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const res = await fetch(`${API_BASE}/admin/config/system-logs?limit=80`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load system logs');
      }
      setSystemLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err) {
      error(err.message || 'Failed to load system logs');
    } finally {
      setLogsLoading(false);
    }
  }, [error, getAuthHeaders]);

  const loadFeeConfig = useCallback(async () => {
    try {
      setFeeLoading(true);
      const res = await fetch(`${API_BASE}/admin/config/fees`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load fee configuration');
      }

      const rows = Array.isArray(data.fees) ? data.fees : [];
      setFeeConfig(rows);
      setFeeDrafts(
        rows.reduce((acc, fee) => {
          acc[fee.fee_type] = String(Number(fee.amount || 0));
          return acc;
        }, {})
      );
    } catch (err) {
      error(err.message || 'Failed to load fee configuration');
    } finally {
      setFeeLoading(false);
    }
  }, [error, getAuthHeaders]);

  const loadSystemSettings = useCallback(async () => {
    try {
      setSettingsLoading(true);
      const res = await fetch(`${API_BASE}/admin/config/settings`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load system settings');
      }

      setSystemSettings((prev) => ({
        ...prev,
        emailNotifications: data.settings?.emailNotifications === true,
        autoAssignment: data.settings?.autoAssignment === true,
        dataBackup: data.settings?.dataBackup === true,
      }));
    } catch (err) {
      error(err.message || 'Failed to load system settings');
    } finally {
      setSettingsLoading(false);
    }
  }, [error, getAuthHeaders]);

  const updateDocumentChecklistItem = async (item, updates) => {
    const key = item.doc_type_key;
    try {
      setChecklistBusyKey(key);
      const payload = {
        displayName: updates.displayName ?? item.display_name,
        description: updates.description ?? item.description ?? '',
        isRequired: updates.isRequired ?? item.is_required,
        isActive: updates.isActive ?? item.is_active,
        sortOrder: updates.sortOrder ?? item.sort_order ?? 100,
      };

      const res = await fetch(`${API_BASE}/admin/config/documents/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update checklist item');
      }

      const nextItems = documentChecklist.map((row) => (row.doc_type_key === key ? data.item : row));
      setDocumentChecklist(nextItems);
      saveCachedDocumentChecklistConfig(nextItems);
      success(`Checklist item ${key} updated`);
    } catch (err) {
      error(err.message || 'Failed to update checklist item');
    } finally {
      setChecklistBusyKey('');
    }
  };

  useEffect(() => {
    if (activeView === 'settings') {
      loadDocumentChecklist();
      loadSystemSettings();
    }
  }, [activeView, loadDocumentChecklist, loadSystemSettings]);

  useEffect(() => {
    if (activeView === 'user-management') {
      loadStaffMembers();
    }
  }, [activeView, loadStaffMembers]);

  useEffect(() => {
    if (activeView === 'dashboard') {
      loadOverviewStats();
      loadFeeConfig();
    }
  }, [activeView, loadOverviewStats, loadFeeConfig]);

  useEffect(() => {
    if (activeView === 'system-logs') {
      loadSystemLogs();
    }
  }, [activeView, loadSystemLogs]);

  const stats = [
    {
      key: 'applications',
      label: 'Total Applications',
      value: overviewStats.totalApplications,
      icon: FileText,
      helper: 'All submitted records in the system',
      iconWrapClass: 'bg-sky-100',
      iconClass: 'text-sky-700',
      actionLabel: 'View Logs',
      actionPath: '/admin/logs',
    },
    {
      key: 'staff',
      label: 'Active Staff',
      value: overviewStats.activeStaff,
      icon: Users,
      helper: 'Currently enabled internal users',
      iconWrapClass: 'bg-emerald-100',
      iconClass: 'text-emerald-700',
      actionLabel: 'Manage Users',
      actionPath: '/admin/users',
    },
    {
      key: 'reviews',
      label: 'Pending Reviews',
      value: overviewStats.pendingReviews,
      icon: AlertCircle,
      helper: overviewStats.pendingReviews > 0 ? 'Requires workflow attention' : 'No pending review backlog',
      iconWrapClass: overviewStats.pendingReviews > 0 ? 'bg-amber-100' : 'bg-slate-100',
      iconClass: overviewStats.pendingReviews > 0 ? 'text-amber-700' : 'text-slate-700',
      actionLabel: 'Open Dashboard',
      actionPath: '/admin/dashboard',
    },
  ];

  const attentionItems = [
    overviewStats.pendingReviews > 0
      ? `${overviewStats.pendingReviews} application(s) are waiting for review.`
      : 'No applications are currently waiting for review.',
    overviewStats.totalApplications > 0
      ? `${overviewStats.totalApplications} total application(s) are currently in the system.`
      : 'No applications have been submitted yet.',
    overviewStats.activeStaff < 2
      ? 'Low active staff count may slow approvals.'
      : 'Staff capacity appears sufficient for normal operations.',
  ];

  const handleAddStaff = async () => {
    if (!staffForm.name || !staffForm.email || !staffForm.role) {
      error('Please fill all required fields.');
      return;
    }

    if (staffForm.password) {
      if (!PASSWORD_PATTERN.test(staffForm.password)) {
        error('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.');
        return;
      }

      if (staffForm.password !== staffForm.confirmPassword) {
        error('Password confirmation does not match.');
        return;
      }
    }

    try {
      setCreatingStaff(true);
      const payload = {
        fullName: staffForm.name,
        email: staffForm.email,
        role: staffForm.role,
      };

      if (staffForm.password) {
        payload.password = staffForm.password;
      }

      const res = await fetch(`${API_BASE}/staff/admin/accounts`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create staff account');
      }

      await loadStaffMembers();
      setShowStaffModal(false);
      setStaffForm({ name: '', email: '', role: '', password: '', confirmPassword: '' });
      const tempPassword = data.temporaryPassword ? ` Temporary password: ${data.temporaryPassword}` : '';
      const customPasswordMessage = !data.temporaryPassword && staffForm.password
        ? ' Custom password was applied.'
        : '';
      success(`Staff member ${staffForm.name} added successfully.${tempPassword}${customPasswordMessage}`);
    } catch (err) {
      error(err.message || 'Failed to create staff account');
    } finally {
      setCreatingStaff(false);
    }
  };

  const openResetPasswordModal = (staff) => {
    setStaffToReset(staff);
    setResetPasswordForm({
      newPassword: generateAdminTemporaryPassword(12),
      confirmPassword: '',
      autoGenerate: true,
    });
    setShowResetPasswordModal(true);
  };

  const handleResetStaffPassword = async () => {
    if (!staffToReset?.email) {
      error('Staff account email is missing.');
      return;
    }

    const passwordToSet = resetPasswordForm.newPassword;

    if (!PASSWORD_PATTERN.test(passwordToSet)) {
      error('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.');
      return;
    }

    if (!resetPasswordForm.autoGenerate && passwordToSet !== resetPasswordForm.confirmPassword) {
      error('Password confirmation does not match.');
      return;
    }

    try {
      setResettingStaffPassword(true);
      const res = await fetch(`${API_BASE}/auth/admin/reset-staff-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          staffEmail: staffToReset.email,
          newPassword: passwordToSet,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset staff password');
      }

      setShowResetPasswordModal(false);
      success(`Password reset for ${staffToReset.full_name}. New password: ${passwordToSet}`);
    } catch (err) {
      error(err.message || 'Failed to reset staff password');
    } finally {
      setResettingStaffPassword(false);
    }
  };

  const handleToggleStaffStatus = async (staff) => {
    try {
      setStaffBusyId(staff.id);
      const res = await fetch(`${API_BASE}/staff/admin/accounts/${staff.id}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !staff.is_active }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update staff status');
      }

      setStaffMembers((prev) => prev.map((row) => (row.id === staff.id ? data.staffAccount : row)));
      success(`${staff.full_name} ${staff.is_active ? 'deactivated' : 'activated'} successfully.`);
    } catch (err) {
      error(err.message || 'Failed to update staff status');
    } finally {
      setStaffBusyId(null);
    }
  };

  const handleFeeDraftChange = (feeType, value) => {
    setFeeDrafts((prev) => ({
      ...prev,
      [feeType]: value,
    }));
  };

  const handleUpdateFee = async () => {
    if (!feeConfig.length) {
      setShowFeeModal(false);
      return;
    }

    try {
      setFeeSaving(true);
      await Promise.all(
        feeConfig.map(async (fee) => {
          const rawValue = feeDrafts[fee.fee_type];
          const parsedAmount = Number(rawValue);
          if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
            throw new Error(`Invalid amount for ${fee.display_name}`);
          }

          if (Number(fee.amount) === parsedAmount) {
            return;
          }

          const res = await fetch(`${API_BASE}/admin/config/fees/${encodeURIComponent(fee.fee_type)}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ amount: parsedAmount }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || `Failed to update ${fee.display_name}`);
          }
        })
      );

      await loadFeeConfig();
      success('Fee structure updated successfully.');
      setShowFeeModal(false);
    } catch (err) {
      error(err.message || 'Failed to update fee structure');
    } finally {
      setFeeSaving(false);
    }
  };

  const handleToggleSystemSetting = async (settingKey) => {
    const apiKey = SYSTEM_SETTING_KEYS[settingKey];
    if (!apiKey) {
      return;
    }

    const nextValue = !systemSettings[settingKey];

    try {
      setSettingsBusyKey(settingKey);
      const res = await fetch(`${API_BASE}/admin/config/settings/${encodeURIComponent(apiKey)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled: nextValue }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update system setting');
      }

      setSystemSettings((prev) => ({
        ...prev,
        [settingKey]: nextValue,
      }));
      success('System setting updated successfully.');
    } catch (err) {
      error(err.message || 'Failed to update system setting');
    } finally {
      setSettingsBusyKey('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
          {/* Dashboard View */}
          {activeView === 'dashboard' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Overview widgets are live and summarize current operational status.</p>
                <Button variant="secondary" onClick={() => { loadOverviewStats(); loadFeeConfig(); }} disabled={overviewLoading || feeLoading}>
                  {overviewLoading || feeLoading ? 'Refreshing...' : 'Refresh Overview'}
                </Button>
              </div>

              <ReportSnapshotWidget
                title="Admin Snapshot"
                description="Live report summary for the current month across the internal system."
              />

              {/* Statistics Cards */}
              {overviewLoading && (
                <p className="text-sm text-slate-600">Refreshing overview metrics...</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <Card key={stat.key} className="p-6 border border-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-600">{stat.label}</p>
                          <p className="text-3xl font-bold text-slate-800 mt-2">{stat.value}</p>
                          <p className="text-xs text-slate-500 mt-2">{stat.helper}</p>
                          <button
                            className="text-xs mt-3 text-blue-700 hover:text-blue-900"
                            onClick={() => navigate(stat.actionPath)}
                          >
                            {stat.actionLabel}
                          </button>
                        </div>
                        <div className={`p-3 rounded-lg ${stat.iconWrapClass}`}>
                          <Icon className={stat.iconClass} size={24} />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <Card className="p-6 border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-slate-800">Operational Focus</h2>
                  <span className="text-xs text-slate-500">Realtime posture</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {attentionItems.map((item, index) => (
                    <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Application Fee Configuration Section */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <DollarSign className="text-green-600" size={24} />
                    <h2 className="text-xl font-bold text-slate-800">Application Fee Configuration</h2>
                  </div>
                  <Button onClick={() => setShowFeeModal(true)} className="flex items-center gap-2" disabled={feeLoading}>
                    <Settings size={18} />
                    Update Fees
                  </Button>
                </div>

                {feeLoading ? (
                  <p className="text-sm text-slate-600">Loading fee configuration...</p>
                ) : feeConfig.length === 0 ? (
                  <p className="text-sm text-slate-600">No fee configuration items found.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {feeConfig.map((fee) => (
                      <div key={fee.id} className="border border-slate-200 rounded-lg p-4">
                        <h3 className="font-semibold text-slate-800 mb-2">{fee.display_name}</h3>
                        <p className="text-2xl font-bold text-green-600 mb-1">{formatCurrencyLKR(fee.amount)}</p>
                        <p className="text-xs text-slate-500">Last updated: {formatDate(fee.updated_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-4">
                  Boundary wall requests are handled inside the Building Permit workflow and do not have a separate application submission fee.
                </p>
              </Card>
            </>
          )}

          {/* User Management View */}
          {activeView === 'user-management' && (
            <>
              <div className="flex items-center justify-end">
                <Button onClick={() => setShowStaffModal(true)} className="flex items-center gap-2">
                  <Users size={18} />
                  Add Staff Member
                </Button>
              </div>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-600">Manage internal staff accounts and role assignments.</p>
                  <Button variant="secondary" onClick={loadStaffMembers} disabled={staffLoading}>
                    {staffLoading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-slate-700 font-semibold">Staff ID</th>
                        <th className="px-4 py-3 text-left text-slate-700 font-semibold">Name</th>
                        <th className="px-4 py-3 text-left text-slate-700 font-semibold">Email</th>
                        <th className="px-4 py-3 text-left text-slate-700 font-semibold">Role</th>
                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">Status</th>
                        <th className="px-4 py-3 text-center text-slate-700 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffLoading ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                            Loading staff accounts...
                          </td>
                        </tr>
                      ) : staffMembers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                            No staff accounts found.
                          </td>
                        </tr>
                      ) : staffMembers.map((staff) => (
                        <tr key={staff.id} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{staff.staff_id}</td>
                          <td className="px-4 py-3 text-slate-700">{staff.full_name}</td>
                          <td className="px-4 py-3 text-slate-700">{staff.email}</td>
                          <td className="px-4 py-3 text-slate-700">{STAFF_ROLE_LABEL[staff.role] || staff.role}</td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={staff.is_active ? 'active' : 'inactive'}>
                              {staff.is_active ? 'Active' : 'Inactive'}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-3">
                              <button
                                className="text-blue-600 hover:text-blue-800 text-sm"
                                onClick={() => openResetPasswordModal(staff)}
                              >
                                Reset Password
                              </button>
                              <button
                                className="text-red-600 hover:text-red-800 text-sm"
                                disabled={staffBusyId === staff.id}
                                onClick={() => handleToggleStaffStatus(staff)}
                              >
                                {staffBusyId === staff.id ? 'Saving...' : staff.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* System Logs View */}
          {activeView === 'system-logs' && (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 px-2 py-1">Audit trail</span>
                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-1">Workflow events</span>
                <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-1">Configuration history</span>
              </div>
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-600">Recent system activity across application workflow and admin configuration.</p>
                  <Button variant="secondary" onClick={loadSystemLogs} disabled={logsLoading}>
                    {logsLoading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>

                {logsLoading ? (
                  <p className="text-sm text-slate-600">Loading system logs...</p>
                ) : systemLogs.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <FileSearch size={48} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-lg font-medium">No logs available</p>
                    <p className="text-sm">Try refreshing to fetch the latest activity.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-slate-700 font-semibold">Time</th>
                          <th className="px-4 py-3 text-left text-slate-700 font-semibold">Category</th>
                          <th className="px-4 py-3 text-left text-slate-700 font-semibold">Message</th>
                          <th className="px-4 py-3 text-left text-slate-700 font-semibold">Actor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {systemLogs.map((log) => (
                          <tr key={`${log.category}-${log.event_id}-${log.occurred_at}`} className="border-b border-slate-200">
                            <td className="px-4 py-3 text-slate-600">{formatDate(log.occurred_at)}</td>
                            <td className="px-4 py-3 text-slate-700">{log.category}</td>
                            <td className="px-4 py-3 text-slate-800">{log.message}</td>
                            <td className="px-4 py-3 text-slate-700">{log.actor_name || 'System'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}

          {/* Settings View */}
          {activeView === 'settings' && (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 px-2 py-1">Global preferences</span>
                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-1">Automation controls</span>
                <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-1">Checklist policy</span>
              </div>
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">System Preferences</h2>
                    <p className="text-sm text-slate-600">Persisted admin-level runtime settings.</p>
                  </div>
                  <Button variant="secondary" onClick={loadSystemSettings} disabled={settingsLoading}>
                    {settingsLoading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      key: 'emailNotifications',
                      title: 'Email Notifications',
                      description: 'Send email updates to applicants',
                    },
                    {
                      key: 'autoAssignment',
                      title: 'Auto-Assignment',
                      description: 'Automatically assign applications to TOs',
                    },
                    {
                      key: 'dataBackup',
                      title: 'Data Backup',
                      description: 'Automatic daily backups at 2:00 AM',
                    },
                  ].map((item) => {
                    const busy = settingsBusyKey === item.key;
                    const checked = systemSettings[item.key] === true;

                    return (
                      <div key={item.key} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div>
                          <h3 className="font-semibold text-slate-800">{item.title}</h3>
                          <p className="text-sm text-slate-600">{item.description}</p>
                        </div>
                        <label className={`relative inline-flex items-center ${busy || settingsLoading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={checked}
                            disabled={busy || settingsLoading}
                            onChange={() => handleToggleSystemSetting(item.key)}
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Document Checklist Configuration</h2>
                    <p className="text-sm text-slate-600">Admins can configure required/active document types without code changes.</p>
                  </div>
                  <Button variant="secondary" onClick={loadDocumentChecklist} disabled={checklistLoading}>
                    {checklistLoading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>

                {checklistLoading ? (
                  <p className="text-sm text-slate-600">Loading checklist configuration...</p>
                ) : documentChecklist.length === 0 ? (
                  <p className="text-sm text-slate-600">No checklist items found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-slate-700 font-semibold">Key</th>
                          <th className="px-4 py-3 text-left text-slate-700 font-semibold">Label</th>
                          <th className="px-4 py-3 text-center text-slate-700 font-semibold">Required</th>
                          <th className="px-4 py-3 text-center text-slate-700 font-semibold">Active</th>
                          <th className="px-4 py-3 text-center text-slate-700 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documentChecklist.map((item) => {
                          const busy = checklistBusyKey === item.doc_type_key;
                          return (
                            <tr key={item.doc_type_key} className="border-b border-slate-200">
                              <td className="px-4 py-3 text-slate-700">{item.doc_type_key}</td>
                              <td className="px-4 py-3 text-slate-800">{item.display_name}</td>
                              <td className="px-4 py-3 text-center">
                                <StatusBadge status={item.is_required ? 'active' : 'inactive'}>
                                  {item.is_required ? 'Yes' : 'No'}
                                </StatusBadge>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <StatusBadge status={item.is_active ? 'active' : 'inactive'}>
                                  {item.is_active ? 'Yes' : 'No'}
                                </StatusBadge>
                              </td>
                              <td className="px-4 py-3 text-center space-x-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => updateDocumentChecklistItem(item, { isRequired: !item.is_required })}
                                >
                                  {busy ? 'Saving...' : item.is_required ? 'Make Optional' : 'Make Required'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => updateDocumentChecklistItem(item, { isActive: !item.is_active })}
                                >
                                  {busy ? 'Saving...' : item.is_active ? 'Deactivate' : 'Activate'}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
      </div>

      {/* Add Staff Modal */}
      <Modal
        open={showStaffModal}
        onClose={() => setShowStaffModal(false)}
        title="Add New Staff Member"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Full Name *"
            value={staffForm.name}
            onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
            placeholder="Enter full name"
          />
          <Input
            label="Email Address *"
            type="email"
            value={staffForm.email}
            onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
            placeholder="email@kelaniya.ps"
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Role *</label>
            <select
              value={staffForm.role}
              onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Role --</option>
              {STAFF_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Initial Password"
            type="password"
            value={staffForm.password}
            onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
            placeholder="Leave blank to auto-generate"
          />
          <Input
            label="Confirm Initial Password"
            type="password"
            value={staffForm.confirmPassword}
            onChange={(e) => setStaffForm({ ...staffForm, confirmPassword: e.target.value })}
            placeholder="Re-enter initial password"
            disabled={!staffForm.password}
          />
          <p className="text-xs text-slate-500">
            If you leave password blank, the system will generate a temporary password and show it once.
          </p>

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowStaffModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleAddStaff} className="flex-1" disabled={creatingStaff}>
              {creatingStaff ? 'Adding...' : 'Add Staff Member'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showResetPasswordModal}
        onClose={() => setShowResetPasswordModal(false)}
        title="Reset Staff Password"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Set a new password for <strong>{staffToReset?.full_name || 'staff account'}</strong>.
          </p>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={resetPasswordForm.autoGenerate}
              onChange={(e) => {
                const checked = e.target.checked;
                setResetPasswordForm((prev) => ({
                  ...prev,
                  autoGenerate: checked,
                  newPassword: checked ? generateAdminTemporaryPassword(12) : prev.newPassword,
                  confirmPassword: checked ? '' : prev.confirmPassword,
                }));
              }}
            />
            Auto-generate temporary password
          </label>

          <Input
            label="New Password"
            type="text"
            value={resetPasswordForm.newPassword}
            onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, newPassword: e.target.value })}
            disabled={resetPasswordForm.autoGenerate}
            placeholder="Enter new password"
          />

          {resetPasswordForm.autoGenerate && (
            <Button
              variant="secondary"
              onClick={() => setResetPasswordForm((prev) => ({ ...prev, newPassword: generateAdminTemporaryPassword(12) }))}
            >
              Generate Another Password
            </Button>
          )}

          {!resetPasswordForm.autoGenerate && (
            <Input
              label="Confirm New Password"
              type="password"
              value={resetPasswordForm.confirmPassword}
              onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, confirmPassword: e.target.value })}
              placeholder="Re-enter new password"
            />
          )}

          <p className="text-xs text-slate-500">
            Password must be at least 8 characters with uppercase, lowercase, number, and special character.
          </p>

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowResetPasswordModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleResetStaffPassword} className="flex-1" disabled={resettingStaffPassword}>
              {resettingStaffPassword ? 'Resetting...' : 'Reset Password'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Update Fee Modal */}
      <Modal
        open={showFeeModal}
        onClose={() => setShowFeeModal(false)}
        title="Update Fee Structure"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Fee changes will apply to all new applications submitted after the update.
            </p>
          </div>

          {feeConfig.map((fee) => (
            <Input
              key={fee.id}
              label={fee.display_name}
              type="number"
              value={feeDrafts[fee.fee_type] ?? ''}
              onChange={(e) => handleFeeDraftChange(fee.fee_type, e.target.value)}
              placeholder="Enter fee amount"
            />
          ))}

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowFeeModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleUpdateFee} className="flex-1" disabled={feeSaving || feeLoading}>
              {feeSaving ? 'Updating...' : 'Update Fees'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminDashboard;
