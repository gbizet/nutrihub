import { nativeDriveAuthorize, nativeDriveDisconnect } from './nativeDriveAuth';
import { appendSyncDebugLog } from './syncDebug.js';

const DRIVE_SCOPES = {
  appData: 'https://www.googleapis.com/auth/drive.appdata',
  visible: 'https://www.googleapis.com/auth/drive.file',
};
const DRIVE_FILE_NAME = 'nutri-sport-hub-sync.json';
const DRIVE_VISIBLE_FOLDER_NAME = 'Nutri Sport Hub';
const DEVICE_ID_KEY = 'nutri-sync-device-id';
const TOKEN_KEY = 'nutri-google-drive-token';
const PREFS_KEY = 'nutri-google-drive-sync-prefs';
const SYNC_RUNTIME_KEY = 'nutri-google-drive-sync-runtime';
export const DRIVE_SYNC_EVENT = 'nutri-drive-sync';
const GIS_SCRIPT_ID = 'google-identity-services';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const DRIVE_SYNC_MODES = {
  appData: 'appData',
  visible: 'visible',
};

export const isNativeMobileRuntime = () => {
  if (typeof window === 'undefined') return false;
  const capacitor = window.Capacitor;
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform();
  if (typeof capacitor.getPlatform === 'function') return capacitor.getPlatform() !== 'web';
  return false;
};

const driveApi = (path) => `https://www.googleapis.com/drive/v3${path}`;
const driveUploadApi = (path) => `https://www.googleapis.com/upload/drive/v3${path}`;

const randomString = (length = 32) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join('');
};

const getTokenStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

const saveStoredToken = (token) => {
  const storage = getTokenStorage();
  if (!storage) return;
  storage.setItem(TOKEN_KEY, JSON.stringify(token));
};

const clearStoredToken = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
};

export const normalizeDriveSyncPreferences = (input = {}) => {
  const mode = input?.mode === DRIVE_SYNC_MODES.visible ? DRIVE_SYNC_MODES.visible : DRIVE_SYNC_MODES.appData;
  return {
    mode,
    mirrorAppData: mode === DRIVE_SYNC_MODES.visible ? Boolean(input?.mirrorAppData) : false,
  };
};

export const getDriveSyncPreferences = () => {
  if (typeof window === 'undefined') return normalizeDriveSyncPreferences();
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return normalizeDriveSyncPreferences();
    return normalizeDriveSyncPreferences(JSON.parse(raw));
  } catch {
    return normalizeDriveSyncPreferences();
  }
};

export const saveDriveSyncPreferences = (input) => {
  if (typeof window === 'undefined') return normalizeDriveSyncPreferences(input);
  const normalized = normalizeDriveSyncPreferences(input);
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(normalized));
  return normalized;
};

const syncRuntimeKeyForPrefs = (preferences = {}) => {
  const normalized = normalizeDriveSyncPreferences(preferences);
  return `${normalized.mode}|mirror:${normalized.mirrorAppData ? 1 : 0}`;
};

const getDriveSyncRuntime = () => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(SYNC_RUNTIME_KEY) || '{}');
  } catch {
    return {};
  }
};

const saveDriveSyncRuntime = (runtime) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SYNC_RUNTIME_KEY, JSON.stringify(runtime || {}));
};

export const getLastSuccessfulDrivePushUpdatedAt = (preferences = {}) => {
  const runtime = getDriveSyncRuntime();
  return runtime[syncRuntimeKeyForPrefs(preferences)] || '';
};

export const emitDriveSyncEvent = (detail = {}) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(DRIVE_SYNC_EVENT, { detail }));
};

export const markDriveSyncCheckpoint = (updatedAt, preferences = {}, meta = {}) => {
  if (!updatedAt) return;
  const normalizedPreferences = normalizeDriveSyncPreferences(preferences);
  const runtime = getDriveSyncRuntime();
  runtime[syncRuntimeKeyForPrefs(normalizedPreferences)] = updatedAt;
  saveDriveSyncRuntime(runtime);
  appendSyncDebugLog('googleDriveSync', 'markDriveSyncCheckpoint', {
    updatedAt,
    preferences: normalizedPreferences,
    kind: meta.kind || 'checkpoint',
  });
  emitDriveSyncEvent({
    kind: meta.kind || 'checkpoint',
    updatedAt,
    preferences: normalizedPreferences,
    targetLabel: meta.targetLabel || describeDriveSyncTarget(normalizedPreferences.mode),
  });
};

