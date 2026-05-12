import {
  formatCurrency,
  formatDateTime,
  formatInteger,
} from './reportFormatters.js';

const escapeCsvValue = (value) => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const toCsvText = (rows) => rows
  .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
  .join('\n');

export const downloadCsvReport = ({ applicationStats, revenueSummary, modificationReasons }) => {
  const rows = [
    ['Period', applicationStats.periodLabel],
    ['Scope', applicationStats.scope],
    ['Generated At', applicationStats.generatedAt],
    [],
    ['APPLICATION TOTALS'],
    ['Total Applications', formatInteger(applicationStats.totals.totalApplications)],
    ['Approved', formatInteger(applicationStats.totals.approved)],
    ['Correction Required', formatInteger(applicationStats.totals.correctionRequired)],
    ['Committee Review', formatInteger(applicationStats.totals.committeeReview)],
    ['Permit Approved', formatInteger(applicationStats.totals.permitApproved)],
    ['Rejected', formatInteger(applicationStats.totals.rejected)],
    [],
    ['REVENUE TOTALS'],
    ['Overall Revenue', formatCurrency(revenueSummary.totals.overallRevenue)],
    ['Application Fee Revenue', formatCurrency(revenueSummary.totals.applicationFeeRevenue)],
    ['COC Fee Revenue', formatCurrency(revenueSummary.totals.cocFeeRevenue)],
    ['Fine Revenue', formatCurrency(revenueSummary.totals.fineRevenue)],
    ['Permit Extension Revenue', formatCurrency(revenueSummary.totals.permitExtensionRevenue)],
    [],
    ['COMMON MODIFICATION REASONS'],
    ['Reason', 'Count'],
    ...modificationReasons.byReason.map((item) => [item.reason, formatInteger(item.count)]),
  ];

  const csv = toCsvText(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reports_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const renderTableRows = (rows, columns) => rows.map((row) => (
  `<tr>${columns.map((column) => `<td>${column.formatter(row[column.key])}</td>`).join('')}</tr>`
)).join('');

export const exportPdfReport = ({
  applicationStats,
  revenueSummary,
  modificationReasons,
  trendData,
  lastUpdated,
}) => {
  const popup = window.open('', '_blank', 'width=1200,height=900');
  if (!popup) {
    throw new Error('Unable to open print window. Please allow popups and try again.');
  }

  const trendRows = [
    { label: 'Applications', change: trendData.applications.change, direction: trendData.applications.direction },
    { label: 'Revenue', change: trendData.revenue.change, direction: trendData.revenue.direction },
    { label: 'Modifications', change: trendData.modifications.change, direction: trendData.modifications.direction },
  ];

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>CiviTrack Reports Export</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
          h1 { margin: 0; font-size: 24px; }
          h2 { margin-top: 28px; font-size: 16px; }
          p.meta { color: #475569; font-size: 12px; margin-top: 6px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
          th { background: #f8fafc; }
          @media print { body { padding: 8px; } .card { break-inside: avoid; } }
        </style>
      </head>
      <body>
        <h1>CiviTrack Reports & Analytics</h1>
        <p class="meta">Period: ${applicationStats.periodLabel} | Scope: ${applicationStats.scope} | Last updated: ${formatDateTime(lastUpdated)}</p>

        <h2>Key Totals</h2>
        <div class="grid">
          <div class="card">
            <strong>Application Totals</strong>
            <table>
              <tbody>
                <tr><td>Total Applications</td><td>${formatInteger(applicationStats.totals.totalApplications)}</td></tr>
                <tr><td>Approved</td><td>${formatInteger(applicationStats.totals.approved)}</td></tr>
                <tr><td>Correction Required</td><td>${formatInteger(applicationStats.totals.correctionRequired)}</td></tr>
                <tr><td>Committee Review</td><td>${formatInteger(applicationStats.totals.committeeReview)}</td></tr>
                <tr><td>Permit Approved</td><td>${formatInteger(applicationStats.totals.permitApproved)}</td></tr>
                <tr><td>Rejected</td><td>${formatInteger(applicationStats.totals.rejected)}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="card">
            <strong>Revenue Totals</strong>
            <table>
              <tbody>
                <tr><td>Overall Revenue</td><td>${formatCurrency(revenueSummary.totals.overallRevenue)}</td></tr>
                <tr><td>Application Fee Revenue</td><td>${formatCurrency(revenueSummary.totals.applicationFeeRevenue)}</td></tr>
                <tr><td>COC Fee Revenue</td><td>${formatCurrency(revenueSummary.totals.cocFeeRevenue)}</td></tr>
                <tr><td>Fine Revenue</td><td>${formatCurrency(revenueSummary.totals.fineRevenue)}</td></tr>
                <tr><td>Permit Extension Revenue</td><td>${formatCurrency(revenueSummary.totals.permitExtensionRevenue)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <h2>Trend Summary</h2>
        <table>
          <thead><tr><th>Metric</th><th>Direction</th><th>Change</th></tr></thead>
          <tbody>
            ${renderTableRows(trendRows, [
              { key: 'label', formatter: (v) => v },
              { key: 'direction', formatter: (v) => String(v || 'flat') },
              { key: 'change', formatter: (v) => `${Number(v || 0).toFixed(1)}%` },
            ])}
          </tbody>
        </table>

        <h2>Top Modification Reasons</h2>
        <table>
          <thead><tr><th>Reason</th><th>Count</th></tr></thead>
          <tbody>
            ${renderTableRows(modificationReasons.byReason, [
              { key: 'reason', formatter: (v) => String(v || 'Unknown') },
              { key: 'count', formatter: (v) => formatInteger(v) },
            ])}
          </tbody>
        </table>
      </body>
    </html>
  `;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
};

