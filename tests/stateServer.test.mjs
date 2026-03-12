import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startStateServer } from '../scripts/state-server-core.mjs';

const withStateServer = async (overrides, run) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'nutri-state-server-'));
  const started = await startStateServer({
    enabled: true,
    bindHost: '127.0.0.1',
    port: 0,
    stateDir,
    allowedOrigins: 'http://127.0.0.1:3000',
    apiToken: 'test-token',
    ...overrides,
  });

  try {
    const address = started.server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await run({ baseUrl, config: started.config });
  } finally {
    await started.close();
  }
};

test('state server rejects disallowed origins and missing auth', async () => {
  await withStateServer({}, async ({ baseUrl }) => {
    const forbidden = await fetch(`${baseUrl}/api/state`, {
      method: 'GET',
      headers: {
        Origin: 'http://evil.local',
        Authorization: 'Bearer test-token',
      },
    });
    assert.equal(forbidden.status, 403);

    const unauthorized = await fetch(`${baseUrl}/api/state`, {
      method: 'GET',
      headers: {
        Origin: 'http://127.0.0.1:3000',
      },
    });
    assert.equal(unauthorized.status, 401);
  });
});

test('state server validates payloads and serves back persisted state', async () => {
  await withStateServer({}, async ({ baseUrl }) => {
    const invalid = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ foods: 'not-an-array' }),
    });
    assert.equal(invalid.status, 400);

    const valid = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updatedAt: '2026-03-10T10:00:00.000Z',
        selectedDate: '2026-03-10',
        foods: [],
        sessions: [],
        metrics: [],
        dailyLogs: [],
      }),
    });
    assert.equal(valid.status, 200);

    const response = await fetch(`${baseUrl}/api/state`, {
      method: 'GET',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Authorization: 'Bearer test-token',
      },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.updatedAt, '2026-03-10T10:00:00.000Z');
    assert.equal(payload.selectedDate, '2026-03-10');
  });
});

test('state server rate limits repeated requests', async () => {
  await withStateServer({ rateLimitMax: 1, rateLimitWindowMs: 60_000 }, async ({ baseUrl }) => {
    const first = await fetch(`${baseUrl}/api/state`, {
      method: 'GET',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Authorization: 'Bearer test-token',
      },
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${baseUrl}/api/state`, {
      method: 'GET',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Authorization: 'Bearer test-token',
      },
    });
    assert.equal(second.status, 429);
  });
});

test('state server creates snapshots before overwriting local state and can restore them', async () => {
  await withStateServer({}, async ({ baseUrl }) => {
    const headers = {
      Origin: 'http://127.0.0.1:3000',
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    };

    const firstPayload = {
      updatedAt: '2026-03-10T10:00:00.000Z',
      selectedDate: '2026-03-10',
      foods: [],
      sessions: [],
      metrics: [{ date: '2026-03-10', weight: 110.3 }],
      dailyLogs: [],
    };

    const secondPayload = {
      updatedAt: '2026-03-10T11:00:00.000Z',
      selectedDate: '2026-03-10',
      foods: [],
      sessions: [],
      metrics: [{ date: '2026-03-10', weight: 109.9 }],
      dailyLogs: [],
    };

    const firstWrite = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(firstPayload),
    });
    assert.equal(firstWrite.status, 200);

    const secondWrite = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(secondPayload),
    });
    assert.equal(secondWrite.status, 200);

    const snapshotResponse = await fetch(`${baseUrl}/api/state/snapshots`, {
      method: 'GET',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Authorization: 'Bearer test-token',
      },
    });
    assert.equal(snapshotResponse.status, 200);
    const snapshotPayload = await snapshotResponse.json();
    assert.ok(Array.isArray(snapshotPayload.snapshots));
    assert.ok(snapshotPayload.snapshots.length >= 1);
    const firstSnapshot = snapshotPayload.snapshots[0];
    assert.equal(firstSnapshot.stateUpdatedAt, '2026-03-10T10:00:00.000Z');

    const restoreResponse = await fetch(`${baseUrl}/api/state/restore`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ snapshotId: firstSnapshot.id }),
    });
    assert.equal(restoreResponse.status, 200);
    const restorePayload = await restoreResponse.json();
    assert.equal(restorePayload.state.updatedAt, '2026-03-10T10:00:00.000Z');
    assert.equal(restorePayload.state.metrics[0].weight, 110.3);

    const finalStateResponse = await fetch(`${baseUrl}/api/state`, {
      method: 'GET',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Authorization: 'Bearer test-token',
      },
    });
    const finalState = await finalStateResponse.json();
    assert.equal(finalState.updatedAt, '2026-03-10T10:00:00.000Z');
    assert.equal(finalState.metrics[0].weight, 110.3);
  });
});
