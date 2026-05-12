import React from 'react';
import FileUpload from '../forms/FileUpload.jsx';
import { getRequiredDocumentsByType } from '../../data/planningWorkflowStore';

const Step3_Uploads = ({ formData, onUpdate, errors = {} }) => {
  const selectedPermitTypes = formData.selectedPermitTypes || [];
  const allDocuments = getRequiredDocumentsByType(selectedPermitTypes);
  const missingDocumentLabels = (errors.missingDocuments || [])
    .map((docId) => allDocuments.find((doc) => doc.id === docId)?.label || docId);

  const handleFileUpload = (documentId, files) => {
    const currentDocuments = formData.documents || {};
    onUpdate({
      documents: {
        ...currentDocuments,
        [documentId]: files
      }
    });
  };

  const handleDocumentNameChange = (documentId, customName) => {
    const currentNames = formData.documentCustomNames || {};
    onUpdate({
      documentCustomNames: {
        ...currentNames,
        [documentId]: customName,
      }
    });
  };

  // Check if a document slot has draft stubs (metadata-only, needs re-upload)
  const hasDraftStubs = (docFiles) => {
    if (!Array.isArray(docFiles) || docFiles.length === 0) return false;
    return docFiles.some((f) => f && f._isDraftStub === true);
  };

  const statusChip = (docFiles) => {
    const files = docFiles || [];
    const hasFiles = files.length > 0;
    const isStub = hasDraftStubs(files);

    if (hasFiles && isStub) {
      return (
        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
          Re-upload needed
        </span>
      );
    }

    return (
      <span
        className={`text-[11px] px-2 py-0.5 rounded-full border ${
          hasFiles
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}
      >
        {hasFiles ? 'Uploaded' : 'Missing'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Required Documents</h2>
        <p className="text-slate-600">Upload all required supporting documents below</p>
      </div>

      {Object.values(formData.documents || {}).flat().some(f => f?._isDraftStub) && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <div className="text-amber-600 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">Draft Resumed: Action Required</p>
            <p className="text-xs text-amber-700 mt-1">
              Your previous selections are shown as "Re-upload needed". Due to browser security restrictions, you must re-select these files from your computer before you can submit.
            </p>
          </div>
        </div>
      )}

      {errors.documents && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-semibold text-red-700 mb-2">{errors.documents}</p>
          {missingDocumentLabels.length > 0 && (
            <ul className="text-xs text-red-700 list-disc list-inside space-y-1">
              {missingDocumentLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Required Documents */}
      <div className="p-6 border rounded-xl bg-slate-50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Required Documents</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {allDocuments.map(doc => {
            const deficiency = (formData.deficientDocuments || []).find(d => d.id === doc.id);
            const isDeficient = !!deficiency;

            return (
              <div 
                key={doc.id} 
                className={`p-4 bg-white border rounded-xl transition-all ${
                  isDeficient 
                    ? 'border-red-300 ring-2 ring-red-50 shadow-md ring-offset-2' 
                    : 'border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">{doc.label}</p>
                    {isDeficient && (
                      <span className="bg-red-100 text-red-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-red-200 uppercase tracking-tighter">
                        FIX NEEDED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-tight ${
                      doc.required === false 
                        ? 'bg-slate-50 text-slate-500 border-slate-200' 
                        : 'bg-blue-50 text-blue-600 border-blue-100'
                    }`}>
                      {doc.required === false ? 'Optional' : 'Required'}
                    </span>
                    {statusChip(formData.documents?.[doc.id] || [])}
                  </div>
                </div>

                {isDeficient && (
                  <div className="mb-4 bg-red-50/50 border border-red-100 rounded-lg p-3 text-xs text-red-800 font-medium leading-relaxed italic">
                    Reason: {deficiency.reason}
                  </div>
                )}

                <FileUpload
                  accept=".pdf,.jpg,.jpeg,.png"
                  files={formData.documents?.[doc.id] || []}
                  onFilesSelect={(files) => handleFileUpload(doc.id, files)}
                  customDocumentName={formData.documentCustomNames?.[doc.id] || ''}
                  onDocumentNameChange={(name) => handleDocumentNameChange(doc.id, name)}
                  multiple={false}
                  maxFileSizeMB={10}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload Summary */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          ℹ️ <strong>Note:</strong> Upload clear soft copies of original/attested documents where possible. 
          Additional checklist documents (fire, UDA, zone-specific clearances) may be requested during preliminary examination.
          You can preview, rename, replace, and re-upload documents during the draft stage, and each upload shows progress and validation feedback.
        </p>
      </div>
    </div>
  );
};

export default Step3_Uploads;
