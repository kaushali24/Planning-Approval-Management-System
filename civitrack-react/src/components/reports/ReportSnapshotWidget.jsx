import React, { useEffect, useMemo } from 'react';
import { ArrowUpRight, BarChart3, ChevronRight, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useReportsAnalytics } from '../../hooks/useReportsAnalytics.js';
import { formatCurrency } from '../../utils/reportFormatters.js';

const REPORT_ROLES = ['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin'];

const Sparkline = ({ series = [] }) => {
  if (!series.length) {
    return <div className="h-14 rounded-xl border border-dashed border-slate-200 bg-slate-50" />;
  }

  const maxValue = Math.max(...series.map((item) => Number(item.value || 0)), 1);

  return (
    <div className="flex h-16 items-end gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      {series.map((point) => {
        const height = Math.max(8, Math.round((Number(point.value || 0) / maxValue) * 100));
        return (
          <div key={point.key || point.label} className="flex-1 flex flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-blue-700 to-cyan-500 transition-all"
              style={{ height: `${height}%`, minHeight: '8px' }}
              title={`${point.label}: ${point.value}`}
            />
            <span className="text-[10px] text-slate-500 truncate w-full text-center">{point.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const StatTile = ({ icon, label, value, hint }) => {
  const IconComponent = icon;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-800">{value}</p>
        </div>
        <div className="rounded-full bg-blue-50 p-2 text-blue-700">
          <IconComponent size={18} />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
};

const ReportSnapshotWidget = ({ title = 'Report Snapshot', description = 'Live report metrics for the current period.' }) => {
  const { user, token } = useAuth();
  const { error } = useNotifications();
  const navigate = useNavigate();
  const analytics = useReportsAnalytics({ token });
  const { loadReports } = analytics;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const canViewReports = REPORT_ROLES.includes(user?.role);

  useEffect(() => {
    if (!token || !canViewReports) return;
    loadReports({ periodType: 'month', month: currentMonth, year: currentYear }).catch((err) => {
      error(err.message || 'Failed to load report snapshot');
    });
  }, [canViewReports, currentMonth, currentYear, error, loadReports, token]);

  const series = useMemo(() => {
    const applicationSeries = analytics.trendData?.applications?.series || [];
    if (applicationSeries.length <= 7) {
      return applicationSeries;
    }
    return applicationSeries.slice(-7);
  }, [analytics.trendData]);

  const changeLabel = useMemo(() => {
    const value = Number(analytics.trendData?.applications?.change || 0);
    if (value === 0) return 'No change across the selected period';
    return `${value > 0 ? '+' : ''}${value} from first to last point`;
  }, [analytics.trendData]);

  if (!canViewReports) {
    return null;
  }

  return (
    <Card className="p-5 border-slate-200 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
            <h2 className="mt-1 text-xl font-bold text-slate-800">{description}</h2>
            <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {analytics.applicationStats
                ? `${analytics.applicationStats.periodLabel} · ${analytics.applicationStats.scope}`
                : 'Loading current period summary...'}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/analytics')}
            className="inline-flex items-center gap-2"
          >
            <BarChart3 size={16} />
            Open Analytics
            <ChevronRight size={16} />
          </Button>
        </div>

        {analytics.loading && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Loading report snapshot...
          </div>
        )}

        {!analytics.loading && analytics.error && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            {analytics.error}
          </div>
        )}

        {!analytics.loading && analytics.applicationStats && analytics.revenueSummary && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatTile
                icon={BarChart3}
                label="Applications"
                value={analytics.applicationStats.totals.totalApplications}
                hint={`${analytics.applicationStats.totals.approved} approved in the current period`}
              />
              <StatTile
                icon={TrendingUp}
                label="Corrections"
                value={analytics.applicationStats.totals.correctionRequired}
                hint={`${analytics.applicationStats.totals.permitApproved} permit approvals recorded`}
              />
              <StatTile
                icon={Wallet}
                label="Revenue"
                value={formatCurrency(analytics.revenueSummary.totals.overallRevenue)}
                hint={`Trend ${changeLabel}`}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Application Trend</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ArrowUpRight size={14} className="text-blue-600" />
                  {changeLabel}
                </div>
              </div>
              <Sparkline series={series} />
            </div>
          </>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Auto-refreshed for the current month.</span>
          <button
            type="button"
            onClick={() => navigate('/analytics')}
            className="inline-flex items-center gap-1 font-medium text-blue-700 hover:text-blue-800"
          >
            <RefreshCw size={12} />
            Drill into analytics
          </button>
        </div>
      </div>
    </Card>
  );
};

export default ReportSnapshotWidget;
