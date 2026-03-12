import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSessionsForDate } from './domainModel.js';
import {
  buildPersistedDashboardState,
  computeMacrosForAmount,
  defaultState,
  formatMacrosLine,
  hydratePersistedState,
  hydrateStateFromSyncEnvelope,
  mergeIncomingStatePreservingLocalSession,
  normalizeFood,
  preparePersistedDashboardState,
  toBounded,
  toNumber,
  toPositive,
  uid,
  validatePersistedDashboardStateCandidate,
  todayIso,
} from './dashboardStateSchema.js';
import { fetchJson } from './network.js';
import { appendSyncDebugLog } from './syncDebug.js';

export {
  buildPersistedDashboardState,
  computeMacrosForAmount,
  defaultState,
  formatMacrosLine,
  hydratePersistedState,
  hydrateStateFromSyncEnvelope,
  mergeIncomingStatePreservingLocalSession,
  normalizeFood,
  toBounded,
  toNumber,
  toPositive,
  uid,
  validatePersistedDashboardStateCandidate,
  todayIso,
} from './dashboardStateSchema.js';

export const STORAGE_KEY = 'nutri-sport-dashboard-v1';
export const DASHBOARD_STATE_EVENT = 'nutri-dashboard-state';
export const DASHBOARD_STORAGE_WARNING_EVENT = 'nutri-dashboard-storage-warning';
const REMOTE_STATE_TIMEOUT_MS = 15_000;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const isNativeMobileRuntime = () => {
  if (typeof window === 'undefined') return false;
  const capacitor = window.Capacitor;
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform();
  if (typeof capacitor.getPlatform === 'function') return capacitor.getPlatform() !== 'web';
  return false;
};

const emitEvent = (eventName, detail = {}) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
};

const isLoopbackHttpUrl = (parsedUrl) =>
  parsedUrl.protocol === 'http:' && LOOPBACK_HOSTS.has(parsedUrl.hostname);

export const getRemoteStatePersistenceConfig = () => {
  if (typeof window === 'undefined') {
    return {
      enabled: false,
      url: '',
      headers: {},
      reason: 'server-runtime',
    };
  }

  const rawUrl = `${import.meta.env?.VITE_REMOTE_STATE_URL || ''}`.trim();
  const token = `${import.meta.env?.VITE_REMOTE_STATE_TOKEN || ''}`.trim();
  if (!rawUrl) {
    return {
      enabled: false,
      url: '',
      headers: {},
      reason: 'missing-url',
    };
  }

  let parsedUrl = null;
  try {
    parsedUrl = new URL(rawUrl, window.location.origin);
  } catch {
    return {
      enabled: false,
      url: '',
      headers: {},
      reason: 'invalid-url',
    };
  }

  const allowedProtocol = parsedUrl.protocol === 'https:' || isLoopbackHttpUrl(parsedUrl);
  if (!allowedProtocol) {
    return {
      enabled: false,
      url: parsedUrl.toString(),
      headers: {},
      reason: 'disallowed-url',
    };
  }

  if (isNativeMobileRuntime() && isLoopbackHttpUrl(parsedUrl)) {
    return {
      enabled: false,
      url: parsedUrl.toString(),
      headers: {},
      reason: 'native-loopback-disabled',
    };
  }

  return {
    enabled: true,
    url: parsedUrl.toString(),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    reason: '',
  };
};

export const canUseRemotePersistence = () => getRemoteStatePersistenceConfig().enabled;

export const emitDashboardStateEvent = (detail = {}) => {
  emitEvent(DASHBOARD_STATE_EVENT, detail);
};

export const emitDashboardStorageWarningEvent = (detail = {}) => {
  emitEvent(DASHBOARD_STORAGE_WARNING_EVENT, detail);
};

export const readPersistedDashboardState = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return hydratePersistedState(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const persistDashboardState = (state) => {
  if (typeof window === 'undefined') return null;

  const prepared = preparePersistedDashboardState(state);
  const persistedState = prepared.persistedState;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
  } catch (error) {
    appendSyncDebugLog('dashboardStore', 'persistDashboardState failed', { error });
    emitDashboardStorageWarningEvent({
      code: 'DASHBOARD_STORAGE_WRITE_FAILED',
      message: 'Impossible de persister le state local.',
    });
    return null;
  }

  appendSyncDebugLog('dashboardStore', 'persistDashboardState', {
    updatedAt: state.updatedAt || '',
    selectedDate: state.selectedDate || '',
    snapshotCount: persistedState.stateSnapshots?.length || 0,
    sizeBytes: prepared.sizeBytes,
  });

  if (prepared.trimmedSnapshotCount > 0 || prepared.warning) {
    const warning = prepared.warning || {
      code: 'DASHBOARD_STORAGE_TRIMMED',
      message: 'Les snapshots locaux ont ete reduits pour contenir la taille du state.',
      sizeBytes: prepared.sizeBytes,
      trimmedSnapshotCount: prepared.trimmedSnapshotCount,
    };
    appendSyncDebugLog('dashboardStore', 'storage warning', warning);
    emitDashboardStorageWarningEvent(warning);
  }

  emitDashboardStateEvent({
    updatedAt: state.updatedAt || '',
    selectedDate: state.selectedDate || '',
  });

  return persistedState;
};

