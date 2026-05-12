import React, { useState } from 'react';
import Modal from './Modal.jsx';
import Input from './Input.jsx';
import Textarea from './Textarea.jsx';
import Button from './Button.jsx';

const deviationOptions = [
  'Blind Wall Violation',
  'Street Line Violation',
  'unauthorized Floor',
  'Other',
];

const FineImpositionModal = ({ open, onClose, onSubmit }) => {
  const [deviationType, setDeviationType] = useState('Blind Wall Violation');
  const [comments, setComments] = useState('');
  const [fineAmount, setFineAmount] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = () => {
    if (!fineAmount) {
      setFormError('Please enter a fine amount.');
      return;
    }
    const parsed = Number(fineAmount);
    if (!Number.isFinite(parsed) || parsed < 15000 || parsed > 150000) {
      setFormError('Fine amount must be between LKR 15,000 and LKR 150,000.');
      return;
    }
    setFormError('');
    onSubmit?.({ deviationType, comments, fineAmount });
    onClose?.();
    setComments('');
    setFineAmount('');
    setDeviationType('Blind Wall Violation');
  };

  return (
    <Modal open={open} onClose={onClose} title="Impose Deviation Fine" size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Deviation Type</label>
          <select
            value={deviationType}
            onChange={(e) => setDeviationType(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
          >
            {deviationOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Officer Comments/Observations</label>
          <Textarea
            rows={4}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Describe the deviation, site observations, and rationale for the fine."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Fine Amount (LKR)</label>
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-800 mb-2">
            <strong>Fine Guidelines:</strong> Blind Wall: 25,000-50,000 | Street Line: 30,000-60,000 | Unauthorized Floor: 40,000-75,000
          </div>
          <Input
            type="number"
            min="15000"
            max="150000"
            step="1000"
            value={fineAmount}
            onChange={(e) => setFineAmount(e.target.value)}
            placeholder="Enter fine amount manually"
            error={formError}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Submit Fine
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default FineImpositionModal;
