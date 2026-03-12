import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPeriodExport, buildPromptContexts } from '../src/lib/promptExport.js';

test('buildPeriodExport keeps workout exercises and sets in their logged order', () => {
  const state = {
    selectedDate: '2026-03-10',
    goals: { kcal: 2200, protein: 180, carbs: 180, fat: 70 },
    entries: [],
    sessions: [
      {
        id: 's-row',
        date: '2026-03-10',
        workoutId: 'w1',
        workoutLabel: 'Pull',
        exerciseName: 'One Arm Dumbbell Row',
        exerciseOrder: 2,
        category: 'Back',
        equipment: 'Haltere',
        source: 'manual',
        setDetails: [
          {
            setIndex: 2,
            reps: 10,
            loadDisplayed: 30,
            loadEstimated: null,
            timeLabel: '19:30',
            loggedAt: '2026-03-10T18:09:30.000Z',
            elapsedSinceWorkoutStartSec: 570,
            restSincePreviousSetSec: 330,
          },
          {
            setIndex: 1,
            reps: 12,
            loadDisplayed: 28,
            loadEstimated: null,
            timeLabel: '18:00',
            loggedAt: '2026-03-10T18:04:00.000Z',
            elapsedSinceWorkoutStartSec: 240,
            restSincePreviousSetSec: null,
          },
        ],
      },
      {
        id: 's-pull',
        date: '2026-03-10',
        workoutId: 'w1',
        workoutLabel: 'Pull',
        exerciseName: 'Vertical Pulldown',
        exerciseOrder: 1,
        category: 'Back',
        equipment: 'Poulie double',
        source: 'manual',
        setDetails: [
          {
            setIndex: 1,
            reps: 8,
            loadDisplayed: 80,
            loadEstimated: null,
            timeLabel: '17:50',
            loggedAt: '2026-03-10T18:00:00.000Z',
            elapsedSinceWorkoutStartSec: 0,
            restSincePreviousSetSec: null,
          },
        ],
      },
    ],
    exerciseMuscleOverrides: {},
    metrics: [],
    dailyLogs: [],
    healthSync: { provider: 'health-connect' },
  };

  const exported = buildPeriodExport({
    state,
    periodRange: {
      start: '2026-03-10',
      end: '2026-03-10',
      days: ['2026-03-10'],
    },
    limits: {},
  });

  const workout = exported.payload.daily[0].training.workouts[0];
  assert.equal(workout.exercises[0].exercise_name, 'Vertical Pulldown');
  assert.equal(workout.exercises[0].exercise_order, 1);
  assert.equal(workout.exercises[1].exercise_name, 'One Arm Dumbbell Row');
  assert.equal(workout.exercises[1].sets[0].time_label, '18:00');
  assert.equal(workout.exercises[1].sets[1].time_label, '19:30');
  assert.equal(workout.started_at, '2026-03-10T18:00:00.000Z');
  assert.equal(workout.ended_at, '2026-03-10T18:09:30.000Z');
  assert.equal(workout.duration_sec, 570);
  assert.equal(workout.duration_timer, '9:30');
  assert.equal(workout.exercises[1].sets[0].elapsed_since_workout_start_timer, '4:00');
  assert.equal(workout.exercises[1].sets[1].rest_since_previous_set_timer, '5:30');
  assert.match(workout.exercises[1].sets[0].logged_clock_time, /^\d{2}:\d{2}:\d{2}$/);
});

test('buildPromptContexts includes set timing in daily training lines', () => {
  const state = {
    selectedDate: '2026-03-10',
    goals: { kcal: 2200, protein: 180, carbs: 180, fat: 70 },
    metrics: [],
    dailyLogs: [],
    neatLogs: [],
    healthSync: { provider: 'health-connect' },
  };

  const contexts = buildPromptContexts({
    state,
    entriesForSelectedDay: [],
    sessionsForSelectedDay: [
      {
        exerciseName: 'Bench Press',
        setDetails: [
          {
            setIndex: 1,
            reps: 8,
            loadDisplayed: 80,
            timeLabel: '10:02',
            loggedAt: '2026-03-10T10:02:00',
            elapsedSinceWorkoutStartSec: 120,
            restSincePreviousSetSec: null,
          },
          {
            setIndex: 2,
            reps: 8,
            loadDisplayed: 82.5,
            timeLabel: '10:05',
            loggedAt: '2026-03-10T10:05:30',
            elapsedSinceWorkoutStartSec: 330,
            restSincePreviousSetSec: 210,
          },
        ],
      },
    ],
    metricsForSelectedDay: null,
    dailyLogForSelectedDay: null,
    dayMacros: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    limits: {},
    drivePrefs: { mode: 'appData', mirrorAppData: false },
    driveConfig: {},
    weeklyData: {
      start: '2026-03-04',
      end: '2026-03-10',
      mealCount: 0,
      workouts: [],
      sessions: [],
      metrics: [],
      logs: [],
      macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    },
  });

  assert.match(contexts.daily.training, /10:02:00/);
  assert.match(contexts.daily.training, /10:05:30/);
  assert.match(contexts.daily.training, /t\+ 2:00/);
  assert.match(contexts.daily.training, /t\+ 5:30/);
  assert.match(contexts.daily.training, /R 3:30/);
});
