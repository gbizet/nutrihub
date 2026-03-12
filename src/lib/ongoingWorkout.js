const ONGOING_WORKOUT_STORAGE_KEY = 'nutri-ongoing-workout-v1';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const toNonNegativeNumber = (value, fallback = 0) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

export const buildEmptyCurrentSetDraft = () => ({
  reps: '',
  load: '',
  setNote: '',
  editingSetIndex: null,
});

const normalizeCurrentSetDraft = (draft = {}) => ({
  reps: `${draft?.reps ?? ''}`,
  load: `${draft?.load ?? ''}`,
  setNote: `${draft?.setNote ?? draft?.timeLabel ?? ''}`.trim(),
  editingSetIndex:
    draft?.editingSetIndex === null || draft?.editingSetIndex === undefined || draft?.editingSetIndex === ''
      ? null
      : Math.max(1, Number.parseInt(draft.editingSetIndex, 10) || 1),
});

const normalizeSetDetails = (setDetails = []) => (
  (Array.isArray(setDetails) ? setDetails : [])
    .map((row, index) => {
      const setIndex = Number.parseInt(row?.setIndex, 10);
      return {
        setIndex: Number.isFinite(setIndex) && setIndex > 0 ? setIndex : index + 1,
        reps: toNonNegativeNumber(row?.reps, 0),
        loadDisplayed: toNonNegativeNumber(row?.loadDisplayed, 0),
        loadEstimated:
          row?.loadEstimated === null || row?.loadEstimated === undefined || row?.loadEstimated === ''
            ? null
            : toNonNegativeNumber(row?.loadEstimated, 0),
        loggedAt: `${row?.loggedAt ?? ''}`.trim(),
        elapsedSinceWorkoutStartSec:
          row?.elapsedSinceWorkoutStartSec === null || row?.elapsedSinceWorkoutStartSec === undefined || row?.elapsedSinceWorkoutStartSec === ''
            ? null
            : toNonNegativeNumber(row?.elapsedSinceWorkoutStartSec, 0),
        restSincePreviousSetSec:
          row?.restSincePreviousSetSec === null || row?.restSincePreviousSetSec === undefined || row?.restSincePreviousSetSec === ''
            ? null
            : toNonNegativeNumber(row?.restSincePreviousSetSec, 0),
        timeLabel: `${row?.timeLabel ?? ''}`.trim(),
        setNote: `${row?.setNote ?? ''}`.trim(),
      };
    })
    .sort((a, b) => a.setIndex - b.setIndex)
)
  .map((row, index) => ({ ...row, setIndex: index + 1 }));

const normalizeExerciseDraft = (exercise = {}, index = 0) => ({
  tempId: `${exercise?.tempId || `ongoing-exercise-${index + 1}`}`,
  exerciseId: `${exercise?.exerciseId || ''}`.trim(),
  exerciseName: `${exercise?.exerciseName || ''}`.trim(),
  equipment: `${exercise?.equipment || ''}`.trim(),
  category: `${exercise?.category || ''}`.trim(),
  order: Math.max(1, Number.parseInt(exercise?.order, 10) || (index + 1)),
  notes: `${exercise?.notes || ''}`.trim(),
  status: exercise?.status === 'completed' ? 'completed' : 'active',
  setDetails: normalizeSetDetails(exercise?.setDetails),
});

export const normalizeOngoingWorkoutDraft = (draft) => {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
  const exercises = (Array.isArray(draft.exercises) ? draft.exercises : [])
    .map((exercise, index) => normalizeExerciseDraft(exercise, index))
    .sort((a, b) => a.order - b.order)
    .map((exercise, index) => ({ ...exercise, order: index + 1 }));
  const activeExerciseId = `${draft.activeExerciseId || ''}`.trim();
  return {
    draftId: `${draft.draftId || ''}`.trim(),
    date: `${draft.date || ''}`.trim(),
    workoutLabel: `${draft.workoutLabel || ''}`.trim(),
    durationMin: `${draft.durationMin ?? ''}`,
    notes: `${draft.notes || ''}`.trim(),
    startedAt: `${draft.startedAt || ''}`.trim(),
    updatedAt: `${draft.updatedAt || ''}`.trim(),
    activeExerciseId: exercises.some((exercise) => exercise.tempId === activeExerciseId) ? activeExerciseId : '',
    currentExerciseDraft: {
      exerciseId: `${draft.currentExerciseDraft?.exerciseId || ''}`.trim(),
      exerciseName: `${draft.currentExerciseDraft?.exerciseName || ''}`.trim(),
      equipment: `${draft.currentExerciseDraft?.equipment || ''}`.trim(),
      notes: `${draft.currentExerciseDraft?.notes || ''}`.trim(),
    },
    exercises,
    currentSetDraft: normalizeCurrentSetDraft(draft.currentSetDraft),
  };
};

export const readOngoingWorkoutDraft = () => {
  if (!canUseStorage()) return null;
  try {
    return normalizeOngoingWorkoutDraft(JSON.parse(window.localStorage.getItem(ONGOING_WORKOUT_STORAGE_KEY) || 'null'));
  } catch {
    return null;
  }
};

export const persistOngoingWorkoutDraft = (draft) => {
  if (!canUseStorage()) return null;
  if (!draft) {
    window.localStorage.removeItem(ONGOING_WORKOUT_STORAGE_KEY);
    return null;
  }
  const normalized = normalizeOngoingWorkoutDraft({
    ...draft,
    updatedAt: new Date().toISOString(),
  });
  if (!normalized) {
    window.localStorage.removeItem(ONGOING_WORKOUT_STORAGE_KEY);
    return null;
  }
  window.localStorage.setItem(ONGOING_WORKOUT_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

export const clearOngoingWorkoutDraft = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(ONGOING_WORKOUT_STORAGE_KEY);
};

export const hasOngoingWorkoutDraft = () => Boolean(readOngoingWorkoutDraft()?.draftId);

export const ONGOING_WORKOUT_STORAGE_KEY_EXPORT = ONGOING_WORKOUT_STORAGE_KEY;
