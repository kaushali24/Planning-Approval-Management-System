export const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatInteger = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-LK', {
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatCompactNumber = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-LK', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
};

export const formatPercent = (value) => {
  const amount = Number(value || 0);
  const sign = amount > 0 ? '+' : '';
  return `${sign}${amount.toFixed(1)}%`;
};

export const formatShortDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-LK', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-LK');
};

