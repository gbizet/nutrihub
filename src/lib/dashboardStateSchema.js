import { defaultHealthSyncState } from './healthSchema.js';
import { COMMON_EXERCISES } from './exerciseKnowledge.js';

export const SCHEMA_VERSION = 3;
export const DASHBOARD_STORAGE_WARN_THRESHOLD_BYTES = 4 * 1024 * 1024;

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const uid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const favoriteFoods = [
  {
    id: uid(),
    name: 'Oeufs entiers',
    kcal: 143,
    protein: 12.6,
    carbs: 0.7,
    fat: 9.5,
    brand: '',
    source: 'preset',
    mealTags: ['petit-dejeuner', 'collation', 'avant-coucher'],
    servingMode: 'unit',
    unitLabel: 'oeuf',
    unitGrams: 50,
    defaultAmount: 2,
    defaultGrams: 100,
  },
  {
    id: uid(),
    name: 'Leerdammer Leger (tranches)',
    kcal: 250,
    protein: 31,
    carbs: 0.1,
    fat: 14,
    brand: 'Leerdammer',
    source: 'preset',
    mealTags: ['petit-dejeuner', 'collation', 'diner', 'avant-coucher'],
    servingMode: 'grams',
    defaultAmount: 60,
    defaultGrams: 60,
  },
  {
    id: uid(),
    name: 'Viande des Grisons',
    kcal: 180,
    protein: 38,
    carbs: 1,
    fat: 2.5,
    brand: '',
    source: 'preset',
    mealTags: ['collation', 'dejeuner', 'diner', 'avant-coucher'],
    servingMode: 'grams',
    defaultAmount: 60,
    defaultGrams: 60,
  },
  {
    id: uid(),
    name: 'Ratatouille Cassegrain',
    kcal: 55,
    protein: 1.3,
    carbs: 5.5,
    fat: 2.8,
    brand: 'Cassegrain',
    source: 'preset',
    mealTags: ['dejeuner', 'diner'],
    servingMode: 'grams',
    defaultAmount: 250,
    defaultGrams: 250,
  },
  {
    id: uid(),
    name: 'Blanc de poulet',
    kcal: 121,
    protein: 23,
    carbs: 0,
    fat: 3,
    brand: '',
    source: 'preset',
    mealTags: ['dejeuner', 'diner'],
    servingMode: 'grams',
    defaultAmount: 180,
    defaultGrams: 180,
  },
  {
    id: uid(),
    name: 'Steak hache 5% (Charal)',
    kcal: 131,
    protein: 21,
    carbs: 0,
    fat: 5,
    brand: 'Charal',
    source: 'preset',
    mealTags: ['dejeuner', 'diner'],
    servingMode: 'grams',
    defaultAmount: 125,
    defaultGrams: 125,
  },
  {
    id: uid(),
    name: 'Pure Isolate - Whey Protein Isolate',
    kcal: 366,
    protein: 86,
    carbs: 3.3,
    fat: 0.9,
    brand: 'EAFIT',
    source: 'preset',
    mealTags: ['collation', 'avant-coucher'],
    servingMode: 'grams',
    defaultAmount: 30,
    defaultGrams: 30,
  },
];

const exerciseLibrary = COMMON_EXERCISES.slice(0, 16).map((exercise) => ({
  id: uid(),
  ...exercise,
}));

export const defaultState = {
  schemaVersion: SCHEMA_VERSION,
  updatedAt: new Date().toISOString(),
  selectedDate: todayIso(),
  goals: { kcal: 2200, protein: 180, carbs: 180, fat: 70 },
  limits: {
    kcal: { min: 2000, max: 2400 },
    protein: { min: 160, max: 220 },
    carbs: { min: 120, max: 220 },
    fat: { min: 45, max: 90 },
  },
  foods: favoriteFoods,
  deletedFoodKeys: [],
  entries: [],
  exercises: exerciseLibrary,
  exerciseMuscleOverrides: {},
  sessions: [],
  cycles: [],
  cycleLogs: [],
  injuries: [],
  supplements: [],
  supplementIntakes: [],
  neatLogs: [],
  recoveryBaselines: {
    sleepHours: 7,
    restingBpm: 62,
    hrvMs: 45,
  },
  metrics: [],
  dailyLogs: [],
  healthSync: defaultHealthSyncState,
  layouts: {},
  stateSnapshots: [],
  promptTemplates: {
    daily:
      'Tu es mon coach nutrition + home gym. Analyse ma journee du {{date}}.\nObjectifs: {{goals}}.\nMesures: {{measures}}.\nRecovery: {{recovery}}.\nMacros du jour: {{macros}}.\nNutrition:\n{{nutrition}}\nEntrainement:\n{{training}}\nDonne: 1) points forts, 2) ecarts vs objectifs, 3) plan precis pour demain (repas + training).',
    weekly:
      'Tu es mon coach nutrition + home gym. Fais ma revue hebdo du {{weekStart}} au {{weekEnd}}.\nObjectifs journaliers: {{goals}}.\nVolume hebdo: {{volume}}.\nTotal macros 7j: {{weeklyMacros}}.\nEvolution poids/BF:\n{{weights}}\nEtat recovery:\n{{weeklyRecovery}}\nDonne: 1) bilan hebdo, 2) recommandations macro-training semaine prochaine, 3) 3 priorites actionnables.',
  },
};

