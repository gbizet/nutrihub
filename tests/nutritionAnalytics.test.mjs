import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateActivityCalories,
  estimateBaseCalories,
  estimateTrainingCalories,
  formatStepActivityMeta,
} from '../src/lib/nutritionAnalytics.js';

test('estimateBaseCalories returns a BMR-style resting energy from weight and body fat', () => {
  const result = estimateBaseCalories({
    weightKg: 110.30000305175781,
    bodyFatPercent: 37.5,
  });

  assert.equal(result.method, 'BMR repos');
  assert.equal(result.formula, 'poids + BF');
  assert.equal(Math.round(result.kcal), 1859);
});

test('estimateActivityCalories uses step-based NEAT instead of health active calories on logged training days', () => {
  const result = estimateActivityCalories({
    neatRow: {
      steps: 6960,
      activeMinutes: 54,
      caloriesActive: 1049.55029296875,
      healthSource: { provider: 'health-connect' },
    },
    weightKg: 110.30000305175781,
    hasLoggedTraining: true,
  });

  assert.equal(result.mode, 'steps-neat');
  assert.equal(result.source, 'pas x poids');
  assert.equal(Math.round(result.kcal), 384);
  assert.equal(formatStepActivityMeta(result), 'NEAT hors seance | 6960 pas');
});

test('estimateActivityCalories keeps health active calories on non-training days', () => {
  const result = estimateActivityCalories({
    neatRow: {
      steps: 6960,
      activeMinutes: 54,
      caloriesActive: 1049.55029296875,
      healthSource: { provider: 'health-connect' },
    },
    weightKg: 110.30000305175781,
    hasLoggedTraining: false,
  });

  assert.equal(result.mode, 'health-active-kcal');
  assert.equal(result.source, 'calories actives sante');
  assert.equal(Math.round(result.kcal), 1050);
  assert.equal(formatStepActivityMeta(result), 'calories actives sante');
});

test('estimateActivityCalories keeps the legacy step/cardio fallback when health active calories are absent', () => {
  const stepDriven = estimateActivityCalories({
    neatRow: {
      steps: 5000,
      activeMinutes: 20,
      caloriesActive: 0,
      healthSource: { provider: 'manual' },
    },
    weightKg: 100,
    hasLoggedTraining: false,
  });
  const cardioDriven = estimateActivityCalories({
    neatRow: {
      steps: 0,
      activeMinutes: 20,
      cardioMin: 20,
      caloriesActive: 0,
      healthSource: { provider: 'manual' },
    },
    weightKg: 100,
    hasLoggedTraining: false,
  });

  assert.equal(stepDriven.mode, 'steps-estimate');
  assert.equal(Math.round(stepDriven.kcal), 250);
  assert.equal(cardioDriven.mode, 'cardio-estimate');
  assert.equal(Math.round(cardioDriven.kcal), 70);
});

test('training-day total no longer double counts health activity calories and sport auto', () => {
  const base = estimateBaseCalories({
    weightKg: 110.30000305175781,
    bodyFatPercent: 37.5,
  });
  const activity = estimateActivityCalories({
    neatRow: {
      steps: 6960,
      activeMinutes: 54,
      caloriesActive: 1049.55029296875,
      healthSource: { provider: 'health-connect' },
    },
    weightKg: 110.30000305175781,
    hasLoggedTraining: true,
  });
  const training = estimateTrainingCalories({
    weightKg: 110.30000305175781,
    sessions: [
      {
        durationMin: 34,
        setDetails: new Array(17).fill({}),
      },
    ],
  });

  const total = base.kcal + activity.kcal + training.kcal;

  assert.equal(Math.round(training.kcal), 150);
  assert.equal(Math.round(total), 2393);
});
