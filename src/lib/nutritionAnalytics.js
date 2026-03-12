import { isActionableHealthActivityRow } from './healthState.js';

export const MEALS = [
  { value: 'petit-dejeuner', label: 'Petit dejeuner', emphasis: 'side' },
  { value: 'dejeuner', label: 'Dejeuner', emphasis: 'main' },
  { value: 'collation', label: 'Collation', emphasis: 'side' },
  { value: 'diner', label: 'Diner', emphasis: 'main' },
  { value: 'avant-coucher', label: 'Avant coucher', emphasis: 'side' },
];

export const METRICS = [
  { key: 'kcal', label: 'Kcal', unit: 'kcal' },
  { key: 'protein', label: 'Proteines', unit: 'g' },
  { key: 'carbs', label: 'Glucides', unit: 'g' },
  { key: 'fat', label: 'Lipides', unit: 'g' },
];

export const DAILY_LOG_MACRO_KEYS = {
  kcal: 'caloriesEstimated',
  protein: 'proteinG',
  carbs: 'carbsG',
  fat: 'fatG',
};

export const foodKey = (food) => `${(food.name || '').trim().toLowerCase()}|${(food.brand || '').trim().toLowerCase()}`;
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const round = (value, digits = 0) => Number(value || 0).toFixed(digits);
export const formatMetric = (value, unit, digits = 0) => `${Number(value || 0).toFixed(digits)} ${unit}`;
export const formatSignedKcal = (value) => `${Number(value || 0) >= 0 ? '+' : ''}${Number(value || 0).toFixed(0)} kcal`;
export const formatDateShort = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export const formatStepActivityMeta = ({ steps = 0, source = 'aucun', mode = 'none' } = {}) => {
  if (mode === 'steps-neat') {
    return steps > 0 ? `NEAT hors seance | ${steps} pas` : 'NEAT hors seance | pas non renseignes';
  }
  if (mode === 'health-active-kcal') return 'calories actives sante';
  if (mode === 'cardio-estimate' || source === 'cardio x poids') return 'cardio estime';
  if (steps > 0) return `${steps} pas | estimation auto`;
  return 'pas non renseignes';
};

export const formatTrainingMeta = (sessions, durationMin, source) => {
  if (sessions > 0) return `${sessions} bloc(s) | ${Math.round(durationMin || 0)} min auto`;
  if (source === 'duree estimee via series') return 'estime via series';
  return 'aucune seance';
};

