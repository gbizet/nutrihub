export const HEALTH_PROVIDER = {
  healthConnect: 'health-connect',
  samsungHealth: 'samsung-health',
  manual: 'manual',
};

export const HEALTH_PERMISSION_IDS = {
  readWeight: 'android.permission.health.READ_WEIGHT',
  readBodyFat: 'android.permission.health.READ_BODY_FAT',
  readLeanBodyMass: 'android.permission.health.READ_LEAN_BODY_MASS',
  readSteps: 'android.permission.health.READ_STEPS',
  readActiveCalories: 'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  readExercise: 'android.permission.health.READ_EXERCISE',
  readSleep: 'android.permission.health.READ_SLEEP',
  readHeartRate: 'android.permission.health.READ_HEART_RATE',
  readRestingHeartRate: 'android.permission.health.READ_RESTING_HEART_RATE',
  readHrv: 'android.permission.health.READ_HEART_RATE_VARIABILITY',
  readBloodPressure: 'android.permission.health.READ_BLOOD_PRESSURE',
  readOxygen: 'android.permission.health.READ_OXYGEN_SATURATION',
  readBloodGlucose: 'android.permission.health.READ_BLOOD_GLUCOSE',
  samsungBodyComposition: 'samsung.permission.BODY_COMPOSITION_READ',
  samsungSteps: 'samsung.permission.STEPS_READ',
  samsungSleep: 'samsung.permission.SLEEP_READ',
  samsungHeartRate: 'samsung.permission.HEART_RATE_READ',
  samsungActivity: 'samsung.permission.ACTIVITY_SUMMARY_READ',
  samsungBloodPressure: 'samsung.permission.BLOOD_PRESSURE_READ',
  samsungOxygen: 'samsung.permission.BLOOD_OXYGEN_READ',
  samsungBloodGlucose: 'samsung.permission.BLOOD_GLUCOSE_READ',
};

export const HEALTH_COVERAGE_STATUS = {
  unknown: 'unknown',
  available: 'available',
  permissionMissing: 'permission-missing',
  sourceAbsent: 'source-absent',
  runtimeError: 'runtime-error',
  unavailable: 'unavailable',
};

export const HEALTH_ERROR_CATEGORY = {
  none: '',
  permissions: 'permissions',
  runtime: 'runtime',
  import: 'import',
  sync: 'sync',
  unknown: 'unknown',
};

export const HEALTH_STREAMS = [
  {
    id: 'weight',
    label: 'Poids',
    target: 'metrics',
    androidPermissions: [HEALTH_PERMISSION_IDS.readWeight],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungBodyComposition],
  },
  {
    id: 'body-composition',
    label: 'Composition',
    target: 'metrics',
    androidPermissions: [HEALTH_PERMISSION_IDS.readBodyFat, HEALTH_PERMISSION_IDS.readLeanBodyMass],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungBodyComposition],
  },
  {
    id: 'steps',
    label: 'Pas',
    target: 'neatLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readSteps],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungSteps],
  },
  {
    id: 'active-calories',
    label: 'Calories actives',
    target: 'neatLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readActiveCalories],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungActivity],
  },
  {
    id: 'active-minutes',
    label: 'Minutes actives',
    target: 'neatLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readExercise],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungActivity],
  },
  {
    id: 'sleep',
    label: 'Sommeil',
    target: 'dailyLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readSleep],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungSleep],
  },
  {
    id: 'heart-rate',
    label: 'FC moyenne',
    target: 'dailyLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readHeartRate],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungHeartRate],
  },
  {
    id: 'resting-heart-rate',
    label: 'FC repos',
    target: 'dailyLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readRestingHeartRate],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungHeartRate],
  },
  {
    id: 'blood-pressure',
    label: 'Tension',
    target: 'dailyLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readBloodPressure],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungBloodPressure],
  },
  {
    id: 'hrv',
    label: 'HRV',
    target: 'dailyLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readHrv],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungHeartRate],
  },
  {
    id: 'oxygen-saturation',
    label: 'Oxygene',
    target: 'dailyLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readOxygen],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungOxygen],
  },
  {
    id: 'blood-glucose',
    label: 'Glycemie',
    target: 'dailyLogs',
    androidPermissions: [HEALTH_PERMISSION_IDS.readBloodGlucose],
    samsungPermissions: [HEALTH_PERMISSION_IDS.samsungBloodGlucose],
  },
];

