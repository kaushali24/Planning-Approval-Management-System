import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserCheck, X } from 'lucide-react';
import VerifyEmail from './VerifyEmail';

const Register = ({ onClose }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: '',
    nicNumber: '',
    email: '',
    contactNumber: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Full name validation
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (formData.fullName.trim().length < 3) {
      newErrors.fullName = 'Full name must be at least 3 characters';
    } else if (!/^[a-zA-Z\s]+$/.test(formData.fullName.trim())) {
      newErrors.fullName = 'Full name can only contain letters and spaces';
    }

    // NIC validation (Sri Lankan format)
    if (!formData.nicNumber.trim()) {
      newErrors.nicNumber = 'NIC number is required';
    } else if (!/^([0-9]{9}[VvXx]|[0-9]{12})$/.test(formData.nicNumber.trim())) {
      newErrors.nicNumber = 'Invalid NIC. Use 9 digits + V/X (e.g., 199512345V) or 12 digits';
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    // Phone number validation (Sri Lankan format)
    if (!formData.contactNumber.trim()) {
      newErrors.contactNumber = 'Contact number is required';
    } else if (!/^(\+94|0)[0-9]{9}$/.test(formData.contactNumber.trim())) {
      newErrors.contactNumber = 'Invalid phone number. Use format: 0771234567 or +94771234567';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else {
      if (formData.password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters';
      } else if (!/[A-Z]/.test(formData.password)) {
        newErrors.password = 'Password must contain at least one uppercase letter';
      } else if (!/[a-z]/.test(formData.password)) {
        newErrors.password = 'Password must contain at least one lowercase letter';
      } else if (!/[0-9]/.test(formData.password)) {
        newErrors.password = 'Password must contain at least one number';
      } else if (!/[@$!%*?&#]/.test(formData.password)) {
        newErrors.password = 'Password must contain at least one special character (@$!%*?&#)';
      }
    }

    // Confirm password validation
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    // Terms acceptance
    if (!formData.termsAccepted) {
      newErrors.termsAccepted = 'You must agree to terms and privacy policy';
    }

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validateForm();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName,
          nicNumber: formData.nicNumber,
          email: formData.email,
          contactNumber: formData.contactNumber,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details) {
          // Validation errors from backend
          const backendErrors = {};
          data.details.forEach((err) => {
            backendErrors[err.field] = err.message;
          });
          setErrors(backendErrors);
        } else {
          setErrors({ submit: data.error || 'Registration failed' });
        }
        return;
      }

      // Success - show verification page
      setRegisteredEmail(formData.email);
      setShowVerification(true);
    } catch (error) {
      setErrors({ submit: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = (user, token) => {
    // Redirect to dashboard or home
    window.location.href = '/dashboard';
  };

  if (showVerification) {
    return (
      <VerifyEmail
        email={registeredEmail}
        onVerified={handleVerified}
        onBack={() => setShowVerification(false)}
      />
    );
  }

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate('/');
    }
  };

  // If onClose is provided, render as modal, otherwise render as page
  const isModal = !!onClose;

  const innerContent = (
    <div className="w-full max-w-md bg-white rounded-xl sm:rounded-2xl shadow-2xl p-6 sm:p-8">
      {/* Header with title and close button */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800">Create Account</h1>
        <button
          onClick={handleClose}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition inline-flex items-center justify-center"
          aria-label="Close"
        >
          <X size={28} strokeWidth={2} />
        </button>
      </div>

      <div>
        <div className="flex flex-col items-start mb-4 sm:mb-6">
          <p className="text-sm sm:text-base text-slate-500">Fill in the details below to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Nimal Perera"
                className={`w-full px-4 py-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.fullName ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {errors.fullName && <p className="text-red-600 text-sm mt-1">{errors.fullName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">NIC Number *</label>
              <input
                type="text"
                name="nicNumber"
                value={formData.nicNumber}
                onChange={handleChange}
                placeholder="199512345V or 199951234567"
                maxLength="12"
                className={`w-full px-4 py-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.nicNumber ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              <p className="text-xs text-slate-500 mt-1">Old format: 9 digits + V/X, New format: 12 digits</p>
              {errors.nicNumber && <p className="text-red-600 text-sm mt-1">{errors.nicNumber}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="applicant@example.com"
                className={`w-full px-4 py-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.email ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contact Number *</label>
              <input
                type="tel"
                name="contactNumber"
                value={formData.contactNumber}
                onChange={handleChange}
                placeholder="0771234567 or +94771234567"
                className={`w-full px-4 py-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.contactNumber ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              <p className="text-xs text-slate-500 mt-1">Sri Lankan format: 0xxxxxxxxx or +94xxxxxxxxx</p>
              {errors.contactNumber && <p className="text-red-600 text-sm mt-1">{errors.contactNumber}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className={`w-full px-4 py-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.password ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              <p className="text-xs text-slate-500 mt-1">Min 8 chars, uppercase, lowercase, number, special char</p>
              {errors.password && <p className="text-red-600 text-sm mt-1">{errors.password}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password *</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                className={`w-full px-4 py-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.confirmPassword ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {errors.confirmPassword && <p className="text-red-600 text-sm mt-1">{errors.confirmPassword}</p>}
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="termsAccepted"
                  checked={formData.termsAccepted}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-1"
                />
                <span className="text-sm text-slate-600">
                  I agree to the{' '}
                  <a href="#" className="text-blue-600 hover:underline">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="#" className="text-blue-600 hover:underline">
                    Privacy Policy
                  </a>
                </span>
              </label>
              {errors.termsAccepted && <p className="text-red-600 text-sm mt-1">{errors.termsAccepted}</p>}
            </div>

            {errors.submit && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{errors.submit}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 bg-blue-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-800 transition min-h-[44px] disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="text-center mt-4 sm:mt-6 text-sm text-slate-600">
            Already have an account?{' '}
            {onClose ? (
              <button
                onClick={onClose}
                className="font-medium text-blue-600 hover:underline min-h-[44px] inline-flex items-center"
              >
                Sign in here
              </button>
            ) : (
              <Link to="/login?mode=applicant" className="font-medium text-blue-600 hover:underline">
                Sign in here
              </Link>
            )}
          </div>
        </div>
    </div>
  );

  // Render as modal if onClose provided, otherwise render as full page
  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 sm:p-6 z-50 overflow-y-auto">
        {innerContent}
      </div>
    );
  }

  // Render as full page
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      {innerContent}
    </div>
  );
};

export default Register;
