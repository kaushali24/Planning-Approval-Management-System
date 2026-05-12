import React, { useState } from 'react';
import Button from './Button.jsx';
import Input from './Input.jsx';
import Modal from './Modal.jsx';

const InspectionScheduler = ({
  open,
  onClose,
  onConfirm,
  inspectionType = 'initial', // 'initial' or 'coc'
}) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [formError, setFormError] = useState('');

  const handleConfirm = () => {
    if (!date || !time) {
      setFormError('Please select both date and time.');
      return;
    }
    setFormError('');
    onConfirm?.({ date, time, inspectionType });
    onClose?.();
    setDate('');
    setTime('');
  };

  const title = inspectionType === 'coc' ? 'Schedule COC Inspection' : 'Schedule Site Inspection';
  const subtitle =
    inspectionType === 'coc'
      ? 'After phone confirmation with the applicant, record the agreed COC site visit date and time.'
      : 'After phone confirmation with the applicant, record the agreed initial site inspection date and time.';

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{subtitle}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Time</label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Scheduling is coordinated by phone between the Technical Officer and applicant. Once the confirmed date/time is saved, the applicant receives an email notification.
        </p>

        {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Confirm Schedule</Button>
        </div>
      </div>
    </Modal>
  );
};

export default InspectionScheduler;
