const pool = require('../config/db');

const REASON_STATUSES = ['correction', 'rejected', 'not_granted_appeal_required'];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const APP_TIME_ZONE = 'Asia/Colombo';
const COLOMBO_OFFSET_MINUTES = 5 * 60 + 30;

const getColomboDateParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number.parseInt(get('year'), 10),
    month: Number.parseInt(get('month'), 10),
    day: Number.parseInt(get('day'), 10),
  };
};

const toUtcFromColombo = (year, month, day, hour = 0, minute = 0, second = 0) => (
  new Date(Date.UTC(year, month - 1, day, hour, minute, second) - (COLOMBO_OFFSET_MINUTES * 60 * 1000))
);

const toColomboTimestamp = (date = new Date()) => {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  return `${formatted.replace(' ', 'T')}+05:30`;
};

const keyForDate = (date, granularity) => {
  const { year, month, day } = getColomboDateParts(date);
  const monthKey = String(month).padStart(2, '0');

  if (granularity === 'day') {
    const dayKey = String(day).padStart(2, '0');
    return `${year}-${monthKey}-${dayKey}`;
  }

  return `${year}-${monthKey}`;
};

const labelForDate = (date, granularity) => {
  if (granularity === 'day') {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      timeZone: APP_TIME_ZONE,
    }).format(date);
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  }).format(date);
};

const createSeries = (period, granularity, rows) => {
  const rowMap = new Map(
    rows.map((row) => {
      const key = row.bucket_key || keyForDate(new Date(row.bucket), granularity);
      return [
        key,
        Number(row.value || 0),
      ];
    })
  );

  const series = [];
  let cursor = new Date(period.start.getTime());

  while (cursor < period.end) {
    const key = keyForDate(cursor, granularity);
    series.push({
      key,
      label: labelForDate(cursor, granularity),
      value: rowMap.get(key) || 0,
    });

    if (granularity === 'day') {
      cursor = new Date(cursor.getTime() + ONE_DAY_MS);
      continue;
    }

    const { year, month } = getColomboDateParts(cursor);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    cursor = toUtcFromColombo(nextYear, nextMonth, 1);
  }

  return series;
};

const trendSummary = (series) => {
  if (!series.length) {
    return { series, total: 0, change: 0, direction: 'flat' };
  }

  const total = series.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const first = Number(series[0].value || 0);
  const last = Number(series[series.length - 1].value || 0);
  const change = last - first;

  return {
    series,
    total,
    change,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
};

const buildPeriodWindow = (query = {}) => {
  const now = new Date();
  const periodType = query.periodType === 'year' ? 'year' : 'month';
  const nowColombo = getColomboDateParts(now);
  const year = Number.parseInt(query.year, 10) || nowColombo.year;

  if (year < 2000 || year > 2100) {
    throw new Error('Invalid year. Use a value between 2000 and 2100.');
  }

  if (periodType === 'year') {
    const start = toUtcFromColombo(year, 1, 1);
    const end = toUtcFromColombo(year + 1, 1, 1);
    return {
      periodType,
      month: null,
      year,
      start,
      end,
      periodLabel: `Year ${year}`,
    };
  }

  const month = Number.parseInt(query.month, 10) || nowColombo.month;
  if (month < 1 || month > 12) {
    throw new Error('Invalid month. Use a value between 1 and 12.');
  }

  const start = toUtcFromColombo(year, month, 1);
  const end = month === 12
    ? toUtcFromColombo(year + 1, 1, 1)
    : toUtcFromColombo(year, month + 1, 1);
  const periodLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  }).format(start);

  return {
    periodType,
    month,
    year,
    start,
    end,
    periodLabel,
  };
};

const appendApplicationScope = ({ role, userId, alias = 'a', params }) => {
  if (role !== 'technical_officer') {
    return '';
  }

  const userParamIndex = params.push(userId);
  return `
    AND (
      ${alias}.assigned_to = $${userParamIndex}
      OR EXISTS (
        SELECT 1
        FROM inspections i
        WHERE i.application_id = ${alias}.id
          AND i.staff_id = $${userParamIndex}
      )
    )
  `;
};

const appendRevenueScope = ({ role, userId, params }) => {
  if (role !== 'technical_officer') {
    return '';
  }

  const userParamIndex = params.push(userId);
  return `
    AND (
      (p.application_id IS NOT NULL AND a.assigned_to = $${userParamIndex})
      OR (p.coc_request_id IS NOT NULL AND c.assigned_to = $${userParamIndex})
      OR (p.fine_id IS NOT NULL AND f.staff_id = $${userParamIndex})
    )
  `;
};

