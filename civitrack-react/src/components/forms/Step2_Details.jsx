import React from 'react';
import Input from '../ui/Input.jsx';
import Textarea from '../ui/Textarea.jsx';

const Step2_Details = ({ formData, onUpdate, errors = {} }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;
    onUpdate({ [name]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Applicant & Property Information</h2>
      </div>

      {/* Applicant Details Section */}
      <div className="p-6 border rounded-xl bg-slate-50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Applicant Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Full Name of Applicant"
            name="applicantName"
            value={formData.applicantName || ''}
            onChange={handleChange}
            placeholder="Enter your full name"
            error={errors.applicantName}
          />
          <Input
            label="National Identity Card (NIC) Number"
            name="nicNumber"
            value={formData.nicNumber || ''}
            onChange={handleChange}
            placeholder="e.g., 198012345678"
            error={errors.nicNumber}
          />
          <Textarea
            label="Full Postal Address"
            name="applicantAddress"
            value={formData.applicantAddress || ''}
            onChange={handleChange}
            placeholder="Enter your address"
            rows={3}
            className="md:col-span-2"
            error={errors.applicantAddress}
          />
          <Input
            label="Contact Number (Mobile)"
            name="contactNumber"
            type="tel"
            value={formData.contactNumber || ''}
            onChange={handleChange}
            placeholder="071-XXXXXXX"
            error={errors.contactNumber}
          />
          <Input
            label="Email Address"
            name="email"
            type="email"
            value={formData.email || ''}
            onChange={handleChange}
            placeholder="your@email.com"
            error={errors.email}
          />
        </div>
      </div>

      {/* Property Details Section */}
      <div className="p-6 border rounded-xl bg-slate-50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Property Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Assessment Number (වරිපනම් අංකය)"
            name="assessmentNumber"
            value={formData.assessmentNumber || ''}
            onChange={handleChange}
            placeholder="e.g., 45B/12"
            error={errors.assessmentNumber}
          />
          <Input
            label="Deed Number & Date"
            name="deedNumber"
            value={formData.deedNumber || ''}
            onChange={handleChange}
            placeholder="e.g., 12345/2020, 2020-05-15"
            error={errors.deedNumber}
          />
          <Input
            label="Survey Plan Number, Date, and Surveyor's Name"
            name="surveyPlan"
            value={formData.surveyPlan || ''}
            onChange={handleChange}
            placeholder="e.g., SP789/2024, 2024-01-20, K. L. Perera"
            className="md:col-span-2"
            error={errors.surveyPlan}
          />
          <Input
            label="Total Extent of the Land"
            name="landExtent"
            value={formData.landExtent || ''}
            onChange={handleChange}
            placeholder="e.g., 20 Perches"
            error={errors.landExtent}
          />
        </div>
      </div>
    </div>
  );
};

export default Step2_Details;
