import React from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

const ConfirmDialog = ({
  open,
  title = 'Please Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}) => (
  <Modal open={open} onClose={onCancel} title={title} size="md">
    <div className="space-y-5">
      <p className="text-sm text-slate-700">{message}</p>
      <div className="flex items-center justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  </Modal>
);

export default ConfirmDialog;
