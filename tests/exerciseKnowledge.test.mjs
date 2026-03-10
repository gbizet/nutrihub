import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMuscleGroup,
  resolveMuscleGroupShares,
  resolveMuscleGroupSharesWithOverrides,
  isMeaningfulExerciseName,
  normalizeExerciseMappingKey,
  rankWorkedMuscleGroups,
} from '../src/lib/exerciseKnowledge.js';

test('bench maps to chest primary', () => {
  const group = resolveMuscleGroup('Bench Press', 'Push');
  assert.equal(group, 'chest');
  const shares = resolveMuscleGroupShares('Bench Press', 'Push');
  assert.ok(shares.chest > shares.shoulders);
});

test('generic headers are not meaningful exercise names', () => {
  assert.equal(isMeaningfulExerciseName('Serie Charge Reps'), false);
  assert.equal(isMeaningfulExerciseName('Developpe couche'), true);
});

test('short french aliases map to expected groups', () => {
  assert.equal(resolveMuscleGroup('SDT top set', 'Imported'), 'legs');
  assert.equal(resolveMuscleGroup('Shrugs', 'Imported'), 'back');
  assert.equal(resolveMuscleGroup('Pecs lourd bench', 'Imported'), 'chest');
});

test('manual overrides replace automatic muscle shares', () => {
  const overrideKey = normalizeExerciseMappingKey('Bench Press');
  const shares = resolveMuscleGroupSharesWithOverrides('Bench Press', 'Push', {
    [overrideKey]: {
      shoulders: 0.7,
      chest: 0.3,
    },
  });

  assert.ok(shares.shoulders > shares.chest);
  assert.equal(Number((shares.shoulders + shares.chest).toFixed(3)), 1);
});

test('rankWorkedMuscleGroups returns dominant groups from a workout day', () => {
  const ranked = rankWorkedMuscleGroups([
    { exerciseName: 'Bench Press', category: 'Push', sets: 5, reps: 8, load: 80 },
    { exerciseName: 'Cable Row', category: 'Back', sets: 4, reps: 10, load: 55 },
    { exerciseName: 'Overhead Press', category: 'Shoulders', sets: 1, reps: 8, load: 45 },
  ]);

  assert.deepEqual(
    ranked.map((row) => row.group),
    ['chest', 'back', 'arms'],
  );
});
