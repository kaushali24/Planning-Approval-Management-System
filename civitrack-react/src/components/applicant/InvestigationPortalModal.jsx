import React, { useState } from 'react';
import { AlertCircle, Upload, CheckCircle, FileText, X, AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const API_BASE = 'http://localhost:5000/api';

const InvestigationPortalModal = ({ open, onClose, application, onSuccess }) => {
  const { success, error, warning } = useNotifications();
  const { token } = useAuth();
  const [files, setFiles] = useState([]);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles(prev => [...prev, ...selectedFiles]);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      warning('Please upload at least one document.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      formData.append('comment', comment);

      const response = await fetch(`${API_BASE}/applications/${application.dbId}/investigation-response`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Submission failed');

      success(data.message || 'Investigation response submitted successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      error(err.message || 'An error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!application) return null;

  const isClearanceHold = application.latestHoldType === 'clearance';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Investigation Portal - Hold Resolution"
      size="lg"
      footer={(
        <div className="flex gap-3 mt-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || files.length === 0}
            className="gap-2 min-w-[180px]"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Response'}
            {!isSubmitting && <Upload size={16} />}
          </Button>
        </div>
      )}
    >
      <div className="space-y-6">
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex gap-3">
          <AlertTriangle className="text-amber-600 shrink-0" size={20} />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {isClearanceHold ? 'Special Clearance Required' : 'Investigation Hold (Complaint/Deficiency)'}
            </p>
            <p className="text-xs text-amber-800 mt-1">
              {isClearanceHold 
                ? `Please upload the clearance certificate from ${application.clearanceAuthority || 'the relevant authority'}.`
                : 'Please upload the requested information or documentation to resolve the pending issue.'}
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Reason for Hold</h4>
          <p className="text-sm text-slate-800 italic">"{application.holdReason}"</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Comments / Explanation</label>
            <textarea
              className="w-full h-24 p-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all resize-none"
              placeholder="Add any additional notes for the Technical Officer..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700">Upload Supporting Documents</label>
            
            <label className="block group cursor-pointer">
              <div className="flex flex-col items-center justify-center gap-2 py-8 bg-white border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all duration-200">
                <div className="p-3 bg-slate-50 rounded-full group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                  <Upload size={24} className="text-slate-400 group-hover:text-blue-500" />
                </div>
                <div className="text-center">
                  <span className="block text-sm font-bold text-slate-700 group-hover:text-blue-700">Click to upload documents</span>
                  <span className="text-xs text-slate-400">PDF, JPG, PNG (Max 10MB each)</span>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  multiple
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png"
                />
              </div>
            </label>

            {files.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <FileText size={16} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 truncate max-w-[400px]">
                        {file.name}
                      </span>
                    </div>
                    <button 
                      onClick={() => removeFile(index)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default InvestigationPortalModal;
