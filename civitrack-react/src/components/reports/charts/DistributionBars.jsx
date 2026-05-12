import React from 'react';
import Card from '../../ui/Card.jsx';
import { formatInteger } from '../../../utils/reportFormatters.js';

const DistributionBars = ({ title, rows = [], labelKey, valueKey, onRowClick, emptyText = 'No data available.' }) => {
  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-lg font-bold text-slate-800">{title}</h3>
      {!rows.length && <p className="text-sm text-slate-500">{emptyText}</p>}
      <div className="space-y-3">
        {rows.map((row) => {
          const value = Number(row[valueKey] || 0);
          const width = Math.max(4, Math.round((value / maxValue) * 100));
          const label = String(row[labelKey] || 'Unknown');
          return (
            <button
              key={`${label}-${value}`}
              type="button"
              onClick={() => onRowClick?.(row)}
              className="w-full rounded-lg p-1 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label={`${title}: ${label}, ${formatInteger(value)}. Open drilldown`}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">{label}</span>
                <span className="font-semibold text-slate-900">{formatInteger(value)}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100" role="presentation">
                <div className="h-2 rounded-full bg-blue-600" style={{ width: `${width}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
};

export default DistributionBars;