export function useDashboardState() {
  const [state, setStateRaw] = useState(defaultState);
  const [hydrated, setHydrated] = useState(false);

  const replaceState = useCallback((nextState) => {
    setStateRaw((previous) => {
      const resolved = typeof nextState === 'function' ? nextState(previous) : nextState;
      return resolved || previous;
    });
  }, []);

  const setState = useCallback((updater) => {
    setStateRaw((previous) => {
      const resolved = typeof updater === 'function' ? updater(previous) : updater;
      if (!resolved) return previous;
      return {
        ...resolved,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const applyRawState = (rawState, source) => {
      const hydratedState = hydratePersistedState(rawState);
      if (!hydratedState || cancelled) {
        if (rawState && source) {
          appendSyncDebugLog('dashboardStore', 'ignored invalid state payload', { source });
        }
        return;
      }
      setStateRaw((previous) => mergeIncomingStatePreservingLocalSession(previous, hydratedState));
    };

    const load = async () => {
      const persistedState = readPersistedDashboardState();
      if (persistedState) {
        try {
          applyRawState(persistedState, 'local-storage');
        } catch (error) {
          appendSyncDebugLog('dashboardStore', 'load persisted state failed', { error });
          console.error('Failed to parse local dashboard state', error);
        }
      }

      const remoteConfig = getRemoteStatePersistenceConfig();
      if (remoteConfig.enabled) {
        try {
          const remote = await fetchJson(
            remoteConfig.url,
            {
              method: 'GET',
              headers: remoteConfig.headers,
            },
            {
              timeoutMs: REMOTE_STATE_TIMEOUT_MS,
            },
          );
          applyRawState(remote, 'remote-state');
        } catch (error) {
          appendSyncDebugLog('dashboardStore', 'remote persistence unavailable', { error });
          console.warn('Remote state unavailable, local storage fallback enabled.');
        }
      }

      if (!cancelled) setHydrated(true);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) return;

    const persistedState = persistDashboardState(state);
    if (!persistedState) return;

    const remoteConfig = getRemoteStatePersistenceConfig();
    if (!remoteConfig.enabled) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        await fetchJson(
          remoteConfig.url,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...remoteConfig.headers,
            },
            body: JSON.stringify(persistedState),
            signal: controller.signal,
          },
          {
            timeoutMs: REMOTE_STATE_TIMEOUT_MS,
          },
        );
      } catch (error) {
        appendSyncDebugLog('dashboardStore', 'remote persistence write failed', { error });
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hydrated, state]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleDashboardState = (event) => {
      const detail = event?.detail || {};
      const nextUpdatedAt = `${detail.updatedAt || ''}`;
      if (!nextUpdatedAt || nextUpdatedAt === `${state.updatedAt || ''}`) return;
      const persistedState = readPersistedDashboardState();
      const hydratedState = hydratePersistedState(persistedState);
      if (!hydratedState || hydratedState.updatedAt === `${state.updatedAt || ''}`) return;
      setStateRaw((previous) => mergeIncomingStatePreservingLocalSession(previous, hydratedState));
    };

    window.addEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
    return () => {
      window.removeEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
    };
  }, [state.updatedAt]);

  const entriesForSelectedDay = useMemo(
    () => state.entries.filter((entry) => entry.date === state.selectedDate),
    [state.entries, state.selectedDate],
  );

  const sessionsForSelectedDay = useMemo(
    () => getSessionsForDate(state, state.selectedDate),
    [state, state.selectedDate],
  );

  const metricsForSelectedDay = useMemo(
    () => state.metrics.find((entry) => entry.date === state.selectedDate),
    [state.metrics, state.selectedDate],
  );

  const dailyLogForSelectedDay = useMemo(
    () => state.dailyLogs.find((entry) => entry.date === state.selectedDate),
    [state.dailyLogs, state.selectedDate],
  );

  const dayMacros = useMemo(
    () =>
      entriesForSelectedDay.reduce(
        (accumulator, entry) => ({
          kcal: accumulator.kcal + entry.macros.kcal,
          protein: accumulator.protein + entry.macros.protein,
          carbs: accumulator.carbs + entry.macros.carbs,
          fat: accumulator.fat + entry.macros.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [entriesForSelectedDay],
  );

  return {
    state,
    setState,
    replaceState,
    entriesForSelectedDay,
    sessionsForSelectedDay,
    metricsForSelectedDay,
    dailyLogForSelectedDay,
    dayMacros,
    uid,
  };
}
