import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultState,
  readPersistedDashboardState,
} from '../src/lib/dashboardStore.js';
import {
  clearOngoingWorkoutDraft,
  persistOngoingWorkoutDraft,
} from '../src/lib/ongoingWorkout.js';
import {
  bootstrapRemoteStateIntoLocalStorage,
  shouldBootstrapFromRemote,
} from '../src/lib/remoteStateBootstrap.js';

const createStorage = () => {
  const storage = new Map();
  return {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };
};

const buildState = (patch = {}) => ({
  ...structuredClone(defaultState),
  ...patch,
});

test('shouldBootstrapFromRemote prefers a richer remote state over an empty local bootstrap', () => {
  const localState = buildState({
    updatedAt: '2026-03-10T19:00:00.000Z',
    selectedDate: '2026-03-10',
    entries: [],
    sessions: [],
    metrics: [],
    dailyLogs: [],
    neatLogs: [],
  });
  const remoteState = buildState({
    updatedAt: '2026-03-10T18:34:32.738Z',
    selectedDate: '2026-03-10',
    entries: [{ id: 'entry-1', date: '2026-03-10', grams: 50, meal: 'dejeuner', foodId: 'food-1', foodName: 'Food', amount: 1, amountUnit: 'g', macros: { kcal: 100, protein: 10, carbs: 0, fat: 5 } }],
    sessions: [{ id: 'session-1', date: '2026-03-10', exerciseName: 'Face Pull', setDetails: [], workoutId: 'w1', workoutLabel: 'w1' }],
    metrics: [{ date: '2026-03-10', weight: 110.3 }],
    dailyLogs: [{ id: 'log-1', date: '2026-03-10', caloriesEstimated: 631 }],
    neatLogs: [{ id: 'neat-1', date: '2026-03-10', steps: 908 }],
  });

  assert.equal(shouldBootstrapFromRemote(localState, remoteState), true);
});

test('bootstrapRemoteStateIntoLocalStorage writes remote state when local is effectively empty', async () => {
  const storage = createStorage();
  const previousWindow = global.window;
  global.window = {
    localStorage: storage,
    dispatchEvent: () => {},
    location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:3000' },
  };

  try {
    const emptyLocal = buildState({
      updatedAt: '2026-03-10T19:00:00.000Z',
      selectedDate: '2026-03-10',
      entries: [],
      sessions: [],
      metrics: [],
      dailyLogs: [],
      neatLogs: [],
    });
    storage.setItem('nutri-sport-dashboard-v1', JSON.stringify(emptyLocal));

    const remoteState = buildState({
      updatedAt: '2026-03-10T18:34:32.738Z',
      selectedDate: '2026-03-10',
      entries: [{ id: 'entry-1', date: '2026-03-10', grams: 50, meal: 'dejeuner', foodId: 'food-1', foodName: 'Food', amount: 1, amountUnit: 'g', macros: { kcal: 100, protein: 10, carbs: 0, fat: 5 } }],
      sessions: [{ id: 'session-1', date: '2026-03-10', exerciseName: 'Face Pull', equipment: 'Poulies vis-a-vis', category: 'Shoulders', sets: 1, reps: 10, load: 30, notes: '', setDetails: [], workoutId: 'w1', workoutLabel: 'w1', sessionGroupId: 'w1', sessionGroupLabel: 'w1' }],
      metrics: [{ date: '2026-03-10', weight: 110.3 }],
      dailyLogs: [{ id: 'log-1', date: '2026-03-10', caloriesEstimated: 631 }],
      neatLogs: [{ id: 'neat-1', date: '2026-03-10', steps: 908 }],
    });

    const result = await bootstrapRemoteStateIntoLocalStorage({
      getConfig: () => ({
        enabled: true,
        url: 'http://127.0.0.1:8787/api/state',
        headers: { Authorization: 'Bearer dev-local-state-token' },
      }),
      fetcher: async () => remoteState,
    });

    const persisted = readPersistedDashboardState();
    assert.equal(result.status, 'updated');
    assert.equal(persisted.entries.length, 1);
    assert.equal(persisted.sessions.length, 1);
    assert.equal(persisted.metrics.length, 1);
    assert.equal(persisted.neatLogs[0].steps, 908);
  } finally {
    global.window = previousWindow;
  }
});

