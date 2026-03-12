import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startStateServer } from '../scripts/state-server-core.mjs';

const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

const withDriveServer = async (overrides, run) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'nutri-drive-server-'));
  const started = await startStateServer({
    enabled: true,
    bindHost: '127.0.0.1',
    port: 0,
    stateDir,
    allowedOrigins: 'http://127.0.0.1:3000',
    apiToken: 'test-token',
    googleClientId: 'test-client-id',
    googleClientSecret: 'test-client-secret',
    tokenEncryptionKey: TEST_ENCRYPTION_KEY,
    secureCookies: false,
    ...overrides,
  });

  try {
    const address = started.server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await run({ baseUrl, config: started.config, sessionStore: started.sessionStore });
  } finally {
    await started.close();
  }
};

test('GET /api/drive/session returns inactive when no session', async () => {
  await withDriveServer({}, async ({ baseUrl }) => {
    const resp = await fetch(`${baseUrl}/api/drive/session`, {
      headers: { Origin: 'http://127.0.0.1:3000' },
    });
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.active, false);
    assert.equal(body.scope, '');
    assert.equal(body.hasRefreshToken, false);
  });
});

test('POST /api/drive/auth/code rejects missing X-Requested-With', async () => {
  await withDriveServer({}, async ({ baseUrl }) => {
    const resp = await fetch(`${baseUrl}/api/drive/auth/code`, {
      method: 'POST',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: 'test-code' }),
    });
    assert.equal(resp.status, 403);
    const body = await resp.json();
    assert.match(body.error, /X-Requested-With/);
  });
});

test('POST /api/drive/auth/code rejects missing code', async () => {
  await withDriveServer({}, async ({ baseUrl }) => {
    const resp = await fetch(`${baseUrl}/api/drive/auth/code`, {
      method: 'POST',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XmlHttpRequest',
      },
      body: JSON.stringify({}),
    });
    assert.equal(resp.status, 400);
    const body = await resp.json();
    assert.match(body.error, /code/i);
  });
});

test('Drive proxy endpoints return 501 when Drive is not configured', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'nutri-nodrive-'));
  const started = await startStateServer({
    enabled: true,
    bindHost: '127.0.0.1',
    port: 0,
    stateDir,
    allowedOrigins: 'http://127.0.0.1:3000',
    apiToken: 'test-token',
    // No Drive config
    googleClientId: '',
    googleClientSecret: '',
    tokenEncryptionKey: '',
  });

  try {
    const address = started.server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const resp = await fetch(`${baseUrl}/api/drive/session`, {
      headers: { Origin: 'http://127.0.0.1:3000' },
    });
    assert.equal(resp.status, 501);
  } finally {
    await started.close();
  }
});

test('Drive proxy file endpoints require session', async () => {
  await withDriveServer({}, async ({ baseUrl }) => {
    const resp = await fetch(`${baseUrl}/api/drive/files?spaces=appDataFolder`, {
      headers: { Origin: 'http://127.0.0.1:3000' },
    });
    assert.equal(resp.status, 401);
    const body = await resp.json();
    assert.match(body.error, /session/i);
  });
});

test('DELETE /api/drive/session clears session cookie', async () => {
  await withDriveServer({}, async ({ baseUrl, sessionStore }) => {
    // Manually create a session
    const sid = sessionStore.createSession({
      access_token: 'test-at',
      refresh_token: 'test-rt',
      expires_in: 3600,
      scope: 'drive.appdata',
    });

    const resp = await fetch(`${baseUrl}/api/drive/session`, {
      method: 'DELETE',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Cookie: `nutri_session=${sid}`,
      },
    });
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.ok, true);

    // Clear cookie is set
    const setCookie = resp.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /Max-Age=0/);

    // Session is gone
    assert.equal(sessionStore.getSession(sid), null);
  });
});

test('GET /api/drive/session returns active for valid session', async () => {
  await withDriveServer({}, async ({ baseUrl, sessionStore }) => {
    const sid = sessionStore.createSession({
      access_token: 'test-at',
      refresh_token: 'test-rt',
      expires_in: 3600,
      scope: 'drive.appdata drive.file',
    });

    const resp = await fetch(`${baseUrl}/api/drive/session`, {
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Cookie: `nutri_session=${sid}`,
      },
    });
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.active, true);
    assert.equal(body.scope, 'drive.appdata drive.file');
    assert.equal(body.hasRefreshToken, true);
  });
});

test('CORS allows credentials on Drive endpoints', async () => {
  await withDriveServer({}, async ({ baseUrl }) => {
    const resp = await fetch(`${baseUrl}/api/drive/session`, {
      headers: { Origin: 'http://127.0.0.1:3000' },
    });
    const allowCreds = resp.headers.get('access-control-allow-credentials');
    assert.equal(allowCreds, 'true');
  });
});

test('OPTIONS on Drive endpoint returns proper CORS headers', async () => {
  await withDriveServer({}, async ({ baseUrl }) => {
    const resp = await fetch(`${baseUrl}/api/drive/auth/code`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://127.0.0.1:3000' },
    });
    assert.equal(resp.status, 204);
    const allowHeaders = resp.headers.get('access-control-allow-headers');
    assert.ok(allowHeaders);
    assert.match(allowHeaders, /X-Requested-With/i);
    const allowCreds = resp.headers.get('access-control-allow-credentials');
    assert.equal(allowCreds, 'true');
  });
});

test('/health endpoint reports driveConfigured status', async () => {
  await withDriveServer({}, async ({ baseUrl }) => {
    const resp = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://127.0.0.1:3000' },
    });
    const body = await resp.json();
    assert.equal(body.driveConfigured, true);
  });
});
