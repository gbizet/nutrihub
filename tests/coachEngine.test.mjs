import test from 'node:test';
import assert from 'node:assert/strict';
import { nutritionSignalsForDay, readinessScore } from '../src/lib/coachEngine.js';

test('nutrition signals compute protein/carbs/hydration compliance flags', () => {
  const state = {
    goals: { protein: 150, carbs: 180 },
    limits: { kcal: { min: 1800, max: 2400 }, protein: { min: 140, max: 220 }, carbs: { min: 100, max: 180 }, fat: { min: 45, max: 90 } },
    entries: [{ date: '2026-02-25', macros: { kcal: 1500, protein: 120, carbs: 40, fat: 70 } }],
    dailyLogs: [{ date: '2026-02-25', sodiumMg: 2800, hydrationMl: 2200 }],
  };
  const s = nutritionSignalsForDay(state, '2026-02-25');
  assert.equal(s.isCarbsOk, true);
  assert.equal(s.isProteinOk, false);
  assert.equal(s.isSodiumOk, false);
  assert.equal(s.isHydrationOk, false);
});

test('readiness decreases with fatigue and bad compliance', () => {
  const state = {
    goals: { protein: 180, carbs: 180 },
    limits: { kcal: { min: 1800, max: 2400 }, protein: { min: 160, max: 220 }, carbs: { min: 100, max: 180 }, fat: { min: 45, max: 90 } },
    entries: [{ date: '2026-02-25', macros: { kcal: 1200, protein: 60, carbs: 90, fat: 40 } }],
    dailyLogs: [{ date: '2026-02-25', fatigueNervousSystem: 8, sleepHours: 5.5, sodiumMg: 1000, hydrationMl: 1200 }],
  };
  const score = readinessScore(state, '2026-02-25');
  assert.ok(score < 60);
});
