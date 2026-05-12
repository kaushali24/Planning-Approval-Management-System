import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

const PromptDialog = ({
  open,
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmLabel = 'Submit',
  cancelLabel = 'Cancel',
  multiline = true,
  rows = 4,
  error,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue || '');
  }, [open, defaultValue]);

  return (
    <Modal open={open} onClose={onCancel} title={title} size="md">
      <div className="space-y-4">
        {message && <p className="text-sm text-slate-700">{message}</p>}

        {multiline ? (
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={rows}
            placeholder={placeholder}
            className={`w-full rounded-lg border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${error ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'}`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            className={`w-full rounded-lg border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${error ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'}`}
          />
        )}

        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button onClick={() => onConfirm(value)}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
};

export default PromptDialog;
