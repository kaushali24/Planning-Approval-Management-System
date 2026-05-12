/**
 * useSimpleDashboard.js
 *
 * React hook that powers all simplified CiviTrack dashboards.
 * Fetches from /api/simple/* and exposes:
 *   - applications[], counts{}, loading, error
 *   - reload()  — re-fetch the dashboard list
 *   - advance(appId, status, notes) — move app to next status
 *   - fetchDetail(appId) — fetch single app with docs + history
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { SIMPLE_API_BASE_URL } from '../utils/apiBase';

const API = SIMPLE_API_BASE_URL;

export function useSimpleDashboard() {
  const { token } = useAuth();
  const [applications, setApplications] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ── Common fetch helper ──────────────────────────────────────────────────
  const authFetch = useCallback(
    async (path, options = {}) => {
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }
      return data;
    },
    [token]
  );

  // ── Load dashboard list ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!token) return;
    if (!isMounted.current) return;
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch('/dashboard');
      if (isMounted.current) {
        setApplications(data.applications || []);
        setCounts(data.counts || {});
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message);
        setApplications([]);
        setCounts({});
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [authFetch, token]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Advance workflow ─────────────────────────────────────────────────────
  const advance = useCallback(
    async (appId, status, notes = '') => {
      const result = await authFetch(`/applications/${appId}/advance`, {
        method: 'POST',
        body: JSON.stringify({ status, notes }),
      });
      // Refresh the list after successful advance
      await load();
      return result;
    },
    [authFetch, load]
  );

  // ── Fetch single application detail ─────────────────────────────────────
  const fetchDetail = useCallback(
    async (appId) => {
      return authFetch(`/applications/${appId}`);
    },
    [authFetch]
  );

  return { 
    applications, counts, loading, error, 
    reload: load, advance, fetchDetail, 
    token, authFetch 
  };
}
