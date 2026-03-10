import {
  countLoggedMealsForWindow,
  getSessionSetDetails,
  getSessionsForWindow,
  getWorkoutsForWindow,
  isoWindow,
} from './domainModel.js';
import { rankWorkedMuscleGroups } from './exerciseKnowledge.js';
import { getHealthSnapshotForDate } from './healthState.js';
import { describeDriveSyncTarget } from './googleDriveSync.js';

export const fallbackTemplate = {
  daily:
    'Tu es mon coach nutrition + home gym. Analyse ma journee du {{date}}.\nObjectifs: {{goals}}.\nMesures: {{measures}}.\nRecovery: {{recovery}}.\nMacros du jour: {{macros}}.\nContexte sync:\n{{syncContext}}\nNutrition:\n{{nutrition}}\nEntrainement:\n{{training}}\nDonne: 1) points forts, 2) ecarts vs objectifs, 3) plan precis pour demain (repas + training).',
  weekly:
    'Tu es mon coach nutrition + home gym. Fais ma revue hebdo du {{weekStart}} au {{weekEnd}}.\nObjectifs journaliers: {{goals}}.\nVolume hebdo: {{volume}}.\nTotal macros 7j: {{weeklyMacros}}.\nContexte sync:\n{{syncContext}}\nEvolution poids/BF:\n{{weights}}\nEtat recovery:\n{{weeklyRecovery}}\nDonne: 1) bilan hebdo, 2) recommandations macro-training semaine prochaine, 3) 3 priorites actionnables.',
};

export const PLACEHOLDER_DEFS = [
  { token: '{{date}}', scope: 'daily', description: 'Date active analysee.' },
  { token: '{{goals}}', scope: 'daily+weekly', description: 'Objectifs kcal/macros et seuils actifs.' },
  { token: '{{measures}}', scope: 'daily', description: 'Poids, BF et masse musculaire du jour.' },
  { token: '{{recovery}}', scope: 'daily', description: 'Sommeil, coeur, tension, pas et fatigue du jour.' },
  { token: '{{macros}}', scope: 'daily', description: 'Resume macros du jour.' },
  { token: '{{nutrition}}', scope: 'daily', description: 'Lignes nutrition du jour.' },
  { token: '{{training}}', scope: 'daily', description: 'Lignes training du jour.' },
  { token: '{{weekStart}}', scope: 'weekly', description: 'Debut de la fenetre hebdo.' },
  { token: '{{weekEnd}}', scope: 'weekly', description: 'Fin de la fenetre hebdo.' },
  { token: '{{volume}}', scope: 'weekly', description: 'Repas/workouts/exercices logges sur 7 jours.' },
  { token: '{{weeklyMacros}}', scope: 'weekly', description: 'Resume macros cumulees sur 7 jours.' },
  { token: '{{weights}}', scope: 'weekly', description: 'Historique poids/BF.' },
  { token: '{{weeklyRecovery}}', scope: 'weekly', description: 'Lignes recovery exactes par jour.' },
  { token: '{{syncContext}}', scope: 'daily+weekly', description: 'Contexte mono-user multi-device: Drive, provider sante, dernier import.' },
];

export const applyTemplate = (template, context) => (
  Object.entries(context).reduce((acc, [key, value]) => acc.replace(new RegExp(`{{${key}}}`, 'g'), value), template)
);

export const weekWindow = (selectedDate) => {
  const end = parseIso(selectedDate);
  const start = parseIso(selectedDate);
  start.setDate(end.getDate() - 6);
  return { start, end };
};

export const parseIso = (isoDate) => {
  const [year, month, day] = `${isoDate || ''}`.split('-').map((chunk) => Number.parseInt(chunk, 10));
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

export const toIso = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const buildIsoRange = (startIso, endIso) => {
  const first = parseIso(startIso);
  const second = parseIso(endIso);
  const start = first <= second ? first : second;
  const end = first <= second ? second : first;
  const days = [];
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    days.push(toIso(new Date(day)));
  }
  return {
    start: toIso(start),
    end: toIso(end),
    days,
  };
};

