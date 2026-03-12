import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  hydratePersistedState,
  validatePersistedDashboardStateCandidate,
} from '../src/lib/dashboardStateSchema.js';
import {
  createSessionStore,
  parseSessionCookie,
  buildSessionCookie,
  buildClearSessionCookie,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
  proxyDriveRequest,
} from './companion-session.mjs';

const DEFAULT_ALLOWED_ORIGIN = 'http://127.0.0.1:3000,http://localhost:3000';
const DEFAULT_API_TOKEN = 'dev-local-state-token';
const DEFAULT_RATE_LIMIT_MAX = 60;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_SNAPSHOT_KEEP = 24;
const MAX_STATE_BODY_BYTES = 4 * 1024 * 1024;
const SNAPSHOT_FILE_PREFIX = 'dashboard-state-snapshot-';

const parsePositiveInteger = (value, fallback) => {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const parsePort = (value, fallback) => {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

const normalizeAllowedOrigins = (value = DEFAULT_ALLOWED_ORIGIN) =>
  `${value || ''}`
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const clientIp = (req) => `${req.socket?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown'}`;

const buildCorsHeaders = (req, config) => {
  const origin = `${req.headers.origin || ''}`.trim();
  if (!origin || !config.allowedOrigins.includes(origin)) {
    return {
      Vary: 'Origin',
    };
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    Vary: 'Origin',
  };
};

const writeAuditLog = (req, status, detail = {}) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ip: clientIp(req),
    route: `${req.url || ''}`,
    method: `${req.method || 'GET'}`,
    status,
    ...detail,
  }));
};

const ensureDir = async (stateDir) => {
  await mkdir(stateDir, { recursive: true });
};

const sanitizeSnapshotStamp = (value = new Date().toISOString()) =>
  `${value}`.replace(/[:.]/g, '-');

const buildSnapshotId = (createdAt = new Date().toISOString()) =>
  `${sanitizeSnapshotStamp(createdAt)}-${Math.random().toString(16).slice(2, 8)}`;

const buildSnapshotFileName = (snapshotId) => `${SNAPSHOT_FILE_PREFIX}${snapshotId}.json`;