const cleanText = (value) => `${value || ''}`.trim();
const toIsoDate = (value) => `${value || ''}`.slice(0, 10);
const positiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const buildCoverageEntry = (stream, patch = {}) => ({
  id: stream.id,
  label: stream.label,
  target: stream.target,
  status: HEALTH_COVERAGE_STATUS.unknown,
  provider: '',
  lastSeenDate: '',
  usedFallback: false,
  sourcePackage: '',
  error: '',
  ...patch,
});

export const buildDefaultHealthCoverage = () => Object.fromEntries(
  HEALTH_STREAMS.map((stream) => [stream.id, buildCoverageEntry(stream)]),
);

const mergeCoverageEntry = (stream, previous = {}, next = {}) => {
  const merged = buildCoverageEntry(stream, {
    ...previous,
    ...next,
  });
  if (!cleanText(merged.lastSeenDate)) merged.lastSeenDate = cleanText(previous?.lastSeenDate || next?.lastSeenDate);
  return merged;
};

export const mergeHealthCoverage = (previousCoverage = {}, nextCoverage = {}) => Object.fromEntries(
  HEALTH_STREAMS.map((stream) => [
    stream.id,
    mergeCoverageEntry(stream, previousCoverage?.[stream.id], nextCoverage?.[stream.id]),
  ]),
);

const updateCoverage = (coverage, streamId, row, providerFallback) => {
  const entry = coverage[streamId];
  if (!entry) return;
  const provider = cleanText(row?.provider) || providerFallback;
  const lastSeenDate = toIsoDate(row?.date || row?.capturedAt || row?.endTime);
  coverage[streamId] = {
    ...entry,
    status: HEALTH_COVERAGE_STATUS.available,
    provider,
    lastSeenDate: lastSeenDate || entry.lastSeenDate,
    usedFallback: provider === HEALTH_PROVIDER.samsungHealth,
    sourcePackage: cleanText(row?.sourcePackage) || entry.sourcePackage,
    error: '',
  };
};

