import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../src/lib/dashboardStore.js';
import { mergeHealthImportIntoState } from '../src/lib/healthImport.js';

test('health import merges weight, steps, sleep and resting heart rate into shared state', () => {
  const importedAt = '2026-03-09T18:30:00.000Z';
  const next = mergeHealthImportIntoState(defaultState, {
    provider: 'health-connect',
    importedAt,
    startDate: '2026-03-08',
    endDate: '2026-03-08',
    deviceName: 'samsung SM-G990B2',
    permissions: ['android.permission.health.READ_WEIGHT'],
    records: {
      bodyMetrics: [
        {
          date: '2026-03-08',
          capturedAt: '2026-03-08T07:15:00.000Z',
          weightKg: 111.4,
          sourceRecordId: 'weight-1',
          sourcePackage: 'com.sec.android.app.shealth',
        },
      ],
      activity: [
        {
          date: '2026-03-08',
          capturedAt: '2026-03-08T23:59:59.000Z',
          steps: 9234,
          sourcePackage: 'com.sec.android.app.shealth',
        },
      ],
      sleep: [
        {
          date: '2026-03-08',
          capturedAt: '2026-03-08T06:20:00.000Z',
          startTime: '2026-03-07T22:50:00.000Z',
          endTime: '2026-03-08T06:20:00.000Z',
          sleepHours: 7.5,
          sourceRecordId: 'sleep-1',
          sourcePackage: 'com.sec.android.app.shealth',
        },
      ],
      vitals: [
        {
          date: '2026-03-08',
          capturedAt: '2026-03-08T07:25:00.000Z',
          restingHeartRate: 58,
          heartRateAvg: 72,
          hrvMs: 44,
          bloodPressureSystolic: 122,
          bloodPressureDiastolic: 78,
          oxygenSaturationPercent: 97.4,
          bloodGlucoseMgDl: 92,
          sourceRecordId: 'rhr-1',
          sourcePackage: 'com.withings.wiscale2',
        },
      ],
    },
  });

  const metric = next.metrics.find((row) => row.date === '2026-03-08');
  const neat = next.neatLogs.find((row) => row.date === '2026-03-08');
  const daily = next.dailyLogs.find((row) => row.date === '2026-03-08');

  assert.equal(metric.weight, 111.4);
  assert.equal(metric.healthSource.provider, 'health-connect');
  assert.equal(metric.healthSource.sourcePackage, 'com.sec.android.app.shealth');
  assert.equal(neat.steps, 9234);
  assert.equal(neat.healthSource.sourcePackage, 'com.sec.android.app.shealth');
  assert.equal(daily.sleepHours, 7.5);
  assert.equal(daily.restingBpm, 58);
  assert.equal(daily.avgHeartRate, 72);
  assert.equal(daily.hrvMs, 44);
  assert.equal(daily.bloodPressure, '122/78');
  assert.equal(daily.oxygenSaturationPercent, 97.4);
  assert.equal(daily.bloodGlucoseMgDl, 92);
  assert.equal(daily.healthSources.sleep.sourcePackage, 'com.sec.android.app.shealth');
  assert.equal(daily.healthSources.vitals.sourcePackage, 'com.withings.wiscale2');
  assert.equal(next.healthSync.lastImportAt, importedAt);
  assert.match(next.healthSync.lastImportSummary, /1 mesures/);
});

test('health import skips empty activity rows so bogus totals do not pollute neat logs', () => {
  const seededState = {
    ...defaultState,
    neatLogs: [{
      id: 'neat-noise',
      date: '2026-03-09',
      steps: 0,
      activeMinutes: 0,
      caloriesActive: 1564.5,
      healthSource: {
        provider: 'health-connect',
      },
    }],
  };

  const next = mergeHealthImportIntoState(seededState, {
    provider: 'health-connect',
    importedAt: '2026-03-09T19:10:00.000Z',
    startDate: '2026-03-09',
    endDate: '2026-03-09',
    deviceName: 'samsung SM-G990B2',
    records: {
      activity: [
        {
          date: '2026-03-09',
          capturedAt: '2026-03-09T23:59:59.000Z',
          steps: 0,
          activeMinutes: 0,
          activeCalories: 0,
          sourcePackage: 'com.sec.android.app.shealth',
        },
      ],
    },
  });

  assert.equal(next.neatLogs.length, 0);
  assert.match(next.healthSync.lastImportSummary, /Aucune donnee importee/);
});