export const emptyMacros = () => ({
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

export const sumEntryMacros = (rows = []) =>
  rows.reduce(
    (acc, entry) => ({
      kcal: acc.kcal + Number(entry?.macros?.kcal || 0),
      protein: acc.protein + Number(entry?.macros?.protein || 0),
      carbs: acc.carbs + Number(entry?.macros?.carbs || 0),
      fat: acc.fat + Number(entry?.macros?.fat || 0),
    }),
    emptyMacros(),
  );

export const macrosFromDailyLog = (log) => ({
  kcal: Number(log?.[DAILY_LOG_MACRO_KEYS.kcal] || 0),
  protein: Number(log?.[DAILY_LOG_MACRO_KEYS.protein] || 0),
  carbs: Number(log?.[DAILY_LOG_MACRO_KEYS.carbs] || 0),
  fat: Number(log?.[DAILY_LOG_MACRO_KEYS.fat] || 0),
});

export const resolveDayNutrition = (rows = [], log = null) => {
  const fromEntries = sumEntryMacros(rows);
  const hasEntries = rows.length > 0;
  if (hasEntries) return { ...fromEntries, source: 'entries', entryCount: rows.length };
  const fromLog = macrosFromDailyLog(log);
  return { ...fromLog, source: log ? 'daily-log' : 'none', entryCount: 0 };
};

export const resolveMetricForDate = (metricsAsc, date, field) => {
  for (let index = metricsAsc.length - 1; index >= 0; index -= 1) {
    const row = metricsAsc[index];
    if (row.date > date) continue;
    const value = Number(row?.[field] || 0);
    if (value > 0) return value;
  }
  for (let index = metricsAsc.length - 1; index >= 0; index -= 1) {
    const value = Number(metricsAsc[index]?.[field] || 0);
    if (value > 0) return value;
  }
  return 0;
};

export const estimateBaseCalories = ({ weightKg, bodyFatPercent }) => {
  if (weightKg > 0 && bodyFatPercent > 0 && bodyFatPercent < 70) {
    const leanMassKg = Math.max(weightKg * (1 - bodyFatPercent / 100), 35);
    return {
      kcal: 370 + 21.6 * leanMassKg,
      confidence: 'bonne',
      method: 'BMR repos',
      formula: 'poids + BF',
    };
  }
  if (weightKg > 0) {
    return {
      kcal: weightKg * 22,
      confidence: 'faible',
      method: 'BMR repos',
      formula: 'poids x 22',
    };
  }
  return {
    kcal: 0,
    confidence: 'faible',
    method: 'BMR repos',
    formula: 'aucune base',
  };
};

export const estimateActivityCalories = ({ neatRow, weightKg, hasLoggedTraining = false }) => {
  const steps = Number(neatRow?.steps || 0);
  const cardioMin = Number(neatRow?.cardioMin || 0);
  const activeKcal = isActionableHealthActivityRow(neatRow) ? Number(neatRow?.caloriesActive || 0) : 0;
  const stepsEstimate = steps > 0 && weightKg > 0 ? steps * weightKg * 0.0005 : 0;
  if (hasLoggedTraining) {
    return {
      kcal: stepsEstimate,
      steps,
      cardioMin,
      source: stepsEstimate > 0 ? 'pas x poids' : 'aucun',
      mode: stepsEstimate > 0 ? 'steps-neat' : 'none',
    };
  }
  const cardioEstimate = activeKcal > 0 || cardioMin <= 0 || weightKg <= 0 ? 0 : cardioMin * weightKg * 0.035;
  const kcal = activeKcal > 0 ? activeKcal : Math.max(stepsEstimate, cardioEstimate);
  return {
    kcal,
    steps,
    cardioMin,
    source: activeKcal > 0 ? 'calories actives sante' : stepsEstimate > 0 ? 'pas x poids' : cardioEstimate > 0 ? 'cardio x poids' : 'aucun',
    mode: activeKcal > 0 ? 'health-active-kcal' : stepsEstimate > 0 ? 'steps-estimate' : cardioEstimate > 0 ? 'cardio-estimate' : 'none',
  };
};

export const estimateTrainingCalories = ({ sessions, weightKg }) => {
  const durationFromLogs = sessions.reduce(
    (max, session) => Math.max(max, Number(session?.durationMin || session?.session_duration_min || 0)),
    0,
  );
  const setCount = sessions.reduce(
    (acc, session) => acc + (Array.isArray(session?.setDetails) && session.setDetails.length > 0 ? session.setDetails.length : Number(session?.sets || 0)),
    0,
  );
  const durationMin = durationFromLogs || (setCount > 0 ? Math.min(75, Math.max(18, setCount * 2.5)) : 0);
  const kcal = durationMin > 0 ? durationMin * (weightKg > 0 ? weightKg * 0.04 : 4.5) : 0;
  return {
    kcal,
    durationMin,
    source: durationFromLogs > 0 ? 'duree loggee' : setCount > 0 ? 'duree estimee via series' : 'aucun',
  };
};

export const confidenceLabel = (snapshot) => {
  const score = [
    snapshot.weightKg > 0,
    snapshot.activityKcal > 0,
    snapshot.trainingKcal > 0,
    snapshot.intakeSource !== 'none',
  ].filter(Boolean).length;
  if (score >= 4) return 'bonne';
  if (score >= 2) return 'moyenne';
  return 'faible';
};

export const energyToneKey = (value) => {
  if (value <= -250) return 'stateok';
  if (value < 150) return 'statebas';
  return 'statehaut';
};

export const clampPercent = (value, max) => {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min((value / max) * 100, 100));
};
