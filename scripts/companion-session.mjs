/**
 * Session management and token encryption for the companion server.
 * Handles:
 * - Opaque session IDs via HttpOnly cookies
 * - AES-256-GCM encryption of refresh tokens at rest
 * - In-memory session store with optional disk persistence
 * - Google OAuth code-for-token exchange
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const SESSION_COOKIE_NAME = 'nutri_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

const deriveKeyBuffer = (hexKey) => {
  if (!hexKey || typeof hexKey !== 'string') {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY is required (64-char hex string for AES-256).');
  }
  const cleaned = hexKey.replace(/\s/g, '');
  if (cleaned.length !== 64 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(cleaned, 'hex');
};

export const encryptToken = (plaintext, hexKey) => {
  const key = deriveKeyBuffer(hexKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decryptToken = (encryptedString, hexKey) => {
  const key = deriveKeyBuffer(hexKey);
  const parts = encryptedString.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted token format.');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const ciphertext = Buffer.from(parts[2], 'hex');
  const decipher = createDecipheriv(ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
};

// ---------------------------------------------------------------------------
// Session store (in-memory with disk backup for refresh tokens)
// ---------------------------------------------------------------------------

export const createSessionStore = (config = {}) => {
  const sessions = new Map();
  const tokenDir = config.tokenDir || config.stateDir || process.cwd();
  const encryptionKey = config.encryptionKey || '';
  const tokenFilePath = path.join(tokenDir, 'drive-sessions.enc.json');

  const generateSessionId = () => randomBytes(32).toString('hex');

  const isExpired = (session) => Date.now() > (session.expiresAt || 0);

  const persistToDisk = async () => {
    if (!encryptionKey) return;
    const serializable = {};
    for (const [sid, session] of sessions) {
      if (isExpired(session)) continue;
      serializable[sid] = {
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        scope: session.scope || '',
        refreshTokenEnc: session.refreshToken
          ? encryptToken(session.refreshToken, encryptionKey)
          : '',
      };
    }
    await mkdir(tokenDir, { recursive: true });
    const tmpFile = `${tokenFilePath}.tmp`;
    await writeFile(tmpFile, JSON.stringify(serializable, null, 2), 'utf8');
    await rename(tmpFile, tokenFilePath);
  };

  const loadFromDisk = async () => {
    if (!encryptionKey) return;
    try {
      const raw = await readFile(tokenFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      for (const [sid, data] of Object.entries(parsed)) {
        if (!data || typeof data !== 'object') continue;
        if (Date.now() > (data.expiresAt || 0)) continue;
        sessions.set(sid, {
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          scope: data.scope || '',
          accessToken: '', // will be refreshed on demand
          accessTokenExpiresAt: 0,
          refreshToken: data.refreshTokenEnc
            ? decryptToken(data.refreshTokenEnc, encryptionKey)
            : '',
        });
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.error('[companion-session] Failed to load sessions from disk:', error.message);
      }
    }
  };

  const createSession = (tokens) => {
    const sid = generateSessionId();
    const now = Date.now();
    sessions.set(sid, {
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      scope: tokens.scope || '',
      accessToken: tokens.access_token || '',
      accessTokenExpiresAt: tokens.expires_in
        ? now + (Number(tokens.expires_in) - 60) * 1000
        : 0,
      refreshToken: tokens.refresh_token || '',
    });
    persistToDisk().catch((err) => console.error('[companion-session] persist error:', err.message));
    return sid;
  };

  const getSession = (sid) => {
    if (!sid) return null;
    const session = sessions.get(sid);
    if (!session) return null;
    if (isExpired(session)) {
      sessions.delete(sid);
      return null;
    }
    return session;
  };

  const deleteSession = (sid) => {
    sessions.delete(sid);
    persistToDisk().catch((err) => console.error('[companion-session] persist error:', err.message));
  };

  const updateAccessToken = (sid, accessToken, expiresIn) => {
    const session = sessions.get(sid);
    if (!session) return;
    session.accessToken = accessToken;
    session.accessTokenExpiresAt = Date.now() + (Number(expiresIn) - 60) * 1000;
  };

  return {
    createSession,
    getSession,
    deleteSession,
    updateAccessToken,
    loadFromDisk,
    persistToDisk,
    get size() { return sessions.size; },
  };
};

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export const parseSessionCookie = (cookieHeader) => {
  if (!cookieHeader) return '';
  const match = `${cookieHeader}`.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : '';
};

export const buildSessionCookie = (sessionId, options = {}) => {
  const secure = options.secure !== false;
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
};

export const buildClearSessionCookie = (options = {}) => {
  const secure = options.secure !== false;
  const parts = [
    `${SESSION_COOKIE_NAME}=deleted`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=0`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
};

// ---------------------------------------------------------------------------
// Google OAuth code exchange
// ---------------------------------------------------------------------------

export const exchangeCodeForTokens = async (code, config = {}) => {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri || 'postmessage',
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Google token exchange failed: ${response.status} ${body}`);
    error.statusCode = 502;
    throw error;
  }
  return response.json();
};

export const refreshAccessToken = async (refreshToken, config = {}) => {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Google token refresh failed: ${response.status} ${body}`);
    error.statusCode = 502;
    throw error;
  }
  return response.json();
};

export const revokeToken = async (token) => {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};

// ---------------------------------------------------------------------------
// Drive API proxy helpers
// ---------------------------------------------------------------------------

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export const proxyDriveRequest = async (accessToken, path, options = {}) => {
  const base = options.upload ? DRIVE_UPLOAD_BASE : DRIVE_API_BASE;
  const url = `${base}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
    body: options.body || undefined,
  });
  return response;
};

export const SESSION_COOKIE_NAME_EXPORT = SESSION_COOKIE_NAME;