const readStateFile = async (stateFile) => {
  try {
    const raw = await readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    const validation = validatePersistedDashboardStateCandidate(parsed);
    if (!validation.ok) {
      const error = new Error(`State file schema invalide: ${validation.issues.join(', ')}`);
      error.statusCode = 500;
      throw error;
    }
    return hydratePersistedState(parsed) || {};
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
};

const readJsonFile = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const hydrateSnapshotPayload = async (filePath) => {
  const raw = await readJsonFile(filePath);
  if (raw?.snapshotVersion === 1 && raw?.payload && typeof raw.payload === 'object') {
    return raw;
  }
  const hydratedState = hydratePersistedState(raw);
  if (!hydratedState) {
    const error = new Error('Snapshot payload invalide.');
    error.statusCode = 500;
    throw error;
  }
  return {
    snapshotVersion: 1,
    id: path.basename(filePath, '.json').replace(/^dashboard-state-snapshot-/, ''),
    createdAt: hydratedState.updatedAt || new Date().toISOString(),
    reason: 'legacy-file',
    label: '',
    stateUpdatedAt: hydratedState.updatedAt || '',
    selectedDate: hydratedState.selectedDate || '',
    payload: hydratedState,
  };
};

const listSnapshotMetadata = async (snapshotDir) => {
  await ensureDir(snapshotDir);
  const names = (await readdir(snapshotDir))
    .filter((name) => name.startsWith(SNAPSHOT_FILE_PREFIX) && name.endsWith('.json'))
    .sort()
    .reverse();
  const snapshots = [];
  for (const name of names) {
    const filePath = path.join(snapshotDir, name);
    try {
      const snapshot = await hydrateSnapshotPayload(filePath);
      const fileStat = await stat(filePath);
      snapshots.push({
        id: snapshot.id,
        createdAt: snapshot.createdAt || '',
        reason: snapshot.reason || '',
        label: snapshot.label || '',
        stateUpdatedAt: snapshot.stateUpdatedAt || '',
        selectedDate: snapshot.selectedDate || '',
        sizeBytes: fileStat.size,
        fileName: name,
      });
    } catch {
      // Ignore corrupt snapshot files; they should not block listing.
    }
  }
  return snapshots;
};

const pruneSnapshotFiles = async (snapshotDir, keep = DEFAULT_SNAPSHOT_KEEP) => {
  const snapshots = await listSnapshotMetadata(snapshotDir);
  const stale = snapshots.slice(Math.max(0, keep));
  await Promise.all(stale.map((snapshot) => rm(path.join(snapshotDir, snapshot.fileName), { force: true })));
  return snapshots.slice(0, keep);
};

const writeSnapshotFile = async (snapshotDir, payload, options = {}) => {
  const hydratedState = hydratePersistedState(payload);
  if (!hydratedState) {
    const error = new Error('Snapshot state invalide.');
    error.statusCode = 400;
    throw error;
  }
  await ensureDir(snapshotDir);
  const createdAt = new Date().toISOString();
  const snapshotId = buildSnapshotId(createdAt);
  const snapshot = {
    snapshotVersion: 1,
    id: snapshotId,
    createdAt,
    reason: `${options.reason || ''}`.trim() || 'manual',
    label: `${options.label || ''}`.trim(),
    stateUpdatedAt: hydratedState.updatedAt || '',
    selectedDate: hydratedState.selectedDate || '',
    payload: hydratedState,
  };
  await writeFile(
    path.join(snapshotDir, buildSnapshotFileName(snapshotId)),
    JSON.stringify(snapshot, null, 2),
    'utf8',
  );
  await pruneSnapshotFiles(snapshotDir, options.keepSnapshots);
  return snapshot;
};

const snapshotExistingStateFile = async (stateFile, snapshotDir, options = {}) => {
  try {
    const currentState = await readStateFile(stateFile);
    if (!currentState || Object.keys(currentState).length === 0) return null;
    return writeSnapshotFile(snapshotDir, currentState, options);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const writeStateFile = async (stateFile, payload) => {
  const stateDir = path.dirname(stateFile);
  await ensureDir(stateDir);
  const tempFile = `${stateFile}.tmp`;
  await writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf8');
  await rename(tempFile, stateFile);
};

const collectBody = async (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_STATE_BODY_BYTES) {
        const error = new Error('Payload too large');
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });

const createRateLimiter = (config) => {
  const entries = new Map();
  return (req) => {
    const now = Date.now();
    const ip = clientIp(req);
    const previous = (entries.get(ip) || []).filter((timestamp) => now - timestamp < config.rateLimitWindowMs);
    if (previous.length >= config.rateLimitMax) {
      entries.set(ip, previous);
      return false;
    }
    previous.push(now);
    entries.set(ip, previous);
    return true;
  };
};

const isAuthorized = (req, config) => req.headers.authorization === `Bearer ${config.apiToken}`;

const isOriginAllowed = (req, config) => {
  const origin = `${req.headers.origin || ''}`.trim();
  return !origin || config.allowedOrigins.includes(origin);
};

const normalizeConfig = (input = {}) => {
  const cwd = input.cwd || process.cwd();
  const stateDir = input.stateDir || path.resolve(cwd, 'data');
  return {
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : false,
    bindHost: input.bindHost || '127.0.0.1',
    port: parsePort(input.port, 8787),
    stateDir,
    stateFile: input.stateFile || path.join(stateDir, 'dashboard-state.json'),
    snapshotDir: input.snapshotDir || path.join(stateDir, 'snapshots'),
    snapshotKeep: parsePositiveInteger(input.snapshotKeep, DEFAULT_SNAPSHOT_KEEP),
    allowedOrigins: normalizeAllowedOrigins(input.allowedOrigins),
    apiToken: `${input.apiToken || DEFAULT_API_TOKEN}`.trim() || DEFAULT_API_TOKEN,
    rateLimitMax: parsePositiveInteger(input.rateLimitMax, DEFAULT_RATE_LIMIT_MAX),
    rateLimitWindowMs: parsePositiveInteger(input.rateLimitWindowMs, DEFAULT_RATE_LIMIT_WINDOW_MS),
    // Drive OAuth (Phase 2)
    googleClientId: `${input.googleClientId || ''}`.trim(),
    googleClientSecret: `${input.googleClientSecret || ''}`.trim(),
    googleRedirectOrigin: `${input.googleRedirectOrigin || ''}`.trim(),
    tokenEncryptionKey: `${input.tokenEncryptionKey || ''}`.trim(),
    sessionSecret: `${input.sessionSecret || ''}`.trim(),
    secureCookies: input.secureCookies !== undefined ? Boolean(input.secureCookies) : true,
  };
};

const sendJson = (req, res, config, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...buildCorsHeaders(req, config),
  });
  res.end(JSON.stringify(payload));
  writeAuditLog(req, status);
};