const formatTrainingLine = (session) => {
  if (Array.isArray(session.setDetails) && session.setDetails.length > 0) {
    const repsTotal = session.setDetails.reduce((acc, setRow) => acc + Number(setRow.reps || 0), 0);
    const topDisplayed = session.setDetails.reduce((max, setRow) => Math.max(max, Number(setRow.loadDisplayed || 0)), 0);
    const topEstimated = session.setDetails.reduce((max, setRow) => Math.max(max, Number(setRow.loadEstimated || 0)), 0);
    const topEstimatedText = topEstimated > 0 ? ` | reel estime ~${topEstimated}kg` : '';
    return `- ${session.exerciseName}: ${session.setDetails.length} series, ${repsTotal} reps, top ${topDisplayed}kg${topEstimatedText}`;
  }
  return `- ${session.exerciseName}: ${session.sets}x${session.reps} @ ${session.load}kg, RIR ${session.rir || '-'}`;
};

const normalizedSetDetails = (session) => {
  if (Array.isArray(session.setDetails) && session.setDetails.length > 0) {
    return session.setDetails.map((setRow, index) => ({
      set: Number(setRow.setIndex || (index + 1)),
      reps: Number(setRow.reps || 0),
      load_displayed_kg: Number(setRow.loadDisplayed || setRow.loadEstimated || 0),
      load_estimated_kg:
        setRow.loadEstimated === null || setRow.loadEstimated === undefined
          ? null
          : Number(setRow.loadEstimated || 0),
    }));
  }
  const sets = Math.max(1, Number(session.sets || 0));
  const reps = Number(session.reps || 0);
  const load = Number(session.load || 0);
  return Array.from({ length: sets }).map((_, index) => ({
    set: index + 1,
    reps,
    load_displayed_kg: load,
    load_estimated_kg: null,
  }));
};

const summarizeSetDetails = (setDetails) => {
  const topLoad = setDetails.reduce((max, row) => Math.max(max, Number(row.load_displayed_kg || row.load_estimated_kg || 0)), 0);
  const repsTotal = setDetails.reduce((acc, row) => acc + Number(row.reps || 0), 0);
  const volume = setDetails.reduce((acc, row) => acc + Number(row.reps || 0) * Number(row.load_displayed_kg || row.load_estimated_kg || 0), 0);
  const e1rm = setDetails.reduce((max, row) => {
    const load = Number(row.load_displayed_kg || row.load_estimated_kg || 0);
    const reps = Math.max(1, Number(row.reps || 1));
    return Math.max(max, load * (1 + reps / 30));
  }, 0);
  return { topLoad, repsTotal, volume, e1rm };
};

const nutritionLogHasValues = (log) => (
  Number(log?.caloriesEstimated || 0) > 0
  || Number(log?.proteinG || 0) > 0
  || Number(log?.carbsG || 0) > 0
  || Number(log?.fatG || 0) > 0
);

const nullIfNonPositive = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const resolveExportSource = (provider, fallback = null) => `${provider || fallback || ''}`.trim() || null;

const exactValueOrNull = (hasExactSource, value, options = {}) => {
  if (!hasExactSource) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (options.allowZero === false && numeric <= 0) return null;
  return numeric;
};

export const truncatePreview = (value, limit = 96) => {
  const compact = `${value || ''}`.replace(/\s+/g, ' ').trim();
  if (!compact) return '-';
  return compact.length <= limit ? compact : `${compact.slice(0, limit).trimEnd()}...`;
};