export const markSuccessfulDrivePush = (updatedAt, preferences = {}, meta = {}) => {
  markDriveSyncCheckpoint(updatedAt, preferences, { ...meta, kind: 'push-success' });
};

export const getStoredGoogleDriveToken = () => {
  if (typeof window === 'undefined') return null;
  try {
    const localRaw = window.localStorage.getItem(TOKEN_KEY);
    const sessionRaw = window.sessionStorage.getItem(TOKEN_KEY);
    const raw = localRaw || sessionRaw;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken) return null;
    if (!localRaw && sessionRaw) {
      window.localStorage.setItem(TOKEN_KEY, sessionRaw);
    }
    return parsed;
  } catch {
    return null;
  }
};

const isTokenFresh = (token) => Boolean(token?.accessToken) && Number(token?.expiresAt || 0) > Date.now() + 60_000;
const splitScopeString = (scopeString = '') => `${scopeString}`.split(/\s+/).map((x) => x.trim()).filter(Boolean);
const uniqueScopes = (scopes = []) => Array.from(new Set(scopes.filter(Boolean)));
export const tokenHasScopes = (token, requiredScopes = []) => {
  const granted = new Set(splitScopeString(token?.scope));
  return uniqueScopes(requiredScopes).every((scope) => granted.has(scope));
};

export const ensureDeviceId = () => {
  if (typeof window === 'undefined') return 'server-device';
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = (crypto?.randomUUID?.() || randomString(32)).toString();
  window.localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
};

export const getGoogleDriveConfig = () => ({
  clientId: import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || '',
  fileName: import.meta.env.VITE_GOOGLE_DRIVE_FILE_NAME || DRIVE_FILE_NAME,
  visibleFolderName: import.meta.env.VITE_GOOGLE_DRIVE_VISIBLE_FOLDER_NAME || DRIVE_VISIBLE_FOLDER_NAME,
});

export const getRequiredGoogleDriveScopes = (preferences = getDriveSyncPreferences()) => {
  const normalized = normalizeDriveSyncPreferences(preferences);
  const scopes = [
    normalized.mode === DRIVE_SYNC_MODES.visible ? DRIVE_SCOPES.visible : DRIVE_SCOPES.appData,
  ];
  if (normalized.mirrorAppData) scopes.push(DRIVE_SCOPES.appData);
  return uniqueScopes(scopes);
};

export const describeDriveSyncTarget = (mode, config = getGoogleDriveConfig()) => (
  mode === DRIVE_SYNC_MODES.visible ? `Mon Drive/${config.visibleFolderName}` : 'appDataFolder'
);

const stripLocalOnlyState = (state) => {
  if (!state || typeof state !== 'object') return state;
  const next = { ...state };
  delete next.stateSnapshots;
  delete next.layouts;
  delete next.dashboards;
  return next;
};

export const buildSyncEnvelope = (state, options = {}) => {
  const sanitizedState = stripLocalOnlyState(state);
  const updatedAt = options.updatedAt || sanitizedState?.updatedAt || new Date().toISOString();
  const deviceId = options.deviceId || ensureDeviceId();
  return {
    schema_version: 1,
    app: 'nutri-sport-hub',
    updated_at: updatedAt,
    device_id: deviceId,
    selected_date: sanitizedState?.selectedDate || null,
    payload: sanitizedState,
  };
};

export const compareSyncEnvelopes = (localEnvelope, remoteEnvelope) => {
  const localAt = Date.parse(localEnvelope?.updated_at || 0);
  const remoteAt = Date.parse(remoteEnvelope?.updated_at || 0);
  let comparison = 'equal';
  if (!Number.isFinite(localAt) && !Number.isFinite(remoteAt)) comparison = 'equal';
  else if (localAt > remoteAt) comparison = 'local-newer';
  else if (remoteAt > localAt) comparison = 'remote-newer';
  return comparison;
};

let gisScriptPromise = null;

export const ensureGoogleIdentityScript = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Identity indisponible cote serveur.'));
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google), { once: true });
      existing.addEventListener('error', () => reject(new Error('Chargement Google Identity echoue.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Chargement Google Identity echoue.'));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
};

