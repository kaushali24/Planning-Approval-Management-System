import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send } from 'lucide-react';

const Feedback = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch('http://localhost:5000/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || 'Failed to submit feedback');
      }

      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setFormData({ name: '', email: '', subject: '', message: '' });
      }, 3000);
    } catch (error) {
      setSubmitError(error.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-4">Get In Touch</h1>
          <p className="text-lg text-slate-600">We'd love to hear from you. Send us your feedback or questions.</p>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Contact Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6 space-y-8">
              {/* Address */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-700" />
                  Address
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Colombo - Kandy Rd,<br />
                  Peliyagoda,<br />
                  Sri Lanka
                </p>
              </div>

              {/* Phone Numbers */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Phone className="w-5 h-5 text-blue-700" />
                  Phone
                </h3>
                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">General:</span>
                    <a href="tel:+94112914110" className="text-blue-700 hover:underline">
                      +94 112 914 110
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Support:</span>
                    <a href="tel:+94112918255" className="text-blue-700 hover:underline">
                      +94 112 918 255
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Chairman:</span>
                    <a href="tel:+94112905255" className="text-blue-700 hover:underline">
                      +94 112 905 255
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Secretary:</span>
                    <a href="tel:+94112905009" className="text-blue-700 hover:underline">
                      +94 112 905 009
                    </a>
                  </div>
                </div>
              </div>

              {/* Email */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-700" />
                  Email
                </h3>
                <a href="mailto:info@kps.gov.lk" className="text-blue-700 hover:underline text-sm">
                  info@kps.gov.lk
                </a>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-slate-800 mb-6">Send us your Feedback</h2>
              
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <Send className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Thank You!</h3>
                  <p className="text-slate-600 text-center">
                    We've received your feedback and will review it shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {submitError ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {submitError}
                    </div>
                  ) : null}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Your Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      placeholder="Your Name"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Your Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="Your Email"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Subject</label>
                    <input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      placeholder="Subject"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Message</label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      placeholder="Your message here..."
                      rows="6"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-800 transition flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {submitting ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Hours of Operation */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <h3 className="text-lg font-bold text-slate-800 mb-2">Office Hours</h3>
          <p className="text-slate-600">
            Monday to Friday: 8:30 AM - 4:30 PM<br />
            Saturday & Sunday: Closed
          </p>
        </div>
      </div>
    </div>
  );
};

export default Feedback;
