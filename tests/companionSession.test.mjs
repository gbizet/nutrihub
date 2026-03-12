import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  encryptToken,
  decryptToken,
  createSessionStore,
  parseSessionCookie,
  buildSessionCookie,
  buildClearSessionCookie,
} from '../scripts/companion-session.mjs';

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

const TEST_KEY = 'a'.repeat(64); // 32 bytes of 0xaa

test('encryptToken / decryptToken round-trips correctly', () => {
  const plaintext = 'my-secret-refresh-token-12345';
  const encrypted = encryptToken(plaintext, TEST_KEY);
  assert.notEqual(encrypted, plaintext);
  assert.match(encrypted, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  const decrypted = decryptToken(encrypted, TEST_KEY);
  assert.equal(decrypted, plaintext);
});

test('encryptToken produces different ciphertext each time (random IV)', () => {
  const plaintext = 'same-token';
  const a = encryptToken(plaintext, TEST_KEY);
  const b = encryptToken(plaintext, TEST_KEY);
  assert.notEqual(a, b);
  assert.equal(decryptToken(a, TEST_KEY), plaintext);
  assert.equal(decryptToken(b, TEST_KEY), plaintext);
});

test('decryptToken with wrong key throws', () => {
  const encrypted = encryptToken('secret', TEST_KEY);
  const wrongKey = 'b'.repeat(64);
  assert.throws(() => decryptToken(encrypted, wrongKey));
});

test('encryptToken rejects invalid key formats', () => {
  assert.throws(() => encryptToken('x', ''), /required/);
  assert.throws(() => encryptToken('x', 'short'), /64-character/);
  assert.throws(() => encryptToken('x', 'z'.repeat(64)), /hex/);
});

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

test('parseSessionCookie extracts session ID', () => {
  assert.equal(parseSessionCookie('nutri_session=abc123; Path=/'), 'abc123');
  assert.equal(parseSessionCookie('other=x; nutri_session=def456; Path=/'), 'def456');
  assert.equal(parseSessionCookie('other=x'), '');
  assert.equal(parseSessionCookie(''), '');
  assert.equal(parseSessionCookie(null), '');
});

test('buildSessionCookie produces HttpOnly SameSite=Lax cookie', () => {
  const cookie = buildSessionCookie('sid123', { secure: true });
  assert.match(cookie, /nutri_session=sid123/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=/);
});

test('buildSessionCookie omits Secure when secure=false', () => {
  const cookie = buildSessionCookie('sid123', { secure: false });
  assert.doesNotMatch(cookie, /Secure/);
});

test('buildClearSessionCookie sets Max-Age=0', () => {
  const cookie = buildClearSessionCookie({ secure: false });
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /nutri_session=deleted/);
});

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

test('session store creates, retrieves and deletes sessions', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'nutri-session-'));
  const store = createSessionStore({ tokenDir: tmpDir, encryptionKey: TEST_KEY });

  const sid = store.createSession({
    access_token: 'at-1',
    refresh_token: 'rt-1',
    expires_in: 3600,
    scope: 'drive.appdata',
  });

  assert.ok(sid);
  assert.equal(typeof sid, 'string');
  assert.equal(sid.length, 64); // 32 bytes hex

  const session = store.getSession(sid);
  assert.ok(session);
  assert.equal(session.accessToken, 'at-1');
  assert.equal(session.refreshToken, 'rt-1');
  assert.equal(session.scope, 'drive.appdata');
  assert.ok(session.expiresAt > Date.now());

  store.deleteSession(sid);
  assert.equal(store.getSession(sid), null);
});

test('session store returns null for unknown or empty session IDs', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'nutri-session-'));
  const store = createSessionStore({ tokenDir: tmpDir, encryptionKey: TEST_KEY });

  assert.equal(store.getSession('nonexistent'), null);
  assert.equal(store.getSession(''), null);
  assert.equal(store.getSession(null), null);
});

test('session store persists to disk and reloads', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'nutri-session-'));

  const store1 = createSessionStore({ tokenDir: tmpDir, encryptionKey: TEST_KEY });
  const sid = store1.createSession({
    access_token: 'at-disk',
    refresh_token: 'rt-disk',
    expires_in: 3600,
    scope: 'drive.file',
  });

  // Wait for async persist
  await new Promise((r) => setTimeout(r, 100));

  // Verify file exists and contains encrypted data
  const filePath = path.join(tmpDir, 'drive-sessions.enc.json');
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  assert.ok(parsed[sid]);
  assert.ok(parsed[sid].refreshTokenEnc);
  assert.doesNotMatch(parsed[sid].refreshTokenEnc, /rt-disk/); // encrypted, not plaintext

  // Load into a new store
  const store2 = createSessionStore({ tokenDir: tmpDir, encryptionKey: TEST_KEY });
  await store2.loadFromDisk();

  const reloaded = store2.getSession(sid);
  assert.ok(reloaded);
  assert.equal(reloaded.refreshToken, 'rt-disk');
  assert.equal(reloaded.scope, 'drive.file');
  assert.equal(reloaded.accessToken, ''); // access token not persisted
});

test('session store updateAccessToken works', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'nutri-session-'));
  const store = createSessionStore({ tokenDir: tmpDir, encryptionKey: TEST_KEY });
  const sid = store.createSession({
    access_token: 'old-at',
    refresh_token: 'rt',
    expires_in: 3600,
    scope: 'scope',
  });

  store.updateAccessToken(sid, 'new-at', 7200);
  const session = store.getSession(sid);
  assert.equal(session.accessToken, 'new-at');
  assert.ok(session.accessTokenExpiresAt > Date.now());
});
