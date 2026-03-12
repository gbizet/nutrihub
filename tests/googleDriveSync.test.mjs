import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCompanionBaseUrl,
  getStoredGoogleDriveToken,
  listGoogleDriveSyncFiles,
} from '../src/lib/googleDriveSync.js';

const createStorage = (seed = {}) => {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
};

test('web token storage migrates legacy localStorage token into sessionStorage', () => {
  const previousWindow = global.window;
  global.window = {
    localStorage: createStorage({
      'nutri-google-drive-token': JSON.stringify({ accessToken: 'legacy-token', scope: 'scope-visible' }),
    }),
    sessionStorage: createStorage(),
  };

  try {
    const token = getStoredGoogleDriveToken();
    assert.equal(token.accessToken, 'legacy-token');
    assert.match(global.window.localStorage.getItem('nutri-google-drive-token'), /legacy-token/);
    assert.equal(global.window.sessionStorage.getItem('nutri-google-drive-token'), null);
  } finally {
    global.window = previousWindow;
  }
});

test('drive file listing follows nextPageToken pagination', async () => {
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(`${url}`);
    const parsed = new URL(url);
    const pageToken = parsed.searchParams.get('pageToken');
    if (!pageToken) {
      return new Response(JSON.stringify({
        files: [{ id: 'file-1', name: 'nutri-sport-hub-sync.json' }],
        nextPageToken: 'page-2',
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      files: [{ id: 'file-2', name: 'nutri-sport-hub-sync.json' }],
    }), { status: 200 });
  };

  try {
    const files = await listGoogleDriveSyncFiles('token');
    assert.equal(files.length, 2);
    assert.equal(files[1].id, 'file-2');
    assert.match(calls[1], /pageToken=page-2/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('companion base url strips the remote state endpoint before drive auth routes are appended', () => {
  assert.equal(
    resolveCompanionBaseUrl('http://127.0.0.1:8787/api/state'),
    'http://127.0.0.1:8787',
  );
  assert.equal(
    resolveCompanionBaseUrl('https://example.com/companion/api/state/'),
    'https://example.com/companion',
  );
});
