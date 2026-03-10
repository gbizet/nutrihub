import {
  appendHealthDebugEntries,
  buildHealthCoverageFromRecords,
  buildHealthDebugEntry,
  defaultHealthSyncState,
  formatHealthImportSummary,
  HEALTH_ERROR_CATEGORY,
  updateHealthSyncAfterImport,
} from './healthSchema.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const upsertByDate = (rows, date, buildNext) => {
  const list = ensureArray(rows);
  const index = list.findIndex((entry) => entry.date === date);
  if (index < 0) return [buildNext(null), ...list];
  const next = [...list];
  next[index] = buildNext(next[index]);
  return next;
};

const toIsoDate = (value) => `${value || ''}`.slice(0, 10);

const cleanText = (value) => `${value || ''}`.trim();

const resolveRowProvider = (row, fallbackProvider) => cleanText(row?.provider) || fallbackProvider;
const resolvePositiveOptionalMetric = (incomingValue, existingValue) => {
  if (incomingValue !== null && incomingValue !== undefined) return incomingValue;
  return Number(existingValue || 0) > 0 ? existingValue : undefined;
};

const hasActivitySignal = (row, fallbackProvider = '') => {
  const provider = resolveRowProvider(row, fallbackProvider);
  const steps = Number(row?.steps || 0);
  const activeMinutes = Number(row?.activeMinutes || 0);
  const activeCalories = Number(row?.activeCalories || 0);
  if (steps > 0 || activeMinutes > 0) return true;
  if (provider === 'health-connect') return false;
  return activeCalories > 0;
};

const isDateInRange = (date, startDate, endDate) => {
  if (!date || !startDate || !endDate) return false;
  return date >= startDate && date <= endDate;
};

const isProviderImportedActivityNoise = (row, provider, startDate, endDate) => (
  isDateInRange(row?.date, startDate, endDate)
  && row?.healthSource?.provider === provider
  && Number(row?.steps || 0) <= 0
  && Number(row?.activeMinutes || row?.cardioMin || 0) <= 0
  && (
    provider === 'health-connect'
      ? true
      : Number(row?.caloriesActive || row?.activeCalories || 0) <= 0
  )
);