export const requestGoogleDriveAccessToken = async ({ forceConsent = false, preferences } = {}) => {
  const config = getGoogleDriveConfig();
  if (!config.clientId) {
    throw new Error('VITE_GOOGLE_DRIVE_CLIENT_ID manquant.');
  }

  const requiredScopes = getRequiredGoogleDriveScopes(preferences);
  let stored = getStoredGoogleDriveToken();
  if (forceConsent && !isNativeMobileRuntime() && stored?.accessToken) {
    appendSyncDebugLog('googleDriveSync', 'force consent clears stored token first', {
      scopes: requiredScopes,
    });
    clearStoredToken();
    stored = null;
  }
  const storedHasScopes = tokenHasScopes(stored, requiredScopes);
  if (!forceConsent && isTokenFresh(stored) && storedHasScopes) {
    appendSyncDebugLog('googleDriveSync', 'reuse stored token', {
      forceConsent,
      scopes: requiredScopes,
    });
    return stored.accessToken;
  }
  if (isNativeMobileRuntime()) {
    appendSyncDebugLog('googleDriveSync', 'request native token', {
      forceConsent,
      scopes: requiredScopes,
    });
    const response = await nativeDriveAuthorize(requiredScopes);
    const token = {
      accessToken: response?.accessToken || '',
      scope: response?.grantedScopes || requiredScopes.join(' '),
      tokenType: response?.tokenType || 'Bearer',
      expiresAt: Date.now() + Math.max(0, Number(response?.expiresIn || 3300) - 60) * 1000,
    };
    if (!token.accessToken) {
      throw new Error('Android n a pas renvoye de token Google Drive.');
    }
    saveStoredToken(token);
    appendSyncDebugLog('googleDriveSync', 'native token granted', {
      expiresAt: token.expiresAt,
      scope: token.scope,
    });
    return token.accessToken;
  }

  if (!window.google?.accounts?.oauth2) {
    await ensureGoogleIdentityScript();
  }

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: requiredScopes.join(' '),
      callback: (response) => {
        if (!response || response.error) {
          reject(new Error(response?.error || 'Autorisation Google Drive refusee.'));
          return;
        }
        const token = {
          accessToken: response.access_token,
          scope: response.scope || requiredScopes.join(' '),
          tokenType: response.token_type || 'Bearer',
          expiresAt: Date.now() + Math.max(0, Number(response.expires_in || 3600) - 60) * 1000,
        };
        saveStoredToken(token);
        resolve(token.accessToken);
      },
      error_callback: (error) => {
        appendSyncDebugLog('googleDriveSync', 'token client popup error', error);
        reject(new Error(error?.type || 'Autorisation Google Drive interrompue.'));
      },
    });

    appendSyncDebugLog('googleDriveSync', 'requestAccessToken start', {
      forceConsent,
      storedHadScopes: storedHasScopes,
      scopes: requiredScopes,
    });
    tokenClient.requestAccessToken({
      prompt: forceConsent ? 'select_account' : !stored || !storedHasScopes ? 'consent' : '',
    });
  });
};

export const revokeGoogleDriveAccess = async () => {
  const stored = getStoredGoogleDriveToken();
  if (isNativeMobileRuntime()) {
    if (stored?.accessToken) {
      await nativeDriveDisconnect(stored.accessToken);
    }
    clearStoredToken();
    return;
  }
  await ensureGoogleIdentityScript();
  if (stored?.accessToken && window.google?.accounts?.oauth2?.revoke) {
    await new Promise((resolve) => {
      window.google.accounts.oauth2.revoke(stored.accessToken, () => resolve());
    });
  }
  clearStoredToken();
};

const escapeDriveQueryValue = (value = '') => `${value}`.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const authorizedJsonFetch = async (accessToken, url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive ${response.status}: ${text || response.statusText}`);
  }

  if (response.status === 204) return null;
  return response.json();
};

const buildMultipartRequest = (metadata, payload) => {
  const boundary = `nutri-sync-${randomString(12)}`;
  const body =
    `--${boundary}\r\n`
    + 'Content-Type: application/json; charset=UTF-8\r\n\r\n'
    + `${JSON.stringify(metadata)}\r\n`
    + `--${boundary}\r\n`
    + 'Content-Type: application/json; charset=UTF-8\r\n\r\n'
    + `${JSON.stringify(payload)}\r\n`
    + `--${boundary}--`;

  return {
    boundary,
    body,
  };
};

export const listGoogleDriveSyncFiles = async (accessToken) => {
  const config = getGoogleDriveConfig();
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${escapeDriveQueryValue(config.fileName)}' and trashed=false`,
    pageSize: '10',
    fields: 'files(id,name,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
  });
  const data = await authorizedJsonFetch(accessToken, `${driveApi('/files')}?${params.toString()}`);
  return data?.files || [];
};

