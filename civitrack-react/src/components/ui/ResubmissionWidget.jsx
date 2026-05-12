import React, { useState } from 'react';
import { AlertCircle, Upload, CheckCircle } from 'lucide-react';
import Button from './Button.jsx';
import StatusBadge from './StatusBadge.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';

const ResubmissionWidget = ({
  applicationId = 'APP/2025/00017',
  deficiencyNote = '',
  deficientDocuments = [],
  existingResubmissions = {},
  onSubmitCorrections,
}) => {
  const { success, error } = useNotifications();
  const [rejectedDocs, setRejectedDocs] = useState(
    deficientDocuments.map((doc) => ({
      id: doc.id,
      name: doc.label,
      status: 'rejected',
      comment: doc.reason || deficiencyNote || 'Correction requested by Planning Officer',
      uploadedFile: null,
      customName: existingResubmissions[doc.id]?.customName || '',
    }))
  );

  const handleFileUpload = (docId, event) => {
    const file = event.target.files?.[0];
    if (file) {
      setRejectedDocs(docs =>
        docs.map(doc =>
          doc.id === docId ? { ...doc, uploadedFile: file } : doc
        )
      );
    }
  };

  const handleSubmit = () => {
    const hasAllUploads = rejectedDocs.every(doc => doc.uploadedFile);
    
    if (!hasAllUploads) {
      error('Please upload corrected versions for all rejected documents.');
      return;
    }

    const payload = {};
    const filesByDoc = {};
    rejectedDocs.forEach((doc) => {
      payload[doc.id] = {
        fileName: doc.uploadedFile.name,
        customName: doc.customName,
        submittedAt: new Date().toISOString(),
      };
      filesByDoc[doc.id] = doc.uploadedFile;
    });

    onSubmitCorrections?.(applicationId, payload, filesByDoc);
    success(`Corrections submitted successfully for ${applicationId}. Documents updated: ${rejectedDocs.length}.`);
    
    // Reset widget after successful submission
    setRejectedDocs(docs =>
      docs.map(doc => ({ ...doc, uploadedFile: null }))
    );
  };

  if (rejectedDocs.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
        <p className="text-sm text-slate-600">No selective corrections are pending for this application.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-red-200 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertCircle className="text-red-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Document Corrections Required</h3>
            <p className="text-sm text-slate-600">Application {applicationId}</p>
          </div>
        </div>
        <StatusBadge status="correction">Action Required</StatusBadge>
      </div>

      <p className="text-sm text-slate-600 mb-6">
        The following documents were rejected during review. Please upload corrected versions to continue processing your application.
        {deficiencyNote && (
          <span className="block mt-2 text-red-700"><strong>Officer Note:</strong> {deficiencyNote}</span>
        )}
      </p>

      {/* Rejected Documents List */}
      <div className="space-y-4 mb-6">
        {rejectedDocs.map((doc) => (
          <div key={doc.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-slate-800">{doc.name}</h4>
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                    Rejected
                  </span>
                </div>
                <p className="text-sm text-red-600">
                  <strong>Reason:</strong> {doc.comment}
                </p>
              </div>
            </div>

            {/* File Upload */}
            <div className="flex items-center gap-3">
              <label
                htmlFor={`file-${doc.id}`}
                className="flex-1 flex items-center gap-2 px-4 py-2 bg-white border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition"
              >
                <Upload size={18} className="text-slate-400" />
                <span className="text-sm text-slate-600">
                  {doc.uploadedFile ? doc.uploadedFile.name : 'Upload Corrected Version'}
                </span>
                <input
                  id={`file-${doc.id}`}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => handleFileUpload(doc.id, e)}
                />
              </label>
              {doc.uploadedFile && (
                <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
              )}
            </div>

            <div className="mt-2">
              <label className="text-xs text-slate-600">Document Name (optional)</label>
              <input
                type="text"
                value={doc.customName || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setRejectedDocs((docs) => docs.map((item) => (
                    item.id === doc.id ? { ...item, customName: value } : item
                  )));
                }}
                className="mt-1 w-full px-2 py-1.5 text-xs border border-slate-300 rounded"
                placeholder="Add a clear file label"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        className="w-full flex items-center justify-center gap-2"
        disabled={!rejectedDocs.some(doc => doc.uploadedFile)}
      >
        <Upload size={18} />
        Submit Corrections
      </Button>

      {/* Info Note */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>Note:</strong> After submission, your application will return to the review queue. 
          You will be notified once the review is complete.
        </p>
      </div>
    </div>
  );
};

export default ResubmissionWidget;
