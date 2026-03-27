import {
  getRemoteStatePersistenceConfig,
  hydratePersistedState,
  mergeIncomingStatePreservingLocalSession,
  persistDashboardState,
  readPersistedDashboardState,
} from './dashboardStore.js';
import { fetchJson } from './network.js';
import { hasOngoingWorkoutDraft } from './ongoingWorkout.js';
import { hasPendingCriticalLocalMutation } from './criticalLocalMutation.js';

const dataScore = (state) => {
  if (!state || typeof state !== 'object') return 0;
  return [
    'entries',
    'sessions',
    'metrics',
    'dailyLogs',
    'neatLogs',
    'cycleLogs',
    'injuries',
    'supplementIntakes',
  ].reduce((sum, key) => sum + (Array.isArray(state[key]) ? state[key].length : 0), 0);
};

const isRemoteNewer = (localState, remoteState) => {
  const localUpdatedAt = `${localState?.updatedAt || ''}`.trim();
  const remoteUpdatedAt = `${remoteState?.updatedAt || ''}`.trim();
  return Boolean(remoteUpdatedAt && (!localUpdatedAt || remoteUpdatedAt > localUpdatedAt));
};

export const shouldBootstrapFromRemote = (localState, remoteState) => {
  if (!remoteState) return false;
  if (!localState) return true;

  if (isRemoteNewer(localState, remoteState)) return true;

  const localScore = dataScore(localState);
  const remoteScore = dataScore(remoteState);
  if (localScore === 0 && remoteScore > 0) return true;
  if (localScore <= 1 && remoteScore >= 3) return true;

  return false;
};

export const bootstrapRemoteStateIntoLocalStorage = async ({
  fetcher = fetchJson,
  getConfig = getRemoteStatePersistenceConfig,
  readLocal = readPersistedDashboardState,
  persist = persistDashboardState,
  hasOngoingDraft = hasOngoingWorkoutDraft,
} = {}) => {
  if (typeof window === 'undefined') {
    return { status: 'skipped', reason: 'no-window' };
  }

  const remoteConfig = getConfig();
  if (!remoteConfig?.enabled || !remoteConfig?.url) {
    return { status: 'skipped', reason: remoteConfig?.reason || 'remote-disabled' };
  }

  if (hasOngoingDraft()) {
    return { status: 'skipped', reason: 'ongoing-workout-active' };
  }

  if (hasPendingCriticalLocalMutation()) {
    return { status: 'skipped', reason: 'critical-local-mutation-pending' };
  }

  const localState = readLocal();

  let remoteRaw = null;
  try {
    remoteRaw = await fetcher(
      remoteConfig.url,
      {
        method: 'GET',
        headers: remoteConfig.headers || {},
      },
      {
        timeoutMs: 15_000,
      },
    );
  } catch (error) {
    return {
      status: 'failed',
      reason: error?.code || 'fetch-failed',
      message: error?.message || 'Remote bootstrap failed.',
    };
  }

  const remoteState = hydratePersistedState(remoteRaw);
  if (!remoteState) {
    return { status: 'failed', reason: 'invalid-remote-state' };
  }

  if (!shouldBootstrapFromRemote(localState, remoteState)) {
    return {
      status: 'kept-local',
      localUpdatedAt: localState?.updatedAt || '',
      remoteUpdatedAt: remoteState.updatedAt || '',
    };
  }

  const nextState = localState
    ? mergeIncomingStatePreservingLocalSession(localState, remoteState)
    : remoteState;

  persist(nextState);
  return {
    status: 'updated',
    localUpdatedAt: localState?.updatedAt || '',
    remoteUpdatedAt: remoteState.updatedAt || '',
    dataScore: dataScore(nextState),
  };
};