const normalizeObject = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const DASHBOARD_TOP_LEVEL_TYPES = {
  schemaVersion: 'number',
  updatedAt: 'string',
  selectedDate: 'string',
  goals: 'object',
  limits: 'object',
  foods: 'array',
  deletedFoodKeys: 'array',
  entries: 'array',
  exercises: 'array',
  exerciseMuscleOverrides: 'object',
  sessions: 'array',
  cycles: 'array',
  cycleLogs: 'array',
  injuries: 'array',
  supplements: 'array',
  supplementIntakes: 'array',
  neatLogs: 'array',
  recoveryBaselines: 'object',
  metrics: 'array',
  dailyLogs: 'array',
  healthSync: 'object',
  layouts: 'object',
  stateSnapshots: 'array',
  promptTemplates: 'object',
};

const hasExpectedType = (value, expectedType) => {
  if (expectedType === 'array') return Array.isArray(value);
  if (expectedType === 'object') return isPlainObject(value);
  if (expectedType === 'number') return Number.isFinite(Number(value));
  if (expectedType === 'string') return typeof value === 'string';
  return true;
};

export const validatePersistedDashboardStateCandidate = (rawState) => {
  if (!isPlainObject(rawState)) {
    return {
      ok: false,
      issues: ['root'],
    };
  }

  const issues = Object.entries(DASHBOARD_TOP_LEVEL_TYPES)
    .filter(([key, expectedType]) => rawState[key] !== undefined && !hasExpectedType(rawState[key], expectedType))
    .map(([key]) => key);

  return {
    ok: issues.length === 0,
    issues,
  };
};

export const toNumber = (value) => Number.parseFloat(value || 0);

