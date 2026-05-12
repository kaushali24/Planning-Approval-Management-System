import { approvedApplications } from './cocMock';
import { formatApplicationCode } from '../utils/applicationCode';

const PERMIT_WORKFLOW_KEY = 'permit_workflow_state';
const YEAR_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toIso = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const plusYearsIso = (iso, years = 1) => {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return toIso();
  return new Date(base.getTime() + years * YEAR_DAYS * 24 * 60 * 60 * 1000).toISOString();
};

const buildSeed = () => {
  return (approvedApplications || []).map((app, idx) => {
    const applicationCode = formatApplicationCode(app.id);
    const isBuildingType = String(app.type || '').toLowerCase().includes('building');
    const issuedAt = toIso(app.approved);
    return {
      applicationId: applicationCode,
      applicationCode,
      type: app.type,
      issuedAt,
      validUntil: isBuildingType ? plusYearsIso(issuedAt, 1) : null,
      permitCollected: true,
      extensionsUsed: isBuildingType ? (idx === 0 ? 1 : 0) : 0,
      extensionHistory: isBuildingType && idx === 0 ? [{ year: 2, paidAt: toIso(), amount: 5000 }] : [],
      maxYears: isBuildingType ? 5 : 0,
    };
  });
};

const normalizePermitRecord = (row = {}) => {
  const type = row.type || '';
  const isBuildingType = isBuildingPermit(type);
  const applicationCode = formatApplicationCode(row.applicationCode || row.applicationId || row.id);

  return {
    ...row,
    applicationId: applicationCode,
    applicationCode,
    validUntil: isBuildingType ? (row.validUntil || null) : null,
    extensionsUsed: isBuildingType ? (row.extensionsUsed || 0) : 0,
    extensionHistory: isBuildingType ? (Array.isArray(row.extensionHistory) ? row.extensionHistory : []) : [],
    maxYears: isBuildingType ? (row.maxYears || 5) : 0,
  };
};

export const loadPermitWorkflow = () => {
  try {
    const raw = localStorage.getItem(PERMIT_WORKFLOW_KEY);
    if (!raw) return buildSeed();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizePermitRecord) : buildSeed();
  } catch {
    return buildSeed();
  }
};

export const savePermitWorkflow = (data) => {
  localStorage.setItem(PERMIT_WORKFLOW_KEY, JSON.stringify(data));
};

export const getPermitByApplicationId = (permits, appId) => (permits || []).find((row) => row.applicationId === appId);

export const isBuildingPermit = (permitOrType) => {
  const value = typeof permitOrType === 'string' ? permitOrType : permitOrType?.type;
  return String(value || '').toLowerCase().includes('building');
};

export const isPermitExpired = (permit) => {
  if (!permit?.validUntil) return false;
  return new Date(permit.validUntil).getTime() < Date.now();
};

export const getPermitDaysUntilExpiry = (permit) => {
  if (!permit?.validUntil) return null;
  const diff = new Date(permit.validUntil).getTime() - Date.now();
  return Math.ceil(diff / MS_PER_DAY);
};

export const getPermitExtensionAvailableFrom = (permit) => {
  if (!permit?.validUntil) return null;
  const date = new Date(permit.validUntil);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + MS_PER_DAY).toISOString();
};

export const canExtendPermit = (permit) => {
  if (!permit) return false;
  if (!isBuildingPermit(permit)) return false;
  return (permit.extensionsUsed || 0) < (permit.maxYears || 5);
};

export const applyPermitExtension = (permit, amount = 5000) => {
  if (!permit || !canExtendPermit(permit)) return permit;
  const nextUsed = (permit.extensionsUsed || 0) + 1;
  const base = permit.validUntil || permit.issuedAt || toIso();
  const nextValidUntil = plusYearsIso(base, 1);
  return {
    ...permit,
    validUntil: nextValidUntil,
    extensionsUsed: nextUsed,
    extensionHistory: [
      ...(permit.extensionHistory || []),
      {
        year: nextUsed + 1,
        paidAt: toIso(),
        amount,
        from: base,
        to: nextValidUntil,
        status: 'extended',
      },
    ],
  };
};
