const API_BASE = 'http://localhost:5000/api';
const CONFIG_CACHE_KEY = 'document_checklist_config_cache';
const CONFIG_CACHE_TTL_MS = 2 * 60 * 1000;

const DEFAULT_COMMON_DOCUMENTS = [
  { id: 'deed', label: 'Copy of Deed', required: true },
  { id: 'assessment_tax_bill', label: 'Paid Assessment Tax Bill', required: true },
];

const normalizeLabel = (id, label) => {
  if (id === 'assessment_tax_bill') {
    return 'Paid Assessment Tax Bill';
  }
  return label;
};

const normalizeChecklistItem = (item = {}) => ({
  id: item.doc_type_key || item.key || item.id || '',
  label: normalizeLabel(
    item.doc_type_key || item.key || item.id || '',
    item.display_name || item.label || item.doc_type_key || item.key || item.id || ''
  ),
  description: item.description || '',
  required: item.is_required === true || item.required === true,
  active: item.is_active !== false,
  sortOrder: Number.isFinite(item.sort_order) ? item.sort_order : Number(item.sortOrder || 100),
});

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const readCacheEnvelope = () => {
  if (typeof window === 'undefined') {
    return { items: [], cachedAt: 0 };
  }

  const raw = window.localStorage.getItem(CONFIG_CACHE_KEY);
  const parsed = safeParse(raw, []);

  // Backward compatibility: older cache format stored a plain array.
  if (Array.isArray(parsed)) {
    return { items: parsed, cachedAt: 0 };
  }

  if (parsed && typeof parsed === 'object') {
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      cachedAt: Number(parsed.cachedAt) || 0,
    };
  }

  return { items: [], cachedAt: 0 };
};

const isFresh = (cachedAt, maxAgeMs = CONFIG_CACHE_TTL_MS) => {
  if (!cachedAt || !Number.isFinite(cachedAt)) return false;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) return true;
  return Date.now() - cachedAt <= maxAgeMs;
};

export const loadCachedDocumentChecklistConfig = () => {
  const { items: parsed } = readCacheEnvelope();
  return Array.isArray(parsed) ? parsed.map(normalizeChecklistItem).filter((item) => item.id) : [];
};

export const isDocumentChecklistCacheFresh = (maxAgeMs = CONFIG_CACHE_TTL_MS) => {
  const { cachedAt } = readCacheEnvelope();
  return isFresh(cachedAt, maxAgeMs);
};

export const saveCachedDocumentChecklistConfig = (items = []) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    CONFIG_CACHE_KEY,
    JSON.stringify({
      items: Array.isArray(items) ? items : [],
      cachedAt: Date.now(),
    })
  );
};

export const getConfiguredCommonDocuments = () => {
  const cached = loadCachedDocumentChecklistConfig();
  if (cached.length > 0) {
    return cached.map((item) => ({ id: item.id, label: item.label, required: item.required !== false }));
  }
  return DEFAULT_COMMON_DOCUMENTS;
};

export const refreshDocumentChecklistConfig = async () => {
  const cached = loadCachedDocumentChecklistConfig();
  if (cached.length > 0 && isDocumentChecklistCacheFresh()) {
    return cached.filter((item) => item.active);
  }

  const response = await fetch(`${API_BASE}/config/documents`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load document checklist configuration');
  }

  const items = Array.isArray(data.items) ? data.items.map(normalizeChecklistItem).filter((item) => item.id && item.active) : [];
  saveCachedDocumentChecklistConfig(items);
  return items;
};

export const forceRefreshDocumentChecklistConfig = async () => {
  const response = await fetch(`${API_BASE}/config/documents`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load document checklist configuration');
  }

  const items = Array.isArray(data.items) ? data.items.map(normalizeChecklistItem).filter((item) => item.id && item.active) : [];
  saveCachedDocumentChecklistConfig(items);
  return items;
};

export const getDocumentChecklistLabel = (docId) => {
  const common = getConfiguredCommonDocuments();
  return common.find((doc) => doc.id === docId)?.label || docId;
};

export const DEFAULT_DOCUMENT_CHECKLIST = DEFAULT_COMMON_DOCUMENTS;
