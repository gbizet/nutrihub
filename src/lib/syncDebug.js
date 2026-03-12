import { sanitizeDebugValue } from './debugSanitizer.js';

export const SYNC_DEBUG_STORAGE_KEY = 'nutri-sync-debug-log-v1';
export const SYNC_DEBUG_EVENT = 'nutri-sync-debug-log';
const MAX_SYNC_DEBUG_ENTRIES = 200;

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
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
    payload: payload ? sanitizeDebugValue(payload) : null,
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
