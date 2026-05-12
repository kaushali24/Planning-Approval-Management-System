import React, { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Phone, MapPin, Mail } from 'lucide-react';
import Logo from '../assets/logo.svg';

const MAPS_URL = 'https://maps.app.goo.gl/QaFdtwJLeSMG2dfv8';

const PublicLayout = () => {
  const [lang, setLang] = useState('en');

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3">
            <img src={Logo} alt="CiviTrack" className="h-9 w-auto" />
          </Link>
          <div className="flex items-center space-x-4 text-sm font-medium">
            <div className="flex items-center space-x-2">
              <label htmlFor="language" className="text-slate-600">Language</label>
              <select
                id="language"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="en">English</option>
                <option value="si">සිංහල</option>
                <option value="ta">தமிழ்</option>
              </select>
            </div>
            <Link className="text-slate-600 hover:text-slate-900" to="/">Home</Link>
            <Link className="text-slate-600 hover:text-slate-900" to="/info">Guidelines</Link>
            <Link className="text-slate-600 hover:text-slate-900" to="/about">About</Link>
            <Link className="text-slate-600 hover:text-slate-900" to="/feedback">Leave Feedback</Link>
            <Link className="text-blue-700 hover:text-blue-800" to="/login">Login</Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-slate-900 text-slate-100">
        {/* Main Footer Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Logo and About */}
            <div>
              <Link to="/" className="inline-block" aria-label="Go to home page">
                <img src={Logo} alt="CiviTrack" className="h-9 w-auto mb-4" />
              </Link>
              <p className="text-sm text-slate-300 leading-relaxed">
                Official Planning Approval System of Kelaniya Pradeshiya Sabha. Streamlining the application and tracking process for planning permissions.
              </p>
            </div>

            {/* Contact Us */}
            <div>
              <h3 className="text-lg font-bold text-white mb-4">Contact Us</h3>
              <div className="space-y-3">
                {/* Address */}
                <div className="flex gap-3">
                  <MapPin className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <a
                      href={MAPS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-slate-300 leading-relaxed hover:text-blue-400 hover:underline"
                      aria-label="Open office location in maps"
                    >
                      Colombo - Kandy Rd,<br />
                      Peliyagoda,<br />
                      Sri Lanka
                    </a>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex gap-3">
                  <Phone className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm text-slate-300">
                      <a href="tel:+94112914110" className="hover:text-blue-400">+94 112 914 110</a>
                    </p>
                    <p className="text-sm text-slate-300">
                      <a href="tel:+94112918255" className="hover:text-blue-400">+94 112 918 255</a>
                    </p>
                    <p className="text-sm text-slate-300">
                      <span className="text-slate-400">(Chairman)</span>{' '}
                      <a href="tel:+94112905255" className="hover:text-blue-400">+94 112 905 255</a>
                    </p>
                    <p className="text-sm text-slate-300">
                      <span className="text-slate-400">(Secretary)</span>{' '}
                      <a href="tel:+94112905009" className="hover:text-blue-400">+94 112 905 009</a>
                    </p>
                  </div>
                </div>

                {/* Email */}
                <div className="flex gap-3">
                  <Mail className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <a href="mailto:info@kps.gov.lk" className="text-sm text-slate-300 hover:text-blue-400">
                    info@kps.gov.lk
                  </a>
                </div>
              </div>

              {/* Feedback Link */}
              <Link
                to="/feedback"
                className="inline-block mt-4 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition"
              >
                Leave Feedback
              </Link>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="text-lg font-bold text-white mb-4">Quick Links</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/" className="text-slate-300 hover:text-blue-400">Home</Link>
                </li>
                <li>
                  <Link to="/login" className="text-slate-300 hover:text-blue-400">Login</Link>
                </li>
                <li>
                  <Link to="/info" className="text-slate-300 hover:text-blue-400">Guidelines</Link>
                </li>
                <li>
                  <Link to="/about" className="text-slate-300 hover:text-blue-400">About</Link>
                </li>
                <li>
                  <Link to="/feedback" className="text-slate-300 hover:text-blue-400">Feedback</Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700 pt-8"></div>

          {/* Copyright */}
          <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-slate-400">
            <span>© 2026 Kelaniya Pradeshiya Sabha. All Rights Reserved.</span>
            <span>Planning Approval Management System</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