const scopeLabelForRole = (role) => (role === 'technical_officer' ? 'personal' : 'institutional');

const applicationFilterClause = ({ filterKey, filterValue, params }) => {
  if (!filterKey || !filterValue) {
    return '';
  }

  if (filterKey === 'status') {
    const index = params.push(filterValue);
    return ` AND a.status = $${index} `;
  }

  if (filterKey === 'type') {
    if (filterValue === 'boundary_wall') {
      return `
        AND EXISTS (
          SELECT 1
          FROM application_permit_selections aps
          WHERE aps.application_id = a.id
            AND aps.permit_code = 'boundary_wall'
        )
      `;
    }

    const index = params.push(filterValue);
    return ` AND a.application_type = $${index} `;
  }

  return '';
};

const buildTrendRows = ({ metric, period, granularity, role, userId }) => {
  const params = [period.start, period.end];

  if (metric === 'applications') {
    const appScope = appendApplicationScope({ role, userId, alias: 'a', params });
    return pool.query(
      `
        SELECT
          date_trunc('${granularity}', a.submission_date) AS bucket,
          COUNT(*)::int AS value
        FROM applications a
        WHERE a.submission_date >= $1
          AND a.submission_date < $2
          ${appScope}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      params
    );
  }

  if (metric === 'revenue') {
    const revenueScope = appendRevenueScope({ role, userId, params });
    return pool.query(
      `
        SELECT
          date_trunc('${granularity}', COALESCE(p.paid_at, p.created_at)) AS bucket,
          COALESCE(SUM(p.amount), 0)::numeric(12,2) AS value
        FROM payments p
        LEFT JOIN applications a ON a.id = p.application_id
        LEFT JOIN coc_requests c ON c.id = p.coc_request_id
        LEFT JOIN fines f ON f.id = p.fine_id
        WHERE p.status = 'completed'
          AND COALESCE(p.paid_at, p.created_at) >= $1
          AND COALESCE(p.paid_at, p.created_at) < $2
          ${revenueScope}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      params
    );
  }

  params.push(REASON_STATUSES);
  const appScope = appendApplicationScope({ role, userId, alias: 'a', params });
  return pool.query(
    `
      SELECT
        date_trunc('${granularity}', ash.changed_at) AS bucket,
        COUNT(*)::int AS value
      FROM application_status_history ash
      JOIN applications a ON a.id = ash.application_id
      WHERE ash.changed_at >= $1
        AND ash.changed_at < $2
        AND ash.status = ANY($3::text[])
        AND ash.reason IS NOT NULL
        AND BTRIM(ash.reason) <> ''
        ${appScope}
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
    params
  );
};

exports.getReportTrends = async (req, res) => {
  try {
    const period = buildPeriodWindow(req.query);
    const granularity = period.periodType === 'month' ? 'day' : 'month';
    const { role, userId } = req.user;

    const [applicationsResult, revenueResult, modificationsResult] = await Promise.all([
      buildTrendRows({ metric: 'applications', period, granularity, role, userId }),
      buildTrendRows({ metric: 'revenue', period, granularity, role, userId }),
      buildTrendRows({ metric: 'modifications', period, granularity, role, userId }),
    ]);

    const applicationsSeries = createSeries(period, granularity, applicationsResult.rows);
    const revenueSeries = createSeries(period, granularity, revenueResult.rows);
    const modificationsSeries = createSeries(period, granularity, modificationsResult.rows);

    res.json({
      periodType: period.periodType,
      year: period.year,
      month: period.month,
      periodLabel: period.periodLabel,
      scope: scopeLabelForRole(role),
      granularity,
      generatedAt: toColomboTimestamp(),
      applications: trendSummary(applicationsSeries),
      revenue: trendSummary(revenueSeries),
      modifications: trendSummary(modificationsSeries),
    });
  } catch (error) {
    console.error('Get report trends error:', error);
    res.status(500).json({
      error: 'Failed to get report trends',
      details: error.message,
    });
  }
};

exports.getReportDrilldown = async (req, res) => {
  try {
    const period = buildPeriodWindow(req.query);
    const { role, userId } = req.user;
    const metric = req.query.metric;
    const filterKey = req.query.filterKey || '';
    const filterValue = req.query.filterValue || '';

    if (!metric) {
      throw new Error('metric is required.');
    }

    if (metric === 'applications') {
      const params = [period.start, period.end];
      const filterClause = applicationFilterClause({ filterKey, filterValue, params });
      const appScope = appendApplicationScope({ role, userId, alias: 'a', params });

      const queryText = `
        SELECT
          a.id,
          a.application_code,
          a.status,
          a.application_type,
          a.submission_date,
          a.assigned_to,
          ap.applicant_ref_id AS applicant_ref,
          COALESCE(a.submitted_applicant_name, ap.full_name, 'Applicant') AS applicant_name,
          COALESCE(sa.full_name, 'Unassigned') AS assigned_officer
        FROM applications a
        LEFT JOIN applicants ap ON ap.id = a.applicant_id
        LEFT JOIN staff_accounts sa ON sa.id = a.assigned_to
        WHERE a.submission_date >= $1
          AND a.submission_date < $2
          ${filterClause}
          ${appScope}
        ORDER BY a.submission_date DESC, a.id DESC
        LIMIT 50
      `;

      const result = await pool.query(queryText, params);
      return res.json({
        metric,
        filterKey,
        filterValue,
        periodType: period.periodType,
        periodLabel: period.periodLabel,
        scope: scopeLabelForRole(role),
        generatedAt: toColomboTimestamp(),
        totalRows: result.rows.length,
        rows: result.rows.map((row) => ({
          id: row.id,
          applicationCode: row.application_code,
          applicantRef: row.applicant_ref,
          applicantName: row.applicant_name,
          applicationType: row.application_type,
          status: row.status,
          submittedAt: row.submission_date,
          assignedOfficer: row.assigned_officer,
        })),
      });
    }

    if (metric === 'revenue') {
      const params = [period.start, period.end];
      if (filterValue) {
        params.push(filterValue);
      }
      const revenueScope = appendRevenueScope({ role, userId, params });

      const queryText = `
        SELECT
          p.id,
          p.payment_type,
          p.amount,
          p.status,
          COALESCE(p.paid_at, p.created_at) AS payment_at,
          p.transaction_id,
          p.payment_method,
          p.application_id,
          a.application_code,
          ap.applicant_ref_id AS applicant_ref,
          COALESCE(a.submitted_applicant_name, ap.full_name, c.applicant_name, 'N/A') AS applicant_name
        FROM payments p
        LEFT JOIN applications a ON a.id = p.application_id
        LEFT JOIN applicants ap ON ap.id = a.applicant_id
        LEFT JOIN coc_requests c ON c.id = p.coc_request_id
        LEFT JOIN fines f ON f.id = p.fine_id
        WHERE p.status = 'completed'
          AND COALESCE(p.paid_at, p.created_at) >= $1
          AND COALESCE(p.paid_at, p.created_at) < $2
          ${filterValue ? 'AND p.payment_type = $3' : ''}
          ${revenueScope}
        ORDER BY payment_at DESC, p.id DESC
        LIMIT 50
      `;

      const result = await pool.query(queryText, params);
      return res.json({
        metric,
        filterKey,
        filterValue,
        periodType: period.periodType,
        periodLabel: period.periodLabel,
        scope: scopeLabelForRole(role),
        generatedAt: toColomboTimestamp(),
        totalRows: result.rows.length,
        rows: result.rows.map((row) => ({
          id: row.id,
          applicationCode: row.application_code,
          applicantRef: row.applicant_ref,
          applicantName: row.applicant_name,
          paymentType: row.payment_type,
          amount: Number(row.amount || 0),
          status: row.status,
          paymentAt: row.payment_at,
          transactionId: row.transaction_id,
          paymentMethod: row.payment_method,
          applicationId: row.application_id,
        })),
      });
    }

    if (metric === 'modifications') {
      const params = [period.start, period.end, REASON_STATUSES];
      if (filterValue) {
        params.push(filterValue);
      }
      const appScope = appendApplicationScope({ role, userId, alias: 'a', params });

      const queryText = `
        SELECT
          ash.id,
          ash.application_id,
          a.application_code,
          ap.applicant_ref_id AS applicant_ref,
          ash.status,
          ash.reason,
          ash.changed_at,
          COALESCE(a.submitted_applicant_name, ap.full_name, 'Applicant') AS applicant_name
        FROM application_status_history ash
        JOIN applications a ON a.id = ash.application_id
        LEFT JOIN applicants ap ON ap.id = a.applicant_id
        WHERE ash.changed_at >= $1
          AND ash.changed_at < $2
          AND ash.status = ANY($3::text[])
          AND ash.reason IS NOT NULL
          AND BTRIM(ash.reason) <> ''
          ${filterValue ? 'AND ash.reason = $4' : ''}
          ${appScope}
        ORDER BY ash.changed_at DESC, ash.id DESC
        LIMIT 50
      `;

      const result = await pool.query(queryText, params);
      return res.json({
        metric,
        filterKey,
        filterValue,
        periodType: period.periodType,
        periodLabel: period.periodLabel,
        scope: scopeLabelForRole(role),
        generatedAt: toColomboTimestamp(),
        totalRows: result.rows.length,
        rows: result.rows.map((row) => ({
          id: row.id,
          applicationId: row.application_id,
          applicationCode: row.application_code,
          applicantRef: row.applicant_ref,
          applicantName: row.applicant_name,
          status: row.status,
          reason: row.reason,
          changedAt: row.changed_at,
        })),
      });
    }

    throw new Error(`Unsupported metric: ${metric}`);
  } catch (error) {
    console.error('Get report drilldown error:', error);
    res.status(500).json({
      error: 'Failed to get report drilldown',
      details: error.message,
    });
  }
};

exports.getApplicationStats = async (req, res) => {
  try {
    const period = buildPeriodWindow(req.query);
    const { role, userId } = req.user;
    const params = [period.start, period.end];
    const appScope = appendApplicationScope({ role, userId, alias: 'a', params });

    const totalsQuery = `
      SELECT
        COUNT(*)::int AS total_applications,
        COUNT(*) FILTER (WHERE a.application_type = 'building')::int AS building_applications,
        COUNT(*) FILTER (WHERE a.application_type = 'subdivision')::int AS subdivision_applications,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM application_permit_selections aps
            WHERE aps.application_id = a.id
              AND aps.permit_code = 'boundary_wall'
          )
        )::int AS boundary_wall_applications,
        COUNT(*) FILTER (WHERE a.status = 'approved')::int AS approved_count,
        COUNT(*) FILTER (WHERE a.status = 'correction')::int AS correction_count,
        COUNT(*) FILTER (WHERE a.status = 'committee_review')::int AS committee_review_count,
        COUNT(*) FILTER (WHERE a.status = 'permit_approved')::int AS permit_approved_count,
        COUNT(*) FILTER (WHERE a.status = 'rejected')::int AS rejected_count
      FROM applications a
      WHERE a.submission_date >= $1
        AND a.submission_date < $2
        ${appScope}
    `;

    const byStatusQuery = `
      SELECT a.status, COUNT(*)::int AS count
      FROM applications a
      WHERE a.submission_date >= $1
        AND a.submission_date < $2
        ${appScope}
      GROUP BY a.status
      ORDER BY count DESC, a.status ASC
    `;

    const totalsResult = await pool.query(totalsQuery, params);
    const byStatusResult = await pool.query(byStatusQuery, params);

    const totals = totalsResult.rows[0] || {
      total_applications: 0,
      building_applications: 0,
      subdivision_applications: 0,
      boundary_wall_applications: 0,
      approved_count: 0,
      correction_count: 0,
      committee_review_count: 0,
      permit_approved_count: 0,
      rejected_count: 0,
    };

    const byType = [
      { type: 'building', count: Number(totals.building_applications || 0) },
      { type: 'boundary_wall', count: Number(totals.boundary_wall_applications || 0) },
      { type: 'subdivision', count: Number(totals.subdivision_applications || 0) },
    ];

    res.json({
      periodType: period.periodType,
      year: period.year,
      month: period.month,
      periodLabel: period.periodLabel,
      scope: scopeLabelForRole(role),
      generatedAt: toColomboTimestamp(),
      totals: {
        totalApplications: Number(totals.total_applications || 0),
        approved: Number(totals.approved_count || 0),
        correctionRequired: Number(totals.correction_count || 0),
        committeeReview: Number(totals.committee_review_count || 0),
        permitApproved: Number(totals.permit_approved_count || 0),
        rejected: Number(totals.rejected_count || 0),
      },
      byType,
      byStatus: byStatusResult.rows.map((row) => ({
        status: row.status,
        count: Number(row.count || 0),
      })),
    });
  } catch (error) {
    console.error('Get application report stats error:', error);
    res.status(500).json({
      error: 'Failed to get application report stats',
      details: error.message,
    });
  }
};

exports.getRevenueSummary = async (req, res) => {
  try {
    const period = buildPeriodWindow(req.query);
    const { role, userId } = req.user;
    const params = [period.start, period.end];
    const revenueScope = appendRevenueScope({ role, userId, params });

    const revenueQuery = `
      SELECT
        p.payment_type,
        COUNT(*)::int AS transaction_count,
        COALESCE(SUM(p.amount), 0)::numeric(12,2) AS total_amount
      FROM payments p
      LEFT JOIN applications a ON a.id = p.application_id
      LEFT JOIN coc_requests c ON c.id = p.coc_request_id
      LEFT JOIN fines f ON f.id = p.fine_id
      WHERE p.status = 'completed'
        AND COALESCE(p.paid_at, p.created_at) >= $1
        AND COALESCE(p.paid_at, p.created_at) < $2
        ${revenueScope}
      GROUP BY p.payment_type
      ORDER BY p.payment_type ASC
    `;

    const revenueResult = await pool.query(revenueQuery, params);

    const totalsByType = {
      application_fee: 0,
      coc_fee: 0,
      deviation_fine: 0,
      permit_extension_fee: 0,
    };

    let overallRevenue = 0;
    const byType = revenueResult.rows.map((row) => {
      const amount = Number(row.total_amount || 0);
      totalsByType[row.payment_type] = amount;
      overallRevenue += amount;
      return {
        paymentType: row.payment_type,
        transactionCount: Number(row.transaction_count || 0),
        amount,
      };
    });

    res.json({
      periodType: period.periodType,
      year: period.year,
      month: period.month,
      periodLabel: period.periodLabel,
      scope: scopeLabelForRole(role),
      generatedAt: toColomboTimestamp(),
      totals: {
        overallRevenue,
        applicationFeeRevenue: totalsByType.application_fee,
        cocFeeRevenue: totalsByType.coc_fee,
        fineRevenue: totalsByType.deviation_fine,
        permitExtensionRevenue: totalsByType.permit_extension_fee,
      },
      byType,
    });
  } catch (error) {
    console.error('Get revenue report summary error:', error);
    res.status(500).json({
      error: 'Failed to get revenue report summary',
      details: error.message,
    });
  }
};

exports.getModificationReasons = async (req, res) => {
  try {
    const period = buildPeriodWindow(req.query);
    const { role, userId } = req.user;

    const params = [period.start, period.end, REASON_STATUSES];
    const appScope = appendApplicationScope({ role, userId, alias: 'a', params });

    const reasonsQuery = `
      SELECT
        ash.reason,
        COUNT(*)::int AS count
      FROM application_status_history ash
      JOIN applications a ON a.id = ash.application_id
      WHERE ash.changed_at >= $1
        AND ash.changed_at < $2
        AND ash.status = ANY($3::text[])
        AND ash.reason IS NOT NULL
        AND BTRIM(ash.reason) <> ''
        ${appScope}
      GROUP BY ash.reason
      ORDER BY count DESC, ash.reason ASC
      LIMIT 10
    `;

    const byStatusQuery = `
      SELECT
        ash.status,
        COUNT(*)::int AS count
      FROM application_status_history ash
      JOIN applications a ON a.id = ash.application_id
      WHERE ash.changed_at >= $1
        AND ash.changed_at < $2
        AND ash.status = ANY($3::text[])
        AND ash.reason IS NOT NULL
        AND BTRIM(ash.reason) <> ''
        ${appScope}
      GROUP BY ash.status
      ORDER BY count DESC, ash.status ASC
    `;

    const [reasonsResult, byStatusResult] = await Promise.all([
      pool.query(reasonsQuery, params),
      pool.query(byStatusQuery, params),
    ]);

    const totalCount = reasonsResult.rows.reduce((sum, row) => sum + Number(row.count || 0), 0);

    res.json({
      periodType: period.periodType,
      year: period.year,
      month: period.month,
      periodLabel: period.periodLabel,
      scope: scopeLabelForRole(role),
      generatedAt: toColomboTimestamp(),
      totalReasonsCount: totalCount,
      byReason: reasonsResult.rows.map((row) => ({
        reason: row.reason,
        count: Number(row.count || 0),
      })),
      byStatus: byStatusResult.rows.map((row) => ({
        status: row.status,
        count: Number(row.count || 0),
      })),
    });
  } catch (error) {
    console.error('Get modification reasons report error:', error);
    res.status(500).json({
      error: 'Failed to get modification reasons report',
      details: error.message,
    });
  }
};
