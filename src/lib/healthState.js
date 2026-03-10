const emptyObject = Object.freeze({});

const sortByDateAsc = (rows = []) => [...rows].sort((a, b) => `${a?.date || ''}`.localeCompare(`${b?.date || ''}`));
const toPositiveOptional = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
};

const latestOnOrBeforeDate = (rows = [], date, hasValue) => {
  const asc = sortByDateAsc(rows);
  for (let index = asc.length - 1; index >= 0; index -= 1) {
    const row = asc[index];
    if ((row?.date || '') > date) continue;
    if (!hasValue || hasValue(row)) return row;
  }
  for (let index = asc.length - 1; index >= 0; index -= 1) {
    const row = asc[index];
    if (!hasValue || hasValue(row)) return row;
  }
  return null;
};

const findByDate = (rows = [], date) => rows.find((row) => row?.date === date) || null;

const pickProvider = (...providers) => providers.find(Boolean) || 'manuel';

export const isActionableHealthActivityRow = (row) => {
  const steps = Number(row?.steps || 0);
  const activeMinutes = Number(row?.activeMinutes || row?.cardioMin || 0);
  const activeCalories = Number(row?.caloriesActive || 0);
  const provider = `${row?.healthSource?.provider || ''}`.trim();

  if (steps > 0 || activeMinutes > 0) return true;
  if (provider === 'health-connect') return false;
  return activeCalories > 0;
};

export const getHealthSnapshotForDate = (state, date, options = {}) => {
  const carryForward = options.carryForward !== false;
  const metrics = findByDate(state?.metrics || [], date);
  const neat = findByDate(state?.neatLogs || [], date);
  const dailyLog = findByDate(state?.dailyLogs || [], date);

  const latestWeightMetric = latestOnOrBeforeDate(state?.metrics || [], date, (row) => Number(row?.weight || 0) > 0);
  const latestBodyFatMetric = latestOnOrBeforeDate(state?.metrics || [], date, (row) => Number(row?.bodyFat || 0) > 0);
  const latestDailySleep = latestOnOrBeforeDate(state?.dailyLogs || [], date, (row) => Number(row?.sleepHours || 0) > 0);
  const latestDailyVitals = latestOnOrBeforeDate(
    state?.dailyLogs || [],
    date,
    (row) => Number(row?.restingBpm || 0) > 0
      || Number(row?.avgHeartRate || 0) > 0
      || Number(row?.hrvMs || 0) > 0
      || Number(row?.oxygenSaturationPercent || 0) > 0
      || Number(row?.bloodGlucoseMgDl || 0) > 0
      || `${row?.bloodPressure || ''}`.trim(),
  );
  const latestNeat = latestOnOrBeforeDate(
    state?.neatLogs || [],
    date,
    isActionableHealthActivityRow,
  );

  const weightRow = metrics && Number(metrics.weight || 0) > 0 ? metrics : (carryForward ? latestWeightMetric : null);
  const bodyFatRow = metrics && Number(metrics.bodyFat || 0) > 0 ? metrics : (carryForward ? latestBodyFatMetric : null);
  const sleepRow = dailyLog && Number(dailyLog.sleepHours || 0) > 0 ? dailyLog : (carryForward ? latestDailySleep : null);
  const vitalsRow = (
    dailyLog
    && (
      Number(dailyLog.restingBpm || 0) > 0
      || Number(dailyLog.avgHeartRate || 0) > 0
      || Number(dailyLog.hrvMs || 0) > 0
      || Number(dailyLog.oxygenSaturationPercent || 0) > 0
      || Number(dailyLog.bloodGlucoseMgDl || 0) > 0
      || `${dailyLog.bloodPressure || ''}`.trim()
    )
  ) ? dailyLog : (carryForward ? latestDailyVitals : null);
  const activityRow = (
    neat
    && isActionableHealthActivityRow(neat)
  ) ? neat : (carryForward ? latestNeat : null);

  return {
    date,
    metrics: metrics || null,
    neat: neat || null,
    dailyLog: dailyLog || null,
    carryForward,
    weightKg: Number(weightRow?.weight || 0),
    bodyFatPercent: Number(bodyFatRow?.bodyFat || 0),
    muscleMassKg: Number(weightRow?.muscleMass || 0),
    visceralFat: Number(weightRow?.visceralFat || 0),
    waterPercent: Number(weightRow?.water || 0),
    steps: Number(activityRow?.steps || 0),
    activeMinutes: Number(activityRow?.activeMinutes || activityRow?.cardioMin || 0),
    caloriesActive: Number(activityRow?.caloriesActive || 0),
    cardioMinutes: Number(activityRow?.cardioMin || activityRow?.activeMinutes || 0),
    sleepHours: Number(sleepRow?.sleepHours || 0),
    sleepStart: sleepRow?.sleepStart || '',
    sleepEnd: sleepRow?.sleepEnd || '',
    restingBpm: toPositiveOptional(vitalsRow?.restingBpm),
    avgHeartRate: toPositiveOptional(vitalsRow?.avgHeartRate),
    hrvMs: toPositiveOptional(vitalsRow?.hrvMs),
    oxygenSaturationPercent: toPositiveOptional(vitalsRow?.oxygenSaturationPercent),
    bloodGlucoseMgDl: toPositiveOptional(vitalsRow?.bloodGlucoseMgDl),
    bloodPressure: `${vitalsRow?.bloodPressure || ''}`.trim(),
    bloodPressureSystolic: toPositiveOptional(vitalsRow?.bloodPressureSystolic),
    bloodPressureDiastolic: toPositiveOptional(vitalsRow?.bloodPressureDiastolic),
    fatigueNervousSystem: Number(dailyLog?.fatigueNervousSystem || 0),
    provider: pickProvider(
      metrics?.healthSource?.provider,
      neat?.healthSource?.provider,
      dailyLog?.healthSources?.sleep?.provider,
      dailyLog?.healthSources?.vitals?.provider,
    ),
    sources: {
      metrics: metrics?.healthSource || null,
      activity: neat?.healthSource || null,
      sleep: dailyLog?.healthSources?.sleep || null,
      vitals: dailyLog?.healthSources?.vitals || null,
    },
    exactSources: {
      metrics: metrics?.healthSource || null,
      activity: neat?.healthSource || null,
      sleep: dailyLog?.healthSources?.sleep || null,
      vitals: dailyLog?.healthSources?.vitals || null,
    },
  };
};

export const getHealthSnapshotsForDates = (state, dates = [], options = {}) =>
  dates.map((date) => getHealthSnapshotForDate(state, date, options));

export const getLatestHealthDebugEntries = (state, limit = 30) => (
  Array.isArray(state?.healthSync?.debugEntries)
    ? state.healthSync.debugEntries.slice(0, limit)
    : []
);

export const formatHealthDebugEntries = (entries = []) => entries
  .map((entry) => {
    const payload = entry?.payload ? ` ${JSON.stringify(entry.payload)}` : '';
    return `${entry?.at || '-'} [health] ${entry?.message || ''}${payload}`;
  })
  .join('\n');

export const getHealthDebugSummary = (state) => ({
  entryCount: Array.isArray(state?.healthSync?.debugEntries) ? state.healthSync.debugEntries.length : 0,
  lastEntry: Array.isArray(state?.healthSync?.debugEntries) && state.healthSync.debugEntries.length
    ? state.healthSync.debugEntries[0]
    : emptyObject,
});
