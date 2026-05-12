import React, { useState } from 'react';
import { Mail, CheckCircle, ArrowLeft } from 'lucide-react';

const PasswordReset = ({ onClose, onBack }) => {
  const [step, setStep] = useState('email'); // email | verify | newPassword | success
  const [resetEmail, setResetEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSendReset = (e) => {
    e.preventDefault();
    if (!resetEmail) {
      setError('Please enter your email address');
      return;
    }
    setError('');
    // Demo: move to verification step
    setStep('verify');
  };

  const handleVerifyCode = (e) => {
    e.preventDefault();
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }
    setError('');
    setStep('newPassword');
  };

  const handleResetPassword = (e) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setStep('success');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 sm:p-6 z-50">
      <div className="w-full max-w-md rounded-xl sm:rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <h2 className="text-lg sm:text-xl font-bold text-slate-800">Reset Password</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {step === 'email' && (
            <form onSubmit={handleSendReset} className="space-y-4">
              <p className="text-slate-600 text-sm">
                Enter your email address and we'll send you a verification code to reset your password.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-lg hover:bg-blue-800 transition flex items-center justify-center gap-2"
              >
                <Mail size={18} />
                Send Verification Code
              </button>
              <button
                type="button"
                onClick={onBack}
                className="w-full text-slate-600 hover:text-slate-800 font-medium py-2 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={16} />
                Back to Sign In
              </button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <p className="text-slate-600 text-sm">
                We've sent a 6-digit verification code to <strong>{resetEmail}</strong>
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Verification Code</label>
                <input
                  type="text"
                  required
                  maxLength="6"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-center text-2xl tracking-widest focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-lg hover:bg-blue-800 transition"
              >
                Verify Code
              </button>
              <button
                type="button"
                onClick={() => setStep('email')}
                className="w-full text-slate-600 hover:text-slate-800 font-medium py-2 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={16} />
                Use Different Email
              </button>
            </form>
          )}

          {step === 'newPassword' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-slate-600 text-sm">
                Enter your new password. Make it strong and unique.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Minimum 8 characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-lg hover:bg-blue-800 transition"
              >
                Reset Password
              </button>
              <button
                type="button"
                onClick={() => setStep('verify')}
                className="w-full text-slate-600 hover:text-slate-800 font-medium py-2 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={16} />
                Back
              </button>
            </form>
          )}

          {step === 'success' && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="w-16 h-16 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Password Reset Successful</h3>
              <p className="text-slate-600 text-sm">
                Your password has been reset. You can now sign in with your new password.
              </p>
              <button
                onClick={onClose}
                className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-lg hover:bg-blue-800 transition"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PasswordReset;
