import React, { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:5000';

const Profile = () => {
  const [profile, setProfile] = useState({
    fullName: '',
    nicNumber: '',
    contactNumber: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus({ type: 'error', message: 'You are not signed in. Please login again.' });
        return;
      }

      try {
        setProfileLoading(true);
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load profile');
        }

        const user = data.user || {};
        setProfile({
          fullName: user.full_name || '',
          nicNumber: user.nic_number || '',
          contactNumber: user.contact_number || '',
        });
      } catch (err) {
        setStatus({ type: 'error', message: err.message });
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSaveProfile = async () => {
    setStatus(null);

    if (!profile.fullName.trim() || !profile.contactNumber.trim()) {
      setStatus({ type: 'error', message: 'Full name and contact number are required' });
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setStatus({ type: 'error', message: 'You are not signed in. Please login again.' });
      return;
    }

    try {
      setSavingProfile(true);
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: profile.fullName,
          contactNumber: profile.contactNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save profile');
      }

      setStatus({ type: 'success', message: 'Profile updated successfully' });
      if (data.user) {
        setProfile((prev) => ({
          ...prev,
          fullName: data.user.full_name || prev.fullName,
          nicNumber: data.user.nic_number || prev.nicNumber,
          contactNumber: data.user.contact_number || prev.contactNumber,
        }));
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setStatus(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatus({ type: 'error', message: 'Please fill all fields' });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({ type: 'error', message: 'New password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'New passwords do not match' });
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setStatus({ type: 'error', message: 'You are not signed in. Please login again.' });
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Password change failed');
      }

      setStatus({ type: 'success', message: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-800">Profile Settings</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-3">Personal Information</h2>
            <form className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  value={profile.fullName}
                  onChange={(e) => setProfile((prev) => ({ ...prev, fullName: e.target.value }))}
                  disabled={profileLoading || savingProfile}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">NIC Number</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-500"
                  value={profile.nicNumber}
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Number</label>
                <input
                  type="tel"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  value={profile.contactNumber}
                  onChange={(e) => setProfile((prev) => ({ ...prev, contactNumber: e.target.value }))}
                  disabled={profileLoading || savingProfile}
                />
              </div>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={profileLoading || savingProfile}
                  className="bg-blue-700 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {profileLoading ? 'Loading...' : savingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-3">Change Password</h2>
            {status && (
              <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {status.message}
              </div>
            )}
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={loading}
                  className="w-full bg-slate-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
