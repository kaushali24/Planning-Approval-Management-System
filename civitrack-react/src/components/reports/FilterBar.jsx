import React from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const FilterBar = ({
  filters,
  yearOptions,
  loading = false,
  onFilterChange,
  onApply,
  onReset,
}) => (
  <Card className="p-4">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      <div>
        <label htmlFor="reports-period-type" className="mb-2 block text-sm font-medium text-slate-700">Period Type</label>
        <select
          id="reports-period-type"
          value={filters.periodType}
          onChange={(event) => onFilterChange('periodType', event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"
        >
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
      </div>

      {filters.periodType === 'month' && (
        <div>
          <label htmlFor="reports-month" className="mb-2 block text-sm font-medium text-slate-700">Month</label>
          <select
            id="reports-month"
            value={filters.month}
            onChange={(event) => onFilterChange('month', Number(event.target.value))}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"
          >
            {MONTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="reports-year" className="mb-2 block text-sm font-medium text-slate-700">Year</label>
        <select
          id="reports-year"
          value={filters.year}
          onChange={(event) => onFilterChange('year', Number(event.target.value))}
          className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"
        >
          {yearOptions.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      <div className="md:col-span-2 flex items-end gap-3">
        <Button onClick={onApply} disabled={loading} className="w-full md:w-auto">
          {loading ? 'Loading...' : 'Apply'}
        </Button>
        <Button onClick={onReset} disabled={loading} variant="secondary" className="w-full md:w-auto inline-flex items-center gap-2">
          <RefreshCw size={16} />
          Reset
        </Button>
      </div>
    </div>

    <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
      <Calendar size={14} />
      Filters are role-safe and only show data your role can access.
    </div>
  </Card>
);

export default FilterBar;

