import React, { useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { formatCurrency, formatShortDate } from '../../utils/reportFormatters.js';

const COLUMNS = {
  applications: [
    { key: 'applicationCode', label: 'Application Code' },
    { key: 'applicantName', label: 'Applicant' },
    { key: 'applicationType', label: 'Type' },
    { key: 'status', label: 'Status' },
    { key: 'submittedAt', label: 'Submitted' },
    { key: 'assignedOfficer', label: 'Assigned Officer' },
  ],
  revenue: [
    { key: 'applicantName', label: 'Payment' },
    { key: 'paymentType', label: 'Type' },
    { key: 'amount', label: 'Amount' },
    { key: 'paymentAt', label: 'Paid At' },
    { key: 'paymentMethod', label: 'Method' },
  ],
  modifications: [
    { key: 'applicationCode', label: 'Application Code' },
    { key: 'applicantName', label: 'Applicant' },
    { key: 'status', label: 'Status' },
    { key: 'reason', label: 'Reason' },
    { key: 'changedAt', label: 'Changed At' },
  ],
};

const formatCell = (metric, row, key) => {
  if (key === 'amount') return formatCurrency(row.amount);
  if (key.endsWith('At')) return formatShortDate(row[key]);
  if (key === 'applicationType') return String(row[key] || '').replace(/_/g, ' ');
  if (key === 'status') return String(row[key] || '').replace(/_/g, ' ');
  if (key === 'applicationCode') return row.applicationCode || String(row.applicationId || row.id || 'N/A');
  if (key === 'applicantName') return [row.applicantName, row.applicantRef ? `(${row.applicantRef})` : ''].filter(Boolean).join(' ');
  return row[key] || 'N/A';
};

const DrilldownTable = ({ metric = 'applications', rows = [], loading = false, error = '', onRetry }) => {
  const [sortKey, setSortKey] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');

  const columns = COLUMNS[metric] || COLUMNS.applications;

  const filteredRows = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => Object.values(row || {}).some((value) => String(value || '').toLowerCase().includes(normalized)));
  }, [rows, searchTerm]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const cloned = [...filteredRows];
    cloned.sort((a, b) => {
      const left = a?.[sortKey];
      const right = b?.[sortKey];
      const leftNum = Number(left);
      const rightNum = Number(right);
      const areNumbers = !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && left !== '' && right !== '';
      let result = 0;
      if (areNumbers) result = leftNum - rightNum;
      else result = String(left || '').localeCompare(String(right || ''));
      return sortDirection === 'asc' ? result : -result;
    });
    return cloned;
  }, [filteredRows, sortDirection, sortKey]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  if (loading) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Loading records...</div>;
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
        <p>{error}</p>
        <button type="button" onClick={onRetry} className="text-red-800 underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Filter rows..."
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          aria-label="Filter drilldown rows"
        />
        <p className="text-sm text-slate-500">{sortedRows.length} rows</p>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-2xl border border-slate-200 shadow-inner">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50 text-slate-700">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-left font-semibold">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    onClick={() => handleSort(column.key)}
                  >
                    {column.label}
                    <ArrowDownUp size={12} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-slate-500">No records found for this filter.</td>
              </tr>
            )}
            {sortedRows.map((row, index) => (
              <tr key={`${row.id || row.applicationId || 'row'}-${index}`} className="align-top hover:bg-slate-50">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-slate-700">{formatCell(metric, row, column.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DrilldownTable;

