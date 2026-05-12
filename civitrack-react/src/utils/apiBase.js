/**
 * API base URLs for the browser build. Override with `VITE_API_BASE_URL` in staging/production
 * (no trailing slash; we normalize here). Defaults to local backend for development.
 */
const DEFAULT_API_BASE = 'http://localhost:5000';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
export const SIMPLE_API_BASE_URL = `${API_BASE_URL}/api/simple`;
