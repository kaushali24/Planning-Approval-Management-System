import React, { useState, useEffect } from 'react';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

const VerifyEmail = ({ email, onVerified, onBack }) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [verified, setVerified] = useState(false);

  const handleChange = (index, value) => {
    if (value.length > 1) return;
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      document.getElementById(`code-${index + 1}`).focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      document.getElementById(`code-${index - 1}`).focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pastedData)) {
      const newCode = pastedData.split('');
      setCode(newCode);
      document.getElementById('code-5').focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const verificationCode = code.join('');

    if (verificationCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:5000/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      // Store token
      localStorage.setItem('token', data.token);
      setVerified(true);

      // Redirect after 2 seconds
      setTimeout(() => {
        if (onVerified) {
          onVerified(data.user, data.token);
        }
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError('');
    setResendSuccess(false);

    try {
      const response = await fetch('http://localhost:5000/api/auth/resend-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend code');
      }

      setResendSuccess(true);
      setCode(['', '', '', '', '', '']);
      document.getElementById('code-0').focus();

      setTimeout(() => setResendSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setResendLoading(false);
    }
  };

  if (verified) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-16 h-16 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Email Verified!</h2>
          <p className="text-slate-600 mt-2">
            Your account has been successfully verified. Redirecting to dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <button
          onClick={onBack}
          className="mb-6 text-blue-700 hover:text-blue-800 font-semibold flex items-center gap-1 text-sm"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Verify Your Email</h1>
          <p className="text-slate-600 mt-2 text-center">
            We've sent a 6-digit verification code to
          </p>
          <p className="font-semibold text-slate-800 mt-1">{email}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 text-center">
              Enter Verification Code
            </label>
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {code.map((digit, index) => (
                <input
                  key={index}
                  id={`code-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-12 h-14 text-center text-2xl font-bold border-2 border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                />
              ))}
            </div>
            {error && (
              <p className="text-red-600 text-sm mt-3 text-center">{error}</p>
            )}
            {resendSuccess && (
              <p className="text-green-600 text-sm mt-3 text-center">
                Verification code sent successfully!
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || code.some((d) => !d)}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>

          <div className="text-center">
            <p className="text-slate-600 text-sm mb-2">Didn't receive the code?</p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading}
              className="text-blue-600 hover:text-blue-700 font-semibold text-sm disabled:text-slate-400"
            >
              {resendLoading ? 'Sending...' : 'Resend Code'}
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-slate-600 text-center">
            <strong>Note:</strong> The verification code expires in 15 minutes. 
            If expired, click "Resend Code" to get a new one.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
