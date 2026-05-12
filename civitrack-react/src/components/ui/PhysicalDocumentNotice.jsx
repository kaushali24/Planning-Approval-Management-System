import React from 'react';
import { AlertTriangle, FileText } from 'lucide-react';

const PhysicalDocumentNotice = ({ applicationId }) => {
  return (
    <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <AlertTriangle className="text-amber-600" size={24} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-900 mb-1">
            Digital Approval Granted
          </h3>
          <p className="text-sm text-amber-800">
            Please submit your physical <strong>Survey Plan</strong> and <strong>Deed</strong> to 
            the Pradeshiya Sabha counter within <strong>7 days</strong> to receive your stamped permit.
          </p>
          {applicationId && (
            <p className="text-xs text-amber-700 mt-2">
              Application: {applicationId}
            </p>
          )}
        </div>
        <FileText className="text-amber-500 flex-shrink-0" size={20} />
      </div>
    </div>
  );
};

export default PhysicalDocumentNotice;
