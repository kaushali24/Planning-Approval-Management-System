import React, { useState } from 'react';
import { Expand } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../../ui/Card.jsx';
import Modal from '../../ui/Modal.jsx';
import {
  formatCompactNumber,
  formatCurrency,
  formatInteger,
  formatPercent,
} from '../../../utils/reportFormatters.js';

const directionClass = (direction) => {
  if (direction === 'up') return 'bg-emerald-50 text-emerald-700';
  if (direction === 'down') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-700';
};

const METRIC_THEME = {
  applications: {
    stroke: '#1D4ED8',
    fill: '#60A5FA',
    dot: '#1D4ED8',
    badge: 'bg-blue-50 text-blue-700',
    label: 'Applications',
  },
  revenue: {
    stroke: '#0F766E',
    fill: '#2DD4BF',
    dot: '#0F766E',
    badge: 'bg-teal-50 text-teal-700',
    label: 'Revenue',
  },
  modifications: {
    stroke: '#B45309',
    fill: '#F59E0B',
    dot: '#B45309',
    badge: 'bg-amber-50 text-amber-700',
    label: 'Modifications',
  },
};

const CustomTooltip = ({ active, payload, label, formatValue, metricLabel }) => {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0]?.value;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-semibold text-slate-800">{label}</p>
      <p className="text-xs text-slate-600">{metricLabel}: {formatValue(value)}</p>
    </div>
  );
};

const ChartCanvas = ({
  series,
  gradientId,
  theme,
  formatAxisTick,
  formatValue,
  title,
  onOpenFullscreen,
}) => (
  <div
    className="h-full w-full"
    onDoubleClick={() => onOpenFullscreen?.()}
    title="Double-click to open fullscreen"
  >
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={theme.fill} stopOpacity={0.35} />
            <stop offset="95%" stopColor={theme.fill} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#64748B', fontSize: 12 }}
          axisLine={{ stroke: '#CBD5E1' }}
          tickLine={{ stroke: '#CBD5E1' }}
        />
        <YAxis
          tickFormatter={formatAxisTick}
          tick={{ fill: '#64748B', fontSize: 12 }}
          axisLine={{ stroke: '#CBD5E1' }}
          tickLine={{ stroke: '#CBD5E1' }}
          width={56}
        />
        <Tooltip
          content={(
            <CustomTooltip
              formatValue={formatValue}
              metricLabel={title}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={theme.stroke}
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={theme.stroke}
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 2, fill: '#FFFFFF', stroke: theme.dot }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

const TrendChart = ({
  title,
  subtitle,
  series = [],
  change = 0,
  direction = 'flat',
  metric = 'applications',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!series.length) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No trend data for this period.
        </div>
      </Card>
    );
  }

  const maxValue = Math.max(...series.map((item) => Number(item.value || 0)), 1);

  const isDown = direction === 'down';
  const isUp = direction === 'up';

  const isRevenue = metric === 'revenue';
  const theme = METRIC_THEME[metric] || METRIC_THEME.applications;
  const formatValue = (value) => (isRevenue ? formatCurrency(value) : `${formatInteger(value)} items`);
  const formatAxisTick = (value) => (isRevenue ? formatCompactNumber(value) : formatInteger(value));
  const gradientId = `${title.replace(/\s+/g, '-')}-${metric}-fill`;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label={`Open ${title} in fullscreen`}
          >
            <Expand size={14} />
            Fullscreen
          </button>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${directionClass(direction)}`}>
            {isUp ? 'Up ' : isDown ? 'Down ' : 'Flat '}
            {formatPercent(change)}
          </span>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${theme.badge}`}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: theme.stroke }} />
          {theme.label} series
        </span>
        <span className="text-slate-500">Hover points for exact values</span>
      </div>

      <div className="h-64 rounded-2xl border border-slate-200 bg-white p-3">
        <ChartCanvas
          series={series}
          gradientId={gradientId}
          theme={theme}
          formatAxisTick={formatAxisTick}
          formatValue={formatValue}
          title={title}
          onOpenFullscreen={() => setIsExpanded(true)}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {`Peak: ${formatValue(maxValue)}`}
      </p>

      <Modal
        open={isExpanded}
        onClose={() => setIsExpanded(false)}
        title={`${title} - Fullscreen`}
        size="xl"
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            {subtitle}
            {' '}
            <span className="text-slate-400">Press Esc to close.</span>
          </p>
          <div className="h-[70vh] rounded-2xl border border-slate-200 bg-white p-3">
            <ChartCanvas
              series={series}
              gradientId={`${gradientId}-expanded`}
              theme={theme}
              formatAxisTick={formatAxisTick}
              formatValue={formatValue}
              title={title}
              onOpenFullscreen={() => {}}
            />
          </div>
        </div>
      </Modal>
    </Card>
  );
};

export default TrendChart;

