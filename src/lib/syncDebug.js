export const SYNC_DEBUG_STORAGE_KEY = 'nutri-sync-debug-log-v1';
export const SYNC_DEBUG_EVENT = 'nutri-sync-debug-log';
const MAX_SYNC_DEBUG_ENTRIES = 200;

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

const sanitizeValue = (value, depth = 0) => {
  if (depth > 4) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, item]) => [key, sanitizeValue(item, depth + 1)]),
    );
  }
  return `${value}`;
};

const emitSyncDebugEvent = () => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(SYNC_DEBUG_EVENT));
};

export const readSyncDebugEntries = () => {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(SYNC_DEBUG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const formatSyncDebugEntries = (entries = readSyncDebugEntries()) => entries
  .map((entry) => {
    const payload = entry?.payload ? ` ${JSON.stringify(entry.payload)}` : '';
    return `${entry.at || '-'} [${entry.scope || 'sync'}] ${entry.message || ''}${payload}`;
  })
  .join('\n');

export const appendSyncDebugLog = (scope, message, payload = null) => {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: new Date().toISOString(),
    scope: `${scope || 'sync'}`,
    message: `${message || ''}`,
    payload: payload ? sanitizeValue(payload) : null,
  };
  const storage = getStorage();
  if (storage) {
    const existing = readSyncDebugEntries();
    const next = [entry, ...existing].slice(0, MAX_SYNC_DEBUG_ENTRIES);
    storage.setItem(SYNC_DEBUG_STORAGE_KEY, JSON.stringify(next));
  }
  try {
    console.log(`[sync-debug] ${JSON.stringify(entry)}`);
  } catch {
    // no-op
  }
  emitSyncDebugEvent();
  return entry;
};

export const clearSyncDebugLog = () => {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(SYNC_DEBUG_STORAGE_KEY);
  emitSyncDebugEvent();
};
