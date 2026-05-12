import React, { useId } from 'react';

const Input = ({ label, error, id, className = '', ...props }) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col">
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
      <input
        id={inputId}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        className={`w-full px-3 py-2 border rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
          error ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-slate-50'
        } ${className}`.trim()}
        {...props}
      />
      {error && (
        <span id={errorId} role="alert" className="text-xs text-red-600 mt-1">
          {error}
        </span>
      )}
    </div>
  );
};

export default Input;
