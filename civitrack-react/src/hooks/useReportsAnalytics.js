import { useCallback, useMemo, useState } from 'react';
import {
  adaptApplicationStats,
  adaptDrilldown,
  adaptModificationReasons,
  adaptRevenueSummary,
  adaptTrendData,
} from '../utils/reportAdapters.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const REPORTS_API_BASE = `${API_BASE}/api/reports`;

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || payload?.message || 'Failed to fetch report data';
    throw new Error(message);
  }
  return payload;
};

const buildQueryString = ({ periodType, month, year }) => {
  const params = new URLSearchParams();
  params.set('periodType', periodType);
  params.set('year', String(year));
  if (periodType === 'month') params.set('month', String(month));
  return params.toString();
};

const buildDrilldownQueryString = ({ periodType, month, year, metric, filterKey, filterValue }) => {
  const params = new URLSearchParams();
  params.set('periodType', periodType);
  params.set('year', String(year));
  if (periodType === 'month') params.set('month', String(month));
  params.set('metric', metric);
  if (filterKey) params.set('filterKey', filterKey);
  if (filterValue) params.set('filterValue', filterValue);
  return params.toString();
};

export const useReportsAnalytics = ({ token }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [applicationStats, setApplicationStats] = useState(null);
  const [revenueSummary, setRevenueSummary] = useState(null);
  const [modificationReasons, setModificationReasons] = useState(null);
  const [trendData, setTrendData] = useState(null);

  const fetchEndpoint = useCallback(async (endpoint, queryString) => {
    const response = await fetch(`${REPORTS_API_BASE}/${endpoint}?${queryString}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseResponse(response);
  }, [token]);

  const loadReports = useCallback(async (filters) => {
    if (!token) {
      setError('You are not authenticated to access report data.');
      setLoaded(false);
      return null;
    }

    try {
      setLoading(true);
      setError('');
      const queryString = buildQueryString(filters);
      const [appStats, revenue, reasons, trends] = await Promise.all([
        fetchEndpoint('application-stats', queryString),
        fetchEndpoint('revenue', queryString),
        fetchEndpoint('modification-reasons', queryString),
        fetchEndpoint('trends', queryString),
      ]);

      setApplicationStats(adaptApplicationStats(appStats));
      setRevenueSummary(adaptRevenueSummary(revenue));
      setModificationReasons(adaptModificationReasons(reasons));
      setTrendData(adaptTrendData(trends));
      setLoaded(true);
      const now = new Date().toISOString();
      setLastUpdated(now);
      return now;
    } catch (err) {
      setError(err.message || 'Failed to load report data.');
      setLoaded(false);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchEndpoint, token]);

  const loadDrilldown = useCallback(async (filters) => {
    if (!token) {
      throw new Error('You are not authenticated to access report data.');
    }
    const queryString = buildDrilldownQueryString(filters);
    const payload = await fetchEndpoint('drilldown', queryString);
    return adaptDrilldown(payload);
  }, [fetchEndpoint, token]);

  return useMemo(() => ({
    loading,
    error,
    loaded,
    lastUpdated,
    applicationStats,
    revenueSummary,
    modificationReasons,
    trendData,
    loadReports,
    loadDrilldown,
  }), [
    applicationStats,
    error,
    lastUpdated,
    loadDrilldown,
    loadReports,
    loaded,
    loading,
    modificationReasons,
    revenueSummary,
    trendData,
  ]);
};

