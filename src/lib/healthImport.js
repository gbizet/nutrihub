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

const HEALTH_NUMERIC_BOUNDS = {
  weightKg: { min: 20, max: 300 },
  bodyFatPercent: { min: 2, max: 75 },
  muscleMassKg: { min: 10, max: 200 },
  visceralFat: { min: 1, max: 60 },
  waterPercent: { min: 10, max: 80 },
  steps: { min: 1, max: 100_000 },
  activeMinutes: { min: 1, max: 1_440 },
  activeCalories: { min: 1, max: 10_000 },
  sleepHours: { min: 0.5, max: 24 },
  restingHeartRate: { min: 30, max: 250 },
  heartRateAvg: { min: 30, max: 250 },
  hrvMs: { min: 1, max: 300 },
  bloodPressureSystolic: { min: 60, max: 260 },
  bloodPressureDiastolic: { min: 40, max: 160 },
  oxygenSaturationPercent: { min: 50, max: 100 },
  bloodGlucoseMgDl: { min: 20, max: 600 },
};

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

const pushValidationWarning = (warnings, row, field, value, bounds) => {
  warnings.push({
    code: 'HEALTH_VALUE_OUT_OF_RANGE',
    field,
    value,
    min: bounds.min,
    max: bounds.max,
    date: toIsoDate(row?.date || row?.capturedAt || row?.endTime),
    sourcePackage: cleanText(row?.sourcePackage),
    sourceRecordId: cleanText(row?.sourceRecordId),
  });
};

const sanitizeBoundedNumber = (row, field, warnings) => {
  const rawValue = row?.[field];
  if (rawValue === null || rawValue === undefined || rawValue === '') return rawValue;
  const numeric = Number(rawValue);
  const bounds = HEALTH_NUMERIC_BOUNDS[field];
  if (!Number.isFinite(numeric) || !bounds || numeric < bounds.min || numeric > bounds.max) {
    pushValidationWarning(warnings, row, field, rawValue, bounds);
    return undefined;
  }
  return numeric;
};

const sanitizeBodyMetricsRow = (row, warnings) => ({
  ...row,
  weightKg: sanitizeBoundedNumber(row, 'weightKg', warnings),
  bodyFatPercent: sanitizeBoundedNumber(row, 'bodyFatPercent', warnings),
  muscleMassKg: sanitizeBoundedNumber(row, 'muscleMassKg', warnings),
  visceralFat: sanitizeBoundedNumber(row, 'visceralFat', warnings),
  waterPercent: sanitizeBoundedNumber(row, 'waterPercent', warnings),
});

const sanitizeActivityRow = (row, warnings) => ({
  ...row,
  steps: sanitizeBoundedNumber(row, 'steps', warnings),
  activeMinutes: sanitizeBoundedNumber(row, 'activeMinutes', warnings),
  activeCalories: sanitizeBoundedNumber(row, 'activeCalories', warnings),
});

const sanitizeSleepRow = (row, warnings) => ({
  ...row,
  sleepHours: sanitizeBoundedNumber(row, 'sleepHours', warnings),
});

const sanitizeVitalsRow = (row, warnings) => ({
  ...row,
  restingHeartRate: sanitizeBoundedNumber(row, 'restingHeartRate', warnings),
  heartRateAvg: sanitizeBoundedNumber(row, 'heartRateAvg', warnings),
  hrvMs: sanitizeBoundedNumber(row, 'hrvMs', warnings),
  bloodPressureSystolic: sanitizeBoundedNumber(row, 'bloodPressureSystolic', warnings),
  bloodPressureDiastolic: sanitizeBoundedNumber(row, 'bloodPressureDiastolic', warnings),
  oxygenSaturationPercent: sanitizeBoundedNumber(row, 'oxygenSaturationPercent', warnings),
  bloodGlucoseMgDl: sanitizeBoundedNumber(row, 'bloodGlucoseMgDl', warnings),
});

const hasBodyMetricsSignal = (row) =>
  Number(row?.weightKg || 0) > 0
  || Number(row?.bodyFatPercent || 0) > 0
  || Number(row?.muscleMassKg || 0) > 0
  || Number(row?.visceralFat || 0) > 0
  || Number(row?.waterPercent || 0) > 0;

