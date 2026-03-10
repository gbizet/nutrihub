import test from 'node:test';
import assert from 'node:assert/strict';
import { countLoggedMeals, countLoggedMealsForWindow, groupSessionsIntoWorkouts } from '../src/lib/domainModel.js';

test('countLoggedMeals groups food lines into distinct daily meals', () => {
  const entries = [
    { id: '1', date: '2026-03-09', meal: 'dejeuner', foodName: 'Poulet' },
    { id: '2', date: '2026-03-09', meal: 'dejeuner', foodName: 'Riz' },
    { id: '3', date: '2026-03-09', meal: 'diner', foodName: 'Steak' },
    { id: '4', date: '2026-03-09', meal: '', foodName: 'Snack libre' },
    { id: '5', date: '2026-03-09', meal: null, foodName: 'Dessert libre' },
  ];

  assert.equal(countLoggedMeals(entries), 3);
});

test('countLoggedMealsForWindow keeps the same meal slot on different days distinct', () => {
  const entries = [
    { id: '1', date: '2026-03-08', meal: 'dejeuner', foodName: 'Poulet' },
    { id: '2', date: '2026-03-08', meal: 'dejeuner', foodName: 'Riz' },
    { id: '3', date: '2026-03-09', meal: 'dejeuner', foodName: 'Steak' },
    { id: '4', date: '2026-03-09', meal: 'diner', foodName: 'Haricots' },
  ];

  assert.equal(countLoggedMealsForWindow(entries), 3);
});

test('groupSessionsIntoWorkouts rebuilds workout -> exercises -> sets from flat session rows', () => {
  const workouts = groupSessionsIntoWorkouts([
    {
      id: 's1',
      date: '2026-03-09',
      workoutId: 'w1',
      workoutLabel: 'Push A',
      exerciseName: 'Bench Press',
      sets: 3,
      reps: 8,
      load: 80,
    },
    {
      id: 's2',
      date: '2026-03-09',
      workoutId: 'w1',
      workoutLabel: 'Push A',
      exerciseName: 'Incline Bench Press',
      setDetails: [
        { setIndex: 1, reps: 10, loadDisplayed: 26, loadEstimated: null },
        { setIndex: 2, reps: 10, loadDisplayed: 26, loadEstimated: null },
      ],
    },
  ]);

  assert.equal(workouts.length, 1);
  assert.equal(workouts[0].title, 'Push A');
  assert.equal(workouts[0].exerciseCount, 2);
  assert.equal(workouts[0].totalSets, 5);
  assert.equal(workouts[0].exercises[0].workoutId, 'w1');
});
