import test from 'node:test';
import assert from 'node:assert/strict';
import { ketoSignalsForDay, readinessScore } from '../src/lib/coachEngine.js';

test('keto signals compute net carbs and compliance flags', () => {
  const state = {
    keto: { netCarbMax: 30, fiberGEstimate: 10, leanMassKgEstimate: 70, proteinPerLeanKgTarget: 2.0, sodiumMgMin: 3000 },
    entries: [{ date: '2026-02-25', macros: { kcal: 1500, protein: 120, carbs: 40, fat: 70 } }],
    dailyLogs: [{ date: '2026-02-25', sodiumMg: 2800 }],
  };
  const s = ketoSignalsForDay(state, '2026-02-25');
  assert.equal(s.netCarb, 30);
  assert.equal(s.isNetCarbOk, true);
  assert.equal(s.isSodiumOk, false);
});

test('readiness decreases with fatigue and bad compliance', () => {
  const state = {
    keto: { netCarbMax: 20, fiberGEstimate: 0, leanMassKgEstimate: 70, proteinPerLeanKgTarget: 2.2, sodiumMgMin: 3500 },
    entries: [{ date: '2026-02-25', macros: { kcal: 1200, protein: 60, carbs: 90, fat: 40 } }],
    dailyLogs: [{ date: '2026-02-25', fatigueNervousSystem: 8, sleepHours: 5.5, sodiumMg: 1000 }],
  };
  const score = readinessScore(state, '2026-02-25');
  assert.ok(score < 60);
});

