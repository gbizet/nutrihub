import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWeightByDay, pointDelta } from '../src/lib/charts.js';

test('aggregateWeightByDay keeps missing dates as null instead of zero', () => {
  const series = aggregateWeightByDay(
    [{ date: '2026-03-09', weight: 110.3 }],
    ['2026-03-08', '2026-03-09', '2026-03-10'],
  );

  assert.deepEqual(series, [
    { date: '2026-03-08', value: null },
    { date: '2026-03-09', value: 110.3 },
    { date: '2026-03-10', value: null },
  ]);
});

test('pointDelta ignores null points instead of treating them as zero', () => {
  const delta = pointDelta([
    { date: '2026-03-08', value: 111.8 },
    { date: '2026-03-09', value: 110.9 },
    { date: '2026-03-10', value: null },
  ]);

  assert.ok(Math.abs(delta - (-0.9)) < 1e-9);
});