const hasActivitySignal = (row, fallbackProvider = '') => {
  const provider = resolveRowProvider(row, fallbackProvider);
  const steps = Number(row?.steps || 0);
  const activeMinutes = Number(row?.activeMinutes || 0);
  const activeCalories = Number(row?.activeCalories || 0);
  if (steps > 0 || activeMinutes > 0) return true;
  if (provider === 'health-connect') return false;
  return activeCalories > 0;
};

const hasSleepSignal = (row) => Number(row?.sleepHours || 0) > 0;

const hasVitalsSignal = (row) =>
  Number(row?.restingHeartRate || 0) > 0
  || Number(row?.heartRateAvg || 0) > 0
  || Number(row?.hrvMs || 0) > 0
  || (
    Number(row?.bloodPressureSystolic || 0) > 0
    && Number(row?.bloodPressureDiastolic || 0) > 0
  )
  || Number(row?.oxygenSaturationPercent || 0) > 0
  || Number(row?.bloodGlucoseMgDl || 0) > 0;

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

const sanitizeHealthRecords = (records = {}, fallbackProvider = '') => {
  const warnings = [];
  const sanitizedRecords = {
    bodyMetrics: ensureArray(records.bodyMetrics)
      .map((row) => sanitizeBodyMetricsRow(row, warnings))
      .filter(hasBodyMetricsSignal),
    activity: ensureArray(records.activity)
      .map((row) => sanitizeActivityRow(row, warnings))
      .filter((row) => hasActivitySignal(row, cleanText(row?.provider) || fallbackProvider)),
    sleep: ensureArray(records.sleep)
      .map((row) => sanitizeSleepRow(row, warnings))
      .filter(hasSleepSignal),
    vitals: ensureArray(records.vitals)
      .map((row) => sanitizeVitalsRow(row, warnings))
      .filter(hasVitalsSignal),
  };
  return { sanitizedRecords, warnings };
};

export const mergeHealthImportIntoState = (prevState, payload = {}) => {
  const provider = payload.provider || defaultHealthSyncState.provider;
  const importedAt = payload.importedAt || new Date().toISOString();
  const importMode = cleanText(payload.importMode) || 'manual';
  const deviceName = cleanText(payload.deviceName);
  const startDate = toIsoDate(payload.startDate);
  const endDate = toIsoDate(payload.endDate);
  const permissions = ensureArray(payload.permissions);
  const preexistingWarnings = ensureArray(payload.validationWarnings);
  const { sanitizedRecords, warnings } = sanitizeHealthRecords(payload.records || {}, provider);
  let metrics = [...(prevState.metrics || [])];
  let neatLogs = [...(prevState.neatLogs || [])].filter(
    (row) => !isProviderImportedActivityNoise(row, provider, startDate, endDate),
  );
  let dailyLogs = [...(prevState.dailyLogs || [])];

  let metricsCount = 0;
  let neatCount = 0;
  let dailyCount = 0;

  ensureArray(sanitizedRecords.bodyMetrics).forEach((row) => {
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

  ensureArray(sanitizedRecords.activity).forEach((row) => {
    const date = toIsoDate(row.date || row.capturedAt);
    if (!date || !hasActivitySignal(row, provider)) return;
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

  ensureArray(sanitizedRecords.sleep).forEach((row) => {
    const date = toIsoDate(row.date || row.endTime || row.capturedAt);
    if (!date || !hasSleepSignal(row)) return;
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

  ensureArray(sanitizedRecords.vitals).forEach((row) => {
    const date = toIsoDate(row.date || row.capturedAt);
    if (!date || !hasVitalsSignal(row)) return;
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

  const allWarnings = [...preexistingWarnings, ...warnings];
  const coverage = buildHealthCoverageFromRecords(sanitizedRecords, provider);
  const lastImportSummary = formatHealthImportSummary({
    metrics: metricsCount,
    neat: neatCount,
    dailyLogs: dailyCount,
  });

  const debugEntries = [];
  if (allWarnings.length > 0) {
    debugEntries.push(
      buildHealthDebugEntry('health import validation warnings', {
        provider,
        warningCount: allWarnings.length,
        warnings: allWarnings.slice(0, 20),
      }),
    );
  }
  debugEntries.push(
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
  );

  const nextHealthSync = updateHealthSyncAfterImport(
    appendHealthDebugEntries(
      prevState.healthSync || defaultHealthSyncState,
      ...debugEntries,
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
