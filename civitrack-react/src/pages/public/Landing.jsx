import React from 'react';
import { Link } from 'react-router-dom';
import { UserRound, ShieldCheck } from 'lucide-react';

const Landing = () => {
  return (
    <div className="bg-slate-100">
      {/* Hero */}
      <div className="relative overflow-hidden text-white bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.28),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(147,197,253,0.28),transparent_35%),linear-gradient(120deg,#0b3a75_0%,#0f4fa8_45%,#1d4ed8_100%)]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:36px_36px] opacity-30" />
        <div className="absolute -top-20 -left-10 w-60 h-60 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="absolute top-10 right-10 w-72 h-72 rounded-full bg-blue-200/20 blur-3xl" />
        <div className="absolute inset-0 bg-black/15" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <p className="inline-flex items-center rounded-full border border-white/35 bg-white/10 px-4 py-1 text-xs sm:text-sm font-semibold tracking-wide text-blue-50 backdrop-blur">
            Kelaniya Pradeshiya Sabha Digital Services
          </p>
          <h1 className="mt-5 text-4xl sm:text-6xl font-black tracking-tight leading-tight">
            CiviTrack
            <span className="block text-blue-100 text-2xl sm:text-3xl font-bold mt-3">Planning Approval Platform</span>
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-blue-100/95 max-w-3xl leading-relaxed">
            Official Planning Approval System of Kelaniya Pradeshiya Sabha for Building Permit, Boundary Wall Permit, and Land Subdivision Permit applications.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/register"
              className="bg-white text-blue-800 font-bold px-6 py-3 rounded-xl shadow-lg shadow-blue-900/20 hover:bg-blue-50 transition"
            >
              Get Started
            </Link>
          </div>

          <div className="mt-7 max-w-3xl bg-amber-100/95 text-amber-950 border border-amber-200 rounded-xl px-4 py-3 text-sm shadow-md">
            Mandatory pre-submission requirement: Review all applicable guidelines, regulatory conditions, and required documents before filing a permit request.
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="rounded-2xl border border-white/25 bg-white/10 backdrop-blur px-4 py-5">
              <div className="text-3xl font-black">3</div>
              <div className="text-sm text-blue-100">Permit Categories Supported</div>
            </div>
            <div className="rounded-2xl border border-white/25 bg-white/10 backdrop-blur px-4 py-5">
              <div className="text-3xl font-black">24/7</div>
              <div className="text-sm text-blue-100">Online Application Access</div>
            </div>
            <div className="rounded-2xl border border-white/25 bg-white/10 backdrop-blur px-4 py-5">
              <div className="text-3xl font-black">Role-Based</div>
              <div className="text-sm text-blue-100">Workflow Review and Approvals</div>
            </div>
          </div>

          {/* Public Info CTA floating on top-right (desktop) */}
          <div className="hidden md:block absolute right-6 sm:right-8 top-16 w-full max-w-[360px]">
            <div className="bg-white/95 backdrop-blur-sm border border-white/30 rounded-2xl p-5 shadow-2xl shadow-blue-950/25 text-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">For Citizens</p>
              <h3 className="text-lg font-bold mt-1">Instructions, Fees & Regulations</h3>
              <p className="text-slate-600 text-sm mt-1">Guideline review is mandatory before submitting a new permit request.</p>
              <Link
                to="/info"
                className="mt-4 inline-flex justify-center bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-800 transition"
              >
                Review Guidelines
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Portal Selection */}
      <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
      {/* Public Info CTA (mobile) */}
      <div className="md:hidden mb-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-lg text-slate-800">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">For Citizens</p>
          <h3 className="text-lg font-bold mt-1">Instructions, Fees & Regulations</h3>
          <p className="text-slate-600 text-sm mt-1">Guideline review is mandatory before you start a new permit request.</p>
          <Link
            to="/info"
            className="mt-3 inline-flex justify-center bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-800 transition"
          >
            Review Guidelines
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Applicant Portal */}
        <div className="rounded-3xl bg-gradient-to-br from-white to-blue-50 shadow-xl border border-blue-100 p-8 flex flex-col items-center text-center hover:shadow-2xl transition duration-300">
          <div className="bg-blue-100 text-blue-700 rounded-2xl p-4">
            <UserRound className="w-10 h-10" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-800">For Applicants</h2>
          <p className="mt-2 text-slate-500">Submit applications, track progress, manage permits, and request Certificates of Compliance online.</p>
          <div className="mt-6 space-y-3 w-full">
            <Link
              to="/login?mode=applicant"
              className="w-full inline-flex justify-center bg-blue-700 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-800 transition"
            >
              Applicant Login / Register
            </Link>
              <Link
                to="/info"
                className="block text-sm text-blue-700 font-semibold hover:underline"
              >
                View Instructions, Fees & Regulations
              </Link>
          </div>
        </div>

        {/* Staff Portal */}
        <div className="rounded-3xl bg-gradient-to-br from-white to-slate-100 shadow-xl border border-slate-200 p-8 flex flex-col items-center text-center hover:shadow-2xl transition duration-300">
          <div className="bg-slate-200 text-slate-700 rounded-2xl p-4">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-800">For Government Staff</h2>
          <p className="mt-2 text-slate-500">Access internal dashboards to review applications, conduct inspections, and make approval decisions.</p>
          <div className="mt-6 space-y-3 w-full">
            <Link
              to="/login?mode=staff"
              className="w-full inline-flex justify-center bg-slate-700 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 transition"
            >
              Staff Portal Login
            </Link>
            <div className="text-xs text-slate-500">
              Available for: Planning Officers, Technical Officers, Superintendent of Works, Committee Members
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="mt-16">
        <h2 className="text-3xl font-bold text-center text-slate-800 mb-10">How CiviTrack Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[{
            step: '1',
            title: 'Review Guidelines First',
            text: 'Confirm permit type, required documents, technical standards, and prescribed fees before submission.',
          }, {
            step: '2',
            title: 'Submit and Track',
            text: 'Submit your application and monitor verification, technical review, inspections, and committee decisions.',
          }, {
            step: '3',
            title: 'Receive Decision and Permit',
            text: 'Receive final decision updates, permit issuance status, and follow-up service options including Certificate of Compliance requests.',
          }].map((item) => (
            <div key={item.step} className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6 text-center hover:shadow-xl hover:-translate-y-1 transition duration-300">
              <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-slate-100 text-blue-700 flex items-center justify-center text-xl font-bold border border-blue-100">
                {item.step}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-800">{item.title}</h3>
              <p className="mt-2 text-slate-600 text-sm">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Location Map */}
      <div className="mt-16">
        <h2 className="text-3xl font-bold text-center text-slate-800 mb-4">Visit Our Office</h2>
        <p className="text-center text-slate-600 mb-8">Kelaniya Pradeshiya Sabha - Colombo - Kandy Rd, Peliyagoda, Sri Lanka</p>
        <div className="w-full h-96 rounded-3xl overflow-hidden shadow-xl border border-slate-200">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3960.3620183450835!2d79.90349147477077!3d6.966549693034022!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae2581710630e9b%3A0x9868b445aa731bc!2sKelaniya%20Pradeshiya%20Sabha!5e0!3m2!1sen!2slk!4v1769357333722!5m2!1sen!2slk"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen=""
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
    </div>
  );
};

export default Landing;
