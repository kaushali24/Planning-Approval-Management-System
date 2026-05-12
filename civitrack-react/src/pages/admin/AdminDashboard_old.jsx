import React, { useState } from 'react';
import { Users, Settings, FileText, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatCurrencyLKR, formatDate } from '../../utils/locale';
import { useNotifications } from '../../context/NotificationContext.jsx';

const AdminDashboard = () => {
  const { success, error } = useNotifications();
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    role: '',
    phone: ''
  });

  const stats = [
    { label: 'Total Applications', value: '856', icon: FileText, color: 'blue' },
    { label: 'Active Staff', value: '24', icon: Users, color: 'green' },
    { label: 'System Health', value: '98%', icon: CheckCircle, color: 'emerald' },
    { label: 'Pending Reviews', value: '12', icon: AlertCircle, color: 'yellow' }
  ];

  const staffMembers = [
    { id: 'ST-001', name: 'A.H. Bandara', email: 'ah.bandara@kelaniya.ps', role: 'Technical Officer', status: 'active' },
    { id: 'ST-002', name: 'S.M. Perera', email: 'sm.perera@kelaniya.ps', role: 'Planning Officer', status: 'active' },
    { id: 'ST-003', name: 'K.L. Jayawardena', email: 'kl.jay@kelaniya.ps', role: 'Technical Officer', status: 'active' },
    { id: 'ST-004', name: 'R.D. Silva', email: 'rd.silva@kelaniya.ps', role: 'Superintendent', status: 'active' }
  ];

  const fees = [
    { id: 1, type: 'Building Permit', amount: 5000, lastUpdated: '2025-06-01' },
    { id: 2, type: 'Land Subdivision', amount: 7500, lastUpdated: '2025-06-01' }
  ];

  const handleAddStaff = () => {
    if (!staffForm.name || !staffForm.email || !staffForm.role) {
      error('Please fill all required fields.');
      return;
    }
    success(`Staff member ${staffForm.name} added successfully.`);
    setShowStaffModal(false);
    setStaffForm({ name: '', email: '', role: '', phone: '' });
  };

  const handleUpdateFee = () => {
    success('Fee structure updated successfully.');
    setShowFeeModal(false);
  };

  const getIconComponent = (IconComponent) => IconComponent;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Admin Dashboard</h1>
        <p className="text-slate-600 mt-1">System configuration and management</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = getIconComponent(stat.icon);
          return (
            <Card key={index} className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-800 mt-2">{stat.value}</p>
                </div>
                <div className={`p-3 bg-${stat.color}-100 rounded-lg`}>
                  <Icon className={`text-${stat.color}-600`} size={24} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Staff Management Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="text-blue-600" size={24} />
            <h2 className="text-xl font-bold text-slate-800">Staff Management</h2>
          </div>
          <Button onClick={() => setShowStaffModal(true)} className="flex items-center gap-2">
            <Users size={18} />
            Add Staff Member
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
              {staffMembers.map((staff) => (
                <tr key={staff.id} className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{staff.id}</td>
                  <td className="px-4 py-3 text-slate-700">{staff.name}</td>
                  <td className="px-4 py-3 text-slate-700">{staff.email}</td>
                  <td className="px-4 py-3 text-slate-700">{staff.role}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={staff.status}>
                      {staff.status === 'active' ? 'Active' : 'Inactive'}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button className="text-blue-600 hover:text-blue-800 text-sm mr-3">
                      Edit
                    </button>
                    <button className="text-red-600 hover:text-red-800 text-sm">
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Fee Configuration Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <DollarSign className="text-green-600" size={24} />
            <h2 className="text-xl font-bold text-slate-800">Fee Configuration</h2>
          </div>
          <Button onClick={() => setShowFeeModal(true)} className="flex items-center gap-2">
            <Settings size={18} />
            Update Fees
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {fees.map((fee) => (
            <div key={fee.id} className="border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-2">{fee.type}</h3>
              <p className="text-2xl font-bold text-green-600 mb-1">{formatCurrencyLKR(fee.amount)}</p>
              <p className="text-xs text-slate-500">Last updated: {formatDate(fee.lastUpdated)}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4">
          Boundary wall requests are handled inside the Building Permit workflow and do not have a separate application submission fee.
        </p>
      </Card>

      {/* System Settings Section */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="text-purple-600" size={24} />
          <h2 className="text-xl font-bold text-slate-800">System Settings</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <h3 className="font-semibold text-slate-800">Email Notifications</h3>
              <p className="text-sm text-slate-600">Send email updates to applicants</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <h3 className="font-semibold text-slate-800">Auto-Assignment</h3>
              <p className="text-sm text-slate-600">Automatically assign applications to TOs</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <h3 className="font-semibold text-slate-800">Data Backup</h3>
              <p className="text-sm text-slate-600">Automatic daily backups at 2:00 AM</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </Card>

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
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Role *
            </label>
            <select
              value={staffForm.role}
              onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Role --</option>
              <option value="Planning Officer">Planning Officer</option>
              <option value="Technical Officer">Technical Officer</option>
              <option value="Superintendent">Superintendent</option>
              <option value="Committee Member">Committee Member</option>
            </select>
          </div>
          <Input
            label="Phone Number"
            value={staffForm.phone}
            onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
            placeholder="071-234-5678"
          />

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowStaffModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleAddStaff} className="flex-1">
              Add Staff Member
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

          {fees.map((fee) => (
            <Input
              key={fee.id}
              label={fee.type}
              type="number"
              defaultValue={fee.amount}
              placeholder="Enter fee amount"
            />
          ))}

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowFeeModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleUpdateFee} className="flex-1">
              Update Fees
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminDashboard;
