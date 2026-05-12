export const LK_LOCALE = 'en-LK';

export const formatDate = (value, options = { year: 'numeric', month: 'short', day: 'numeric' }) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(LK_LOCALE, options);
};

export const formatDateTime = (
  value,
  options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(LK_LOCALE, options);
};

export const formatMonthYear = (value, options = { month: 'short', year: 'numeric' }) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(LK_LOCALE, options);
};

export const formatTime = (value, options = { hour: '2-digit', minute: '2-digit' }) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(LK_LOCALE, options);
};

export const formatCurrencyLKR = (value, options = {}) => {
  const amount = Number(value ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(LK_LOCALE, {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(safeAmount);
};

export const formatNumber = (value, options = {}) => {
  const amount = Number(value ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(LK_LOCALE, options).format(safeAmount);
};