export const mergeHealthImportIntoState = (prevState, payload = {}) => {
  const provider = payload.provider || defaultHealthSyncState.provider;
  const importedAt = payload.importedAt || new Date().toISOString();
  const importMode = cleanText(payload.importMode) || 'manual';
  const deviceName = cleanText(payload.deviceName);
  const startDate = toIsoDate(payload.startDate);
  const endDate = toIsoDate(payload.endDate);
  const permissions = ensureArray(payload.permissions);
  const records = payload.records || {};
  let metrics = [...(prevState.metrics || [])];
  let neatLogs = [...(prevState.neatLogs || [])].filter(
    (row) => !isProviderImportedActivityNoise(row, provider, startDate, endDate),
  );
  let dailyLogs = [...(prevState.dailyLogs || [])];

  let metricsCount = 0;
  let neatCount = 0;
  let dailyCount = 0;

  ensureArray(records.bodyMetrics).forEach((row) => {
    const date = toIsoDate(row.date || row.capturedAt);
    if (!date) return;
    const rowProvider = resolveRowProvider(row, provider);
    metrics = upsertByDate(metrics, date, (existing) => ({
      ...(existing || { date }),
      date,
      weight: row.weightKg ?? existing?.weight ?? 0,
      bodyFat: row.bodyFatPercent ?? existing?.bodyFat ?? 0,
      muscleMass: row.muscleMassKg ?? existing?.muscleMass ?? 0,
      visceralFat: row.visceralFat ?? existing?.visceralFat ?? 0,
      water: row.waterPercent ?? existing?.water ?? 0,
      notes: existing?.notes || '',
      healthSource: {
        provider: rowProvider,
        sourceRecordId: row.sourceRecordId || '',
        sourcePackage: row.sourcePackage || '',
        capturedAt: row.capturedAt || '',
        importedAt,
        deviceName,
      },
    }));
    metricsCount += 1;
  });

  ensureArray(records.activity).forEach((row) => {
    if (!hasActivitySignal(row, provider)) return;
    const date = toIsoDate(row.date || row.capturedAt);
    if (!date) return;
    const rowProvider = resolveRowProvider(row, provider);
    neatLogs = upsertByDate(neatLogs, date, (existing) => ({
      ...(existing || { id: `neat-${date}`, date }),
      id: existing?.id || `neat-${date}`,
      date,
      steps: row.steps ?? existing?.steps ?? 0,
      cardioMin: row.activeMinutes ?? existing?.cardioMin ?? 0,
      activeMinutes: row.activeMinutes ?? existing?.activeMinutes ?? 0,
      caloriesActive: row.activeCalories ?? existing?.caloriesActive ?? 0,
      healthSource: {
        provider: rowProvider,
        sourceRecordId: row.sourceRecordId || '',
        sourcePackage: row.sourcePackage || '',
        capturedAt: row.capturedAt || '',
        importedAt,
        deviceName,
      },
    }));
    neatCount += 1;
  });

  ensureArray(records.sleep).forEach((row) => {
    const date = toIsoDate(row.date || row.endTime || row.capturedAt);
    if (!date) return;
    const rowProvider = resolveRowProvider(row, provider);
    dailyLogs = upsertByDate(dailyLogs, date, (existing) => ({
      ...(existing || { id: `log-${date}`, date }),
      id: existing?.id || `log-${date}`,
      date,
      sleepHours: row.sleepHours ?? existing?.sleepHours ?? 0,
      sleepStart: row.startTime || existing?.sleepStart || '',
      sleepEnd: row.endTime || existing?.sleepEnd || '',
      healthSources: {
        ...(existing?.healthSources || {}),
        sleep: {
          provider: rowProvider,
          sourceRecordId: row.sourceRecordId || '',
          sourcePackage: row.sourcePackage || '',
          capturedAt: row.capturedAt || '',
          importedAt,
          deviceName,
        },
      },
    }));
    dailyCount += 1;
  });

  ensureArray(records.vitals).forEach((row) => {
    const date = toIsoDate(row.date || row.capturedAt);
    if (!date) return;
    const rowProvider = resolveRowProvider(row, provider);
    dailyLogs = upsertByDate(dailyLogs, date, (existing) => {
      const systolic = row.bloodPressureSystolic ?? existing?.bloodPressureSystolic ?? null;
      const diastolic = row.bloodPressureDiastolic ?? existing?.bloodPressureDiastolic ?? null;
      const nextBloodPressure =
        systolic && diastolic ? `${systolic}/${diastolic}` : (existing?.bloodPressure || '');

      return {
        ...(existing || { id: `log-${date}`, date }),
        id: existing?.id || `log-${date}`,
        date,
        bloodPressureSystolic: systolic,
        bloodPressureDiastolic: diastolic,
        bloodPressure: nextBloodPressure,
        restingBpm: resolvePositiveOptionalMetric(row.restingHeartRate, existing?.restingBpm),
        avgHeartRate: resolvePositiveOptionalMetric(row.heartRateAvg, existing?.avgHeartRate),
        hrvMs: resolvePositiveOptionalMetric(row.hrvMs, existing?.hrvMs),
        oxygenSaturationPercent: resolvePositiveOptionalMetric(row.oxygenSaturationPercent, existing?.oxygenSaturationPercent),
        bloodGlucoseMgDl: resolvePositiveOptionalMetric(row.bloodGlucoseMgDl, existing?.bloodGlucoseMgDl),
        healthSources: {
          ...(existing?.healthSources || {}),
          vitals: {
            provider: rowProvider,
            sourceRecordId: row.sourceRecordId || '',
            sourcePackage: row.sourcePackage || '',
            capturedAt: row.capturedAt || '',
            importedAt,
            deviceName,
          },
        },
      };
    });
    dailyCount += 1;
  });

  const coverage = buildHealthCoverageFromRecords(records, provider);
  const lastImportSummary = formatHealthImportSummary({
    metrics: metricsCount,
    neat: neatCount,
    dailyLogs: dailyCount,
  });
  const nextHealthSync = updateHealthSyncAfterImport(
    appendHealthDebugEntries(
      prevState.healthSync || defaultHealthSyncState,
      buildHealthDebugEntry('health import merged into shared state', {
        provider,
        importedAt,
        importMode,
        startDate,
        endDate,
        deviceName,
        metricsCount,
        neatCount,
        dailyCount,
        permissions,
        coverage,
      }),
    ),
    {
      provider,
      importedAt,
      importMode,
      startDate,
      endDate,
      lastImportSummary,
      lastDeviceName: deviceName,
      permissions,
      coverage,
      lastError: '',
      lastErrorCategory: HEALTH_ERROR_CATEGORY.none,
    },
  );

  return {
    ...prevState,
    metrics,
    neatLogs,
    dailyLogs,
    healthSync: nextHealthSync,
  };
};
