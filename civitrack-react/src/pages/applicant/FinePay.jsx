import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReceiptText } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import PaymentModal from '../../components/ui/PaymentModal.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { loadCocWorkflow, saveCocWorkflow } from '../../data/cocWorkflowStore';
import { formatDate, formatDateTime } from '../../utils/locale';

const toFineStateLabel = (row) => {
  if (row.paidAt) return { tone: 'success', label: 'Paid' };
  return { tone: 'warning', label: 'Pending Payment' };
};

const FinePay = () => {
  const { user } = useAuth();
  const { success, error } = useNotifications();
  const [rows, setRows] = useState(loadCocWorkflow);
  const [selectedCocId, setSelectedCocId] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const applicantEmail = String(user?.email || '').trim().toLowerCase();

  const fines = useMemo(() => {
    return rows
      .filter((row) => String(row.applicantEmail || '').trim().toLowerCase() === applicantEmail)
      .filter((row) => (
        row.status === 'coc-violations-found'
        || row.status === 'coc-fine-paid-awaiting-correction'
        || row.status === 'coc-fine-paid-regularization-pending'
        || row.status === 'coc-rejected-non-rectifiable'
      ))
      .filter((row) => row.violationReport?.fineRequired !== false)
      .map((row) => ({
        cocId: row.cocId,
        applicationId: row.applicationId,
        amount: Number(row.deviationFine || row.violationReport?.fineAmount || 0),
        deviationType: row.violationReport?.deviationType || 'Violation',
        issuedAt: row.violationReportedAt || row.inspectionCompletedAt || row.requestedAt,
        paidAt: row.finePaidAt || null,
      }))
      .sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());
  }, [rows, applicantEmail]);

  const pending = fines.filter((item) => !item.paidAt && item.amount > 0);
  const paid = fines.filter((item) => !!item.paidAt);
  const selected = fines.find((item) => item.cocId === selectedCocId) || null;

  const requestPayment = (cocId) => {
    setSelectedCocId(cocId);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = () => {
    if (!selectedCocId) return;
    const paidAt = new Date().toISOString();

    const next = rows.map((row) => {
      if (row.cocId !== selectedCocId) return row;
      if (row.violationReport?.fineRequired === false) return row;

      return {
        ...row,
        paidAt,
        finePaidAt: paidAt,
        status: row.violationReport?.isFixable
          ? 'coc-fine-paid-awaiting-correction'
          : 'coc-fine-paid-regularization-pending',
      };
    });

    setRows(next);
    saveCocWorkflow(next);
    setShowPaymentModal(false);
    setSelectedCocId(null);
    success('Fine payment recorded successfully.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Fine Tracking & Payment</h1>
          <p className="text-sm text-slate-500">Review imposed fines, pay pending amounts, and keep correction workflows moving.</p>
        </div>
        <Link to="/coc-requests">
          <Button variant="secondary">Open COC Requests</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Total Fine Cases</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{fines.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <p className="text-xs font-medium text-red-600">Pending Payments</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{pending.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <p className="text-xs font-medium text-emerald-600">Paid Cases</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{paid.length}</p>
        </div>
      </div>

      <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Pending Fines</h2>

        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">No pending fine payments.</p>
        ) : (
          pending.map((item) => {
            const meta = toFineStateLabel(item);
            return (
              <div key={item.cocId} className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-red-900">{item.cocId} · {item.applicationId}</p>
                  <p className="text-sm text-red-800">{item.deviationType}</p>
                  <p className="text-xs text-red-700">Issued: {item.issuedAt ? formatDate(item.issuedAt) : 'N/A'}</p>
                  <p className="text-sm font-semibold text-red-900 mt-1">LKR {item.amount.toLocaleString('en-LK')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={meta.tone}>{meta.label}</StatusBadge>
                  <Button size="sm" onClick={() => requestPayment(item.cocId)}>
                    Pay Fine
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Payment History</h2>

        {paid.length === 0 ? (
          <p className="text-sm text-slate-500">No completed fine payments yet.</p>
        ) : (
          paid.map((item) => (
            <div key={item.cocId} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-900">{item.cocId} · {item.applicationId}</p>
                <p className="text-sm text-emerald-800">{item.deviationType}</p>
                <p className="text-xs text-emerald-700">Paid at: {item.paidAt ? formatDateTime(item.paidAt) : 'N/A'}</p>
              </div>
              <div className="flex items-center gap-2">
                <ReceiptText className="w-4 h-4 text-emerald-700" />
                <span className="text-sm font-semibold text-emerald-900">LKR {item.amount.toLocaleString('en-LK')}</span>
                <StatusBadge status="success">Paid</StatusBadge>
              </div>
            </div>
          ))
        )}
      </section>

      <PaymentModal
        open={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedCocId(null);
        }}
        applicationFee={selected?.amount || 0}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </div>
  );
};

export default FinePay;
