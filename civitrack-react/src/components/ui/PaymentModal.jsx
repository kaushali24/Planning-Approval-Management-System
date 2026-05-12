import React, { useState } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import Input from './Input.jsx';
import { CreditCard, Lock, CheckCircle2, Loader2 } from 'lucide-react';
import { formatCurrencyLKR, formatDate } from '../../utils/locale';

const PaymentModal = ({ open, onClose, applicationFee = 2500, applicationId = '', onPaymentSuccess }) => {
  const [paymentState, setPaymentState] = useState('form'); // 'form' | 'processing' | 'success'
  const [transactionId, setTransactionId] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [formError, setFormError] = useState('');

  const downloadPaymentReceipt = () => {
    const issuedAt = paidAt || new Date().toISOString();
    const lines = [
      'CiviTrack - Inspection Fee Receipt',
      '----------------------------------',
      `Receipt ID: ${receiptId || 'N/A'}`,
      `Transaction ID: ${transactionId || 'N/A'}`,
      `Application ID: ${applicationId || 'N/A'}`,
      `Amount Paid (LKR): ${applicationFee}`,
      `Payment Method: Online Card Payment`,
      `Paid At: ${new Date(issuedAt).toLocaleString()}`,
      '',
      'This receipt is system-generated.',
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${applicationId || 'application'}-payment-receipt.txt`;
    link.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 3000);
  };

  const handlePayment = () => {
    if (!cardNumber || !expiry || !cvc || !cardholderName) {
      setFormError('Please fill in all payment details.');
      return;
    }
    setFormError('');

    // Simulate payment processing
    setPaymentState('processing');
    const txId = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const rcId = `RCT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const paidTimestamp = new Date().toISOString();
    
    setTimeout(() => {
      setTransactionId(txId);
      setReceiptId(rcId);
      setPaidAt(paidTimestamp);
      setPaymentState('success');
      onPaymentSuccess?.({
        transactionId: txId,
        receiptId: rcId,
        amount: applicationFee,
        method: 'online',
        paidAt: paidTimestamp,
      });
    }, 2000);
  };

  const handleClose = () => {
    setPaymentState('form');
    setCardNumber('');
    setExpiry('');
    setCvc('');
    setCardholderName('');
    setTransactionId('');
    setReceiptId('');
    setPaidAt('');
    setFormError('');
    onClose?.();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Secure Payment Gateway" size="md">
      {paymentState === 'form' && (
        <div className="space-y-6">
          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Lock className="text-green-600" size={20} />
            <p className="text-sm text-green-800 font-medium">
              Secure SSL Encrypted Payment
            </p>
          </div>

          {/* Order Summary */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Order Summary</h3>
            <div className="flex justify-between items-center">
              <span className="text-slate-700">Application Processing Fee</span>
              <span className="text-xl font-bold text-slate-900">{formatCurrencyLKR(applicationFee)}</span>
            </div>
          </div>

          {/* Payment Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Card Number</label>
              <div className="relative">
                <Input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                  placeholder="1234 5678 9012 3456"
                  maxLength="16"
                />
                <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Expiry Date</label>
                <Input
                  type="text"
                  value={expiry}
                  onChange={(e) => {
                    let value = e.target.value.replace(/\D/g, '');
                    if (value.length >= 2) {
                      value = value.slice(0, 2) + '/' + value.slice(2, 4);
                    }
                    setExpiry(value.slice(0, 5));
                  }}
                  placeholder="MM/YY"
                  maxLength="5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CVC</label>
                <Input
                  type="text"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="123"
                  maxLength="3"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Cardholder Name</label>
              <Input
                type="text"
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                placeholder="Name as shown on card"
              />
            </div>
          </div>

          {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handlePayment} className="flex-1 flex items-center justify-center gap-2">
              <Lock size={16} />
              Pay Now
            </Button>
          </div>

          {/* Footer Note */}
          <p className="text-xs text-center text-slate-500">
            This is a simulated payment gateway for demonstration purposes
          </p>
        </div>
      )}

      {paymentState === 'processing' && (
        <div className="py-12 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="text-blue-600 animate-spin" size={48} />
          <p className="text-lg font-semibold text-slate-800">Processing Payment...</p>
          <p className="text-sm text-slate-500">Please wait while we verify your payment</p>
        </div>
      )}

      {paymentState === 'success' && (
        <div className="py-8 space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="text-green-600" size={40} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800">Payment Successful!</h3>
            <p className="text-slate-600 text-center">
              Your application processing fee has been received
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-slate-600">Transaction ID</span>
              <span className="text-sm font-mono font-semibold text-slate-900">{transactionId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600">Receipt ID</span>
              <span className="text-sm font-mono font-semibold text-slate-900">{receiptId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600">Amount Paid</span>
              <span className="text-sm font-semibold text-slate-900">{formatCurrencyLKR(applicationFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600">Payment Date</span>
              <span className="text-sm font-semibold text-slate-900">
                {formatDate(paidAt || new Date())}
              </span>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">
              ✓ Receipt generated successfully. Download and keep this for your records.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={downloadPaymentReceipt} className="w-full">
              Download Receipt
            </Button>
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PaymentModal;