export const resolveStateServerConfig = (env = process.env, cwd = process.cwd()) => normalizeConfig({
  cwd,
  enabled: env.STATE_ENABLE === '1',
  bindHost: env.STATE_BIND_HOST || '127.0.0.1',
  port: env.STATE_PORT || '8787',
  stateDir: env.STATE_DIR ? path.resolve(cwd, env.STATE_DIR) : path.resolve(cwd, 'data'),
  allowedOrigins: env.STATE_ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN,
  apiToken: env.STATE_API_TOKEN || DEFAULT_API_TOKEN,
  rateLimitMax: env.STATE_RATE_LIMIT_MAX || DEFAULT_RATE_LIMIT_MAX,
  rateLimitWindowMs: env.STATE_RATE_LIMIT_WINDOW_MS || DEFAULT_RATE_LIMIT_WINDOW_MS,
  snapshotDir: env.STATE_SNAPSHOT_DIR ? path.resolve(cwd, env.STATE_SNAPSHOT_DIR) : path.join(path.resolve(cwd, 'data'), 'snapshots'),
  snapshotKeep: env.STATE_SNAPSHOT_KEEP || DEFAULT_SNAPSHOT_KEEP,
  // Drive OAuth (Phase 2)
  googleClientId: env.GOOGLE_OAUTH_CLIENT_ID || '',
  googleClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  googleRedirectOrigin: env.GOOGLE_OAUTH_REDIRECT_ORIGIN || '',
  tokenEncryptionKey: env.GOOGLE_TOKEN_ENCRYPTION_KEY || '',
  sessionSecret: env.COMPANION_SESSION_SECRET || '',
  secureCookies: env.COMPANION_SECURE_COOKIES !== '0',
});

const isDriveConfigured = (config) =>
  Boolean(config.googleClientId && config.googleClientSecret && config.tokenEncryptionKey);

const sendJsonWithCookie = (req, res, config, status, payload, cookie = '') => {
  const headers = {
    'Content-Type': 'application/json',
    ...buildCorsHeaders(req, config),
    'Access-Control-Allow-Credentials': 'true',
  };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
  writeAuditLog(req, status);
};

const requireXhr = (req) => {
  const xrw = `${req.headers['x-requested-with'] || ''}`;
  return xrw === 'XmlHttpRequest' || xrw === 'XMLHttpRequest';
};

const getSessionAccessToken = async (session, config) => {
  if (session.accessToken && Date.now() < (session.accessTokenExpiresAt || 0)) {
    return session.accessToken;
  }
  if (!session.refreshToken) return null;
  const tokens = await refreshAccessToken(session.refreshToken, {
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
  });
  session.accessToken = tokens.access_token;
  session.accessTokenExpiresAt = Date.now() + (Number(tokens.expires_in || 3600) - 60) * 1000;
  return session.accessToken;
};