export const buildHealthCoverageFromRecords = (records = {}, providerFallback = HEALTH_PROVIDER.healthConnect) => {
  const coverage = buildDefaultHealthCoverage();
  const bodyMetrics = Array.isArray(records.bodyMetrics) ? records.bodyMetrics : [];
  const activity = Array.isArray(records.activity) ? records.activity : [];
  const sleep = Array.isArray(records.sleep) ? records.sleep : [];
  const vitals = Array.isArray(records.vitals) ? records.vitals : [];

  bodyMetrics.forEach((row) => {
    if (positiveNumber(row?.weightKg) > 0) updateCoverage(coverage, 'weight', row, providerFallback);
    if (
      positiveNumber(row?.bodyFatPercent) > 0
      || positiveNumber(row?.muscleMassKg) > 0
      || positiveNumber(row?.visceralFat) > 0
      || positiveNumber(row?.waterPercent) > 0
    ) {
      updateCoverage(coverage, 'body-composition', row, providerFallback);
    }
  });

  activity.forEach((row) => {
    if (positiveNumber(row?.steps) > 0) updateCoverage(coverage, 'steps', row, providerFallback);
    if (positiveNumber(row?.activeCalories) > 0) updateCoverage(coverage, 'active-calories', row, providerFallback);
    if (positiveNumber(row?.activeMinutes) > 0) updateCoverage(coverage, 'active-minutes', row, providerFallback);
  });

  sleep.forEach((row) => {
    if (positiveNumber(row?.sleepHours) > 0) updateCoverage(coverage, 'sleep', row, providerFallback);
  });

  vitals.forEach((row) => {
    if (positiveNumber(row?.heartRateAvg) > 0) updateCoverage(coverage, 'heart-rate', row, providerFallback);
    if (positiveNumber(row?.restingHeartRate) > 0) updateCoverage(coverage, 'resting-heart-rate', row, providerFallback);
    if (
      positiveNumber(row?.bloodPressureSystolic) > 0
      && positiveNumber(row?.bloodPressureDiastolic) > 0
    ) {
      updateCoverage(coverage, 'blood-pressure', row, providerFallback);
    }
    if (positiveNumber(row?.hrvMs) > 0) updateCoverage(coverage, 'hrv', row, providerFallback);
    if (positiveNumber(row?.oxygenSaturationPercent) > 0) updateCoverage(coverage, 'oxygen-saturation', row, providerFallback);
    if (positiveNumber(row?.bloodGlucoseMgDl) > 0) updateCoverage(coverage, 'blood-glucose', row, providerFallback);
  });

  HEALTH_STREAMS.forEach((stream) => {
    if (coverage[stream.id].status === HEALTH_COVERAGE_STATUS.unknown) {
      coverage[stream.id] = {
        ...coverage[stream.id],
        status: HEALTH_COVERAGE_STATUS.sourceAbsent,
      };
    }
  });

  return coverage;
};

const extractLastImportedDate = (coverage = {}) => (
  Object.values(coverage)
    .map((entry) => cleanText(entry?.lastSeenDate))
    .filter(Boolean)
    .sort()
    .at(-1) || ''
);

export const defaultHealthSyncState = {
  provider: HEALTH_PROVIDER.healthConnect,
  lastImportAt: '',
  lastAutoImportAt: '',
  lastPushAt: '',
  lastPullAt: '',
  lastImportSummary: '',
  lastImportWindow: null,
  lastImportedDate: '',
  lastError: '',
  lastErrorCategory: HEALTH_ERROR_CATEGORY.none,
  lastDeviceName: '',
  permissions: [],
  supportedStreams: HEALTH_STREAMS.map((item) => item.id),
  checkpoints: {},
  lastCoverage: buildDefaultHealthCoverage(),
  debugEntries: [],
};

export const formatHealthImportSummary = (summary = {}) => {
  const parts = [];
  if (summary.metrics) parts.push(`${summary.metrics} mesures`);
  if (summary.neat) parts.push(`${summary.neat} activites`);
  if (summary.dailyLogs) parts.push(`${summary.dailyLogs} recoveries`);
  return parts.join(' | ') || 'Aucune donnee importee';
};

export const classifyHealthErrorCategory = (errorOrMessage = '') => {
  const message = cleanText(errorOrMessage?.message || errorOrMessage).toLowerCase();
  if (!message) return HEALTH_ERROR_CATEGORY.none;
  if (message.includes('permission')) return HEALTH_ERROR_CATEGORY.permissions;
  if (message.includes('runtime') || message.includes('sdk') || message.includes('policy')) return HEALTH_ERROR_CATEGORY.runtime;
  if (message.includes('sync') || message.includes('drive')) return HEALTH_ERROR_CATEGORY.sync;
  if (message.includes('import')) return HEALTH_ERROR_CATEGORY.import;
  return HEALTH_ERROR_CATEGORY.unknown;
};

