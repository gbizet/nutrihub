import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hydrateStateFromSyncEnvelope,
  hydratePersistedState,
  mergeIncomingStatePreservingLocalSession,
  persistDashboardState,
  readPersistedDashboardState,
  STORAGE_KEY,
} from '../src/lib/dashboardStore.js';

test('sync envelope hydration uses remote updated_at as local updatedAt', () => {
  const state = hydrateStateFromSyncEnvelope({
    updated_at: '2026-03-09T15:12:00.000Z',
    selected_date: '2026-03-07',
    payload: {
      updatedAt: '2026-03-08T10:00:00.000Z',
      selectedDate: '2026-03-05',
      foods: [],
      sessions: [],
      metrics: [],
      dailyLogs: [],
    },
  });

  assert.equal(state.updatedAt, '2026-03-09T15:12:00.000Z');
  assert.equal(state.selectedDate, '2026-03-07');
});

test('sync envelope hydration rejects invalid payloads', () => {
  assert.equal(hydrateStateFromSyncEnvelope(null), null);
  assert.equal(hydrateStateFromSyncEnvelope({ updated_at: '2026-03-09T15:12:00.000Z', payload: null }), null);
});

test('persisted state hydration rejects invalid top-level field types', () => {
  assert.equal(hydratePersistedState({ foods: 'not-an-array' }), null);
});

test('persisted state hydration merges exercise aliases into a single canonical entry', () => {
  const hydrated = hydratePersistedState({
    updatedAt: '2026-03-10T10:00:00.000Z',
    foods: [],
    sessions: [
      {
        id: 'session-1',
        date: '2026-03-10',
        exerciseId: 'legacy-ez',
        exerciseName: 'curl barre ez',
        equipment: 'EZ Bar',
        category: 'Arms',
        sets: 3,
        reps: 8,
        load: 26,
      },
    ],
    exercises: [
      { id: 'exercise-a', name: 'curl barre ez', equipment: 'EZ Bar', category: 'Arms' },
      { id: 'exercise-b', name: 'EZ Bar Curl', equipment: 'EZ Bar', category: 'Arms' },
    ],
    metrics: [],
    dailyLogs: [],
  });

  assert.equal(hydrated.exercises.filter((exercise) => exercise.name === 'EZ Bar Curl').length, 1);
  assert.equal(hydrated.exercises.filter((exercise) => exercise.name === 'curl barre ez').length, 0);
  assert.equal(hydrated.sessions[0].exerciseName, 'EZ Bar Curl');
  assert.equal(hydrated.sessions[0].exerciseId, 'exercise-a');
});

test('persisted storage is updated immediately after hydrating a pulled envelope', () => {
  const storage = new Map();
  const previousWindow = global.window;
  global.window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    location: { hostname: 'app.local' },
  };

  try {
    const pulledState = hydrateStateFromSyncEnvelope({
      updated_at: '2026-03-09T15:12:00.000Z',
      selected_date: '2026-03-07',
      payload: {
        updatedAt: '2026-03-08T10:00:00.000Z',
        selectedDate: '2026-03-05',
        foods: [],
        sessions: [],
        metrics: [],
        dailyLogs: [],
      },
    });

    persistDashboardState(pulledState);
    const persisted = readPersistedDashboardState();

    assert.equal(persisted.updatedAt, '2026-03-09T15:12:00.000Z');
    assert.equal(persisted.selectedDate, '2026-03-07');
  } finally {
    global.window = previousWindow;
  }
});

test('mergeIncomingStatePreservingLocalSession keeps local selected date and layouts on remote pull', () => {
  const merged = mergeIncomingStatePreservingLocalSession(
    {
      selectedDate: '2026-03-09',
      layouts: { training: [{ id: 'progress', span: 12 }] },
      stateSnapshots: [{ id: 'snap-1' }],
      sessions: [{ id: 'session-local', exerciseName: 'Face Pull' }],
      updatedAt: '2026-03-10T10:00:00.000Z',
    },
    {
      selectedDate: '2026-03-01',
      layouts: { training: [{ id: 'log', span: 6 }] },
      updatedAt: '2026-03-09T15:12:00.000Z',
      sessions: [],
    },
  );

  assert.equal(merged.selectedDate, '2026-03-09');
  assert.deepEqual(merged.layouts.training, [{ id: 'progress', span: 12 }]);
  assert.deepEqual(merged.sessions, [{ id: 'session-local', exerciseName: 'Face Pull' }]);
  assert.equal(merged.stateSnapshots.length, 1);
  assert.equal(merged.updatedAt, '2026-03-09T15:12:00.000Z');
});

test('persistDashboardState trims Android hot state snapshots and health debug entries', () => {
  const storage = new Map();
  const previousWindow = global.window;
  global.window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    location: { hostname: 'app.local' },
    Capacitor: {
      getPlatform: () => 'android',
    },
  };

  try {
    persistDashboardState({
      updatedAt: '2026-03-19T09:00:00.000Z',
      selectedDate: '2026-03-19',
      foods: [],
      sessions: [],
      metrics: [],
      dailyLogs: [],
      stateSnapshots: [
        {
          id: 'snap-1',
          at: '2026-03-19T09:00:00.000Z',
          selectedDate: '2026-03-19',
          size: 123,
          payload: { heavy: true },
        },
      ],
      healthSync: {
        debugEntries: Array.from({ length: 25 }, (_, index) => ({ id: `debug-${index}` })),
      },
    });

    const persistedRaw = JSON.parse(storage.get(STORAGE_KEY));
    assert.deepEqual(persistedRaw.stateSnapshots, []);
    assert.equal(persistedRaw.healthSync.debugEntries.length, 20);
  } finally {
    global.window = previousWindow;
  }
});

test('persistDashboardState keeps desktop hot state snapshotless too', () => {
  const storage = new Map();
  const previousWindow = global.window;
  global.window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    location: { hostname: 'app.local' },
  };

  try {
    persistDashboardState({
      updatedAt: '2026-03-19T09:00:00.000Z',
      selectedDate: '2026-03-19',
      foods: [],
      sessions: [],
      metrics: [],
      dailyLogs: [],
      stateSnapshots: [
        {
          id: 'snap-1',
          at: '2026-03-19T09:00:00.000Z',
          selectedDate: '2026-03-19',
          size: 123,
          payload: { heavy: true },
        },
      ],
    });

    const persistedRaw = JSON.parse(storage.get(STORAGE_KEY));
    assert.deepEqual(persistedRaw.stateSnapshots, []);
  } finally {
    global.window = previousWindow;
  }
});
