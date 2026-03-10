import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutoHealthImportWindow, deriveHealthStreamDiagnostics } from '../src/lib/healthSyncService.js';
import { HEALTH_COVERAGE_STATUS, HEALTH_PERMISSION_IDS, HEALTH_PROVIDER } from '../src/lib/healthSchema.js';

test('auto health import window reuses last imported date with overlap', () => {
  const window = buildAutoHealthImportWindow(
    {
      provider: HEALTH_PROVIDER.healthConnect,
      lastImportedDate: '2026-03-08',
    },
    {
      overlapDays: 2,
      endDate: '2026-03-10',
    },
  );

  assert.equal(window.mode, 'auto');
  assert.equal(window.startDate, '2026-03-07');
  assert.equal(window.endDate, '2026-03-10');
});

test('health stream diagnostics flag missing permissions and Samsung fallback coverage', () => {
  const diagnostics = deriveHealthStreamDiagnostics(
    {
      healthConnectAvailable: true,
      samsungHealthAvailable: true,
      missingPermissions: [HEALTH_PERMISSION_IDS.readSleep],
      samsungLastError: '',
      samsungReadDataRuntimeError: '',
    },
    {
      sleep: {
        status: HEALTH_COVERAGE_STATUS.sourceAbsent,
      },
      steps: {
        status: HEALTH_COVERAGE_STATUS.available,
        provider: HEALTH_PROVIDER.samsungHealth,
        usedFallback: true,
        lastSeenDate: '2026-03-09',
      },
    },
  );

  const sleep = diagnostics.find((stream) => stream.id === 'sleep');
  const steps = diagnostics.find((stream) => stream.id === 'steps');

  assert.equal(sleep.status, HEALTH_COVERAGE_STATUS.permissionMissing);
  assert.match(sleep.reason, /permission/i);
  assert.equal(steps.status, HEALTH_COVERAGE_STATUS.available);
  assert.equal(steps.usedFallback, true);
  assert.equal(steps.lastSeenDate, '2026-03-09');
});
