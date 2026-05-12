import React from 'react';

const Textarea = ({ label, error, rows = 4, ...props }) => (
  <div className="flex flex-col">
    {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
    <textarea
      rows={rows}
      className={`px-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500 transition resize-none ${
        error ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-slate-50'
      }`.trim()}
      {...props}
    />
    {error && <span className="text-xs text-red-600 mt-1">{error}</span>}
  </div>
);

export default Textarea;
