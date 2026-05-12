import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, Landmark, ShieldCheck, Edit2, FileText, AlertTriangle, Clock } from 'lucide-react';
import { getRequiredDocumentsByType } from '../../data/planningWorkflowStore';

const formatFeeLabel = (amount) => `LKR ${Number(amount || 0).toFixed(2)}`;

const Step6_ReviewSubmit = ({ formData, onUpdate, errors = {}, onEditStep, feeConfig = {} }) => {
  const [paymentError, setPaymentError] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const isOnlinePayment = formData.applicationFeeMethod === 'online';
  const isBankPayment = formData.applicationFeeMethod === 'bank';
  const selectedPermitTypes = formData.selectedPermitTypes || [];
  const requiresPayment = selectedPermitTypes.length > 0;
  const buildingPermitFee = Number(feeConfig.building_permit ?? 750);
  const subdivisionFee = Number(feeConfig.land_subdivision ?? 500);

  const feeAmount = useMemo(() => {
    if (selectedPermitTypes.includes('building') || selectedPermitTypes.includes('boundaryWall')) return buildingPermitFee;
    if (selectedPermitTypes.includes('subdivision')) return subdivisionFee;
    return 0;
  }, [selectedPermitTypes, buildingPermitFee, subdivisionFee]);

  const getFeeForType = (type) => {
    if (type === 'building' || type === 'boundaryWall' || type === 'boundary-wall') {
      return formatFeeLabel(buildingPermitFee);
    }
    if (type === 'subdivision') {
      return formatFeeLabel(subdivisionFee);
    }
    return formatFeeLabel(0);
  };

  const getApplicationTypeLabel = (type) => {
    const labels = {
      building: 'Building Permit (Including Boundary Wall Section)',
      'boundary-wall': 'Boundary Wall Permit',
      subdivision: 'Land Subdivision Permit',
    };
    return labels[type] || 'Unknown';
  };

  const getSelectedPermitLabel = () => {
    const labels = [];
    if (selectedPermitTypes.includes('building')) labels.push('Building Permit');
    if (selectedPermitTypes.includes('boundaryWall')) labels.push('Boundary Wall Permit');
    if (selectedPermitTypes.includes('subdivision')) labels.push('Land Subdivision Permit');
    return labels.length > 0 ? labels.join(' + ') : 'No permit selected';
  };

  const formatCardNumber = (value) =>
    value
      .replace(/\D/g, '')
      .slice(0, 16)
      .replace(/(.{4})/g, '$1 ')
      .trim();

  const formatExpiry = (value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    if (cleaned.length <= 2) return cleaned;
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
  };

  const onlinePaymentIsValid = () => {
    const cardNumber = (formData.paymentCardNumber || '').replace(/\s/g, '');
    const cvv = (formData.paymentCvv || '').trim();
    const expiry = (formData.paymentExpiry || '').trim();
    const holder = (formData.paymentCardHolder || '').trim();

    if (cardNumber.length !== 16) return 'Card number must be 16 digits';
    if (!/^\d{2}\/\d{2}$/.test(expiry)) return 'Expiry must be in MM/YY format';
    if (!/^\d{3,4}$/.test(cvv)) return 'CVV must be 3 or 4 digits';
    if (holder.length < 3) return 'Card holder name is required';
    return '';
  };

  const processOnlinePayment = () => {
    const validationMessage = onlinePaymentIsValid();
    if (validationMessage) {
      setPaymentError(validationMessage);
      return;
    }

    setPaymentError('');
    setIsProcessingPayment(true);

    setTimeout(() => {
      const transactionId = `TXN-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, '0')}`;

      onUpdate({
        applicationFeePaid: true,
        applicationFeeTransactionId: transactionId,
        applicationFeePaidAt: new Date().toISOString(),
      });
      setIsProcessingPayment(false);
    }, 900);
  };

  const markBankPaymentSubmitted = () => {
    if (!formData.applicationFeeReceiptRef?.trim()) {
      setPaymentError('Receipt reference is required for bank/counter payment');
      return;
    }

    setPaymentError('');
    onUpdate({
      applicationFeePaid: true,
      applicationFeePaidAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Review & Submit</h2>
        <p className="text-slate-600">
          Complete payment below, then review all your details before final submission.
        </p>
      </div>

      {/* Payment Section - Always Visible */}
      <div className="p-6 border-2 border-blue-300 rounded-xl bg-blue-50 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-800">Complete Payment</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-white rounded-lg">
          <div>
            <p className="text-sm text-slate-600">Application Type</p>
            <p className="font-semibold text-slate-800">{getSelectedPermitLabel()}</p>
          </div>
          <div>
            <p className="text-sm text-slate-600">Fee Amount</p>
            <p className="font-semibold text-blue-700 text-lg">{getFeeForType(formData.applicationType || selectedPermitTypes[0])}</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
          <select
            value={formData.applicationFeeMethod || ''}
            onChange={(e) =>
              onUpdate({
                applicationFeeMethod: e.target.value,
                applicationFeePaid: false,
                applicationFeeTransactionId: '',
              })
            }
            disabled={formData.applicationFeePaid}
            className="w-full md:w-80 px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          >
            <option value="">Select method</option>
            <option value="online">Online Card Payment</option>
            <option value="bank">Bank/Counter Payment</option>
          </select>
          {errors.applicationFeeMethod && <p className="text-sm text-red-600 mt-2">{errors.applicationFeeMethod}</p>}
        </div>

        {requiresPayment && isOnlinePayment && !formData.applicationFeePaid && (
          <div className="p-4 border border-slate-200 rounded-xl bg-white space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-semibold">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Secure Card Checkout
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Card Number</label>
                <input
                  type="text"
                  value={formData.paymentCardNumber || ''}
                  onChange={(e) => onUpdate({ paymentCardNumber: formatCardNumber(e.target.value) })}
                  placeholder="1234 5678 9012 3456"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expiry (MM/YY)</label>
                <input
                  type="text"
                  value={formData.paymentExpiry || ''}
                  onChange={(e) => onUpdate({ paymentExpiry: formatExpiry(e.target.value) })}
                  placeholder="08/29"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CVV</label>
                <input
                  type="password"
                  value={formData.paymentCvv || ''}
                  onChange={(e) => onUpdate({ paymentCvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="123"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Card Holder Name</label>
                <input
                  type="text"
                  value={formData.paymentCardHolder || ''}
                  onChange={(e) => onUpdate({ paymentCardHolder: e.target.value })}
                  placeholder="Name on card"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border rounded-lg">
              <span className="text-sm text-slate-600">Amount to Pay</span>
              <span className="font-bold text-slate-800">LKR {feeAmount.toFixed(2)}</span>
            </div>

            <button
              type="button"
              onClick={processOnlinePayment}
              disabled={isProcessingPayment}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              <ShieldCheck className="w-4 h-4" />
              {isProcessingPayment ? 'Processing...' : 'Pay Now'}
            </button>
          </div>
        )}

        {requiresPayment && isBankPayment && !formData.applicationFeePaid && (
          <div className="p-4 border border-slate-200 rounded-xl bg-white space-y-3">
            <div className="flex items-center gap-2 text-slate-800 font-semibold">
              <Landmark className="w-5 h-5 text-blue-600" />
              Bank/Counter Payment Confirmation
            </div>
            <p className="text-sm text-slate-600">Enter your bank slip or counter receipt reference to confirm payment.</p>
            <input
              type="text"
              value={formData.applicationFeeReceiptRef || ''}
              onChange={(e) => onUpdate({ applicationFeeReceiptRef: e.target.value })}
              placeholder="Enter receipt reference"
              className="w-full md:w-96 px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.applicationFeeReceiptRef && <p className="text-sm text-red-600">{errors.applicationFeeReceiptRef}</p>}
            <button
              type="button"
              onClick={markBankPaymentSubmitted}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Confirm Bank Payment
            </button>
          </div>
        )}

        {paymentError && <p className="text-sm text-red-600">{paymentError}</p>}
        {requiresPayment && errors.applicationFeePaid && <p className="text-sm text-red-600">{errors.applicationFeePaid}</p>}

        {(formData.applicationFeePaid || !requiresPayment) && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800">
              <strong>Payment confirmed!</strong> {formData.applicationFeeTransactionId ? `(${formData.applicationFeeTransactionId})` : ''}
              <br />
              <span className="text-xs">Scroll below to review your application and submit.</span>
            </p>
          </div>
        )}
      </div>

      {/* Full Review Section - Only visible after payment confirmed */}
      {(formData.applicationFeePaid || !requiresPayment) && (
        <div className="p-6 border rounded-xl bg-white space-y-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <h3 className="text-lg font-semibold text-slate-800">Application Review</h3>
          </div>

          {/* Application Type */}
          <div className="p-4 border rounded-lg bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-700">Application Type & Fee</h4>
              <button
                type="button"
                onClick={() => onEditStep?.(1)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-blue-300 rounded text-blue-600 hover:bg-blue-50"
              >
                <Edit2 className="w-3 h-3" />
                Edit
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-600">Type</p>
                <p className="font-medium text-slate-800">{getSelectedPermitLabel()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600">Fee</p>
                <p className="font-medium text-slate-800">{getFeeForType(formData.applicationType || selectedPermitTypes[0])}</p>
              </div>
            </div>
          </div>

          {/* Applicant Information */}
          <div className="p-4 border rounded-lg bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-700">Applicant Information</h4>
              <button
                type="button"
                onClick={() => onEditStep?.(2)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-blue-300 rounded text-blue-600 hover:bg-blue-50"
              >
                <Edit2 className="w-3 h-3" />
                Edit
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-600">Full Name</p>
                <p className="font-medium text-slate-800">{formData.applicantName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600">NIC Number</p>
                <p className="font-medium text-slate-800">{formData.nicNumber || '—'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-slate-600">Address</p>
                <p className="font-medium text-slate-800 text-sm">{formData.applicantAddress || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600">Contact Number</p>
                <p className="font-medium text-slate-800">{formData.contactNumber || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600">Email</p>
                <p className="font-medium text-slate-800 text-sm">{formData.email || '—'}</p>
              </div>
            </div>
          </div>

          {/* Property Information */}
          <div className="p-4 border rounded-lg bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-700">Property Information</h4>
              <button
                type="button"
                onClick={() => onEditStep?.(3)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-blue-300 rounded text-blue-600 hover:bg-blue-50"
              >
                <Edit2 className="w-3 h-3" />
                Edit
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-600">Assessment Number</p>
                <p className="font-medium text-slate-800">{formData.assessmentNumber || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600">Deed Number</p>
                <p className="font-medium text-slate-800 text-sm">{formData.deedNumber || '—'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-slate-600">Survey Plan</p>
                <p className="font-medium text-slate-800 text-sm">{formData.surveyPlan || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600">Land Extent</p>
                <p className="font-medium text-slate-800">{formData.landExtent || '—'}</p>
              </div>
            </div>
          </div>

          {/* Documents Checklist */}
          <div className="p-4 border rounded-lg bg-slate-50 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-700">Document Submission Checklist</h4>
              <button
                type="button"
                onClick={() => onEditStep?.(3)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-blue-300 rounded text-blue-600 hover:bg-blue-50"
              >
                <Edit2 className="w-3 h-3" />
                Edit Uploads
              </button>
            </div>

            {/* Error Message if documents are missing */}
            {errors.documents && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                <div className="text-xs text-red-800">
                  <p className="font-bold">{errors.documents}</p>
                  {errors.missingDocuments && errors.missingDocuments.length > 0 && (
                    <ul className="list-disc list-inside mt-1">
                      {errors.missingDocuments.map((docId) => (
                        <li key={docId}>
                          {getRequiredDocumentsByType(formData.selectedPermitTypes || formData.applicationType).find(d => d.id === docId)?.label || docId}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {getRequiredDocumentsByType(formData.selectedPermitTypes || formData.applicationType).map((requirement) => {
                const uploadedFiles = formData.documents?.[requirement.id];
                const hasFiles = Array.isArray(uploadedFiles) && uploadedFiles.length > 0;
                const isStub = hasFiles && uploadedFiles.some(f => f?._isDraftStub);

                return (
                  <div key={requirement.id} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    hasFiles && !isStub ? 'bg-white border-green-200' : isStub ? 'bg-amber-50 border-amber-200' : requirement.required === false ? 'bg-white border-slate-200 opacity-80' : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`p-2 rounded-lg ${
                        hasFiles && !isStub ? 'bg-green-100' : isStub ? 'bg-amber-100' : 'bg-slate-100'
                      }`}>
                        <FileText className={`w-4 h-4 ${
                          hasFiles && !isStub ? 'text-green-600' : isStub ? 'text-amber-600' : 'text-slate-400'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          hasFiles && !isStub ? 'text-slate-900' : 'text-slate-700'
                        }`}>
                          {requirement.label}
                        </p>
                        {hasFiles && (
                          <p className="text-[11px] text-slate-500 truncate">
                            File: {formData.documentCustomNames?.[requirement.id] || uploadedFiles[0].name}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {requirement.required === false && !hasFiles && (
                        <span className="text-[10px] uppercase font-bold text-slate-400 px-2 py-0.5 bg-slate-50 border rounded-full">Optional</span>
                      )}
                      {hasFiles && !isStub && (
                        <div className="flex items-center gap-1 text-green-600 font-bold text-[10px] uppercase bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                          <CheckCircle2 className="w-3 h-3" />
                          Ready
                        </div>
                      )}
                      {isStub && (
                        <div className="flex items-center gap-1 text-amber-600 font-bold text-[10px] uppercase bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                          <Clock className="w-3 h-3" />
                          Re-upload needed
                        </div>
                      )}
                      {requirement.required !== false && !hasFiles && (
                        <div className="flex items-center gap-1 text-red-600 font-bold text-[10px] uppercase bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                          <AlertTriangle className="w-3 h-3" />
                          Missing
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Location */}
          {(formData.latitude || formData.longitude) && (
            <div className="p-4 border rounded-lg bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-slate-700">Location Coordinates</h4>
                <button
                  type="button"
                  onClick={() => onEditStep?.(5)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-blue-300 rounded text-blue-600 hover:bg-blue-50"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-600">Latitude</p>
                  <p className="font-medium text-slate-800">{Number(formData.latitude).toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Longitude</p>
                  <p className="font-medium text-slate-800">{Number(formData.longitude).toFixed(4)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Important Notes - Only visible after payment */}
      {(formData.applicationFeePaid || !requiresPayment) && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-semibold mb-2">Before Final Submission:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Review all information carefully in the sections above</li>
                <li>Use Edit buttons to correct any details if needed</li>
                <li>Once submitted, you cannot edit without officer request</li>
                <li>You will receive email confirmation shortly</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Declaration - Only visible after payment */}
      {(formData.applicationFeePaid || !requiresPayment) && (
        <div className="p-6 border rounded-xl bg-slate-50 space-y-4">
          <h3 className="font-semibold text-slate-800">Final Declaration</h3>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!formData.declaration}
              onChange={(e) => {
                onUpdate({ declaration: e.target.checked });
              }}
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-1 flex-shrink-0"
            />
            <span className="text-sm text-slate-700 leading-relaxed">
              I hereby certify that the information and documents provided in this application are true and accurate to the
              best of my knowledge. I understand that providing false, misleading, or incomplete information may result in
              rejection of my application, cancellation of any issued certificate, and legal consequences as per applicable
              laws and regulations of the Kelaniya Pradeshiya Sabha.
            </span>
          </label>
          {!formData.declaration && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <span>✕ You must agree to submit your application</span>
            </p>
          )}
          {errors.declaration && <p className="text-xs text-red-600">{errors.declaration}</p>}
        </div>
      )}

      {/* Next Steps Info */}
      {(formData.applicationFeePaid || !requiresPayment) && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <p>
            <strong>Next Steps:</strong> After submission, your application will be assigned to a Planning Officer who will
            verify your details and conduct necessary inspections. You will receive updates about your application status.
          </p>
        </div>
      )}
    </div>
  );
};

export default Step6_ReviewSubmit;