test('bootstrapRemoteStateIntoLocalStorage keeps a richer newer local state', async () => {
  const storage = createStorage();
  const previousWindow = global.window;
  global.window = {
    localStorage: storage,
    dispatchEvent: () => {},
    location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:3000' },
  };

  try {
    const localState = buildState({
      updatedAt: '2026-03-10T19:40:00.000Z',
      selectedDate: '2026-03-10',
      entries: [{ id: 'entry-local', date: '2026-03-10', grams: 100, meal: 'dejeuner', foodId: 'food-local', foodName: 'Local', amount: 1, amountUnit: 'g', macros: { kcal: 200, protein: 20, carbs: 0, fat: 10 } }],
      sessions: [{ id: 'session-local', date: '2026-03-10', exerciseName: 'Bench Press', equipment: 'Banc + barre olympique + disques', category: 'Push', sets: 1, reps: 5, load: 100, notes: '', setDetails: [], workoutId: 'w2', workoutLabel: 'w2', sessionGroupId: 'w2', sessionGroupLabel: 'w2' }],
      metrics: [{ date: '2026-03-10', weight: 110.3 }],
      dailyLogs: [{ id: 'log-local', date: '2026-03-10', caloriesEstimated: 200 }],
      neatLogs: [{ id: 'neat-local', date: '2026-03-10', steps: 5000 }],
    });
    storage.setItem('nutri-sport-dashboard-v1', JSON.stringify(localState));

    const remoteState = buildState({
      updatedAt: '2026-03-10T18:34:32.738Z',
      selectedDate: '2026-03-10',
      entries: [{ id: 'entry-remote', date: '2026-03-10', grams: 50, meal: 'dejeuner', foodId: 'food-remote', foodName: 'Remote', amount: 1, amountUnit: 'g', macros: { kcal: 100, protein: 10, carbs: 0, fat: 5 } }],
      sessions: [],
      metrics: [],
      dailyLogs: [],
      neatLogs: [],
    });

    const result = await bootstrapRemoteStateIntoLocalStorage({
      getConfig: () => ({
        enabled: true,
        url: 'http://127.0.0.1:8787/api/state',
        headers: { Authorization: 'Bearer dev-local-state-token' },
      }),
      fetcher: async () => remoteState,
    });

    const persisted = readPersistedDashboardState();
    assert.equal(result.status, 'kept-local');
    assert.equal(persisted.entries[0].id, 'entry-local');
    assert.equal(persisted.neatLogs[0].steps, 5000);
  } finally {
    global.window = previousWindow;
  }
});

test('bootstrapRemoteStateIntoLocalStorage skips remote pull when an ongoing workout draft exists', async () => {
  const storage = createStorage();
  const previousWindow = global.window;
  global.window = {
    localStorage: storage,
    dispatchEvent: () => {},
    location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:3000' },
  };

  try {
    const localState = buildState({
      updatedAt: '2026-03-10T19:40:00.000Z',
      selectedDate: '2026-03-10',
      entries: [{ id: 'entry-local', date: '2026-03-10', grams: 100, meal: 'dejeuner', foodId: 'food-local', foodName: 'Local', amount: 1, amountUnit: 'g', macros: { kcal: 200, protein: 20, carbs: 0, fat: 10 } }],
    });
    storage.setItem('nutri-sport-dashboard-v1', JSON.stringify(localState));
    persistOngoingWorkoutDraft({
      draftId: 'ongoing-1',
      date: '2026-03-10',
      workoutLabel: 'Pull',
      durationMin: '',
      notes: '',
      startedAt: '2026-03-10T19:30:00.000Z',
      updatedAt: '2026-03-10T19:35:00.000Z',
      activeExerciseId: '',
      currentExerciseDraft: {
        exerciseId: '',
        exerciseName: '',
        equipment: '',
        notes: '',
      },
      exercises: [],
      currentSetDraft: {
        reps: '',
        load: '',
        setNote: '',
        editingSetIndex: null,
      },
    });

    let fetchCalls = 0;
    const result = await bootstrapRemoteStateIntoLocalStorage({
      getConfig: () => ({
        enabled: true,
        url: 'http://127.0.0.1:8787/api/state',
        headers: { Authorization: 'Bearer dev-local-state-token' },
      }),
      fetcher: async () => {
        fetchCalls += 1;
        return buildState({
          updatedAt: '2026-03-10T20:00:00.000Z',
          selectedDate: '2026-03-10',
          entries: [{ id: 'entry-remote', date: '2026-03-10', grams: 50, meal: 'dejeuner', foodId: 'food-remote', foodName: 'Remote', amount: 1, amountUnit: 'g', macros: { kcal: 100, protein: 10, carbs: 0, fat: 5 } }],
        });
      },
    });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'ongoing-workout-active');
    assert.equal(fetchCalls, 0);
    assert.equal(readPersistedDashboardState().entries[0].id, 'entry-local');
  } finally {
    clearOngoingWorkoutDraft();
    global.window = previousWindow;
  }
});