export const buildWeeklyData = (state, selectedDate) => {
  const { start, end } = weekWindow(selectedDate);
  const days = isoWindow(selectedDate, 7);
  const daySet = new Set(days);
  const entries = state.entries.filter((entry) => daySet.has(entry.date));
  const sessions = getSessionsForWindow(state, days);
  const workouts = getWorkoutsForWindow(state, days);
  const metrics = state.metrics.filter((entry) => daySet.has(entry.date));
  const logs = state.dailyLogs.filter((entry) => daySet.has(entry.date));

  const macrosFromEntries = entries.reduce(
    (acc, entry) => ({
      kcal: acc.kcal + entry.macros.kcal,
      protein: acc.protein + entry.macros.protein,
      carbs: acc.carbs + entry.macros.carbs,
      fat: acc.fat + entry.macros.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const macrosFromLogs = logs.reduce(
    (acc, log) => ({
      kcal: acc.kcal + Number(log.caloriesEstimated || 0),
      protein: acc.protein + Number(log.proteinG || 0),
      carbs: acc.carbs + Number(log.carbsG || 0),
      fat: acc.fat + Number(log.fatG || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    entries,
    mealCount: countLoggedMealsForWindow(entries),
    sessions,
    workouts,
    metrics,
    logs,
    macros: macrosFromEntries.kcal > 0 ? macrosFromEntries : macrosFromLogs,
    start: toIso(start),
    end: toIso(end),
  };
};

export const buildPromptContexts = ({
  state,
  entriesForSelectedDay,
  sessionsForSelectedDay,
  metricsForSelectedDay,
  dailyLogForSelectedDay,
  dayMacros,
  limits,
  drivePrefs,
  driveConfig,
  weeklyData,
}) => {
  const nutritionLines = entriesForSelectedDay.map((entry) => `- ${entry.meal}: ${entry.foodName} (${entry.grams}g) => ${entry.macros.kcal.toFixed(0)} kcal`).join('\n') || '- Aucun repas logge';
  const trainingLines = sessionsForSelectedDay.map((session) => formatTrainingLine(session)).join('\n') || (dailyLogForSelectedDay?.training ? `- ${dailyLogForSelectedDay.training}` : '- Aucune session');
  const effectiveMacros = dayMacros.kcal > 0 ? dayMacros : {
    kcal: Number(dailyLogForSelectedDay?.caloriesEstimated || 0),
    protein: Number(dailyLogForSelectedDay?.proteinG || 0),
    carbs: Number(dailyLogForSelectedDay?.carbsG || 0),
    fat: Number(dailyLogForSelectedDay?.fatG || 0),
  };

  const goals = `${state.goals.kcal} kcal, P ${state.goals.protein}g, G ${state.goals.carbs}g, L ${state.goals.fat}g`;
  const limitsText = `kcal ${limits.kcal?.min ?? 0}-${limits.kcal?.max ?? 0}, P ${limits.protein?.min ?? 0}-${limits.protein?.max ?? 0}g, G ${limits.carbs?.min ?? 0}-${limits.carbs?.max ?? 0}g, L ${limits.fat?.min ?? 0}-${limits.fat?.max ?? 0}g`;
  const selectedHealth = getHealthSnapshotForDate(state, state.selectedDate, { carryForward: false });
  const syncContext = [
    `Drive: ${describeDriveSyncTarget(drivePrefs.mode, driveConfig)}`,
    `Health: ${state.healthSync?.provider || 'health-connect'}`,
    `Dernier import sante: ${state.healthSync?.lastImportAt || 'aucun'}`,
    'Mono-user multi-device: oui',
  ].join(' | ');

  return {
    daily: {
      date: state.selectedDate,
      goals: `${goals} | Seuils actifs: ${limitsText}`,
      measures: `poids ${metricsForSelectedDay?.weight ?? '-'} kg, BF ${metricsForSelectedDay?.bodyFat ?? '-'}%, muscle ${metricsForSelectedDay?.muscleMass ?? '-'} kg`,
      recovery: `sommeil ${selectedHealth.sleepHours || '-'}h, tension ${selectedHealth.bloodPressure || '-'}, FC repos ${selectedHealth.restingBpm || '-'}, FC moy ${selectedHealth.avgHeartRate || '-'}, HRV ${selectedHealth.hrvMs || '-'}, O2 ${selectedHealth.oxygenSaturationPercent || '-'}%, glycemie ${selectedHealth.bloodGlucoseMgDl || '-'} mg/dL, pas ${selectedHealth.steps || '-'}, actives ${selectedHealth.activeMinutes || 0} min, fatigue SNC ${dailyLogForSelectedDay?.fatigueNervousSystem ?? '-'} /10`,
      macros: `${Number(effectiveMacros.kcal || 0).toFixed(0)} kcal | P ${Number(effectiveMacros.protein || 0).toFixed(1)} g | G ${Number(effectiveMacros.carbs || 0).toFixed(1)} g | L ${Number(effectiveMacros.fat || 0).toFixed(1)} g`,
      syncContext,
      nutrition: nutritionLines,
      training: trainingLines,
    },
    weekly: {
      weekStart: weeklyData.start,
      weekEnd: weeklyData.end,
      goals: `${goals} | Seuils actifs: ${limitsText}`,
      volume: `${weeklyData.mealCount} repas logges, ${weeklyData.workouts.length} workouts, ${weeklyData.sessions.length} exercices`,
      weeklyMacros: `${Number(weeklyData.macros.kcal || 0).toFixed(0)} kcal | P ${Number(weeklyData.macros.protein || 0).toFixed(1)} g | G ${Number(weeklyData.macros.carbs || 0).toFixed(1)} g | L ${Number(weeklyData.macros.fat || 0).toFixed(1)} g`,
      syncContext,
      weights: weeklyData.metrics.map((metric) => `${metric.date}: ${metric.weight}kg / BF ${metric.bodyFat}%`).join('\n') || '- Pas de mesures',
      weeklyRecovery: isoWindow(state.selectedDate, 7).map((date) => {
        const health = getHealthSnapshotForDate(state, date, { carryForward: false });
        const dayLog = weeklyData.logs.find((entry) => entry.date === date);
        return `${date}: sommeil ${health.sleepHours || '-'}h, pas ${health.steps || '-'} (${resolveExportSource(health.exactSources?.activity?.provider, 'missing') || 'missing'}), FC repos ${health.restingBpm || '-'}, FC moy ${health.avgHeartRate || '-'}, HRV ${health.hrvMs || '-'}, tension ${health.bloodPressure || '-'}, O2 ${health.oxygenSaturationPercent || '-'}%, gly ${health.bloodGlucoseMgDl || '-'} mg/dL, fatigue ${dayLog?.fatigueNervousSystem ?? '-'} /10`;
      }).join('\n') || '- Pas de donnees recovery',
    },
  };
};

export const buildPeriodExport = ({ state, periodRange, limits }) => {
  const daySet = new Set(periodRange.days);
  const entries = (state.entries || []).filter((entry) => daySet.has(entry.date)).sort((a, b) => `${a.date}`.localeCompare(`${b.date}`));
  const sessions = getSessionsForWindow(state, periodRange.days).sort((a, b) => `${a.date}`.localeCompare(`${b.date}`));
  const metrics = (state.metrics || []).filter((entry) => daySet.has(entry.date)).sort((a, b) => `${a.date}`.localeCompare(`${b.date}`));
  const logs = (state.dailyLogs || []).filter((entry) => daySet.has(entry.date)).sort((a, b) => `${a.date}`.localeCompare(`${b.date}`));

  const entriesByDate = new Map();
  const sessionsByDate = new Map();
  const metricsByDate = new Map(metrics.map((row) => [row.date, row]));
  const logsByDate = new Map(logs.map((row) => [row.date, row]));

  entries.forEach((entry) => {
    if (!entriesByDate.has(entry.date)) entriesByDate.set(entry.date, []);
    entriesByDate.get(entry.date).push(entry);
  });
  sessions.forEach((session) => {
    if (!sessionsByDate.has(session.date)) sessionsByDate.set(session.date, []);
    sessionsByDate.get(session.date).push(session);
  });

  const daily = periodRange.days.map((date) => {
    const dayEntries = entriesByDate.get(date) || [];
    const daySessions = sessionsByDate.get(date) || [];
    const dayWorkouts = getWorkoutsForWindow(state, [date]);
    const dayMetrics = metricsByDate.get(date) || null;
    const dayLog = logsByDate.get(date) || null;
    const health = getHealthSnapshotForDate(state, date, { carryForward: false });
    const nutritionLogged = dayEntries.length > 0 || nutritionLogHasValues(dayLog);
    const activitySource = resolveExportSource(health.exactSources?.activity?.provider);
    const sleepSource = resolveExportSource(health.exactSources?.sleep?.provider);
    const vitalsSource = resolveExportSource(health.exactSources?.vitals?.provider);
    const metricsSource = resolveExportSource(dayMetrics?.healthSource?.provider, dayMetrics ? 'manual' : null);

    const entryMacros = dayEntries.reduce(
      (acc, entry) => ({
        kcal: acc.kcal + Number(entry.macros?.kcal || 0),
        protein_g: acc.protein_g + Number(entry.macros?.protein || 0),
        carbs_g: acc.carbs_g + Number(entry.macros?.carbs || 0),
        fat_g: acc.fat_g + Number(entry.macros?.fat || 0),
      }),
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    const logMacros = {
      kcal: Number(dayLog?.caloriesEstimated || 0),
      protein_g: Number(dayLog?.proteinG || 0),
      carbs_g: Number(dayLog?.carbsG || 0),
      fat_g: Number(dayLog?.fatG || 0),
    };
    const effectiveMacros = dayEntries.length > 0 ? entryMacros : logMacros;

    const nutritionEntries = dayEntries.map((entry) => ({
      meal: entry.meal || 'autre',
      food_name: entry.foodName || '',
      grams: Number(entry.grams || 0),
      kcal: Number(entry.macros?.kcal || 0),
      protein_g: Number(entry.macros?.protein || 0),
      carbs_g: Number(entry.macros?.carbs || 0),
      fat_g: Number(entry.macros?.fat || 0),
    }));

    const trainingWorkouts = dayWorkouts.map((workout, workoutIndex) => ({
      index: workoutIndex + 1,
      workout_id: workout.workoutId,
      title: workout.title,
      source: workout.source || 'manual',
      duration_min: nullIfNonPositive(workout.durationMin),
      exercise_count: workout.exerciseCount,
      primary_muscles: rankWorkedMuscleGroups(workout.exercises, state.exerciseMuscleOverrides, { limit: 3 }).map((row) => ({
        group: row.group,
        label: row.label,
        score: row.score,
      })),
      exercises: workout.exercises.map((session, index) => {
        const setDetails = normalizedSetDetails(session);
        const summary = summarizeSetDetails(setDetails);
        return {
          index: index + 1,
          exercise_id: session.exerciseId || null,
          exercise_name: session.exerciseName || 'Exercice',
          category: session.category || '',
          equipment: session.equipment || '',
          source: session.source || 'manual',
          sets_count: setDetails.length,
          reps_total: Number(summary.repsTotal.toFixed(0)),
          top_load_kg: Number(summary.topLoad.toFixed(1)),
          estimated_1rm_kg: Number(summary.e1rm.toFixed(1)),
          volume_kg_reps: Number(summary.volume.toFixed(1)),
          rir: session.rir ?? null,
          notes: session.notes || '',
          sets: setDetails,
        };
      }),
    }));

    const trainingTotals = trainingWorkouts.reduce((acc, workout) => ({
      workouts: acc.workouts + 1,
      exercises: acc.exercises + Number(workout.exercise_count || 0),
      sets: acc.sets + workout.exercises.reduce((sum, exercise) => sum + Number(exercise.sets_count || 0), 0),
      reps: acc.reps + workout.exercises.reduce((sum, exercise) => sum + Number(exercise.reps_total || 0), 0),
      volume_kg_reps: acc.volume_kg_reps + workout.exercises.reduce((sum, exercise) => sum + Number(exercise.volume_kg_reps || 0), 0),
    }), {
      workouts: 0,
      exercises: 0,
      sets: 0,
      reps: 0,
      volume_kg_reps: 0,
    });

    const dayQualityFlags = [];
    if (!nutritionLogged) dayQualityFlags.push('nutrition_missing');
    if (!activitySource && Number(health.steps || 0) === 0) dayQualityFlags.push('activity_source_missing');

    return {
      date,
      metrics: {
        weight_kg: nullIfNonPositive(dayMetrics?.weight),
        body_fat_percent: nullIfNonPositive(dayMetrics?.bodyFat),
        muscle_mass_kg: nullIfNonPositive(dayMetrics?.muscleMass),
        visceral_fat: nullIfNonPositive(dayMetrics?.visceralFat),
        water_percent: nullIfNonPositive(dayMetrics?.water),
        tension: health.bloodPressure || null,
        sleep_hours: exactValueOrNull(Boolean(sleepSource), health.sleepHours, { allowZero: false }),
        fatigue_1_10: nullIfNonPositive(dayLog?.fatigueNervousSystem),
        sources: {
          weight: nullIfNonPositive(dayMetrics?.weight) !== null ? metricsSource : null,
          body_fat: nullIfNonPositive(dayMetrics?.bodyFat) !== null ? metricsSource : null,
          muscle_mass: nullIfNonPositive(dayMetrics?.muscleMass) !== null ? metricsSource : null,
        },
      },
      recovery: {
        sleep_hours: exactValueOrNull(Boolean(sleepSource), health.sleepHours, { allowZero: false }),
        blood_pressure: health.bloodPressure || null,
        resting_bpm: exactValueOrNull(Boolean(vitalsSource), health.restingBpm, { allowZero: false }),
        avg_heart_rate_bpm: exactValueOrNull(Boolean(vitalsSource), health.avgHeartRate, { allowZero: false }),
        hrv_ms: exactValueOrNull(Boolean(vitalsSource), health.hrvMs, { allowZero: false }),
        oxygen_saturation_percent: exactValueOrNull(Boolean(vitalsSource), health.oxygenSaturationPercent, { allowZero: false }),
        blood_glucose_mg_dl: exactValueOrNull(Boolean(vitalsSource), health.bloodGlucoseMgDl, { allowZero: false }),
        fatigue_nervous_system_1_10: nullIfNonPositive(dayLog?.fatigueNervousSystem),
        doms_legs_1_10: nullIfNonPositive(dayLog?.domsLegs),
        mood_1_10: nullIfNonPositive(dayLog?.mood),
        steps: exactValueOrNull(Boolean(activitySource), health.steps),
        active_minutes: exactValueOrNull(Boolean(activitySource), health.activeMinutes),
        active_calories: exactValueOrNull(Boolean(activitySource), health.caloriesActive),
        source: {
          activity: activitySource,
          sleep: sleepSource,
          vitals: vitalsSource,
        },
        notes: dayLog?.notes || '',
      },
      nutrition_logged: nutritionLogged,
      nutrition: nutritionLogged ? {
        source: dayEntries.length > 0 ? 'entries' : 'daily_log',
        totals: {
          kcal: Number(effectiveMacros.kcal.toFixed(0)),
          protein_g: Number(effectiveMacros.protein_g.toFixed(1)),
          carbs_g: Number(effectiveMacros.carbs_g.toFixed(1)),
          fat_g: Number(effectiveMacros.fat_g.toFixed(1)),
        },
        entries: nutritionEntries,
      } : null,
      training: {
        totals: {
          workouts: trainingTotals.workouts,
          exercises: trainingTotals.exercises,
          sets: trainingTotals.sets,
          reps: trainingTotals.reps,
          volume_kg_reps: Number(trainingTotals.volume_kg_reps.toFixed(1)),
        },
        primary_muscles: rankWorkedMuscleGroups(daySessions, state.exerciseMuscleOverrides, { limit: 3 }).map((row) => ({
          group: row.group,
          label: row.label,
          score: row.score,
        })),
        workouts: trainingWorkouts,
      },
      quality_flags: dayQualityFlags,
    };
  });

  const exactStepValues = daily.map((day) => day.recovery?.steps).filter((value) => value !== null && value !== undefined);
  const repeatedStepsFlag = exactStepValues.length >= 3 && new Set(exactStepValues).size === 1
    ? `repeated_steps_exact:${exactStepValues[0]}`
    : null;
  if (repeatedStepsFlag) {
    daily.forEach((day) => {
      day.quality_flags = [...(day.quality_flags || []), repeatedStepsFlag];
    });
  }

  const summary = daily.reduce((acc, day) => {
    const nutritionKcal = Number(day.nutrition?.totals?.kcal || 0);
    const hasTraining = Number(day.training?.totals?.workouts || 0) > 0;
    return {
      days: acc.days + 1,
      days_with_nutrition: acc.days_with_nutrition + (day.nutrition_logged ? 1 : 0),
      days_with_training: acc.days_with_training + (hasTraining ? 1 : 0),
      kcal_total: acc.kcal_total + nutritionKcal,
      protein_total_g: acc.protein_total_g + Number(day.nutrition?.totals?.protein_g || 0),
      carbs_total_g: acc.carbs_total_g + Number(day.nutrition?.totals?.carbs_g || 0),
      fat_total_g: acc.fat_total_g + Number(day.nutrition?.totals?.fat_g || 0),
      workouts_total: acc.workouts_total + Number(day.training?.totals?.workouts || 0),
      exercise_blocks_total: acc.exercise_blocks_total + Number(day.training?.totals?.exercises || 0),
      sets_total: acc.sets_total + Number(day.training.totals.sets || 0),
      reps_total: acc.reps_total + Number(day.training.totals.reps || 0),
      volume_total: acc.volume_total + Number(day.training.totals.volume_kg_reps || 0),
    };
  }, {
    days: 0,
    days_with_nutrition: 0,
    days_with_training: 0,
    kcal_total: 0,
    protein_total_g: 0,
    carbs_total_g: 0,
    fat_total_g: 0,
    workouts_total: 0,
    exercise_blocks_total: 0,
    sets_total: 0,
    reps_total: 0,
    volume_total: 0,
  });

  const firstWeight = daily.find((day) => day.metrics?.weight_kg !== null && day.metrics?.weight_kg !== undefined)?.metrics?.weight_kg ?? null;
  const lastWeight = [...daily].reverse().find((day) => day.metrics?.weight_kg !== null && day.metrics?.weight_kg !== undefined)?.metrics?.weight_kg ?? null;

  const payload = {
    export_version: 4,
    generated_at: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    date_range: {
      start: periodRange.start,
      end: periodRange.end,
      days: periodRange.days.length,
    },
    goals: state.goals,
    thresholds: limits,
    summary: {
      ...summary,
      kcal_avg: summary.days_with_nutrition > 0 ? Number((summary.kcal_total / summary.days_with_nutrition).toFixed(0)) : null,
      protein_avg_g: summary.days_with_nutrition > 0 ? Number((summary.protein_total_g / summary.days_with_nutrition).toFixed(1)) : null,
      carbs_avg_g: summary.days_with_nutrition > 0 ? Number((summary.carbs_total_g / summary.days_with_nutrition).toFixed(1)) : null,
      fat_avg_g: summary.days_with_nutrition > 0 ? Number((summary.fat_total_g / summary.days_with_nutrition).toFixed(1)) : null,
      weight_start_kg: firstWeight,
      weight_end_kg: lastWeight,
      weight_delta_kg: firstWeight !== null && lastWeight !== null ? Number((lastWeight - firstWeight).toFixed(1)) : null,
      quality_flags: repeatedStepsFlag ? [repeatedStepsFlag] : [],
    },
    daily,
  };

  const payloadJson = JSON.stringify(payload, null, 2);
  const prompt = [
    'Tu es mon coach nutrition + home gym et tu analyses cette periode de suivi.',
    `Periode: ${periodRange.start} â†’ ${periodRange.end}.`,
    'Utilise uniquement le JSON ci-dessous.',
    'Retour attendu:',
    '1) Tendances cles (poids, calories/macros, charge/volume training).',
    '2) Points forts et points a corriger.',
    '3) Plan 7 jours: cible kcal/proteines + split training + priorites.',
    '4) Liste des donnees manquantes ou incoherentes.',
    '',
    'JSON:',
    payloadJson,
  ].join('\n');

  return {
    payload,
    payloadJson,
    prompt,
  };
};
