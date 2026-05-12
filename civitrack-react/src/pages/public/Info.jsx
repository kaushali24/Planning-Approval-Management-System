import React from 'react';

const Card = ({ title, badge, children }) => (
  <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-8">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      {badge ? <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">{badge}</span> : null}
    </div>
    {children}
  </div>
);

const Info = () => (
  <div className="bg-slate-100 py-12">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Planning Approval Guidelines & Regulations</h1>
        <p className="text-slate-600">Official requirements, prescribed fees, and regulatory conditions for Building Permit, Boundary Wall Permit, and Land Subdivision Permit applications.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900">
        <h2 className="text-lg font-semibold mb-2">Mandatory Pre-Submission Notice</h2>
        <p className="text-sm leading-relaxed">
          Applicants are required to review all applicable guidelines and regulations below prior to submitting a permit request. Any application that does not
          comply with the stated requirements, technical standards, and documentary obligations is liable to be returned, delayed, or rejected at validation and
          technical review stages.
        </p>
      </div>

      <Card title="Building Permit" badge="Most Common">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-700 text-sm">
          <div className="space-y-3">
            <h3 className="font-semibold">Application Requirements</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Three copies of building plans (scale 1:100)</li>
              <li>Approved survey plan</li>
              <li>Latest assessment tax receipt</li>
              <li>Location/route map</li>
              <li>Copy of owner NIC</li>
              <li>Copy of deed/title document</li>
            </ul>
            <h3 className="font-semibold">Fees</h3>
            <div className="bg-slate-50 rounded-lg p-4">Prescribed Application Fee: <span className="font-bold">LKR 750</span></div>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold">Technical Specs</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Minimum setbacks: 10 ft from road reservation / 5 ft from side boundaries</li>
              <li>Maximum structure height: 35 ft (subject to zoning and local limits)</li>
              <li>Minimum access road width: 10 ft</li>
              <li>Minimum 50 ft separation between wells and septic systems</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card title="Boundary Wall Permit">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-700 text-sm">
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-900">
              <span className="font-semibold">How to apply:</span> Start a <span className="font-semibold">Building Application</span> and select
              <span className="font-semibold"> Boundary Wall Permit</span> under permit options. Boundary wall approval is processed under the building
              application workflow.
            </div>
            <h3 className="font-semibold">Application Requirements</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Boundary wall drawings indicating dimensions, elevations, and location</li>
              <li>Approved survey plan clearly indicating legal property boundaries</li>
              <li>Latest assessment tax receipt</li>
              <li>Copy of owner NIC</li>
              <li>Copy of deed/title document</li>
            </ul>
            <h3 className="font-semibold">Fees</h3>
            <div className="bg-slate-50 rounded-lg p-4">Prescribed Application Fee: <span className="font-medium">LKR 750</span></div>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold">Regulatory Notes</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Wall placement shall comply with approved boundary lines and road reservations</li>
              <li>Retaining or high boundary walls shall include adequate structural details</li>
              <li>Wall openings and alignment shall not obstruct public drainage or neighboring access rights</li>
            </ul>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900">
              In specified boundary wall cases, applicants may be directed to execute a physical non-indemnification agreement prior to permit issuance. Agreement
              status is recorded in the system for compliance tracking.
            </div>
          </div>
        </div>
      </Card>

      <Card title="Land Subdivision Permit">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-700 text-sm">
          <div className="space-y-3">
            <h3 className="font-semibold">Documentation</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Standard subdivision plan with required copies</li>
              <li>Master plan of the land parcel</li>
              <li>Copies of deed/title documents</li>
              <li>Assessment tax payment receipts</li>
              <li>Licensed surveyor's report</li>
            </ul>
            <h3 className="font-semibold">Fees</h3>
            <div className="bg-slate-50 rounded-lg p-4">
              Prescribed Application Fee: <span className="font-medium">LKR 500</span> + processing charge per lot (LKR 500-1000)
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold">Regulatory Conditions</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Minimum lot size: 6-10 perches (subject to zoning classification)</li>
              <li>Minimum road frontage: 20 ft</li>
              <li>Minimum access width: 10 ft (residential) / 30 ft (commercial)</li>
              <li>Survey plan should be less than 10 years old</li>
            </ul>
            <h3 className="font-semibold">Review Stages</h3>
            <ol className="list-decimal list-inside space-y-1">
              <li>Submission and completeness verification</li>
              <li>Technical evaluation by relevant officers</li>
              <li>Committee review and recommendation</li>
              <li>Final approval and lot numbering</li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  </div>
);

export default Info;