test('bootstrapRemoteStateIntoLocalStorage skips remote pull when a critical local mutation is pending', async () => {
  const storage = createStorage();
  const previousWindow = global.window;
  global.window = {
    localStorage: storage,
    dispatchEvent: () => {},
    location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:3000' },
  };

  try {
    storage.setItem('nutri-sport-dashboard-v1', JSON.stringify(buildState({
      updatedAt: '2026-03-10T19:40:00.000Z',
      selectedDate: '2026-03-10',
      sessions: [],
    })));
    storage.setItem('nutri-critical-local-mutation-v1', JSON.stringify({
      kind: 'workout-finalize',
      updatedAt: '2026-03-10T19:40:00.000Z',
      workout: {
        workoutId: 'workout-1',
        workoutLabel: 'Pull',
        date: '2026-03-10',
        sessions: [],
      },
    }));

    let fetchCalls = 0;
    const result = await bootstrapRemoteStateIntoLocalStorage({
      getConfig: () => ({
        enabled: true,
        url: 'http://127.0.0.1:8787/api/state',
        headers: { Authorization: 'Bearer dev-local-state-token' },
      }),
      fetcher: async () => {
        fetchCalls += 1;
        return buildState({
          updatedAt: '2026-03-10T20:00:00.000Z',
          selectedDate: '2026-03-10',
          entries: [{ id: 'entry-remote', date: '2026-03-10', grams: 50, meal: 'dejeuner', foodId: 'food-remote', foodName: 'Remote', amount: 1, amountUnit: 'g', macros: { kcal: 100, protein: 10, carbs: 0, fat: 5 } }],
        });
      },
    });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'critical-local-mutation-pending');
    assert.equal(fetchCalls, 0);
  } finally {
    global.window = previousWindow;
  }
});

test('bootstrapRemoteStateIntoLocalStorage keeps a fresh workout draft from being overwritten by a newer remote state', async () => {
  const storage = createStorage();
  const previousWindow = global.window;
  global.window = {
    localStorage: storage,
    dispatchEvent: () => {},
    location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:3000' },
  };

  try {
    const localState = buildState({
      updatedAt: '2026-03-10T19:40:00.000Z',
      selectedDate: '2026-03-10',
      entries: [{ id: 'entry-local', date: '2026-03-10', grams: 100, meal: 'dejeuner', foodId: 'food-local', foodName: 'Local', amount: 1, amountUnit: 'g', macros: { kcal: 200, protein: 20, carbs: 0, fat: 10 } }],
      sessions: [],
    });
    storage.setItem('nutri-sport-dashboard-v1', JSON.stringify(localState));
    persistOngoingWorkoutDraft({
      draftId: 'ongoing-finalize-race',
      date: '2026-03-10',
      workoutLabel: 'Dos',
      durationMin: '18',
      notes: 'Workout freshly finalized locally',
      startedAt: '2026-03-10T19:30:00.000Z',
      updatedAt: '2026-03-10T19:39:30.000Z',
      activeExerciseId: 'exercise-1',
      currentExerciseDraft: {
        exerciseId: '',
        exerciseName: '',
        equipment: '',
        notes: '',
      },
      exercises: [
        {
          tempId: 'exercise-1',
          exerciseId: '',
          exerciseName: 'Face Pull',
          equipment: 'Poulie double',
          category: 'Shoulders',
          order: 1,
          notes: '',
          status: 'active',
          setDetails: [
            { setIndex: 1, reps: 15, loadDisplayed: 30, loadEstimated: null, timeLabel: '19:35' },
          ],
        },
      ],
      currentSetDraft: {
        reps: '15',
        load: '30',
        setNote: '',
        editingSetIndex: null,
      },
    });

    let fetchCalls = 0;
    const result = await bootstrapRemoteStateIntoLocalStorage({
      getConfig: () => ({
        enabled: true,
        url: 'http://127.0.0.1:8787/api/state',
        headers: { Authorization: 'Bearer dev-local-state-token' },
      }),
      fetcher: async () => {
        fetchCalls += 1;
        return buildState({
          updatedAt: '2026-03-10T20:00:00.000Z',
          selectedDate: '2026-03-10',
          entries: [{ id: 'entry-remote', date: '2026-03-10', grams: 50, meal: 'dejeuner', foodId: 'food-remote', foodName: 'Remote', amount: 1, amountUnit: 'g', macros: { kcal: 100, protein: 10, carbs: 0, fat: 5 } }],
          sessions: [{ id: 'session-remote', date: '2026-03-10', exerciseName: 'Bench Press', workoutId: 'w-remote', workoutLabel: 'Push' }],
        });
      },
    });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'ongoing-workout-active');
    assert.equal(fetchCalls, 0);
    assert.equal(readPersistedDashboardState().entries[0].id, 'entry-local');
  } finally {
    clearOngoingWorkoutDraft();
    global.window = previousWindow;
  }
});
