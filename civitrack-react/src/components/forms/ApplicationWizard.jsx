import React, { useState } from 'react';
import Input from '../ui/Input.jsx';
import Textarea from '../ui/Textarea.jsx';
import FileUpload from './FileUpload.jsx';
import Button from '../ui/Button.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';

const steps = [
  { id: 1, label: 'Application Type' },
  { id: 2, label: 'Applicant Details' },
  { id: 3, label: 'Property Details' },
  { id: 4, label: 'Upload Documents' },
  { id: 5, label: 'Review & Submit' },
];

const ApplicationWizard = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    applicationType: 'building-permit',
    name: '',
    nic: '',
    phone: '',
    email: '',
    propertyAddress: '',
    district: '',
    documents: [],
  });

  const handleNext = () => {
    if (currentStep < steps.length) setCurrentStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilesSelect = (files) => {
    setFormData((prev) => ({ ...prev, documents: files }));
  };

  const handleSubmit = () => {
    onComplete?.(formData);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between">
          {steps.map((step) => (
            <div key={step.id} className="flex-1 mx-1 text-center">
              <div
                className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm transition ${
                  step.id <= currentStep ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {step.id}
              </div>
              <p className="text-xs text-slate-600 mt-1">{step.label}</p>
            </div>
          ))}
        </div>
        <div className="flex h-1 gap-1">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex-1 rounded-full transition ${step.id <= currentStep ? 'bg-blue-700' : 'bg-slate-200'}`}
            />
          ))}
        </div>
      </div>

      {/* Step 1: Application Type */}
      {currentStep === 1 && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">Select Application Type</h2>
          {['building-permit', 'boundary-wall', 'land-subdivision'].map((type) => (
            <label key={type} className="flex items-center p-3 border border-slate-300 rounded-lg cursor-pointer hover:bg-blue-50">
              <input
                type="radio"
                name="applicationType"
                value={type}
                checked={formData.applicationType === type}
                onChange={handleChange}
                className="w-4 h-4"
              />
              <span className="ml-3 font-medium text-slate-700 capitalize">{type.replace('-', ' ')}</span>
            </label>
          ))}
        </div>
      )}

      {/* Step 2: Applicant Details */}
      {currentStep === 2 && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">Your Details</h2>
          <Input label="Full Name" name="name" value={formData.name} onChange={handleChange} required />
          <Input label="NIC Number" name="nic" value={formData.nic} onChange={handleChange} required />
          <Input label="Phone" name="phone" value={formData.phone} onChange={handleChange} type="tel" required />
          <Input label="Email" name="email" value={formData.email} onChange={handleChange} type="email" required />
        </div>
      )}

      {/* Step 3: Property Details */}
      {currentStep === 3 && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">Property Information</h2>
          <Textarea label="Property Address" name="propertyAddress" value={formData.propertyAddress} onChange={handleChange} rows={3} required />
          <Input label="District / Area" name="district" value={formData.district} onChange={handleChange} required />
        </div>
      )}

      {/* Step 4: Upload Documents */}
      {currentStep === 4 && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">Upload Required Documents</h2>
          <FileUpload
            label="Select Files (PDF, Images)"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            files={formData.documents}
            onFilesSelect={handleFilesSelect}
          />
          <p className="text-xs text-slate-500">Accepted: PDF, JPG, PNG. Max 5 files.</p>
        </div>
      )}

      {/* Step 5: Review & Submit */}
      {currentStep === 5 && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">Review Your Application</h2>
          <div className="space-y-3 text-sm bg-slate-50 p-4 rounded-lg">
            <p>
              <span className="font-semibold">Type:</span> {formData.applicationType}
            </p>
            <p>
              <span className="font-semibold">Name:</span> {formData.name}
            </p>
            <p>
              <span className="font-semibold">Email:</span> {formData.email}
            </p>
            <p>
              <span className="font-semibold">Location:</span> {formData.district}
            </p>
            <p>
              <span className="font-semibold">Documents:</span> {formData.documents.length} file(s) attached
            </p>
          </div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Note:</span> Review the above information carefully before submitting. You can edit or go back to previous steps.
            </p>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={handlePrev} disabled={currentStep === 1}>
          Previous
        </Button>
        <div className="flex gap-2">
          {currentStep < steps.length && (
            <Button onClick={handleNext}>Next</Button>
          )}
          {currentStep === steps.length && (
            <Button onClick={handleSubmit}>Submit Application</Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationWizard;