export const createStateServer = (input = {}) => {
  const config = normalizeConfig(input);
  const allowRequest = createRateLimiter(config);
  const sessionStore = isDriveConfigured(config)
    ? createSessionStore({
        tokenDir: config.stateDir,
        encryptionKey: config.tokenEncryptionKey,
      })
    : null;

  const server = createServer(async (req, res) => {
    const route = `${req.url || ''}`.split('?')[0];

    if (!isOriginAllowed(req, config)) {
      sendJson(req, res, config, 403, { error: 'Origin not allowed' });
      return;
    }

    if (req.method === 'OPTIONS') {
      const corsHeaders = {
        ...buildCorsHeaders(req, config),
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      };
      res.writeHead(204, corsHeaders);
      res.end();
      writeAuditLog(req, 204);
      return;
    }

    if (!allowRequest(req)) {
      sendJson(req, res, config, 429, { error: 'Rate limit exceeded' });
      return;
    }

    if (route === '/health') {
      sendJson(req, res, config, 200, {
        ok: true,
        enabled: config.enabled,
        driveConfigured: isDriveConfigured(config),
        file: config.stateFile,
      });
      return;
    }

    // ---------------------------------------------------------------
    // /api/state — existing state persistence (bearer token auth)
    // ---------------------------------------------------------------
    if (route === '/api/state/snapshots') {
      if (!isAuthorized(req, config)) {
        sendJson(req, res, config, 401, { error: 'Unauthorized' });
        return;
      }

      try {
        if (req.method === 'GET') {
          const snapshots = await listSnapshotMetadata(config.snapshotDir);
          sendJson(req, res, config, 200, { snapshots });
          return;
        }

        if (req.method === 'POST') {
          const raw = await collectBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const nextState = body?.state ? hydratePersistedState(body.state) : await readStateFile(config.stateFile);
          if (!nextState) {
            sendJson(req, res, config, 400, { error: 'No valid state available for snapshot.' });
            return;
          }
          const snapshot = await writeSnapshotFile(config.snapshotDir, nextState, {
            reason: body?.reason || 'manual-api',
            label: body?.label || '',
            keepSnapshots: config.snapshotKeep,
          });
          sendJson(req, res, config, 200, {
            ok: true,
            snapshot: {
              id: snapshot.id,
              createdAt: snapshot.createdAt,
              reason: snapshot.reason,
              label: snapshot.label,
              stateUpdatedAt: snapshot.stateUpdatedAt,
              selectedDate: snapshot.selectedDate,
            },
          });
          return;
        }

        sendJson(req, res, config, 405, { error: 'Method not allowed' });
      } catch (error) {
        const status = Number(error?.statusCode || 500);
        sendJson(req, res, config, status, {
          error: error?.message || 'Unexpected error',
        });
      }
      return;
    }

    if (route === '/api/state/restore') {
      if (!isAuthorized(req, config)) {
        sendJson(req, res, config, 401, { error: 'Unauthorized' });
        return;
      }

      try {
        if (req.method !== 'POST') {
          sendJson(req, res, config, 405, { error: 'Method not allowed' });
          return;
        }

        const raw = await collectBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const snapshotId = `${body?.snapshotId || ''}`.trim();
        if (!snapshotId) {
          sendJson(req, res, config, 400, { error: 'Missing snapshotId.' });
          return;
        }
        const snapshotPath = path.join(config.snapshotDir, buildSnapshotFileName(snapshotId));
        const snapshot = await hydrateSnapshotPayload(snapshotPath);
        if (!snapshot?.payload) {
          sendJson(req, res, config, 404, { error: 'Snapshot not found.' });
          return;
        }
        await snapshotExistingStateFile(config.stateFile, config.snapshotDir, {
          reason: 'before-restore',
          label: `restore:${snapshotId}`,
          keepSnapshots: config.snapshotKeep,
        });
        await writeStateFile(config.stateFile, snapshot.payload);
        sendJson(req, res, config, 200, {
          ok: true,
          restoredAt: new Date().toISOString(),
          snapshot: {
            id: snapshot.id,
            createdAt: snapshot.createdAt,
            reason: snapshot.reason,
            label: snapshot.label,
            stateUpdatedAt: snapshot.stateUpdatedAt,
            selectedDate: snapshot.selectedDate,
          },
          state: snapshot.payload,
        });
      } catch (error) {
        const status = error?.code === 'ENOENT' ? 404 : Number(error?.statusCode || 500);
        sendJson(req, res, config, status, {
          error: error?.message || 'Unexpected error',
        });
      }
      return;
    }

    if (route === '/api/state') {
      if (!isAuthorized(req, config)) {
        sendJson(req, res, config, 401, { error: 'Unauthorized' });
        return;
      }

      try {
        if (req.method === 'GET') {
          const payload = await readStateFile(config.stateFile);
          sendJson(req, res, config, 200, payload);
          return;
        }

        if (req.method === 'PUT') {
          const raw = await collectBody(req);
          const parsed = JSON.parse(raw || '{}');
          const validation = validatePersistedDashboardStateCandidate(parsed);
          if (!validation.ok) {
            sendJson(req, res, config, 400, {
              error: 'Invalid dashboard state payload',
              issues: validation.issues,
            });
            return;
          }

          const hydrated = hydratePersistedState(parsed);
          if (!hydrated) {
            sendJson(req, res, config, 400, { error: 'Invalid dashboard state payload' });
            return;
          }

          await snapshotExistingStateFile(config.stateFile, config.snapshotDir, {
            reason: 'pre-write',
            label: hydrated.updatedAt || '',
            keepSnapshots: config.snapshotKeep,
          });
          await writeStateFile(config.stateFile, hydrated);
          sendJson(req, res, config, 200, { ok: true });
          return;
        }

        sendJson(req, res, config, 405, { error: 'Method not allowed' });
      } catch (error) {
        const status = Number(error?.statusCode || 500);
        sendJson(req, res, config, status, {
          error: error?.message || 'Unexpected error',
        });
      }
      return;
    }

    // ---------------------------------------------------------------
    // /api/drive/* — Phase 2 Drive proxy (session cookie auth)
    // ---------------------------------------------------------------
    if (route.startsWith('/api/drive/')) {
      if (!isDriveConfigured(config) || !sessionStore) {
        sendJson(req, res, config, 501, { error: 'Drive proxy not configured.' });
        return;
      }

      // POST /api/drive/auth/code — exchange authorization code for tokens
      if (route === '/api/drive/auth/code' && req.method === 'POST') {
        if (!requireXhr(req)) {
          sendJson(req, res, config, 403, { error: 'X-Requested-With header required.' });
          return;
        }
        try {
          const raw = await collectBody(req);
          const body = JSON.parse(raw || '{}');
          if (!body.code || typeof body.code !== 'string') {
            sendJson(req, res, config, 400, { error: 'Missing authorization code.' });
            return;
          }
          const tokens = await exchangeCodeForTokens(body.code, {
            clientId: config.googleClientId,
            clientSecret: config.googleClientSecret,
            redirectUri: 'postmessage',
          });
          const sid = sessionStore.createSession(tokens);
          const cookie = buildSessionCookie(sid, { secure: config.secureCookies });
          writeAuditLog(req, 200, { detail: 'drive-auth-code-exchange' });
          sendJsonWithCookie(req, res, config, 200, {
            ok: true,
            scope: tokens.scope || '',
            expiresIn: tokens.expires_in || 3600,
          }, cookie);
        } catch (error) {
          const status = Number(error?.statusCode || 500);
          sendJson(req, res, config, status, {
            error: error?.message || 'Code exchange failed.',
          });
        }
        return;
      }

      // GET /api/drive/session — check session status
      if (route === '/api/drive/session' && req.method === 'GET') {
        const sid = parseSessionCookie(req.headers.cookie);
        const session = sessionStore.getSession(sid);
        sendJsonWithCookie(req, res, config, 200, {
          active: Boolean(session),
          scope: session?.scope || '',
          hasRefreshToken: Boolean(session?.refreshToken),
        });
        return;
      }

      // DELETE /api/drive/session — logout / revoke
      if (route === '/api/drive/session' && req.method === 'DELETE') {
        const sid = parseSessionCookie(req.headers.cookie);
        const session = sessionStore.getSession(sid);
        if (session) {
          if (session.refreshToken) {
            try { await revokeToken(session.refreshToken); } catch { /* best effort */ }
          } else if (session.accessToken) {
            try { await revokeToken(session.accessToken); } catch { /* best effort */ }
          }
          sessionStore.deleteSession(sid);
        }
        const cookie = buildClearSessionCookie({ secure: config.secureCookies });
        writeAuditLog(req, 200, { detail: 'drive-session-deleted' });
        sendJsonWithCookie(req, res, config, 200, { ok: true }, cookie);
        return;
      }

      // --- All remaining /api/drive/* routes require a valid session ---
      const sid = parseSessionCookie(req.headers.cookie);
      const session = sessionStore.getSession(sid);
      if (!session) {
        sendJson(req, res, config, 401, { error: 'Drive session expired or missing.' });
        return;
      }

      // GET /api/drive/files?q=...&spaces=...&fields=...&orderBy=...&pageSize=...&pageToken=...
      if (route === '/api/drive/files' && req.method === 'GET') {
        try {
          const accessToken = await getSessionAccessToken(session, config);
          if (!accessToken) {
            sendJson(req, res, config, 401, { error: 'Unable to obtain Drive access token.' });
            return;
          }
          const qs = `${req.url || ''}`.split('?')[1] || '';
          const driveResp = await proxyDriveRequest(accessToken, `/files?${qs}`);
          const body = await driveResp.text();
          res.writeHead(driveResp.status, {
            'Content-Type': 'application/json',
            ...buildCorsHeaders(req, config),
            'Access-Control-Allow-Credentials': 'true',
          });
          res.end(body);
          writeAuditLog(req, driveResp.status);
        } catch (error) {
          sendJson(req, res, config, 502, { error: error?.message || 'Drive proxy error.' });
        }
        return;
      }

      // GET /api/drive/files/:id?alt=media — download file content
      const fileDownloadMatch = route.match(/^\/api\/drive\/files\/([^/]+)$/);
      if (fileDownloadMatch && req.method === 'GET') {
        try {
          const accessToken = await getSessionAccessToken(session, config);
          if (!accessToken) {
            sendJson(req, res, config, 401, { error: 'Unable to obtain Drive access token.' });
            return;
          }
          const fileId = fileDownloadMatch[1];
          const qs = `${req.url || ''}`.split('?')[1] || '';
          const driveResp = await proxyDriveRequest(accessToken, `/files/${encodeURIComponent(fileId)}?${qs}`);
          const ct = driveResp.headers.get('content-type') || 'application/json';
          const body = await driveResp.text();
          res.writeHead(driveResp.status, {
            'Content-Type': ct,
            ...buildCorsHeaders(req, config),
            'Access-Control-Allow-Credentials': 'true',
          });
          res.end(body);
          writeAuditLog(req, driveResp.status);
        } catch (error) {
          sendJson(req, res, config, 502, { error: error?.message || 'Drive proxy error.' });
        }
        return;
      }

      // POST /api/drive/files — create file (multipart upload)
      if (route === '/api/drive/files' && req.method === 'POST') {
        try {
          const accessToken = await getSessionAccessToken(session, config);
          if (!accessToken) {
            sendJson(req, res, config, 401, { error: 'Unable to obtain Drive access token.' });
            return;
          }
          const raw = await collectBody(req);
          const qs = `${req.url || ''}`.split('?')[1] || '';
          const driveResp = await proxyDriveRequest(accessToken, `/files?${qs}`, {
            upload: qs.includes('uploadType=multipart'),
            method: 'POST',
            headers: {
              'Content-Type': req.headers['content-type'] || 'application/json',
            },
            body: raw,
          });
          const body = await driveResp.text();
          res.writeHead(driveResp.status, {
            'Content-Type': 'application/json',
            ...buildCorsHeaders(req, config),
            'Access-Control-Allow-Credentials': 'true',
          });
          res.end(body);
          writeAuditLog(req, driveResp.status);
        } catch (error) {
          sendJson(req, res, config, 502, { error: error?.message || 'Drive proxy error.' });
        }
        return;
      }

      // PATCH /api/drive/files/:id — update file (multipart upload)
      if (fileDownloadMatch && req.method === 'PATCH') {
        try {
          const accessToken = await getSessionAccessToken(session, config);
          if (!accessToken) {
            sendJson(req, res, config, 401, { error: 'Unable to obtain Drive access token.' });
            return;
          }
          const fileId = fileDownloadMatch[1];
          const qs = `${req.url || ''}`.split('?')[1] || '';
          const raw = await collectBody(req);
          const driveResp = await proxyDriveRequest(accessToken, `/files/${encodeURIComponent(fileId)}?${qs}`, {
            upload: qs.includes('uploadType=multipart'),
            method: 'PATCH',
            headers: {
              'Content-Type': req.headers['content-type'] || 'application/json',
            },
            body: raw,
          });
          const body = await driveResp.text();
          res.writeHead(driveResp.status, {
            'Content-Type': 'application/json',
            ...buildCorsHeaders(req, config),
            'Access-Control-Allow-Credentials': 'true',
          });
          res.end(body);
          writeAuditLog(req, driveResp.status);
        } catch (error) {
          sendJson(req, res, config, 502, { error: error?.message || 'Drive proxy error.' });
        }
        return;
      }

      sendJson(req, res, config, 404, { error: 'Drive route not found.' });
      return;
    }

    sendJson(req, res, config, 404, { error: 'Not found' });
  });

  return {
    server,
    config,
    sessionStore,
  };
};

export const startStateServer = async (input = {}) => {
  const { server, config, sessionStore } = createStateServer(input);
  await ensureDir(path.dirname(config.stateFile));
  await ensureDir(config.snapshotDir);
  if (sessionStore) {
    await sessionStore.loadFromDisk();
  }
  await new Promise((resolve) => server.listen(config.port, config.bindHost, resolve));
  return {
    server,
    config,
    sessionStore,
    close: async () => {
      if (sessionStore) {
        await sessionStore.persistToDisk().catch(() => {});
      }
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
};
