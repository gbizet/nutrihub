import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCompactTextRows,
  parsePortableCutRows,
  parseTrainingToSessions,
} from '../src/lib/dataImportParsers.js';

test('compact text parser tolerates accented low-macro markers', () => {
  const rows = parseCompactTextRows('2026\n09-03 111.3 2200 180 g tres bas tres bas Push 3x8 bench');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-03-09');
  assert.equal(rows[0].weight_morning_kg, 111.3);
  assert.equal(rows[0].protein_g, 180);
  assert.equal(rows[0].carbs_g, null);
  assert.equal(rows[0].fat_g, null);
});

test('portable cut parser keeps cut-day note and training text', () => {
  const rows = parsePortableCutRows('2026\n09-03 J4 111.0 2100 170 g tres bas 65 g Marche 45 min');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].notes.includes('jour_cut: J4'), true);
  assert.equal(rows[0].training, 'Marche 45 min');
});

test('free training parser detects cardio duration and load x reps blocks', () => {
  const sessions = parseTrainingToSessions(
    {
      date: '2026-03-09',
      training: 'Marche 30 min + curl barre ez 80x8',
    },
    () => 'uid-test',
  );

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].exerciseName, 'Marche');
  assert.equal(sessions[0].reps, 30);
  assert.equal(sessions[1].exerciseName, 'EZ Bar Curl');
  assert.equal(sessions[1].load, 80);
  assert.equal(sessions[1].reps, 8);
});