export const toPositive = (value, fallback = 0) => {
  const numeric = toNumber(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

export const toBounded = (value, min, max, fallback = min) => {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
};

const foodIdentityKey = (food) =>
  `${(food?.name || '').trim().toLowerCase()}|${(food?.brand || '').trim().toLowerCase()}`;

const isEggFood = (food) => /(oeuf|egg)/i.test(`${food?.name || ''} ${food?.brand || ''}`);

export const normalizeFood = (candidate = {}) => {
  const servingMode = candidate.servingMode === 'unit' ? 'unit' : 'grams';
  const defaultAmountRaw =
    candidate.defaultAmount !== undefined ? candidate.defaultAmount : candidate.defaultGrams;
  const unitGrams = toPositive(candidate.unitGrams, 100);
  const defaultAmount =
    servingMode === 'unit' ? toPositive(defaultAmountRaw, 1) : toPositive(defaultAmountRaw, 100);
  const defaultGrams = servingMode === 'unit' ? defaultAmount * unitGrams : defaultAmount;

  return {
    id: candidate.id,
    name: `${candidate.name || ''}`.trim(),
    brand: `${candidate.brand || ''}`.trim(),
    kcal: toPositive(candidate.kcal),
    protein: toPositive(candidate.protein),
    carbs: toPositive(candidate.carbs),
    fat: toPositive(candidate.fat),
    source: candidate.source || 'manual',
    mealTags: Array.isArray(candidate.mealTags) ? candidate.mealTags : [],
    servingMode,
    unitLabel: `${candidate.unitLabel || 'portion'}`.trim(),
    unitGrams,
    defaultAmount,
    defaultGrams,
  };
};

export const computeMacros = (food, grams) => {
  const ratio = grams / 100;
  return {
    kcal: food.kcal * ratio,
    protein: food.protein * ratio,
    carbs: food.carbs * ratio,
    fat: food.fat * ratio,
  };
};

export const computeMacrosForAmount = (food, amount) => {
  const servingMode = food.servingMode || 'grams';
  const quantity = servingMode === 'unit' ? toPositive(amount, 1) : toPositive(amount, 0);
  const grams = servingMode === 'unit' ? quantity * toPositive(food.unitGrams, 50) : quantity;
  return computeMacros(food, grams);
};

export const formatMacrosLine = (macros) =>
  `${macros.kcal.toFixed(0)} kcal | P ${macros.protein.toFixed(1)} g | G ${macros.carbs.toFixed(1)} g | L ${macros.fat.toFixed(1)} g`;

const hydrateFoods = (inputFoods, deletedFoodKeys = []) => {
  const parsedFoods = Array.isArray(inputFoods) ? inputFoods : [];
  const deletedSet = new Set(
    (Array.isArray(deletedFoodKeys) ? deletedFoodKeys : [])
      .map((item) => `${item || ''}`.trim().toLowerCase())
      .filter(Boolean),
  );
  const normalizedParsedFoods = parsedFoods
    .map((food) => {
      const base = normalizeFood(food);
      if (isEggFood(food) && (!food.servingMode || food.servingMode === 'grams')) {
        return normalizeFood({
          ...base,
          servingMode: 'unit',
          unitLabel: 'oeuf',
          unitGrams: 50,
          defaultAmount: food.defaultAmount || 2,
        });
      }
      return base;
    })
    .filter((food) => food.name);

  const mergedMap = new Map();
  [...favoriteFoods.map(normalizeFood), ...normalizedParsedFoods].forEach((food) => {
    mergedMap.set(foodIdentityKey(food), food);
  });
  return Array.from(mergedMap.values()).filter((food) => !deletedSet.has(foodIdentityKey(food)));
};

export const hydratePersistedState = (rawState) => {
  const validation = validatePersistedDashboardStateCandidate(rawState);
  if (!validation.ok) return null;
  const {
    keto: _legacyKeto,
    dashboards: _legacyDashboards,
    ...sanitizedRawState
  } = rawState;

  const deletedFoodKeys = Array.isArray(rawState.deletedFoodKeys)
    ? rawState.deletedFoodKeys.map((item) => `${item || ''}`.trim().toLowerCase()).filter(Boolean)
    : [];
  const schemaVersion = Number.isFinite(Number(rawState.schemaVersion))
    ? Number(rawState.schemaVersion)
    : 1;
  const normalizedSessions = Array.isArray(rawState.sessions)
    ? rawState.sessions.map((session) => {
      const setDetails = Array.isArray(session?.setDetails)
        ? session.setDetails
          .map((row, index) => {
            const setIndex = Number.parseInt(row?.setIndex, 10);
            const loadDisplayed = toPositive(row?.loadDisplayed, 0);
            const loadEstimated =
              row?.loadEstimated === null || row?.loadEstimated === undefined
                ? null
                : toPositive(row?.loadEstimated, 0);
            const reps = toPositive(row?.reps, 0);
            const loggedAt = `${row?.loggedAt || ''}`.trim();
            const elapsedSinceWorkoutStartSec =
              row?.elapsedSinceWorkoutStartSec === null || row?.elapsedSinceWorkoutStartSec === undefined || `${row?.elapsedSinceWorkoutStartSec ?? ''}`.trim() === ''
                ? null
                : toPositive(row?.elapsedSinceWorkoutStartSec, 0);
            const restSincePreviousSetSec =
              row?.restSincePreviousSetSec === null || row?.restSincePreviousSetSec === undefined || `${row?.restSincePreviousSetSec ?? ''}`.trim() === ''
                ? null
                : toPositive(row?.restSincePreviousSetSec, 0);
            const timeLabel = `${row?.timeLabel || ''}`.trim();
            const setNote = `${row?.setNote || ''}`.trim();
            return {
              setIndex: Number.isFinite(setIndex) ? setIndex : index + 1,
              loadDisplayed,
              loadEstimated,
              reps,
              loggedAt,
              elapsedSinceWorkoutStartSec,
              restSincePreviousSetSec,
              timeLabel,
              setNote,
            };
          })
          .filter((row) => row.reps >= 0)
        : [];
      const workoutId =
        `${session?.workoutId || session?.sessionGroupId || ''}`.trim()
        || `${session?.date || 'undated'}::${session?.sessionTitle || session?.sessionGroupLabel || session?.exerciseName || session?.id || 'workout'}`.trim();
      const workoutLabel =
        `${session?.workoutLabel || session?.sessionGroupLabel || session?.sessionTitle || session?.date || 'Seance'}`.trim();
      return {
        ...session,
        workoutId,
        workoutLabel,
        exerciseOrder: Number.parseInt(session?.exerciseOrder, 10) || undefined,
        sessionGroupId: session?.sessionGroupId || workoutId,
        sessionGroupLabel: session?.sessionGroupLabel || workoutLabel,
        setDetails,
      };
    })
    : [];

  return {
    ...sanitizedRawState,
    schemaVersion: Math.max(schemaVersion, SCHEMA_VERSION),
    updatedAt: rawState.updatedAt || rawState.stateSnapshots?.[0]?.at || new Date().toISOString(),
    deletedFoodKeys,
    foods: hydrateFoods(rawState.foods, deletedFoodKeys),
    exerciseMuscleOverrides: normalizeObject(rawState.exerciseMuscleOverrides),
    sessions: normalizedSessions,
    cycles: normalizeArray(rawState.cycles),
    cycleLogs: normalizeArray(rawState.cycleLogs),
    injuries: normalizeArray(rawState.injuries),
    supplements: normalizeArray(rawState.supplements),
    supplementIntakes: normalizeArray(rawState.supplementIntakes),
    neatLogs: normalizeArray(rawState.neatLogs),
    recoveryBaselines: {
      ...defaultState.recoveryBaselines,
      ...(rawState.recoveryBaselines || {}),
    },
    healthSync: {
      ...defaultHealthSyncState,
      ...(rawState.healthSync || {}),
    },
    stateSnapshots: normalizeArray(rawState.stateSnapshots).slice(0, 20),
  };
};

export const mergeIncomingStatePreservingLocalSession = (previousState, incomingState) => {
  const previous = previousState || defaultState;
  const next = incomingState || previous;
  const {
    keto: _legacyKeto,
    dashboards: _legacyDashboards,
    ...sanitizedNext
  } = next;
  return {
    ...sanitizedNext,
    selectedDate: previous.selectedDate || next.selectedDate || defaultState.selectedDate,
    layouts: normalizeObject(previous.layouts, next.layouts || defaultState.layouts),
    stateSnapshots: Array.isArray(previous.stateSnapshots) ? previous.stateSnapshots : (next.stateSnapshots || []),
  };
};

export const hydrateStateFromSyncEnvelope = (envelope) => {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return null;
  const payload = envelope.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return hydratePersistedState({
    ...payload,
    selectedDate: envelope.selected_date || payload.selectedDate || defaultState.selectedDate,
    updatedAt: envelope.updated_at || payload.updatedAt || new Date().toISOString(),
  });
};

export const preparePersistedDashboardState = (
  state,
  {
    thresholdBytes = DASHBOARD_STORAGE_WARN_THRESHOLD_BYTES,
    maxSnapshots = 20,
  } = {},
) => {
  const snapshotless = { ...state, stateSnapshots: undefined };
  const snapshot = {
    id: `${Date.now()}`,
    at: state.updatedAt || new Date().toISOString(),
    selectedDate: state.selectedDate,
    size: JSON.stringify(snapshotless).length,
    payload: snapshotless,
  };

  const requestedSnapshots = [snapshot, ...(state.stateSnapshots || [])].slice(0, maxSnapshots);
  let persistedState = {
    ...state,
    stateSnapshots: requestedSnapshots,
  };
  let serialized = JSON.stringify(persistedState);

  while (serialized.length > thresholdBytes && persistedState.stateSnapshots.length > 0) {
    persistedState = {
      ...persistedState,
      stateSnapshots: persistedState.stateSnapshots.slice(0, -1),
    };
    serialized = JSON.stringify(persistedState);
  }

  return {
    persistedState,
    sizeBytes: serialized.length,
    thresholdBytes,
    trimmedSnapshotCount: requestedSnapshots.length - persistedState.stateSnapshots.length,
    warning:
      serialized.length > thresholdBytes
        ? {
          code: 'DASHBOARD_STORAGE_THRESHOLD',
          message: `Le state local depasse ${thresholdBytes} octets.`,
          sizeBytes: serialized.length,
          thresholdBytes,
        }
        : null,
  };
};

export const buildPersistedDashboardState = (state, options = {}) =>
  preparePersistedDashboardState(state, options).persistedState;
