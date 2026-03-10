import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../src/lib/dashboardStore.js';
import { getHealthSnapshotForDate, isActionableHealthActivityRow } from '../src/lib/healthState.js';
import { appendHealthDebugEntries, buildHealthDebugEntry } from '../src/lib/healthSchema.js';

test('health snapshot merges metrics neat and daily logs for one date', () => {
  const state = {
    ...defaultState,
    metrics: [{
      date: '2026-03-09',
      weight: 110.9,
      bodyFat: 23.4,
      healthSource: { provider: 'health-connect' },
    }],
    neatLogs: [{
      id: 'neat-1',
      date: '2026-03-09',
      steps: 10234,
      activeMinutes: 64,
      caloriesActive: 712,
      healthSource: { provider: 'health-connect' },
    }],
    dailyLogs: [{
      id: 'log-1',
      date: '2026-03-09',
      sleepHours: 7.3,
      restingBpm: 58,
      avgHeartRate: 71,
      hrvMs: 44,
      bloodPressure: '122/78',
      oxygenSaturationPercent: 97.1,
      bloodGlucoseMgDl: 94,
      healthSources: {
        sleep: { provider: 'health-connect' },
        vitals: { provider: 'health-connect' },
      },
    }],
  };

  const snapshot = getHealthSnapshotForDate(state, '2026-03-09');

  assert.equal(snapshot.weightKg, 110.9);
  assert.equal(snapshot.bodyFatPercent, 23.4);
  assert.equal(snapshot.steps, 10234);
  assert.equal(snapshot.activeMinutes, 64);
  assert.equal(snapshot.caloriesActive, 712);
  assert.equal(snapshot.sleepHours, 7.3);
  assert.equal(snapshot.restingBpm, 58);
  assert.equal(snapshot.avgHeartRate, 71);
  assert.equal(snapshot.hrvMs, 44);
  assert.equal(snapshot.bloodPressure, '122/78');
  assert.equal(snapshot.oxygenSaturationPercent, 97.1);
  assert.equal(snapshot.bloodGlucoseMgDl, 94);
  assert.equal(snapshot.provider, 'health-connect');
});

test('health snapshot can disable carry forward for exact selected-day rendering', () => {
  const state = {
    ...defaultState,
    neatLogs: [{
      id: 'neat-1',
      date: '2026-03-07',
      steps: 11000,
      activeMinutes: 42,
      caloriesActive: 650,
      healthSource: { provider: 'health-connect' },
    }],
    dailyLogs: [{
      id: 'log-1',
      date: '2026-03-07',
      sleepHours: 8,
      restingBpm: 58,
      healthSources: {
        sleep: { provider: 'health-connect' },
        vitals: { provider: 'health-connect' },
      },
    }],
  };

  const exact = getHealthSnapshotForDate(state, '2026-03-09', { carryForward: false });
  const carried = getHealthSnapshotForDate(state, '2026-03-09');

  assert.equal(exact.steps, 0);
  assert.equal(exact.sleepHours, 0);
  assert.equal(exact.restingBpm, undefined);
  assert.equal(carried.steps, 11000);
  assert.equal(carried.sleepHours, 8);
  assert.equal(carried.restingBpm, 58);
});

test('health snapshot keeps missing optional vitals unset instead of coercing them to zero', () => {
  const state = {
    ...defaultState,
    dailyLogs: [{
      id: 'log-1',
      date: '2026-03-09',
      sleepHours: 7.1,
      bloodPressure: '127/82',
      healthSources: {
        sleep: { provider: 'health-connect' },
        vitals: { provider: 'health-connect' },
      },
    }],
  };

  const snapshot = getHealthSnapshotForDate(state, '2026-03-09', { carryForward: false });

  assert.equal(snapshot.restingBpm, undefined);
  assert.equal(snapshot.avgHeartRate, undefined);
  assert.equal(snapshot.hrvMs, undefined);
  assert.equal(snapshot.oxygenSaturationPercent, undefined);
  assert.equal(snapshot.bloodGlucoseMgDl, undefined);
  assert.equal(snapshot.bloodPressureSystolic, undefined);
  assert.equal(snapshot.bloodPressureDiastolic, undefined);
  assert.equal(snapshot.bloodPressure, '127/82');
});

test('health debug entries are prepended and capped in healthSync state', () => {
  const base = {
    provider: 'health-connect',
    debugEntries: [buildHealthDebugEntry('older entry')],
  };

  const next = appendHealthDebugEntries(base, buildHealthDebugEntry('new entry', { steps: 1000 }));

  assert.equal(next.debugEntries.length, 2);
  assert.equal(next.debugEntries[0].message, 'new entry');
  assert.equal(next.debugEntries[1].message, 'older entry');
  assert.equal(next.debugEntries[0].payload.steps, 1000);
});

test('health activity rows ignore health-connect calorie-only noise but keep manual calorie logs', () => {
  assert.equal(isActionableHealthActivityRow({
    caloriesActive: 1564.5,
    healthSource: { provider: 'health-connect' },
  }), false);

  assert.equal(isActionableHealthActivityRow({
    caloriesActive: 420,
    healthSource: { provider: 'manuel' },
  }), true);

  assert.equal(isActionableHealthActivityRow({
    steps: 2804,
    healthSource: { provider: 'health-connect' },
  }), true);
});
