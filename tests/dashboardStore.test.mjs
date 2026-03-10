import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hydrateStateFromSyncEnvelope,
  mergeIncomingStatePreservingLocalSession,
  persistDashboardState,
  readPersistedDashboardState,
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
      dashboards: { active: 'default', profiles: { default: ['quick'] } },
      stateSnapshots: [{ id: 'snap-1' }],
    },
    {
      selectedDate: '2026-03-01',
      layouts: { training: [{ id: 'log', span: 6 }] },
      dashboards: { active: 'remote', profiles: { default: ['remote'] } },
      updatedAt: '2026-03-09T15:12:00.000Z',
    },
  );

  assert.equal(merged.selectedDate, '2026-03-09');
  assert.deepEqual(merged.layouts.training, [{ id: 'progress', span: 12 }]);
  assert.equal(merged.dashboards.active, 'default');
  assert.equal(merged.stateSnapshots.length, 1);
  assert.equal(merged.updatedAt, '2026-03-09T15:12:00.000Z');
});
