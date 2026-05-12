const APP_CODE_REGEX = /^APP\/(\d{4})\/(\d{5})$/i;
const LEGACY_PS_CODE_REGEX = /^PS-(\d{4})-(\d{3,5})$/i;

export const formatApplicationCode = (value) => {
  if (value === null || value === undefined) return 'N/A';

  const text = String(value).trim();
  if (!text) return 'N/A';

  if (APP_CODE_REGEX.test(text)) {
    return text.toUpperCase();
  }

  const legacyMatch = text.match(LEGACY_PS_CODE_REGEX);
  if (legacyMatch) {
    const [, yearPart, sequencePart] = legacyMatch;
    return `APP/${yearPart}/${sequencePart.padStart(5, '0')}`;
  }

  return text;
};

export const getDisplayApplicationCode = (value, pendingLabel = 'Pending Code') => {
  const formatted = formatApplicationCode(value);
  return formatted === 'N/A' ? pendingLabel : formatted;
};