const listVisibleDriveFolders = async (accessToken, folderName) => {
  const params = new URLSearchParams({
    q: `mimeType='${DRIVE_FOLDER_MIME}' and name='${escapeDriveQueryValue(folderName)}' and trashed=false`,
    pageSize: '10',
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
  });
  const data = await authorizedJsonFetch(accessToken, `${driveApi('/files')}?${params.toString()}`);
  return data?.files || [];
};

const listVisibleDriveSyncFiles = async (accessToken, folderId, fileName) => {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and name='${escapeDriveQueryValue(fileName)}' and trashed=false`,
    pageSize: '10',
    fields: 'files(id,name,modifiedTime,size,parents)',
    orderBy: 'modifiedTime desc',
  });
  const data = await authorizedJsonFetch(accessToken, `${driveApi('/files')}?${params.toString()}`);
  return data?.files || [];
};

const listVisibleDriveSyncFilesGlobal = async (accessToken, fileName) => {
  const params = new URLSearchParams({
    q: `name='${escapeDriveQueryValue(fileName)}' and trashed=false`,
    pageSize: '10',
    fields: 'files(id,name,modifiedTime,size,parents)',
    orderBy: 'modifiedTime desc',
  });
  const data = await authorizedJsonFetch(accessToken, `${driveApi('/files')}?${params.toString()}`);
  return data?.files || [];
};

const createVisibleDriveFolder = async (accessToken, folderName) => authorizedJsonFetch(
  accessToken,
  `${driveApi('/files')}?fields=id,name,modifiedTime`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: DRIVE_FOLDER_MIME,
      appProperties: {
        app: 'nutri-sport-hub',
        kind: 'sync-folder',
      },
    }),
  },
);

const ensureVisibleDriveFolder = async (accessToken, folderName) => {
  const existing = await listVisibleDriveFolders(accessToken, folderName);
  if (existing[0]) return existing[0];
  return createVisibleDriveFolder(accessToken, folderName);
};

export const fetchGoogleDriveSyncEnvelope = async (accessToken, options = {}) => {
  const config = getGoogleDriveConfig();
  const preferences = normalizeDriveSyncPreferences(options.preferences);
  const target = options.target || preferences.mode || DRIVE_SYNC_MODES.appData;
  appendSyncDebugLog('googleDriveSync', 'fetchGoogleDriveSyncEnvelope start', {
    target,
    preferences,
  });

  if (target === DRIVE_SYNC_MODES.visible) {
    const folders = await listVisibleDriveFolders(accessToken, config.visibleFolderName);
    const folder = folders[0] || null;
    let files = folder ? await listVisibleDriveSyncFiles(accessToken, folder.id, config.fileName) : [];
    if (!files[0]) {
      appendSyncDebugLog('googleDriveSync', 'visible folder/file lookup fallback', {
        folderFound: Boolean(folder),
        target,
        fileName: config.fileName,
      });
      files = await listVisibleDriveSyncFilesGlobal(accessToken, config.fileName);
    }
    const file = files[0] || null;
    if (!file) return { target, folder, file: null, envelope: null };
    const envelope = await authorizedJsonFetch(accessToken, `${driveApi(`/files/${file.id}`)}?alt=media`);
    appendSyncDebugLog('googleDriveSync', 'fetchGoogleDriveSyncEnvelope success', {
      target,
      fileId: file.id,
      updatedAt: envelope?.updated_at || null,
    });
    return { target, folder, file, envelope };
  }

  const files = await listGoogleDriveSyncFiles(accessToken);
  const file = files[0] || null;
  if (!file) return { target, folder: null, file: null, envelope: null };
  const envelope = await authorizedJsonFetch(accessToken, `${driveApi(`/files/${file.id}`)}?alt=media`);
  appendSyncDebugLog('googleDriveSync', 'fetchGoogleDriveSyncEnvelope success', {
    target,
    fileId: file.id,
    updatedAt: envelope?.updated_at || null,
  });
  return { target, folder: null, file, envelope };
};

export const upsertGoogleDriveSyncEnvelope = async (accessToken, envelope, options = {}) => {
  const config = getGoogleDriveConfig();
  const target = options.target || DRIVE_SYNC_MODES.appData;
  const existingFile = options.existingFile || null;
  const folderId = options.folderId || null;
  const metadata = {
    name: config.fileName,
    mimeType: 'application/json',
    appProperties: {
      app: 'nutri-sport-hub',
      syncTarget: target,
    },
    ...(existingFile ? {} : {
      parents: [target === DRIVE_SYNC_MODES.visible ? folderId : 'appDataFolder'],
    }),
  };
  const { boundary, body } = buildMultipartRequest(metadata, envelope);
  const endpoint = existingFile
    ? `${driveUploadApi(`/files/${existingFile.id}`)}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : `${driveUploadApi('/files')}?uploadType=multipart&fields=id,name,modifiedTime,size`;
  return authorizedJsonFetch(accessToken, endpoint, {
    method: existingFile ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
};

export const pullGoogleDriveState = async (accessToken) => {
  const remote = await fetchGoogleDriveSyncEnvelope(accessToken);
  return {
    ...remote,
    comparison: remote.envelope ? 'available' : 'missing',
  };
};

export const guardedPushGoogleDriveState = async (accessToken, state, options = {}) => {
  const preferences = normalizeDriveSyncPreferences(options.preferences);
  const localEnvelope = buildSyncEnvelope(state);
  const remote = await fetchGoogleDriveSyncEnvelope(accessToken, { preferences });
  const comparison = remote.envelope ? compareSyncEnvelopes(localEnvelope, remote.envelope) : 'missing';
  appendSyncDebugLog('googleDriveSync', 'guardedPushGoogleDriveState compare', {
    comparison,
    localUpdatedAt: localEnvelope.updated_at,
    remoteUpdatedAt: remote.envelope?.updated_at || null,
    preferences,
  });

  if (comparison === 'remote-newer' && !options.allowRemoteOverwrite) {
    const error = new Error(
      `Push bloque: ${describeDriveSyncTarget(preferences.mode)} contient une version plus recente (${remote.envelope.updated_at}). Fais un pull d'abord.`,
    );
    error.code = 'REMOTE_NEWER';
    error.remote = remote;
    error.comparison = comparison;
    throw error;
  }

  const result = await pushGoogleDriveState(accessToken, state, options);
  markSuccessfulDrivePush(result.envelope?.updated_at || localEnvelope.updated_at, preferences);
  appendSyncDebugLog('googleDriveSync', 'guardedPushGoogleDriveState success', {
    pushedUpdatedAt: result.envelope?.updated_at || localEnvelope.updated_at,
    target: result.target,
  });
  return {
    ...result,
    comparison,
    remoteBefore: remote,
  };
};

export const pushGoogleDriveState = async (accessToken, state, options = {}) => {
  const preferences = normalizeDriveSyncPreferences(options.preferences);
  const envelope = buildSyncEnvelope(state);

  if (preferences.mode === DRIVE_SYNC_MODES.visible) {
    const config = getGoogleDriveConfig();
    const folder = await ensureVisibleDriveFolder(accessToken, config.visibleFolderName);
    const existing = await fetchGoogleDriveSyncEnvelope(accessToken, { target: DRIVE_SYNC_MODES.visible, preferences });
    const file = await upsertGoogleDriveSyncEnvelope(accessToken, envelope, {
      target: DRIVE_SYNC_MODES.visible,
      existingFile: existing.file,
      folderId: folder.id,
    });

    let mirror = null;
    if (preferences.mirrorAppData) {
      const existingMirror = await fetchGoogleDriveSyncEnvelope(accessToken, { target: DRIVE_SYNC_MODES.appData, preferences });
      const mirrorFile = await upsertGoogleDriveSyncEnvelope(accessToken, envelope, {
        target: DRIVE_SYNC_MODES.appData,
        existingFile: existingMirror.file,
      });
      mirror = { target: DRIVE_SYNC_MODES.appData, file: mirrorFile };
    }

    return { target: DRIVE_SYNC_MODES.visible, file, envelope, folder, mirror };
  }

  const existing = await fetchGoogleDriveSyncEnvelope(accessToken, { target: DRIVE_SYNC_MODES.appData, preferences });
  const file = await upsertGoogleDriveSyncEnvelope(accessToken, envelope, {
    target: DRIVE_SYNC_MODES.appData,
    existingFile: existing.file,
  });
  return { target: DRIVE_SYNC_MODES.appData, file, envelope, folder: null, mirror: null };
};
