import {
  HEALTH_COVERAGE_STATUS,
  HEALTH_ERROR_CATEGORY,
  HEALTH_PROVIDER,
  HEALTH_STREAMS,
} from './healthSchema.js';
import {
  getHealthPlatformStatus,
  importHealthSnapshot,
  requestHealthImportPermissions,
} from './platformHealth.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

const shiftIsoDate = (isoDate, deltaDays) => {
  const [year, month, day] = `${isoDate || ''}`.split('-').map((chunk) => Number.parseInt(chunk, 10));
  if (!year || !month || !day) return todayIso();
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
};

const cleanText = (value) => `${value || ''}`.trim();

const hasPermissionGap = (status = {}, stream = {}) => {
  const missing = new Set(status.missingPermissions || []);
  return (stream.androidPermissions || []).some((permission) => missing.has(permission));
};

export const buildManualHealthImportWindow = ({ days = 30, endDate = todayIso() } = {}) => ({
  mode: 'manual',
  startDate: shiftIsoDate(endDate, -(Math.max(1, Number(days || 30)) - 1)),
  endDate,
});

export const buildAutoHealthImportWindow = (healthSync = {}, { overlapDays = 2, bootstrapDays = 30, endDate = todayIso() } = {}) => {
  const overlap = Math.max(1, Number(overlapDays || 2));
  const bootstrap = Math.max(1, Number(bootstrapDays || 30));
  const previousEndDate = cleanText(healthSync?.lastImportWindow?.endDate)
    || cleanText(healthSync?.lastImportedDate)
    || cleanText(healthSync?.checkpoints?.[healthSync?.provider || HEALTH_PROVIDER.healthConnect]?.lastImportedDate);

  if (!previousEndDate) return buildManualHealthImportWindow({ days: bootstrap, endDate });
  return {
    mode: 'auto',
    startDate: shiftIsoDate(previousEndDate, -(overlap - 1)),
    endDate,
  };
};

export const getHealthIntegrationStatus = async () => getHealthPlatformStatus();

export const requestHealthIntegrationPermissions = async () => requestHealthImportPermissions();

export const importManualHealthWindow = async ({ days = 30, endDate = todayIso() } = {}) => {
  const window = buildManualHealthImportWindow({ days, endDate });
  const payload = await importHealthSnapshot(window);
  return {
    ...payload,
    importMode: 'manual',
    startDate: window.startDate,
    endDate: window.endDate,
  };
};

export const importAutoHealthWindow = async (healthSync = {}, { overlapDays = 2, bootstrapDays = 30, endDate = todayIso() } = {}) => {
  const window = buildAutoHealthImportWindow(healthSync, { overlapDays, bootstrapDays, endDate });
  const payload = await importHealthSnapshot(window);
  return {
    ...payload,
    importMode: window.mode === 'auto' ? 'auto' : 'manual',
    startDate: window.startDate,
    endDate: window.endDate,
  };
};

export const deriveHealthStreamDiagnostics = (platformStatus = {}, lastCoverage = {}) => {
  const runtimeError = cleanText(platformStatus.samsungReadDataRuntimeError || platformStatus.samsungLastError);
  return HEALTH_STREAMS.map((stream) => {
    const coverage = lastCoverage?.[stream.id] || {};
    const permissionMissing = hasPermissionGap(platformStatus, stream);
    const provider = cleanText(coverage.provider) || HEALTH_PROVIDER.healthConnect;
    let status = coverage.status || HEALTH_COVERAGE_STATUS.unknown;
    let reason = '';

    if (!platformStatus.healthConnectAvailable && !platformStatus.samsungHealthAvailable) {
      status = HEALTH_COVERAGE_STATUS.unavailable;
      reason = cleanText(platformStatus.reason) || 'Aucune source sante disponible.';
    } else if (coverage.status === HEALTH_COVERAGE_STATUS.available) {
      reason = coverage.usedFallback ? 'Fallback Samsung utilise.' : 'Flux disponible.';
    } else if (permissionMissing) {
      status = HEALTH_COVERAGE_STATUS.permissionMissing;
      reason = 'Permission manquante.';
    } else if (runtimeError) {
      status = HEALTH_COVERAGE_STATUS.runtimeError;
      reason = runtimeError;
    } else if (coverage.status === HEALTH_COVERAGE_STATUS.sourceAbsent) {
      reason = 'Source absente pour la fenetre importee.';
    } else {
      reason = cleanText(platformStatus.reason) || 'Etat non determine.';
    }

    return {
      id: stream.id,
      label: stream.label,
      target: stream.target,
      status,
      provider,
      lastSeenDate: cleanText(coverage.lastSeenDate),
      usedFallback: Boolean(coverage.usedFallback),
      sourcePackage: cleanText(coverage.sourcePackage),
      permissionMissing,
      reason,
    };
  });
};

export const classifyHealthImportFailure = (error) => {
  const message = cleanText(error?.message || error);
  const lower = message.toLowerCase();
  if (!message) return HEALTH_ERROR_CATEGORY.unknown;
  if (lower.includes('permission')) return HEALTH_ERROR_CATEGORY.permissions;
  if (lower.includes('runtime') || lower.includes('sdk') || lower.includes('policy')) return HEALTH_ERROR_CATEGORY.runtime;
  if (lower.includes('sync') || lower.includes('drive')) return HEALTH_ERROR_CATEGORY.sync;
  return HEALTH_ERROR_CATEGORY.import;
};
