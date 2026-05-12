import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import FilterBar from '../../components/reports/FilterBar.jsx';
import KpiCards from '../../components/reports/KpiCards.jsx';
import DistributionBars from '../../components/reports/charts/DistributionBars.jsx';
import TopReasonsChart from '../../components/reports/charts/TopReasonsChart.jsx';
import DrilldownTable from '../../components/reports/DrilldownTable.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useReportsAnalytics } from '../../hooks/useReportsAnalytics.js';
import { formatDateTime } from '../../utils/reportFormatters.js';
import { downloadCsvReport, exportPdfReport } from '../../utils/reportExport.js';

const REPORT_ROLES = ['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin'];
const TrendChart = lazy(() => import('../../components/reports/charts/TrendChart.jsx'));

const now = new Date();
const DEFAULT_FILTERS = {
  periodType: 'month',
  month: now.getMonth() + 1,
  year: now.getFullYear(),
};

const ReportsPage = () => {
  const { user, token } = useAuth();
  const { error: notifyError, info } = useNotifications();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState('');
  const [drilldownData, setDrilldownData] = useState(null);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [lastDrilldownArgs, setLastDrilldownArgs] = useState(null);
  const [showTrendCharts, setShowTrendCharts] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const analytics = useReportsAnalytics({ token });
  const canViewReports = REPORT_ROLES.includes(user?.role);

  const yearOptions = useMemo(() => {
    const years = [];
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 6; i += 1) years.push(currentYear - i);
    return years;
  }, []);

  const handleApply = async () => {
    try {
      setShowTrendCharts(false);
      await analytics.loadReports(filters);
      window.setTimeout(() => {
        setShowTrendCharts(true);
      }, 180);
    } catch (error) {
      notifyError(error.message || 'Failed to load reports.');
    }
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setShowTrendCharts(false);
  };

  const exportCsv = () => {
    if (!analytics.applicationStats || !analytics.revenueSummary || !analytics.modificationReasons) {
      info('Apply filters and load report data before exporting.');
      return;
    }
    try {
      setExportingCsv(true);
      downloadCsvReport({
        applicationStats: analytics.applicationStats,
        revenueSummary: analytics.revenueSummary,
        modificationReasons: analytics.modificationReasons,
      });
    } catch (error) {
      notifyError(error.message || 'Failed to export CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  const openDrilldown = async ({ metric, filterKey = '', filterValue = '', title }) => {
    const args = { ...filters, metric, filterKey, filterValue };
    setLastDrilldownArgs({ args, title });
    setDrilldownError('');
    setDrilldownOpen(true);
    setDrilldownTitle(title || 'Drilldown');
    try {
      setDrilldownLoading(true);
      const data = await analytics.loadDrilldown(args);
      setDrilldownData(data);
    } catch (error) {
      setDrilldownData(null);
      setDrilldownError(error.message || 'Failed to load drilldown data.');
      notifyError(error.message || 'Failed to load drilldown data.');
    } finally {
      setDrilldownLoading(false);
    }
  };

  const retryDrilldown = async () => {
    if (!lastDrilldownArgs) return;
    await openDrilldown({
      metric: lastDrilldownArgs.args.metric,
      filterKey: lastDrilldownArgs.args.filterKey,
      filterValue: lastDrilldownArgs.args.filterValue,
      title: lastDrilldownArgs.title,
    });
  };

  if (!canViewReports) {
    return (
      <Card className="p-8">
        <h1 className="text-2xl font-bold text-slate-800">Reports & Analytics</h1>
        <p className="mt-2 text-slate-600">Your account does not have permission to view internal reports.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-800">Reports & Analytics</h1>
          <p className="mt-1 text-slate-600">Trends, distributions, rankings, and drilldowns for operational decisions.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={exportCsv} variant="secondary" className="inline-flex items-center gap-2" disabled={exportingCsv || !analytics.loaded}>
            <Download size={18} />
            {exportingCsv ? 'Exporting CSV...' : 'Export CSV'}
          </Button>
          <Button
            onClick={() => {
              if (!analytics.applicationStats || !analytics.revenueSummary || !analytics.modificationReasons || !analytics.trendData) {
                info('Apply filters and load report data before exporting.');
                return;
              }
              try {
                setExportingPdf(true);
                exportPdfReport({
                  applicationStats: analytics.applicationStats,
                  revenueSummary: analytics.revenueSummary,
                  modificationReasons: analytics.modificationReasons,
                  trendData: analytics.trendData,
                  lastUpdated: analytics.lastUpdated,
                });
              } catch (error) {
                notifyError(error.message || 'Failed to export PDF.');
              } finally {
                setExportingPdf(false);
              }
            }}
            className="inline-flex items-center gap-2"
            disabled={exportingPdf || !analytics.loaded}
          >
            <FileText size={18} />
            {exportingPdf ? 'Preparing PDF...' : 'Export PDF'}
          </Button>
        </div>
      </div>

      <FilterBar
        filters={filters}
        yearOptions={yearOptions}
        loading={analytics.loading}
        onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onApply={handleApply}
        onReset={handleReset}
      />

      {analytics.error && (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{analytics.error}</p>
        </Card>
      )}

      {!analytics.loaded && !analytics.loading && !analytics.error && (
        <Card className="p-6">
          <p className="text-slate-600">Select period filters and click Apply to generate reports.</p>
        </Card>
      )}

      {analytics.loaded && analytics.applicationStats && analytics.revenueSummary && analytics.modificationReasons && analytics.trendData && (
        <>
          <Card className="p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-slate-600">Period: <span className="font-semibold text-slate-800">{analytics.applicationStats.periodLabel}</span></p>
                <p className="text-sm text-slate-600">Scope: <span className="font-semibold capitalize text-slate-800">{analytics.applicationStats.scope}</span></p>
              </div>
              <p className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Last updated: {formatDateTime(analytics.lastUpdated)}</p>
            </div>
          </Card>

          <KpiCards
            applicationStats={analytics.applicationStats}
            revenueSummary={analytics.revenueSummary}
            onOpenDrilldown={openDrilldown}
          />

          {!showTrendCharts && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <Card key={item} className="p-6">
                  <div className="mb-3 h-5 w-40 animate-pulse rounded bg-slate-100" />
                  <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
                </Card>
              ))}
            </div>
          )}

          {showTrendCharts && (
            <Suspense fallback={(
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <Card key={item} className="p-6">
                    <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
                  </Card>
                ))}
              </div>
            )}
            >
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <TrendChart
                  title="Application Trend"
                  subtitle={`${analytics.trendData.granularity === 'day' ? 'Daily' : 'Monthly'} movement across selected period.`}
                  series={analytics.trendData.applications.series}
                  change={analytics.trendData.applications.change}
                  direction={analytics.trendData.applications.direction}
                  metric="applications"
                />
                <TrendChart
                  title="Revenue Trend"
                  subtitle="Cash flow movement by period."
                  series={analytics.trendData.revenue.series}
                  change={analytics.trendData.revenue.change}
                  direction={analytics.trendData.revenue.direction}
                  metric="revenue"
                />
                <TrendChart
                  title="Modification Trend"
                  subtitle="Correction/rejection activity over time."
                  series={analytics.trendData.modifications.series}
                  change={analytics.trendData.modifications.change}
                  direction={analytics.trendData.modifications.direction}
                  metric="modifications"
                />
              </div>
            </Suspense>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DistributionBars
              title="Status Distribution"
              rows={analytics.applicationStats.byStatus}
              labelKey="status"
              valueKey="count"
              emptyText="No status rows for this period."
              onRowClick={(row) => openDrilldown({
                metric: 'applications',
                filterKey: 'status',
                filterValue: row.status,
                title: `${row.status} applications`,
              })}
            />
            <DistributionBars
              title="Application Type Distribution"
              rows={analytics.applicationStats.byType}
              labelKey="type"
              valueKey="count"
              emptyText="No type rows for this period."
              onRowClick={(row) => openDrilldown({
                metric: 'applications',
                filterKey: 'type',
                filterValue: row.type,
                title: `${String(row.type || '').replace(/_/g, ' ')} applications`,
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DistributionBars
              title="Revenue by Payment Type"
              rows={analytics.revenueSummary.byType}
              labelKey="paymentType"
              valueKey="amount"
              emptyText="No completed payments for this period."
              onRowClick={(row) => openDrilldown({
                metric: 'revenue',
                filterKey: 'paymentType',
                filterValue: row.paymentType,
                title: `${row.paymentType} revenue`,
              })}
            />
            <TopReasonsChart
              rows={analytics.modificationReasons.byReason}
              onReasonClick={(row) => openDrilldown({
                metric: 'modifications',
                filterKey: 'reason',
                filterValue: row.reason,
                title: `Reason: ${row.reason}`,
              })}
            />
          </div>

          <Modal open={drilldownOpen} onClose={() => setDrilldownOpen(false)} size="xl" title={drilldownTitle || 'Drilldown'}>
            <DrilldownTable
              metric={drilldownData?.metric || 'applications'}
              rows={drilldownData?.rows || []}
              loading={drilldownLoading}
              error={drilldownError}
              onRetry={retryDrilldown}
            />
          </Modal>
        </>
      )}
    </div>
  );
};

export default ReportsPage;

