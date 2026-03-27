const STORAGE_KEY = 'nutri-critical-local-mutation-v1';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const normalizeObject = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

const normalizeSetDetails = (value) => (
  Array.isArray(value)
    ? value
      .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
      .map((row, index) => ({
        setIndex: Number.parseInt(row.setIndex, 10) || (index + 1),
        reps: Number.parseFloat(row.reps) || 0,
        loadDisplayed: Number.parseFloat(row.loadDisplayed) || 0,
        loadEstimated:
          row.loadEstimated === null || row.loadEstimated === undefined || row.loadEstimated === ''
            ? null
            : Number.parseFloat(row.loadEstimated) || 0,
        loggedAt: `${row.loggedAt || ''}`.trim(),
        elapsedSinceWorkoutStartSec:
          row.elapsedSinceWorkoutStartSec === null || row.elapsedSinceWorkoutStartSec === undefined || row.elapsedSinceWorkoutStartSec === ''
            ? null
            : Number.parseInt(row.elapsedSinceWorkoutStartSec, 10) || 0,
        restSincePreviousSetSec:
          row.restSincePreviousSetSec === null || row.restSincePreviousSetSec === undefined || row.restSincePreviousSetSec === ''
            ? null
            : Number.parseInt(row.restSincePreviousSetSec, 10) || 0,
        timeLabel: `${row.timeLabel || ''}`.trim(),
        setNote: `${row.setNote || ''}`.trim(),
      }))
    : []
);

const normalizeSessions = (value) => (
  Array.isArray(value)
    ? value
      .filter((session) => session && typeof session === 'object' && !Array.isArray(session))
      .map((session) => ({
        ...normalizeObject(session),
        id: `${session.id || ''}`.trim(),
        date: `${session.date || ''}`.trim(),
        workoutId: `${session.workoutId || session.sessionGroupId || ''}`.trim(),
        workoutLabel: `${session.workoutLabel || session.sessionGroupLabel || ''}`.trim(),
        sessionGroupId: `${session.sessionGroupId || session.workoutId || ''}`.trim(),
        sessionGroupLabel: `${session.sessionGroupLabel || session.workoutLabel || ''}`.trim(),
        exerciseName: `${session.exerciseName || ''}`.trim(),
        notes: `${session.notes || ''}`.trim(),
        workoutNotes: `${session.workoutNotes || ''}`.trim(),
        setDetails: normalizeSetDetails(session.setDetails),
      }))
    : []
);

const normalizePendingWorkout = (value) => {
  const normalized = normalizeObject(value, null);
  if (!normalized) return null;
  const sessions = normalizeSessions(normalized.sessions);
  return {
    workoutId: `${normalized.workoutId || ''}`.trim(),
    workoutLabel: `${normalized.workoutLabel || ''}`.trim(),
    date: `${normalized.date || ''}`.trim(),
    durationMin:
      normalized.durationMin === null || normalized.durationMin === undefined || normalized.durationMin === ''
        ? null
        : Number.parseInt(normalized.durationMin, 10) || 0,
    sessionCount: Number.parseInt(normalized.sessionCount, 10) || sessions.length,
    sessions,
  };
};

const normalizePendingCriticalLocalMutation = (value) => {
  const normalized = normalizeObject(value, null);
  if (!normalized) return null;
  const updatedAt = `${normalized.updatedAt || ''}`.trim();
  if (!updatedAt) return null;
  return {
    kind: `${normalized.kind || 'unknown'}`.trim() || 'unknown',
    updatedAt,
    createdAt: `${normalized.createdAt || updatedAt}`.trim() || updatedAt,
    source: `${normalized.source || ''}`.trim(),
    workout: normalizePendingWorkout(normalized.workout),
  };
};

export const readPendingCriticalLocalMutation = () => {
  if (!canUseStorage()) return null;
  try {
    return normalizePendingCriticalLocalMutation(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'),
    );
  } catch {
    return null;
  }
};

export const hasPendingCriticalLocalMutation = () => Boolean(readPendingCriticalLocalMutation()?.updatedAt);

export const markPendingCriticalLocalMutation = (payload = {}) => {
  if (!canUseStorage()) return normalizePendingCriticalLocalMutation(payload);
  const normalized = normalizePendingCriticalLocalMutation({
    ...payload,
    createdAt: payload.createdAt || new Date().toISOString(),
  });
  if (!normalized) return null;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

export const clearPendingCriticalLocalMutation = (confirmedUpdatedAt = '') => {
  const current = readPendingCriticalLocalMutation();
  if (!current || !canUseStorage()) return null;
  const normalizedConfirmedUpdatedAt = `${confirmedUpdatedAt || ''}`.trim();
  if (normalizedConfirmedUpdatedAt && `${current.updatedAt || ''}` > normalizedConfirmedUpdatedAt) {
    return current;
  }
  window.localStorage.removeItem(STORAGE_KEY);
  return null;
};

export const shouldBlockIncomingSyncForPendingCriticalMutation = (localUpdatedAt = '') => {
  const pending = readPendingCriticalLocalMutation();
  if (!pending?.updatedAt) return false;
  const normalizedLocalUpdatedAt = `${localUpdatedAt || ''}`.trim();
  return !normalizedLocalUpdatedAt || pending.updatedAt >= normalizedLocalUpdatedAt;
};

export const CRITICAL_LOCAL_MUTATION_STORAGE_KEY = STORAGE_KEY;
