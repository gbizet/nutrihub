const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const parseIsoDate = (isoDate) => {
  const [y, m, d] = `${isoDate || ''}`.split('-').map((chunk) => Number.parseInt(chunk, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
};

export const toIsoDate = (date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const isoWindow = (selectedDate, days) => {
  const end = parseIsoDate(selectedDate);
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toIsoDate(d));
  }
  return out;
};

export const getDayLog = (state, isoDate) =>
  (state?.dailyLogs || []).find((entry) => entry.date === isoDate) || null;

const normalizeMealKey = (entry, includeDate = false) => {
  const meal = `${entry?.meal || 'autre'}`.trim() || 'autre';
  if (!includeDate) return meal;
  const date = `${entry?.date || ''}`.trim();
  return `${date}::${meal}`;
};

export const countLoggedMeals = (entries) => {
  const keys = new Set(
    (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => normalizeMealKey(entry)),
  );
  return keys.size;
};

export const countLoggedMealsForWindow = (entries) => {
  const keys = new Set(
    (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => normalizeMealKey(entry, true)),
  );
  return keys.size;
};

export const getSessionSetDetails = (session) => {
  if (Array.isArray(session?.setDetails) && session.setDetails.length > 0) {
    return session.setDetails.map((row, index) => ({
      setIndex: Number(row?.setIndex || index + 1),
      reps: Number(row?.reps || 0),
      loadDisplayed: Number(row?.loadDisplayed || row?.loadEstimated || 0),
      loadEstimated:
        row?.loadEstimated === null || row?.loadEstimated === undefined
          ? null
          : Number(row?.loadEstimated || 0),
    }));
  }
  const sets = Math.max(1, Number(session?.sets || 0));
  const reps = Number(session?.reps || 0);
  const load = Number(session?.load || 0);
  return Array.from({ length: sets }).map((_, index) => ({
    setIndex: index + 1,
    reps,
    loadDisplayed: load,
    loadEstimated: null,
  }));
};

export const getWorkoutKeyForSession = (session) =>
  `${session?.workoutId || session?.sessionGroupId || `${session?.date || 'undated'}::${session?.workoutLabel || session?.sessionGroupLabel || session?.sessionTitle || session?.exerciseName || session?.id || 'workout'}`}`;

export const groupSessionsIntoWorkouts = (sessions = []) => {
  const map = new Map();
  (Array.isArray(sessions) ? sessions : []).forEach((session, index) => {
    const workoutId = getWorkoutKeyForSession(session);
    const workoutLabel = `${session?.workoutLabel || session?.sessionGroupLabel || session?.sessionTitle || session?.date || 'Seance'}`.trim() || 'Seance';
    const date = `${session?.date || ''}`.trim();
    if (!map.has(workoutId)) {
      map.set(workoutId, {
        id: workoutId,
        workoutId,
        date,
        title: workoutLabel,
        source: session?.workoutSource || session?.source || 'manual',
        durationMin: Number(session?.durationMin || session?.session_duration_min || 0),
        exercises: [],
        sortIndex: index,
      });
    }
    const workout = map.get(workoutId);
    workout.date = workout.date || date;
    workout.durationMin = Math.max(Number(workout.durationMin || 0), Number(session?.durationMin || session?.session_duration_min || 0));
    workout.exercises.push(session);
  });

  return Array.from(map.values())
    .map((workout) => {
      const exercises = workout.exercises.slice().sort((a, b) => `${a?.exerciseName || ''}`.localeCompare(`${b?.exerciseName || ''}`));
      const totals = exercises.reduce((acc, session) => {
        const setDetails = getSessionSetDetails(session);
        const reps = setDetails.reduce((sum, row) => sum + Number(row.reps || 0), 0);
        const volume = setDetails.reduce((sum, row) => sum + Number(row.reps || 0) * Number(row.loadDisplayed || row.loadEstimated || 0), 0);
        return {
          exercises: acc.exercises + 1,
          sets: acc.sets + setDetails.length,
          reps: acc.reps + reps,
          volume: acc.volume + volume,
        };
      }, {
        exercises: 0,
        sets: 0,
        reps: 0,
        volume: 0,
      });
      return {
        ...workout,
        exercises,
        exerciseCount: totals.exercises,
        totalSets: totals.sets,
        totalReps: totals.reps,
        totalVolume: totals.volume,
      };
    })
    .sort((a, b) => `${b.date || ''}`.localeCompare(`${a.date || ''}`) || Number(a.sortIndex || 0) - Number(b.sortIndex || 0));
};

const isCompletedCycleLog = (row) => Boolean(row?.done) || toNum(row?.load) > 0;

const cycleLogToSessionLike = (row) => ({
  id: row.id,
  date: row.date,
  exerciseId: `cycle-${row.id}`,
  exerciseName: row.exerciseName,
  equipment: 'Cycle',
  category: row.cycleName ? `Cycle:${row.cycleName}` : 'Cycle',
  sets: toNum(row.sets),
  reps: toNum(row.reps),
  load: toNum(row.load),
  rir: null,
  notes: row.cycleName || '',
  source: 'cycle-log',
  done: Boolean(row.done),
});

export const getSessionsForDate = (state, isoDate) => {
  const baseSessions = (state?.sessions || []).filter((entry) => entry.date === isoDate);
  const cycleSessions = (state?.cycleLogs || [])
    .filter((row) => row.date === isoDate)
    .filter((row) => isCompletedCycleLog(row))
    .map(cycleLogToSessionLike);
  return [...baseSessions, ...cycleSessions];
};

export const getSessionsForWindow = (state, dates) => {
  const set = new Set(dates);
  const baseSessions = (state?.sessions || []).filter((entry) => set.has(entry.date));
  const cycleSessions = (state?.cycleLogs || [])
    .filter((row) => set.has(row.date))
    .filter((row) => isCompletedCycleLog(row))
    .map(cycleLogToSessionLike);
  return [...baseSessions, ...cycleSessions];
};

export const getWorkoutsForDate = (state, isoDate) => groupSessionsIntoWorkouts(getSessionsForDate(state, isoDate));

export const getWorkoutsForWindow = (state, dates) => groupSessionsIntoWorkouts(getSessionsForWindow(state, dates));

export const getActiveInjuriesForDate = (state, isoDate) =>
  (state?.injuries || [])
    .filter((row) => row.date <= isoDate)
    .sort((a, b) => b.date.localeCompare(a.date));

export const getCycleObjectiveForDate = (state, isoDate) => {
  const cycleLogs = (state?.cycleLogs || []).filter((row) => row.date <= isoDate);
  if (cycleLogs.length === 0) return null;
  const latest = [...cycleLogs].sort((a, b) => b.date.localeCompare(a.date))[0];
  const cycle = (state?.cycles || []).find((x) => x.id === latest.cycleId);
  if (!cycle) return null;
  const firstLogDate = cycleLogs
    .filter((x) => x.cycleId === cycle.id)
    .sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  if (!firstLogDate) return { cycleName: cycle.name, goal: cycle.goal, dayIndex: 1, totalDays: cycle.days || 28 };
  const diffMs = parseIsoDate(isoDate).getTime() - parseIsoDate(firstLogDate).getTime();
  const dayIndex = Math.max(1, Math.floor(diffMs / (24 * 3600 * 1000)) + 1);
  return {
    cycleName: cycle.name,
    goal: cycle.goal,
    dayIndex,
    totalDays: toNum(cycle.days) || 28,
  };
};
