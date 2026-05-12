import React, { useState } from 'react';
import { AlertCircle, Upload, CheckCircle, FileText, X } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const API_BASE = 'http://localhost:5000/api';

const CorrectionPortalModal = ({ open, onClose, application, onSuccess }) => {
  const { success, error, warning } = useNotifications();
  const { token } = useAuth();
  const [uploads, setUploads] = useState({}); // { docId: File }
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deficientDocuments = application?.deficientDocuments || [];

  const handleFileChange = (docId, event) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploads(prev => ({ ...prev, [docId]: file }));
    }
  };

  const removeFile = (docId) => {
    setUploads(prev => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  };

  const handleSubmit = async () => {
    const docIds = Object.keys(uploads);
    if (docIds.length === 0) {
      warning('Please upload at least one corrected document.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      docIds.forEach(id => {
        formData.append('files', uploads[id]);
      });
      formData.append('doc_ids', JSON.stringify(docIds));

      const response = await fetch(`${API_BASE}/applications/${application.dbId}/resubmit-corrections`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Resubmission failed');

      success(data.message || 'Corrections submitted successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      error(err.message || 'An error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!application) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Correction Portal - Resubmit Documents"
      size="lg"
      footer={(
        <div className="flex gap-3 mt-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || Object.keys(uploads).length === 0}
            className="gap-2 min-w-[160px]"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Corrections'}
            {!isSubmitting && <Upload size={16} />}
          </Button>
        </div>
      )}
    >
      <div className="space-y-6">
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex gap-3">
          <AlertCircle className="text-amber-600 shrink-0" size={20} />
          <div>
            <p className="text-sm font-semibold text-amber-900">Stage 2: Preliminary Examination corrections</p>
            <p className="text-xs text-amber-800 mt-1">
              Please upload the corrected versions of the document(s) flagged by the officer. 
              Once all flagged items are corrected, the application will return to Stage 2 - Preliminary Examination.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {deficientDocuments.map((doc) => (
            <div key={doc.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-3 transition-colors hover:border-slate-300">
              <div className="flex items-start justify-between">
                <div className="flex gap-3">
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 shadow-sm">
                    <FileText size={20} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">{doc.label}</h4>
                    <div className="bg-red-50 px-2 py-1 rounded border border-red-100 inline-block">
                        <p className="text-[11px] text-red-600 font-medium leading-tight">Reason: {doc.reason}</p>
                    </div>
                  </div>
                </div>
                {uploads[doc.id] && (
                  <div className="bg-green-100 text-green-600 p-1 rounded-full">
                    <CheckCircle size={16} />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                {!uploads[doc.id] ? (
                  <label className="flex-1 group cursor-pointer">
                    <div className="flex items-center justify-center gap-2.5 px-4 py-8 bg-white border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all duration-200">
                      <div className="p-2 bg-slate-50 rounded-full group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                        <Upload size={18} className="text-slate-400 group-hover:text-blue-500" />
                      </div>
                      <div className="text-center">
                        <span className="block text-xs font-bold text-slate-700 group-hover:text-blue-700">Click to upload corrected version</span>
                        <span className="text-[10px] text-slate-400">PDF, JPG, PNG (Max 10MB)</span>
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        onChange={(e) => handleFileChange(doc.id, e)}
                        accept=".pdf,.jpg,.jpeg,.png"
                      />
                    </div>
                  </label>
                ) : (
                  <div className="flex-1 flex items-center justify-between px-4 py-4 bg-white border border-green-200 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                            <FileText size={16} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 truncate max-w-[300px]">
                        {uploads[doc.id].name}
                        </span>
                    </div>
                    <button 
                      onClick={(e) => { e.preventDefault(); removeFile(doc.id); }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Remove file"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default CorrectionPortalModal;
