import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog.jsx';
import FineImpositionModal from './FineImpositionModal';
import { useNotifications } from '../../context/NotificationContext.jsx';

/**
 * COCInspectionForm Component
 * 
 * Used by Technical Officers to conduct COC inspections and record findings.
 * Addresses Requirement 21: TO conducts COC inspection and submits report
 * indicating either compliance or deviation.
 * 
 * Props:
 * - cocId: The COC request ID being inspected
 * - applicantName: Name of the applicant
 * - applicationId: Original application ID
 * - onComplete: Callback when inspection is submitted (compliant or fine imposed)
 */
const COCInspectionForm = ({ 
  cocId = 'COC-2025-001', 
  applicantName = 'Nimal Perera',
  applicationId = 'APP/2025/00012',
  onComplete 
}) => {
  const { success, info } = useNotifications();
  const [inspectionResult, setInspectionResult] = useState(null); // 'compliant' or 'deviation'
  const [showFineModal, setShowFineModal] = useState(false);
  const [showRecommendConfirm, setShowRecommendConfirm] = useState(false);
  const [isFixable, setIsFixable] = useState('yes');
  const [fineRequired, setFineRequired] = useState('yes');
  const [toInstructions, setToInstructions] = useState('');
  const [nextLegalPath, setNextLegalPath] = useState('new-application');

  const handleRecommendCOC = () => {
    // In real implementation, this would call an API endpoint
    success(`COC inspection report submitted for ${cocId}. Status: compliant. Recommendation: approve COC.`);
    setShowRecommendConfirm(false);

    if (onComplete) {
      onComplete({
        cocId,
        result: 'compliant',
        recommendation: 'approve'
      });
    }
  };

  const handleOpenFineModal = () => {
    if (!toInstructions.trim()) {
      info('Please add clear correction instructions before recording the violation report.');
      return;
    }
    setShowFineModal(true);
  };

  const handleFineSubmitted = (fineData) => {
    setShowFineModal(false);

    info(`Deviation recorded for ${cocId}. Fine imposed: LKR ${fineData.fineAmount}. Applicant will be notified.`);
    
    if (onComplete) {
      onComplete({ 
        cocId, 
        result: 'deviation', 
        fineData: {
          ...fineData,
          isFixable: isFixable === 'yes',
          fineRequired: true,
          toInstructions: toInstructions.trim(),
          nextLegalPath: isFixable === 'yes' ? null : nextLegalPath,
        },
      });
    }
  };

  const handleSubmitDeviationWithoutFine = () => {
    if (!toInstructions.trim()) {
      info('Please add clear correction/legal instructions before submitting the violation report.');
      return;
    }

    if (onComplete) {
      onComplete({
        cocId,
        result: 'deviation',
        fineData: {
          deviationType: 'Other',
          comments: 'No monetary fine imposed by TO for this violation case.',
          fineAmount: 0,
          isFixable: isFixable === 'yes',
          fineRequired: false,
          toInstructions: toInstructions.trim(),
          nextLegalPath: isFixable === 'yes' ? null : nextLegalPath,
        },
      });
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="text-blue-600" size={28} />
          Certificate of Conformity Inspection
        </h2>
        <p className="text-slate-600 mt-1">
          COC ID: <span className="font-semibold">{cocId}</span> | 
          Applicant: <span className="font-semibold">{applicantName}</span> | 
          Application: <span className="font-semibold">{applicationId}</span>
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>Inspection Instructions:</strong> Verify that the completed construction 
          matches the approved plans. Check for any deviations in dimensions, materials, 
          or building placement. Record your findings below.
        </p>
      </div>

      {/* Inspection Result Selection - Radio Buttons with Visual Cards */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-slate-700">
          Inspection Outcome <span className="text-red-500">*</span>
        </label>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Compliant Option */}
          <button
            type="button"
            onClick={() => setInspectionResult('compliant')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              inspectionResult === 'compliant'
                ? 'border-green-500 bg-green-50 shadow-md'
                : 'border-slate-200 bg-white hover:border-green-300 hover:bg-green-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-1 flex-shrink-0 ${
                inspectionResult === 'compliant' ? 'text-green-600' : 'text-slate-400'
              }`}>
                <CheckCircle2 size={28} />
              </div>
              <div>
                <h3 className={`font-bold text-lg ${
                  inspectionResult === 'compliant' ? 'text-green-900' : 'text-slate-800'
                }`}>
                  Compliant
                </h3>
                <p className={`text-sm mt-1 ${
                  inspectionResult === 'compliant' ? 'text-green-800' : 'text-slate-600'
                }`}>
                  Construction matches approved plans. No deviations found.
                </p>
              </div>
            </div>
          </button>

          {/* Deviation Found Option */}
          <button
            type="button"
            onClick={() => setInspectionResult('deviation')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              inspectionResult === 'deviation'
                ? 'border-red-500 bg-red-50 shadow-md'
                : 'border-slate-200 bg-white hover:border-red-300 hover:bg-red-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-1 flex-shrink-0 ${
                inspectionResult === 'deviation' ? 'text-red-600' : 'text-slate-400'
              }`}>
                <AlertTriangle size={28} />
              </div>
              <div>
                <h3 className={`font-bold text-lg ${
                  inspectionResult === 'deviation' ? 'text-red-900' : 'text-slate-800'
                }`}>
                  Deviation Found
                </h3>
                <p className={`text-sm mt-1 ${
                  inspectionResult === 'deviation' ? 'text-red-800' : 'text-slate-600'
                }`}>
                  Construction deviates from approved plans. TO must decide whether a fine is required.
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Conditional Actions Based on Selection */}
      <div className="pt-4 border-t border-slate-200">
        {inspectionResult === null && (
          <div className="text-center py-4 text-slate-500">
            Please select an inspection outcome above
          </div>
        )}

        {inspectionResult === 'compliant' && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-900">
                ✓ Construction is compliant with approved plans. You can now recommend 
                issuance of the Certificate of Conformity.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => setShowRecommendConfirm(true)}
                className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
              >
                <CheckCircle2 size={18} />
                Recommend for COC Issuance
              </Button>
            </div>
          </div>
        )}

        {inspectionResult === 'deviation' && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-900">
                ⚠ Deviation detected. You must record the deviation details and impose 
                a fine. Mark whether this violation is fixable and provide clear applicant instructions.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Can this violation be fixed?</label>
                <select
                  value={isFixable}
                  onChange={(e) => setIsFixable(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                >
                  <option value="yes">Yes - Applicant can correct and request re-inspection</option>
                  <option value="no">No - Re-inspection path not allowed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Is a fine required for this case?</label>
                <select
                  value={fineRequired}
                  onChange={(e) => setFineRequired(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                >
                  <option value="yes">Yes - Applicant must pay fine</option>
                  <option value="no">No - No fine payment required</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Instructions to Applicant (Required)</label>
                <textarea
                  rows={4}
                  value={toInstructions}
                  onChange={(e) => setToInstructions(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3"
                  placeholder="Explain what must be corrected, required evidence, and deadline."
                />
              </div>

              {isFixable === 'no' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Next Legal Path</label>
                  <select
                    value={nextLegalPath}
                    onChange={(e) => setNextLegalPath(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  >
                    <option value="new-application">New Application</option>
                    <option value="appeal">Appeal</option>
                    <option value="manual-enforcement">Manual Enforcement</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              {fineRequired === 'yes' ? (
                <Button
                  variant="primary"
                  onClick={handleOpenFineModal}
                  className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
                >
                  <AlertTriangle size={18} />
                  Record Deviation & Impose Fine
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleSubmitDeviationWithoutFine}
                  className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
                >
                  <AlertTriangle size={18} />
                  Record Deviation (No Fine)
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fine Imposition Modal */}
      {showFineModal && (
        <FineImpositionModal
          open={showFineModal}
          cocId={cocId}
          applicantName={applicantName}
          onClose={() => setShowFineModal(false)}
          onSubmit={handleFineSubmitted}
        />
      )}

      <ConfirmDialog
        open={showRecommendConfirm}
        title="Confirm COC Recommendation"
        message={`Recommend Certificate of Conformity issuance for ${cocId}?`}
        confirmLabel="Recommend COC"
        onCancel={() => setShowRecommendConfirm(false)}
        onConfirm={handleRecommendCOC}
      />
    </div>
  );
};

export default COCInspectionForm;
