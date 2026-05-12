import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, Lightbulb, Target } from 'lucide-react';

const About = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-600 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">About CiviTrack</h1>
          <p className="text-lg text-blue-100">
            Official Planning Approval System of Kelaniya Pradeshiya Sabha
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Mission Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-slate-800 mb-6">Our Mission</h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            CiviTrack streamlines the planning application and approval process for the Kelaniya Pradeshiya Sabha. 
            We are committed to making it easy for citizens and businesses to submit planning applications, 
            track their progress in real-time, and receive approvals efficiently and transparently.
          </p>
        </div>

        {/* Mandatory Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-12">
          <h3 className="text-xl font-bold text-amber-900 mb-3">Mandatory Pre-Submission Notice</h3>
          <p className="text-amber-900 leading-relaxed">
            All applicants are expected to review applicable guidelines, technical standards, and document requirements before starting a permit request.
            Non-compliant applications may be delayed, returned for corrections, or rejected during validation and technical review.
          </p>
          <Link
            to="/info"
            className="inline-block mt-4 px-5 py-2.5 bg-amber-700 text-white font-semibold rounded-lg hover:bg-amber-800 transition"
          >
            Review Guidelines
          </Link>
        </div>

        {/* Permit Scope */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Permit Scope Covered by CiviTrack</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Building Permit</h3>
              <p className="text-slate-600 text-sm">For new construction and structural work subject to local planning and technical requirements.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Boundary Wall Permit</h3>
              <p className="text-slate-600 text-sm">For boundary wall construction requiring approved plans, boundary compliance, and safety-related conditions.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Land Subdivision Permit</h3>
              <p className="text-slate-600 text-sm">For subdivision of land parcels according to zoning, frontage, access, and survey documentation rules.</p>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Transparency */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
              <Lightbulb className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">Transparency</h3>
            <p className="text-slate-600">
              Track your applications in real-time with detailed status updates and timeline information 
              at every stage of the approval process.
            </p>
          </div>

          {/* Efficiency */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">Efficiency</h3>
            <p className="text-slate-600">
              Submit applications online, reduce paperwork, and expedite the approval process with our 
              streamlined digital platform.
            </p>
          </div>

          {/* Accessibility */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">Accessibility</h3>
            <p className="text-slate-600">
              Available online for citizens to submit and review applications, with a language selector in the public portal
              for English, Sinhala, and Tamil interface options.
            </p>
          </div>

          {/* Authority */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">Government Authority</h3>
            <p className="text-slate-600">
              Officially operated by Kelaniya Pradeshiya Sabha to ensure secure, reliable, and 
              compliant handling of all planning applications.
            </p>
          </div>
        </div>

        {/* About the Organization */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-12">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Kelaniya Pradeshiya Sabha</h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            The Kelaniya Pradeshiya Sabha is the local government authority responsible for planning, 
            development, and municipal services in the Kelaniya area of Sri Lanka. This digital platform 
            represents our commitment to modernizing government services and improving citizen engagement.
          </p>
          <p className="text-slate-600 leading-relaxed">
            For more information about our services, regulations, and fees, please visit our Guidelines section 
            or contact our office directly.
          </p>
        </div>

        {/* Data and Privacy */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-12">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Data and Privacy</h2>
          <p className="text-slate-600 leading-relaxed mb-3">
            CiviTrack collects application, identity, and supporting document data only for permit processing, regulatory review, and compliance record keeping.
          </p>
          <p className="text-slate-600 leading-relaxed">
            Access to workflow actions is role-based, and records are maintained to support transparency, auditing, and service accountability.
          </p>
        </div>

        {/* Service Channels */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-12">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Service Channels</h2>
          <p className="text-slate-600 mb-6">Use the channels below to start, track, and manage planning approval requests.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/register" className="px-5 py-2.5 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800 transition">Create Account</Link>
            <Link to="/login" className="px-5 py-2.5 bg-slate-800 text-white font-semibold rounded-lg hover:bg-slate-900 transition">Login</Link>
            <Link to="/info" className="px-5 py-2.5 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800 transition">Guidelines</Link>
            <Link to="/feedback" className="px-5 py-2.5 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-800 transition">Feedback</Link>
          </div>
        </div>

        {/* Contact CTA */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
          <h3 className="text-2xl font-bold text-slate-800 mb-4">Have Questions?</h3>
          <p className="text-slate-600 mb-6">
            For official assistance on planning approvals, use the listed contact numbers and email in the contact section.
          </p>
          <Link
            to="/feedback"
            className="inline-block px-6 py-3 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800 transition"
          >
            Leave Feedback
          </Link>
        </div>
      </div>
    </div>
  );
};

export default About;