export const updateHealthSyncAfterImport = (
  healthSync = {},
  {
    provider = HEALTH_PROVIDER.healthConnect,
    importedAt = new Date().toISOString(),
    importMode = 'manual',
    startDate = '',
    endDate = '',
    lastImportSummary = '',
    lastDeviceName = '',
    permissions = [],
    coverage = buildDefaultHealthCoverage(),
    lastError = '',
    lastErrorCategory = HEALTH_ERROR_CATEGORY.none,
  } = {},
) => {
  const previous = {
    ...defaultHealthSyncState,
    ...healthSync,
  };
  const mergedCoverage = mergeHealthCoverage(previous.lastCoverage, coverage);
  const lastImportedDate = extractLastImportedDate(mergedCoverage) || previous.lastImportedDate;
  const nextCheckpoints = {
    ...(previous.checkpoints || {}),
    [provider]: {
      ...((previous.checkpoints || {})[provider] || {}),
      lastImportAt: importedAt,
      lastAutoImportAt: importMode === 'auto' ? importedAt : (((previous.checkpoints || {})[provider] || {}).lastAutoImportAt || ''),
      lastImportedDate,
      lastImportWindow: { startDate: cleanText(startDate), endDate: cleanText(endDate), mode: importMode },
      streams: Object.fromEntries(
        HEALTH_STREAMS.map((stream) => [
          stream.id,
          {
            ...((((previous.checkpoints || {})[provider] || {}).streams || {})[stream.id] || {}),
            lastImportedDate: mergedCoverage[stream.id]?.lastSeenDate || '',
            status: mergedCoverage[stream.id]?.status || HEALTH_COVERAGE_STATUS.unknown,
            provider: mergedCoverage[stream.id]?.provider || '',
            usedFallback: Boolean(mergedCoverage[stream.id]?.usedFallback),
            sourcePackage: mergedCoverage[stream.id]?.sourcePackage || '',
          },
        ]),
      ),
    },
  };

  return {
    ...previous,
    provider,
    lastImportAt: importedAt,
    lastAutoImportAt: importMode === 'auto' ? importedAt : previous.lastAutoImportAt,
    lastImportSummary,
    lastImportWindow: { startDate: cleanText(startDate), endDate: cleanText(endDate), mode: importMode },
    lastImportedDate,
    lastError,
    lastErrorCategory,
    lastDeviceName,
    permissions,
    supportedStreams: HEALTH_STREAMS.map((item) => item.id),
    checkpoints: nextCheckpoints,
    lastCoverage: mergedCoverage,
  };
};

export const updateHealthSyncAfterDriveOperation = (
  healthSync = {},
  kind,
  updatedAt,
) => {
  const previous = {
    ...defaultHealthSyncState,
    ...healthSync,
  };
  if (!cleanText(updatedAt)) return previous;
  if (kind === 'push') {
    return {
      ...previous,
      lastPushAt: updatedAt,
    };
  }
  if (kind === 'pull') {
    return {
      ...previous,
      lastPullAt: updatedAt,
    };
  }
  return previous;
};

export const updateHealthSyncError = (
  healthSync = {},
  {
    message = '',
    category = HEALTH_ERROR_CATEGORY.unknown,
  } = {},
) => ({
  ...defaultHealthSyncState,
  ...healthSync,
  lastError: cleanText(message),
  lastErrorCategory: category || HEALTH_ERROR_CATEGORY.unknown,
});

const MAX_HEALTH_DEBUG_ENTRIES = 120;

const sanitizeHealthDebugValue = (value, depth = 0) => {
  if (depth > 4) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeHealthDebugValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, item]) => [key, sanitizeHealthDebugValue(item, depth + 1)]),
    );
  }
  return `${value}`;
};

export const buildHealthDebugEntry = (message, payload = null) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  at: new Date().toISOString(),
  message: `${message || ''}`,
  payload: payload ? sanitizeHealthDebugValue(payload) : null,
});

export const appendHealthDebugEntries = (healthSync = {}, ...entries) => {
  const nextEntries = entries.filter(Boolean);
  return {
    ...defaultHealthSyncState,
    ...healthSync,
    debugEntries: [...nextEntries, ...((healthSync?.debugEntries || []))].slice(0, MAX_HEALTH_DEBUG_ENTRIES),
  };
};
