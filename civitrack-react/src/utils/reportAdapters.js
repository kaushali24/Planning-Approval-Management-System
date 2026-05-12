const toNumber = (value) => Number(value || 0);

export const adaptApplicationStats = (payload) => ({
  periodLabel: payload?.periodLabel || 'Unknown period',
  scope: payload?.scope || 'all',
  generatedAt: payload?.generatedAt || new Date().toISOString(),
  totals: {
    totalApplications: toNumber(payload?.totals?.totalApplications),
    approved: toNumber(payload?.totals?.approved),
    correctionRequired: toNumber(payload?.totals?.correctionRequired),
    committeeReview: toNumber(payload?.totals?.committeeReview),
    permitApproved: toNumber(payload?.totals?.permitApproved),
    rejected: toNumber(payload?.totals?.rejected),
  },
  byType: Array.isArray(payload?.byType)
    ? payload.byType.map((row) => ({ type: row.type || 'unknown', count: toNumber(row.count) }))
    : [],
  byStatus: Array.isArray(payload?.byStatus)
    ? payload.byStatus.map((row) => ({ status: row.status || 'unknown', count: toNumber(row.count) }))
    : [],
});

export const adaptRevenueSummary = (payload) => ({
  periodLabel: payload?.periodLabel || 'Unknown period',
  scope: payload?.scope || 'all',
  generatedAt: payload?.generatedAt || new Date().toISOString(),
  totals: {
    overallRevenue: toNumber(payload?.totals?.overallRevenue),
    applicationFeeRevenue: toNumber(payload?.totals?.applicationFeeRevenue),
    cocFeeRevenue: toNumber(payload?.totals?.cocFeeRevenue),
    fineRevenue: toNumber(payload?.totals?.fineRevenue),
    permitExtensionRevenue: toNumber(payload?.totals?.permitExtensionRevenue),
  },
  byType: Array.isArray(payload?.byType)
    ? payload.byType.map((row) => ({
      paymentType: row.paymentType || 'unknown',
      transactionCount: toNumber(row.transactionCount),
      amount: toNumber(row.amount),
    }))
    : [],
});

export const adaptModificationReasons = (payload) => ({
  periodLabel: payload?.periodLabel || 'Unknown period',
  scope: payload?.scope || 'all',
  generatedAt: payload?.generatedAt || new Date().toISOString(),
  totalReasonsCount: toNumber(payload?.totalReasonsCount),
  byReason: Array.isArray(payload?.byReason)
    ? payload.byReason.map((row) => ({ reason: row.reason || 'Unknown', count: toNumber(row.count) }))
    : [],
  byStatus: Array.isArray(payload?.byStatus)
    ? payload.byStatus.map((row) => ({ status: row.status || 'unknown', count: toNumber(row.count) }))
    : [],
});

const adaptTrendMetric = (metric) => {
  const series = Array.isArray(metric?.series)
    ? metric.series.map((row) => ({
      key: row.key || row.label || 'unknown',
      label: row.label || row.key || 'Unknown',
      value: toNumber(row.value),
    }))
    : [];
  return {
    series,
    total: toNumber(metric?.total),
    change: toNumber(metric?.change),
    direction: metric?.direction || 'flat',
  };
};

export const adaptTrendData = (payload) => ({
  periodLabel: payload?.periodLabel || 'Unknown period',
  scope: payload?.scope || 'all',
  granularity: payload?.granularity || 'day',
  generatedAt: payload?.generatedAt || new Date().toISOString(),
  applications: adaptTrendMetric(payload?.applications),
  revenue: adaptTrendMetric(payload?.revenue),
  modifications: adaptTrendMetric(payload?.modifications),
});

export const adaptDrilldown = (payload) => ({
  metric: payload?.metric || 'applications',
  totalRows: toNumber(payload?.totalRows),
  periodLabel: payload?.periodLabel || 'Unknown period',
  scope: payload?.scope || 'all',
  generatedAt: payload?.generatedAt || new Date().toISOString(),
  rows: Array.isArray(payload?.rows) ? payload.rows : [],
});

