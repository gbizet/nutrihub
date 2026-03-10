import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSessionsForDate } from './domainModel.js';
import { defaultHealthSyncState } from './healthSchema.js';
import { appendSyncDebugLog } from './syncDebug.js';

export const STORAGE_KEY = 'nutri-sport-dashboard-v1';
export const DASHBOARD_STATE_EVENT = 'nutri-dashboard-state';
const REMOTE_STATE_URL = 'http://localhost:8787/api/state';
const SCHEMA_VERSION = 3;

export const todayIso = () => new Date().toISOString().slice(0, 10);

const uid = () => {
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

const exerciseLibrary = [
  { id: uid(), name: 'Back Squat', equipment: 'Full Rack', category: 'Lower Body' },
  { id: uid(), name: 'Bench Press', equipment: 'Full Rack', category: 'Push' },
  { id: uid(), name: 'Romanian Deadlift', equipment: 'Barre olympique', category: 'Posterior Chain' },
  { id: uid(), name: 'Hex Bar Deadlift', equipment: 'Hex Bar', category: 'Lower Body' },
  { id: uid(), name: 'EZ Bar Curl', equipment: 'EZ Bar', category: 'Arms' },
  { id: uid(), name: 'Cable Fly', equipment: 'Poulies vis-a-vis', category: 'Chest' },
  { id: uid(), name: 'Cable Row', equipment: 'Poulies vis-a-vis', category: 'Back' },
  { id: uid(), name: 'Overhead Press', equipment: 'Barre olympique', category: 'Push' },
];

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
  keto: {
    netCarbMax: 35,
    fiberGEstimate: 10,
    leanMassKgEstimate: 70,
    proteinPerLeanKgTarget: 2.2,
    sodiumMgMin: 3500,
    potassiumMgMin: 3000,
    magnesiumMgMin: 350,
    hydrationMlMin: 2500,
    restingBpmMax: 70,
    hrvMsMin: 35,
  },
  layouts: {},
  dashboards: {
    active: 'default',
    profiles: {
      default: ['kpis', 'sparks', 'quick'],
    },
  },
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

export const toNumber = (value) => Number.parseFloat(value || 0);
export const toPositive = (value, fallback = 0) => {
  const n = toNumber(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
export const toBounded = (value, min, max, fallback = min) => {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
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
  const qty = servingMode === 'unit' ? toPositive(amount, 1) : toPositive(amount, 0);
  const grams = servingMode === 'unit' ? qty * toPositive(food.unitGrams, 50) : qty;
  return computeMacros(food, grams);
};

export const formatMacrosLine = (m) =>
  `${m.kcal.toFixed(0)} kcal | P ${m.protein.toFixed(1)} g | G ${m.carbs.toFixed(1)} g | L ${m.fat.toFixed(1)} g`;

const hydrateFoods = (inputFoods, deletedFoodKeys = []) => {
  const parsedFoods = Array.isArray(inputFoods) ? inputFoods : [];
  const deletedSet = new Set((Array.isArray(deletedFoodKeys) ? deletedFoodKeys : []).map((x) => `${x || ''}`.trim().toLowerCase()).filter(Boolean));
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
  // User-saved foods must override preset defaults when key is identical.
  [...favoriteFoods.map(normalizeFood), ...normalizedParsedFoods].forEach((food) => {
    mergedMap.set(foodIdentityKey(food), food);
  });
  return Array.from(mergedMap.values()).filter((food) => !deletedSet.has(foodIdentityKey(food)));
};

export const hydratePersistedState = (rawState) => {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return null;
  const deletedFoodKeys = Array.isArray(rawState.deletedFoodKeys)
    ? rawState.deletedFoodKeys.map((x) => `${x || ''}`.trim().toLowerCase()).filter(Boolean)
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
            return {
              setIndex: Number.isFinite(setIndex) ? setIndex : index + 1,
              loadDisplayed,
              loadEstimated,
              reps,
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
        sessionGroupId: session?.sessionGroupId || workoutId,
        sessionGroupLabel: session?.sessionGroupLabel || workoutLabel,
        setDetails,
      };
    })
    : [];
  const normalizeArray = (value) => (Array.isArray(value) ? value : []);

  return {
    ...rawState,
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
    dashboards: {
      ...defaultState.dashboards,
      ...(rawState.dashboards || {}),
      profiles: {
        ...(defaultState.dashboards?.profiles || {}),
        ...((rawState.dashboards || {}).profiles || {}),
      },
    },
    healthSync: {
      ...defaultHealthSyncState,
      ...(rawState.healthSync || {}),
    },
    stateSnapshots: normalizeArray(rawState.stateSnapshots).slice(0, 20),
    keto: {
      ...defaultState.keto,
      ...(rawState.keto || {}),
    },
  };
};

export const mergeIncomingStatePreservingLocalSession = (previousState, incomingState) => {
  const prev = previousState || defaultState;
  const next = incomingState || prev;
  return {
    ...next,
    selectedDate: prev.selectedDate || next.selectedDate || defaultState.selectedDate,
    layouts: normalizeObject(prev.layouts, next.layouts || defaultState.layouts),
    dashboards: normalizeObject(prev.dashboards, next.dashboards || defaultState.dashboards),
    stateSnapshots: Array.isArray(prev.stateSnapshots) ? prev.stateSnapshots : (next.stateSnapshots || []),
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

const canUseRemotePersistence = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

export const readPersistedDashboardState = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return hydratePersistedState(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const buildPersistedDashboardState = (state) => {
  const snapshotless = { ...state, stateSnapshots: undefined };
  const serialized = JSON.stringify(snapshotless);
  const snapshot = {
    id: `${Date.now()}`,
    at: state.updatedAt || new Date().toISOString(),
    selectedDate: state.selectedDate,
    size: serialized.length,
    payload: snapshotless,
  };
  return {
    ...state,
    stateSnapshots: [snapshot, ...(state.stateSnapshots || [])].slice(0, 20),
  };
};

export const emitDashboardStateEvent = (detail = {}) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_STATE_EVENT, { detail }));
};

export const persistDashboardState = (state) => {
  if (typeof window === 'undefined') return null;
  const persistedState = buildPersistedDashboardState(state);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
  appendSyncDebugLog('dashboardStore', 'persistDashboardState', {
    updatedAt: state.updatedAt || '',
    selectedDate: state.selectedDate || '',
    snapshotCount: persistedState.stateSnapshots?.length || 0,
  });
  emitDashboardStateEvent({
    updatedAt: state.updatedAt || '',
    selectedDate: state.selectedDate || '',
  });
  return persistedState;
};

export function useDashboardState() {
  const [state, setStateRaw] = useState(defaultState);
  const [hydrated, setHydrated] = useState(false);

  const replaceState = useCallback((nextState) => {
    setStateRaw((prev) => {
      const resolved = typeof nextState === 'function' ? nextState(prev) : nextState;
      return resolved || prev;
    });
  }, []);

  const setState = useCallback((updater) => {
    setStateRaw((prev) => {
      const resolved = typeof updater === 'function' ? updater(prev) : updater;
      if (!resolved) return prev;
      const nextUpdatedAt = new Date().toISOString();
      return {
        ...resolved,
        updatedAt: nextUpdatedAt,
      };
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const applyRawState = (rawState) => {
      const hydratedState = hydratePersistedState(rawState);
      if (!hydratedState || cancelled) return;
      setStateRaw((prev) => mergeIncomingStatePreservingLocalSession(prev, hydratedState));
    };

    const load = async () => {
      const persistedState = readPersistedDashboardState();
      if (persistedState) {
        try {
          applyRawState(persistedState);
        } catch (error) {
          appendSyncDebugLog('dashboardStore', 'load persisted state failed', { error });
          console.error('Failed to parse local dashboard state', error);
        }
      }

      if (canUseRemotePersistence()) {
        try {
          const response = await fetch(REMOTE_STATE_URL, { method: 'GET' });
          if (response.ok) {
            const remote = await response.json();
            applyRawState(remote);
          }
        } catch (error) {
          appendSyncDebugLog('dashboardStore', 'remote persistence unavailable', { error });
          console.warn('Remote state unavailable, local storage fallback enabled.');
        }
      }

      if (!cancelled) setHydrated(true);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) return;
    const persistedState = persistDashboardState(state);

    if (!canUseRemotePersistence()) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        await fetch(REMOTE_STATE_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(persistedState),
          signal: controller.signal,
        });
      } catch (error) {
        // keep localStorage as fallback; no hard failure needed in UI
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hydrated, state]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleDashboardState = (event) => {
      const detail = event?.detail || {};
      const nextUpdatedAt = `${detail.updatedAt || ''}`;
      if (!nextUpdatedAt || nextUpdatedAt === `${state.updatedAt || ''}`) return;
      const persistedState = readPersistedDashboardState();
      const hydratedState = hydratePersistedState(persistedState);
      if (!hydratedState || hydratedState.updatedAt === `${state.updatedAt || ''}`) return;
      setStateRaw((prev) => mergeIncomingStatePreservingLocalSession(prev, hydratedState));
    };

    window.addEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
    return () => {
      window.removeEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
    };
  }, [state.updatedAt]);

  const entriesForSelectedDay = useMemo(
    () => state.entries.filter((entry) => entry.date === state.selectedDate),
    [state.entries, state.selectedDate],
  );

  const sessionsForSelectedDay = useMemo(
    () => getSessionsForDate(state, state.selectedDate),
    [state, state.selectedDate],
  );

  const metricsForSelectedDay = useMemo(
    () => state.metrics.find((entry) => entry.date === state.selectedDate),
    [state.metrics, state.selectedDate],
  );

  const dailyLogForSelectedDay = useMemo(
    () => state.dailyLogs.find((entry) => entry.date === state.selectedDate),
    [state.dailyLogs, state.selectedDate],
  );

  const dayMacros = useMemo(
    () =>
      entriesForSelectedDay.reduce(
        (acc, entry) => ({
          kcal: acc.kcal + entry.macros.kcal,
          protein: acc.protein + entry.macros.protein,
          carbs: acc.carbs + entry.macros.carbs,
          fat: acc.fat + entry.macros.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [entriesForSelectedDay],
  );

  return {
    state,
    setState,
    replaceState,
    entriesForSelectedDay,
    sessionsForSelectedDay,
    metricsForSelectedDay,
    dailyLogForSelectedDay,
    dayMacros,
    uid,
  };
}
