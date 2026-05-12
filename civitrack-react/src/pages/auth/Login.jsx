import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserRound, ShieldCheck, ClipboardList } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import PasswordReset from '../../components/auth/PasswordReset.jsx';
import Register from './Register.jsx';
import ForgotPassword from './ForgotPassword.jsx';

const staffRoles = [
  { value: 'planning_officer', label: 'Planning Officer' },
  { value: 'technical_officer', label: 'Technical Officer' },
  { value: 'superintendent', label: 'Superintendent of Works' },
  { value: 'committee', label: 'Planning Committee' },
];

const Login = () => {
  const { login } = useAuth();
  const { error } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedStaffRole, setSelectedStaffRole] = useState('planning_officer');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPassword, setApplicantPassword] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const mode = new URLSearchParams(location.search).get('mode');
  const isApplicantOnly = mode === 'applicant';
  const isStaffOnly = mode === 'staff';
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const getRedirectForRole = (role) => {
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
      default:
        return '/dashboard';
    }
  };

  const handleApplicantLogin = async (e) => {
    e?.preventDefault();
    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: applicantEmail, password: applicantPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      login(data.user, data.token);
      navigate(getRedirectForRole(data.user.role), { replace: true });
    } catch (err) {
      error(err.message);
    }
  };

  const handleStaffLogin = async (e) => {
    e?.preventDefault();
    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: staffEmail, password: staffPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      login(data.user, data.token);
      navigate(getRedirectForRole(data.user.role), { replace: true });
    } catch (err) {
      error(err.message);
    }
  };

  // Show staff-only login if routed with ?mode=staff
  if (isStaffOnly) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Staff Login Card */}
          <div className="rounded-2xl bg-white shadow-xl border border-slate-200 p-8 flex flex-col">
            <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center mb-4">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 text-center">Staff Portal Login</h2>
            <p className="mt-2 text-center text-slate-600 text-sm">Access your dashboard to manage applications and workflows</p>
            
            <form onSubmit={handleStaffLogin} className="mt-6 space-y-4 w-full">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="staff@kps.gov.lk"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="text-xs text-slate-500">
                Contact your administrator for login credentials
              </div>
              <button
                type="submit"
                className="w-full bg-slate-800 text-white font-bold py-3 px-6 rounded-lg hover:bg-slate-900 transition"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>

        {/* Password Reset Modal */}
        {showPasswordReset && (
          <PasswordReset
            onClose={() => setShowPasswordReset(false)}
            onBack={() => setShowPasswordReset(false)}
          />
        )}

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <ForgotPassword
            onClose={() => setShowForgotPassword(false)}
            onBackToLogin={() => setShowForgotPassword(false)}
          />
        )}
      </div>
    );
  }

  // Show applicant-only login if routed with ?mode=applicant
  if (isApplicantOnly) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Applicant Login Card */}
          <div className="rounded-2xl bg-white shadow-xl border border-slate-200 p-8 flex flex-col">
            <div className="mx-auto w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
              <UserRound className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 text-center">Sign In</h2>
            <p className="mt-2 text-center text-slate-600 text-sm">Access your planning applications and permits</p>
            
            <form onSubmit={handleApplicantLogin} className="mt-6 space-y-4 w-full">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={applicantEmail}
                  onChange={(e) => setApplicantEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700">Password</label>
                  <button
                    type="button"
                    onClick={() => setShowPasswordReset(true)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={applicantPassword}
                  onChange={(e) => setApplicantPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-700 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-800 transition"
              >
                Sign In
              </button>

              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="w-full text-center text-blue-600 hover:text-blue-700 text-sm font-semibold mt-2"
              >
                Forgot Password?
              </button>
            </form>

            {/* Register Link */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-center text-slate-600 text-sm">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="text-blue-600 hover:underline font-semibold"
                >
                  Register here
                </button>
              </p>
            </div>

            {/* Info Links */}
            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => navigate('/info')}
                className="w-full text-sm text-blue-700 hover:underline"
              >
                View Instructions, Fees & Regulations
              </button>
            </div>
          </div>
        </div>

        {/* Password Reset Modal */}
        {showPasswordReset && (
          <PasswordReset
            onClose={() => setShowPasswordReset(false)}
            onBack={() => setShowPasswordReset(false)}
          />
        )}

        {/* Register Modal */}
        {showRegister && (
          <Register onClose={() => setShowRegister(false)} />
        )}

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <ForgotPassword
            onClose={() => setShowForgotPassword(false)}
            onBackToLogin={() => setShowForgotPassword(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800">Choose Your Portal</h1>
          <p className="mt-2 text-slate-600 text-sm sm:text-base max-w-3xl mx-auto">
            Applicants can submit and track applications; staff can access their assigned workflows. Pick the right portal to continue.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="rounded-3xl bg-gradient-to-br from-white to-blue-50 shadow-xl border border-blue-100 p-8 flex flex-col items-center text-center hover:shadow-2xl transition duration-300">
            <div className="bg-blue-100 text-blue-700 rounded-2xl p-4">
              <UserRound className="w-10 h-10" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-slate-800">For Applicants</h2>
            <p className="mt-2 text-slate-500">Submit applications, track progress, manage permits, and request Certificates of Compliance online.</p>
            <div className="mt-6 space-y-3 w-full">
              <button
                type="button"
                onClick={() => navigate('/login?mode=applicant')}
                className="w-full inline-flex justify-center bg-blue-700 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-800 transition"
              >
                Applicant Login / Register
              </button>
              <button
                type="button"
                onClick={() => navigate('/info')}
                className="block w-full text-sm text-blue-700 font-semibold hover:underline"
              >
                View Instructions, Fees & Regulations
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-white to-slate-100 shadow-xl border border-slate-200 p-8 flex flex-col items-center text-center hover:shadow-2xl transition duration-300">
            <div className="bg-slate-200 text-slate-700 rounded-2xl p-4">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-slate-800">For Government Staff</h2>
            <p className="mt-2 text-slate-500">Access internal dashboards to review applications, conduct inspections, and make approval decisions.</p>
            <div className="mt-6 space-y-3 w-full">
              <button
                type="button"
                onClick={() => navigate('/login?mode=staff')}
                className="w-full inline-flex justify-center bg-slate-700 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 transition"
              >
                Staff Portal Login
              </button>
              <div className="text-xs text-slate-500">
                Available for: Planning Officers, Technical Officers, Superintendent of Works, Committee Members
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <PasswordReset
          onClose={() => setShowPasswordReset(false)}
          onBack={() => setShowPasswordReset(false)}
        />
      )}

      {/* Register Modal */}
      {showRegister && (
        <Register onClose={() => setShowRegister(false)} />
      )}
    </div>
  );
};

export default Login;