test('health import keeps Samsung calorie-only activity rows so Samsung fallback remains usable', () => {
  const next = mergeHealthImportIntoState(defaultState, {
    provider: 'samsung-health',
    importedAt: '2026-03-09T19:30:00.000Z',
    startDate: '2026-03-09',
    endDate: '2026-03-09',
    deviceName: 'samsung SM-G990B2',
    records: {
      activity: [
        {
          date: '2026-03-09',
          capturedAt: '2026-03-09T22:59:59.000Z',
          provider: 'samsung-health',
          activeCalories: 412.5,
          sourcePackage: 'com.sec.android.app.shealth',
        },
      ],
    },
  });

  const neat = next.neatLogs.find((row) => row.date === '2026-03-09');

  assert.equal(neat.caloriesActive, 412.5);
  assert.equal(neat.healthSource.provider, 'samsung-health');
});

test('health import preserves per-row provider so Samsung fallback can coexist with Health Connect', () => {
  const next = mergeHealthImportIntoState(defaultState, {
    provider: 'health-connect',
    importedAt: '2026-03-09T21:30:00.000Z',
    startDate: '2026-03-09',
    endDate: '2026-03-09',
    deviceName: 'samsung SM-G990B2',
    records: {
      bodyMetrics: [
        {
          date: '2026-03-09',
          capturedAt: '2026-03-09T07:10:00.000Z',
          provider: 'samsung-health',
          weightKg: 111.1,
          bodyFatPercent: 24.2,
          sourceRecordId: 'body-composition-1',
          sourcePackage: 'com.sec.android.app.shealth',
        },
      ],
      vitals: [
        {
          date: '2026-03-09',
          capturedAt: '2026-03-09T08:20:00.000Z',
          provider: 'health-connect',
          heartRateAvg: 61,
          sourceRecordId: 'vitals-1',
          sourcePackage: 'com.sec.android.app.shealth',
        },
      ],
    },
  });

  const metric = next.metrics.find((row) => row.date === '2026-03-09');
  const daily = next.dailyLogs.find((row) => row.date === '2026-03-09');

  assert.equal(metric.healthSource.provider, 'samsung-health');
  assert.equal(daily.healthSources.vitals.provider, 'health-connect');
});

test('health import keeps missing vitals unset instead of coercing them to zero', () => {
  const next = mergeHealthImportIntoState(defaultState, {
    provider: 'samsung-health',
    importedAt: '2026-03-10T00:10:00.000Z',
    startDate: '2026-03-09',
    endDate: '2026-03-09',
    deviceName: 'samsung SM-G990B2',
    records: {
      vitals: [
        {
          date: '2026-03-09',
          capturedAt: '2026-03-09T08:20:00.000Z',
          heartRateAvg: 72,
          bloodPressureSystolic: 127,
          bloodPressureDiastolic: 82,
          sourceRecordId: 'vitals-2',
          sourcePackage: 'com.sec.android.app.shealth',
        },
      ],
    },
  });

  const daily = next.dailyLogs.find((row) => row.date === '2026-03-09');

  assert.equal(daily.avgHeartRate, 72);
  assert.equal(daily.bloodPressure, '127/82');
  assert.equal(daily.restingBpm, undefined);
  assert.equal(daily.hrvMs, undefined);
  assert.equal(daily.oxygenSaturationPercent, undefined);
  assert.equal(daily.bloodGlucoseMgDl, undefined);
});
