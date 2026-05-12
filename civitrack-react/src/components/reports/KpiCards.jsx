import React from 'react';
import { BarChart3, ChevronRight, TrendingUp, Wallet } from 'lucide-react';
import Card from '../ui/Card.jsx';
import { formatCurrency, formatInteger } from '../../utils/reportFormatters.js';

const KPI_CARD_CONFIG = [
  {
    id: 'total-applications',
    icon: BarChart3,
    label: 'Total Applications',
    valueKey: 'totalApplications',
    drilldown: { metric: 'applications', title: 'All Applications' },
  },
  {
    id: 'approved-applications',
    icon: TrendingUp,
    label: 'Approved',
    valueKey: 'approved',
    drilldown: { metric: 'applications', filterKey: 'status', filterValue: 'approved', title: 'Approved Applications' },
  },
  {
    id: 'correction-required',
    icon: BarChart3,
    label: 'Corrections Required',
    valueKey: 'correctionRequired',
    drilldown: { metric: 'applications', filterKey: 'status', filterValue: 'correction', title: 'Applications Requiring Correction' },
  },
  {
    id: 'overall-revenue',
    icon: Wallet,
    label: 'Overall Revenue',
    valueKey: 'overallRevenue',
    isCurrency: true,
    drilldown: { metric: 'revenue', title: 'All Revenue Transactions' },
  },
];

const KpiCards = ({ applicationStats, revenueSummary, onOpenDrilldown }) => (
  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
    {KPI_CARD_CONFIG.map((config) => {
      const Icon = config.icon;
      const value = config.valueKey === 'overallRevenue'
        ? revenueSummary?.totals?.overallRevenue
        : applicationStats?.totals?.[config.valueKey];
      const displayValue = config.isCurrency ? formatCurrency(value) : formatInteger(value);

      return (
        <Card key={config.id} className="p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
          <button
            type="button"
            onClick={() => onOpenDrilldown(config.drilldown)}
            className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label={`${config.label}: ${displayValue}. View records`}
          >
            <div className="mb-2 flex items-center gap-2 text-slate-700">
              <Icon size={18} />
              <span className="text-sm font-semibold">{config.label}</span>
            </div>
            <p className={`font-bold text-slate-800 ${config.isCurrency ? 'text-lg' : 'text-2xl'}`}>{displayValue}</p>
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-blue-700">
              View records
              <ChevronRight size={12} />
            </p>
          </button>
        </Card>
      );
    })}
  </div>
);

export default KpiCards;

