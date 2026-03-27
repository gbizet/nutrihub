import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Link } from 'react-router-dom';
import {
  DASHBOARD_STORAGE_WARNING_EVENT,
  DASHBOARD_STATE_EVENT,
  emitDashboardStateEvent,
  persistDashboardState,
  readPersistedDashboardState,
  todayIso,
} from '../lib/dashboardStore';
import { mergeHealthImportIntoState } from '../lib/healthImport.js';
import {
  DRIVE_SYNC_EVENT,
  describeDriveSyncTarget,
  getDriveSyncPreferences,
  getGoogleDriveConfig,
  getRequiredGoogleDriveScopes,
  getStoredGoogleDriveToken,
  isNativeMobileRuntime,
  getLastSuccessfulDrivePushUpdatedAt,
  markDriveSyncCheckpoint,
  tokenHasScopes,
} from '../lib/googleDriveSync';
import { pullDriveStateToLocal, pushLocalStateToDrive } from '../lib/driveSyncService.js';
import { getHealthIntegrationStatus, importAutoHealthWindow } from '../lib/healthSyncService.js';
import { hasOngoingWorkoutDraft } from '../lib/ongoingWorkout.js';
import { appendSyncDebugLog } from '../lib/syncDebug';
import { createStateServerSnapshot } from '../lib/stateRecovery.js';
import { isAutoRefreshBusy, setAppActive, setAutoRefreshBusy } from '../lib/appRuntime.js';
import { updateAndroidRuntimeStats } from '../lib/androidRuntimeStats.js';
import {
  clearPendingCriticalLocalMutation,
  readPendingCriticalLocalMutation,
  shouldBlockIncomingSyncForPendingCriticalMutation,
} from '../lib/criticalLocalMutation.js';

const AUTO_PUSH_DEBOUNCE_MS = 10_000;
const MOBILE_AUTO_PUSH_DEBOUNCE_MS = 30_000;
const AUTO_REFRESH_RUNTIME_KEY = 'nutri-mobile-auto-refresh-runtime-v2';
const MOBILE_FOREGROUND_DEDUP_MS = 5_000;
const MOBILE_AUTO_PULL_COOLDOWN_MS = 30 * 60 * 1000;
const MOBILE_AUTO_HEALTH_IMPORT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
let bootAutoHealthLaunchAttempted = false;
let bootAutoHealthImportTs = 0;

export const __resetGlobalSyncBarBootStateForTests = () => {
  bootAutoHealthLaunchAttempted = false;
  bootAutoHealthImportTs = 0;
};

const parseJsonStorage = (key) => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
};

const saveJsonStorage = (key, payload) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(payload || {}));
};

const updateAutoRefreshRuntime = (patch) => {
  const previous = parseJsonStorage(AUTO_REFRESH_RUNTIME_KEY);
  const next = {
    ...previous,
    ...(typeof patch === 'function' ? patch(previous) : (patch || {})),
  };
  saveJsonStorage(AUTO_REFRESH_RUNTIME_KEY, next);
  return next;
};

const resolveAutoHealthCooldownTimestamp = (runtime = {}, state = null, bootTs = 0) => {
  const runtimeTs = Number(runtime?.lastAutoImportTs) || 0;
  const stateTs = Date.parse(`${state?.healthSync?.lastAutoImportAt || ''}`) || 0;
  return Math.max(runtimeTs, stateTs, Number(bootTs) || 0, 0);
};

const resolveAutoPullCooldownTimestamp = (runtime = {}, state = null) => {
  const runtimeTs = Number(runtime?.lastAutoPullTs) || 0;
  const stateTs = Date.parse(`${state?.healthSync?.lastPullAt || ''}`) || 0;
  return Math.max(runtimeTs, stateTs, 0);
};

const healthPayloadDates = (payload = {}) => {
  const records = payload.records || {};
  return [
    ...(Array.isArray(records.bodyMetrics) ? records.bodyMetrics : []),
    ...(Array.isArray(records.activity) ? records.activity : []),
    ...(Array.isArray(records.sleep) ? records.sleep : []),
    ...(Array.isArray(records.vitals) ? records.vitals : []),
  ]
    .map((row) => `${row?.date || row?.capturedAt || row?.endTime || ''}`.slice(0, 10))
    .filter(Boolean);
};

const toneClassName = (tone) => {
  if (tone === 'ok') return 'Ok';
  if (tone === 'warn') return 'Warn';
  if (tone === 'error') return 'Error';
  return 'Idle';
};

export default function GlobalSyncBar({
  mobileChromeMode = 'default',
  mobileTitleShort = 'Nutri Sport Hub',
  routeKey = 'home',
  syncCompact = false,
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('idle');
  const [sessionTick, setSessionTick] = useState(0);
  const chromeRef = useRef(null);
  const busyRef = useRef(false);
  const pushTimerRef = useRef(null);
  const autoHealthBusyRef = useRef(false);
  const autoRefreshFlowBusyRef = useRef(false);
  const lastForegroundEventAtRef = useRef(0);
  const foregroundSequenceRef = useRef(0);
  const ignoredDashboardUpdatedAtRef = useRef('');

  const refreshSession = () => setSessionTick((value) => value + 1);

  const prefs = useMemo(() => getDriveSyncPreferences(), [sessionTick]);
  const config = useMemo(() => getGoogleDriveConfig(), [sessionTick]);
  const mobileNative = isNativeMobileRuntime();
  const autoPushDebounceMs = mobileNative ? MOBILE_AUTO_PUSH_DEBOUNCE_MS : AUTO_PUSH_DEBOUNCE_MS;
  const targetLabel = describeDriveSyncTarget(prefs.mode, config);
  const configured = Boolean(config.clientId);
  const storedToken = useMemo(() => getStoredGoogleDriveToken(), [sessionTick]);
  const requiredScopes = useMemo(
    () => getRequiredGoogleDriveScopes(prefs),
    [prefs.mode, prefs.mirrorAppData],
  );
  const scopeReady = storedToken?.companion || tokenHasScopes(storedToken, requiredScopes);
  const syncReady = configured && scopeReady;
  const compactStatusLabel = busy
    ? 'Sync...'
    : message || (syncReady ? 'Autosync on' : 'Autosync off');
  const compactToneClass = toneClassName(
    busy ? 'warn' : (message ? tone : (syncReady ? 'ok' : 'idle')),
  );

  const setBusyState = (value) => {
    busyRef.current = value;
    setBusy(value);
  };

  const runSyncAttempt = async (mode = 'manual') => {
    const currentPrefs = getDriveSyncPreferences();
    const currentConfig = getGoogleDriveConfig();
    const currentTargetLabel = describeDriveSyncTarget(currentPrefs.mode, currentConfig);
    const currentToken = getStoredGoogleDriveToken();
    const currentScopes = getRequiredGoogleDriveScopes(currentPrefs);
    const currentScopeReady = currentToken?.companion || tokenHasScopes(currentToken, currentScopes);

    if (!currentConfig.clientId) {
      if (mode === 'manual') {
        setTone('warn');
        setMessage('Sync non configuree. Ouvre Sync.');
      }
      return false;
    }

    if (!currentToken?.accessToken || !currentScopeReady) {
      if (mode === 'manual') {
        setTone('warn');
        setMessage(mobileNative ? 'Session Drive mobile absente ou incomplete. Ouvre Sync.' : 'Session Drive absente ou incomplete. Ouvre Sync.');
      }
      return false;
    }

    const localState = readPersistedDashboardState();
    if (!localState) {
      if (mode === 'manual') {
        setTone('warn');
        setMessage('Aucune data locale a pousser.');
      }
      return false;
    }

    setBusyState(true);
    try {
      if (mode === 'manual') {
        await createStateServerSnapshot(localState, {
          reason: 'before-manual-sync-push',
          label: `${mode}:${localState.updatedAt || ''}`,
        }).catch(() => null);
      }
      const result = await pushLocalStateToDrive({
        state: localState,
        preferences: currentPrefs,
        source: mode,
      });
      appendSyncDebugLog('GlobalSyncBar', `${mode} sync success`, {
        localUpdatedAt: localState.updatedAt,
        remoteUpdatedAt: result.updatedAt || null,
      });
      clearPendingCriticalLocalMutation(localState.updatedAt || result.updatedAt || '');
      if (mode === 'auto' && mobileNative) {
        updateAndroidRuntimeStats({
          lastAutoPushAt: new Date().toISOString(),
          lastAutoPushDebounceMs: autoPushDebounceMs,
          lastAutoPushSkippedReason: '',
        });
      }
      setTone('ok');
      setMessage(mode === 'manual' ? `Sync OK vers ${currentTargetLabel}.` : `Autosync OK vers ${currentTargetLabel}.`);
      refreshSession();
      return true;
    } catch (error) {
      appendSyncDebugLog('GlobalSyncBar', `${mode} sync failed`, { error });
      if (mode === 'auto' && mobileNative) {
        updateAndroidRuntimeStats({
          lastAutoPushSkippedReason: 'sync-failed',
        });
      }
      if (mode === 'manual') {
        if (error?.code === 'REMOTE_NEWER') {
          setTone('warn');
          setMessage('Push bloque: distant plus recent. Ouvre Sync pour pull.');
        } else {
          setTone('error');
          setMessage(error?.message || 'Sync impossible.');
        }
      }
      return false;
    } finally {
      setBusyState(false);
    }
  };

  const runAutoPull = async (reason = 'resume', { force = false } = {}) => {
    const startedAt = Date.now();
    const currentPrefs = getDriveSyncPreferences();
    const currentConfig = getGoogleDriveConfig();
    const currentToken = getStoredGoogleDriveToken();
    const currentScopes = getRequiredGoogleDriveScopes(currentPrefs);
    if (!currentConfig.clientId || !currentToken?.accessToken || !(currentToken?.companion || tokenHasScopes(currentToken, currentScopes))) {
      const cause = !currentConfig.clientId ? 'no-client-id' : !currentToken?.accessToken ? 'no-token' : 'scope-mismatch';
      appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', {
        reason,
        cause,
      });
      if (mobileNative) {
        updateAndroidRuntimeStats({
          lastAutoPullSkippedReason: cause,
        });
      }
      return false;
    }

    try {
      if (hasOngoingWorkoutDraft()) {
        appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', {
          reason,
          cause: 'ongoing-workout-active',
        });
        if (mobileNative) {
          updateAndroidRuntimeStats({
            lastAutoPullSkippedReason: 'ongoing-workout-active',
          });
        }
        return false;
      }
      const localState = readPersistedDashboardState();
      if (!localState) {
        appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', { reason, cause: 'no-local-state' });
        if (mobileNative) {
          updateAndroidRuntimeStats({
            lastAutoPullSkippedReason: 'no-local-state',
          });
        }
        return false;
      }
      if (shouldBlockIncomingSyncForPendingCriticalMutation(localState.updatedAt)) {
        const pendingMutation = readPendingCriticalLocalMutation();
        appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', {
          reason,
          cause: 'critical-local-mutation-pending',
          pendingUpdatedAt: pendingMutation?.updatedAt || null,
          localUpdatedAt: localState.updatedAt || null,
        });
        if (mobileNative) {
          updateAndroidRuntimeStats({
            lastAutoPullSkippedReason: 'critical-local-mutation-pending',
          });
        }
        return false;
      }
      const result = await pullDriveStateToLocal({
        localState,
        preferences: currentPrefs,
        source: reason,
      });
      if (!result.envelope || result.comparison !== 'remote-newer' || !result.mergedState) {
        const cause = !result.envelope ? 'no-remote-envelope' : 'local-up-to-date';
        appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', {
          reason,
          cause,
          comparison: result.comparison || 'unknown',
        });
        if (mobileNative) {
          updateAndroidRuntimeStats({
            lastAutoPullSkippedReason: cause,
          });
        }
        return false;
      }

      // Guard: don't overwrite local edits that haven't been pushed yet
      if (!force) {
        const lastCheckpoint = getLastSuccessfulDrivePushUpdatedAt(currentPrefs);
        if (lastCheckpoint && localState.updatedAt && localState.updatedAt > lastCheckpoint) {
          appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', {
            reason,
            cause: 'local-has-unpushed-edits',
            localUpdatedAt: localState.updatedAt,
            lastCheckpoint,
            remoteUpdatedAt: result.updatedAt || null,
          });
          if (mobileNative) {
            updateAndroidRuntimeStats({
              lastAutoPullSkippedReason: 'local-has-unpushed-edits',
            });
          }
          return false;
        }
      }
      const merged = result.mergedState;

      ignoredDashboardUpdatedAtRef.current = `${merged.updatedAt || ''}`;
      persistDashboardState(merged);
      emitDashboardStateEvent({
        updatedAt: merged.updatedAt,
        selectedDate: merged.selectedDate,
        source: 'auto-pull',
      });
      markDriveSyncCheckpoint(result.updatedAt, currentPrefs, {
        kind: 'pull-success',
        targetLabel: describeDriveSyncTarget(currentPrefs.mode, currentConfig),
      });
      appendSyncDebugLog('GlobalSyncBar', 'auto pull success', {
        reason,
        remoteUpdatedAt: result.updatedAt || null,
      });
      if (mobileNative) {
        updateAutoRefreshRuntime({
          lastAutoPullTs: Date.now(),
          lastAutoPullReason: reason,
        });
        updateAndroidRuntimeStats({
          lastAutoPullAt: new Date().toISOString(),
          lastAutoPullDurationMs: Date.now() - startedAt,
          lastAutoPullSkippedReason: '',
        });
      }
      setTone('ok');
      setMessage(`Pull auto OK depuis ${describeDriveSyncTarget(currentPrefs.mode, currentConfig)}.`);
      refreshSession();
      return true;
    } catch (error) {
      appendSyncDebugLog('GlobalSyncBar', 'auto pull failed', { reason, error });
      if (mobileNative) {
        updateAndroidRuntimeStats({
          lastAutoPullSkippedReason: 'pull-failed',
        });
      }
      return false;
    }
  };

  const runAutoHealthImport = async (reason = 'launch', { bypassSchedule = false } = {}) => {
    const startedAt = Date.now();
    const launchAttempt = reason === 'launch';
    if (launchAttempt && bootAutoHealthLaunchAttempted) {
      appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', {
        reason,
        cause: 'launch-already-attempted',
      });
      if (mobileNative) {
        updateAndroidRuntimeStats({
          lastAutoHealthImportSkippedReason: 'launch-already-attempted',
        });
      }
      return false;
    }
    if (!mobileNative || autoHealthBusyRef.current) {
      const cause = !mobileNative ? 'not-mobile-native' : 'already-busy';
      appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', {
        reason,
        cause,
      });
      if (mobileNative) {
        updateAndroidRuntimeStats({
          lastAutoHealthImportSkippedReason: cause,
        });
      }
      return false;
    }
    if (launchAttempt) bootAutoHealthLaunchAttempted = true;
    autoHealthBusyRef.current = true;
    try {
      const currentState = readPersistedDashboardState();
      if (!currentState) {
        appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', { reason, cause: 'no-local-state' });
        updateAndroidRuntimeStats({
          lastAutoHealthImportSkippedReason: 'no-local-state',
        });
        return false;
      }
      const today = todayIso();
      const runtime = parseJsonStorage(AUTO_REFRESH_RUNTIME_KEY);
      const lastAutoTs = resolveAutoHealthCooldownTimestamp(runtime, currentState, bootAutoHealthImportTs);
      const lastAutoImportDate = `${runtime.lastAutoImportDate || currentState.healthSync?.lastAutoImportAt || ''}`.slice(0, 10);
      const shouldBypassSchedule = bypassSchedule || launchAttempt;
      const cooldownStillActive = lastAutoTs && Date.now() - lastAutoTs < MOBILE_AUTO_HEALTH_IMPORT_COOLDOWN_MS;
      const dayChangedSinceLastImport = lastAutoImportDate && lastAutoImportDate !== today;
      if (!shouldBypassSchedule && cooldownStillActive && !dayChangedSinceLastImport) {
        appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', {
          reason,
          cause: 'cooldown-active',
          lastAutoImportTs: new Date(lastAutoTs).toISOString(),
          cooldownHours: 6,
        });
        updateAndroidRuntimeStats({
          lastAutoHealthImportSkippedReason: 'cooldown-active',
        });
        return false;
      }

      const status = await getHealthIntegrationStatus();
      const healthConnectReady = status.healthConnectAvailable && (status.missingPermissions || []).length === 0;
      const samsungFallbackReady = status.samsungDataSdkFallbackAvailable;
      if (!healthConnectReady && !samsungFallbackReady) {
        appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', {
          reason,
          cause: 'no-source-ready',
          healthConnectAvailable: status.healthConnectAvailable,
          missingPermissions: (status.missingPermissions || []).length,
          samsungFallbackReady,
        });
        updateAndroidRuntimeStats({
          lastAutoHealthImportSkippedReason: 'no-source-ready',
        });
        return false;
      }

      const payload = await importAutoHealthWindow(currentState.healthSync, {
        overlapDays: 2,
        bootstrapDays: 30,
        endDate: today,
      });
      bootAutoHealthImportTs = Date.now();
      const importedDates = [...new Set(healthPayloadDates(payload))];
      const lastImportedDate = [...importedDates].sort().at(-1) || currentState.selectedDate || today;
      const merged = mergeHealthImportIntoState(currentState, payload);
      const nextState = {
        ...merged,
        updatedAt: new Date().toISOString(),
      };
      ignoredDashboardUpdatedAtRef.current = `${nextState.updatedAt || ''}`;
      persistDashboardState(nextState);
      emitDashboardStateEvent({
        updatedAt: nextState.updatedAt,
        selectedDate: nextState.selectedDate,
        source: 'auto-health',
      });
      updateAutoRefreshRuntime({
        lastAutoImportTs:
          Date.parse(`${nextState.healthSync?.lastAutoImportAt || nextState.healthSync?.lastImportAt || ''}`)
          || bootAutoHealthImportTs
          || Date.now(),
        lastAutoImportDate: today,
        lastAutoImportReason: reason,
      });
      appendSyncDebugLog('GlobalSyncBar', 'auto health import success', {
        reason,
        startDate: payload.startDate,
        endDate: today,
        importedDates,
        lastImportedDate,
      });
      updateAndroidRuntimeStats({
        lastAutoHealthImportAt: new Date().toISOString(),
        lastAutoHealthImportDurationMs: Date.now() - startedAt,
        lastAutoHealthImportSkippedReason: '',
      });
      if (importedDates.length) {
        setTone('ok');
        setMessage(`Sante auto OK: ${importedDates.length} jour(s) maj.`);
      }
      refreshSession();

      return true;
    } catch (error) {
      appendSyncDebugLog('GlobalSyncBar', 'auto health import failed', { reason, error });
      if (mobileNative) {
        updateAndroidRuntimeStats({
          lastAutoHealthImportSkippedReason: 'import-failed',
        });
      }
      return false;
    } finally {
      autoHealthBusyRef.current = false;
    }
  };

  const handleSyncNow = async () => {
    if (busyRef.current) return;
    await runSyncAttempt('manual');
  };

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const updateChromeHeight = () => {
      const nextHeight = Math.ceil(chromeRef.current?.getBoundingClientRect()?.height || 0);
      root.style.setProperty('--app-chrome-height', `${nextHeight || 60}px`);
    };

    updateChromeHeight();

    if (typeof ResizeObserver === 'function' && chromeRef.current) {
      const observer = new ResizeObserver(() => updateChromeHeight());
      observer.observe(chromeRef.current);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener('resize', updateChromeHeight);
    return () => {
      window.removeEventListener('resize', updateChromeHeight);
    };
  }, []);

  useEffect(() => {
    setAppActive(typeof document === 'undefined' ? true : document.visibilityState !== 'hidden', {
      source: 'mount',
    });

    const handleDriveSyncEvent = (event) => {
      const detail = event?.detail || {};
      if (detail.kind === 'pull-success') {
        appendSyncDebugLog('GlobalSyncBar', 'received drive sync event', detail);
        setTone('ok');
        setMessage(`Pull OK depuis ${detail.targetLabel || targetLabel}.`);
      } else if (detail.kind === 'push-success') {
        appendSyncDebugLog('GlobalSyncBar', 'received drive sync event', detail);
        setTone('ok');
        setMessage(`Sync OK vers ${detail.targetLabel || targetLabel}.`);
      }
      refreshSession();
    };

    const handleDashboardState = (event) => {
      const detail = event?.detail || {};
      if (detail.updatedAt && detail.updatedAt === ignoredDashboardUpdatedAtRef.current) {
        ignoredDashboardUpdatedAtRef.current = '';
        return;
      }
      if (!detail.updatedAt || detail.source === 'auto-pull' || detail.source === 'auto-health') return;
      if (mobileNative && isAutoRefreshBusy()) {
        updateAndroidRuntimeStats({
          lastAutoPushSkippedReason: 'auto-refresh-busy',
        });
        return;
      }
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = setTimeout(() => {
        if (busyRef.current) {
          if (mobileNative) {
            updateAndroidRuntimeStats({
              lastAutoPushSkippedReason: 'sync-busy',
            });
          }
          return;
        }
        if (mobileNative && isAutoRefreshBusy()) {
          updateAndroidRuntimeStats({
            lastAutoPushSkippedReason: 'auto-refresh-busy',
          });
          return;
        }
        runSyncAttempt('auto');
      }, autoPushDebounceMs);
    };

    const handleStorageWarning = (event) => {
      const detail = event?.detail || {};
      if (!detail.message) return;
      setTone('warn');
      setMessage(detail.message);
    };

    const setRuntimeActive = (isActive, source) => {
      setAppActive(isActive, { source });
      if (!isActive) clearTimeout(pushTimerRef.current);
    };

    const runPendingCriticalMutationPush = async (reason = 'resume') => {
      const pendingMutation = readPendingCriticalLocalMutation();
      if (!pendingMutation?.updatedAt) return false;
      const localState = readPersistedDashboardState();
      const localUpdatedAt = `${localState?.updatedAt || ''}`.trim();
      if (!localUpdatedAt || localUpdatedAt < pendingMutation.updatedAt) {
        appendSyncDebugLog('GlobalSyncBar', 'pending critical mutation push skipped', {
          reason,
          cause: 'local-state-missing-or-stale',
          pendingUpdatedAt: pendingMutation.updatedAt,
          localUpdatedAt: localUpdatedAt || null,
        });
        return false;
      }
      appendSyncDebugLog('GlobalSyncBar', 'pending critical mutation push start', {
        reason,
        pendingUpdatedAt: pendingMutation.updatedAt,
        localUpdatedAt,
      });
      return runSyncAttempt('auto');
    };

    const runForegroundRefreshFlow = async (reason = 'resume') => {
      if (!mobileNative) {
        await runPendingCriticalMutationPush(reason);
        await runAutoPull(reason);
        return false;
      }

      const now = Date.now();
      if (autoRefreshFlowBusyRef.current) {
        appendSyncDebugLog('GlobalSyncBar', 'foreground refresh skipped', {
          reason,
          cause: 'already-busy',
        });
        updateAndroidRuntimeStats({
          lastDuplicateForegroundAt: new Date().toISOString(),
          lastDuplicateForegroundReason: 'already-busy',
        });
        return false;
      }

      if (reason !== 'launch' && now - lastForegroundEventAtRef.current < MOBILE_FOREGROUND_DEDUP_MS) {
        appendSyncDebugLog('GlobalSyncBar', 'foreground refresh skipped', {
          reason,
          cause: 'duplicate-foreground',
          dedupWindowMs: MOBILE_FOREGROUND_DEDUP_MS,
        });
        updateAndroidRuntimeStats((previous) => ({
          duplicateForegroundSkipCount: Number(previous?.duplicateForegroundSkipCount || 0) + 1,
          lastDuplicateForegroundAt: new Date().toISOString(),
          lastDuplicateForegroundReason: 'duplicate-foreground',
        }));
        return false;
      }

      lastForegroundEventAtRef.current = now;
      foregroundSequenceRef.current += 1;
      const sequence = foregroundSequenceRef.current;
      updateAutoRefreshRuntime({
        lastForegroundTs: now,
        lastForegroundReason: reason,
        foregroundSequence: sequence,
      });
      updateAndroidRuntimeStats({
        lastForegroundAt: new Date(now).toISOString(),
        lastForegroundReason: reason,
        foregroundSequence: sequence,
      });

      autoRefreshFlowBusyRef.current = true;
      setAutoRefreshBusy(true, {
        reason,
        autoRefreshSequence: sequence,
        source: 'GlobalSyncBar',
      });
      try {
        await runPendingCriticalMutationPush(reason);
        const runtime = parseJsonStorage(AUTO_REFRESH_RUNTIME_KEY);
        const currentState = readPersistedDashboardState();
        if (reason === 'launch') {
          await runAutoPull(reason, { force: true });
          await runAutoHealthImport(reason, { bypassSchedule: true });
          return true;
        }

        const lastAutoPullTs = resolveAutoPullCooldownTimestamp(runtime, currentState);
        const shouldRunAutoPull = !lastAutoPullTs || (Date.now() - lastAutoPullTs >= MOBILE_AUTO_PULL_COOLDOWN_MS);
        if (shouldRunAutoPull) {
          await runAutoPull(reason);
        } else {
          appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', {
            reason,
            cause: 'cooldown-active',
            lastAutoPullTs: new Date(lastAutoPullTs).toISOString(),
            cooldownMin: 30,
          });
          updateAndroidRuntimeStats({
            lastAutoPullSkippedReason: 'cooldown-active',
          });
        }

        const today = todayIso();
        const lastAutoImportTs = resolveAutoHealthCooldownTimestamp(runtime, currentState, bootAutoHealthImportTs);
        const lastAutoImportDate = `${runtime.lastAutoImportDate || currentState?.healthSync?.lastAutoImportAt || ''}`.slice(0, 10);
        const shouldRunAutoHealthImport = (
          !lastAutoImportTs
          || (Date.now() - lastAutoImportTs >= MOBILE_AUTO_HEALTH_IMPORT_COOLDOWN_MS)
          || (lastAutoImportDate && lastAutoImportDate !== today)
        );
        if (shouldRunAutoHealthImport) {
          await runAutoHealthImport(reason);
        } else {
          appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', {
            reason,
            cause: 'cooldown-active',
            lastAutoImportTs: new Date(lastAutoImportTs).toISOString(),
            cooldownHours: 6,
          });
          updateAndroidRuntimeStats({
            lastAutoHealthImportSkippedReason: 'cooldown-active',
          });
        }
        return true;
      } finally {
        autoRefreshFlowBusyRef.current = false;
        setAutoRefreshBusy(false, {
          reason: '',
          autoRefreshSequence: sequence,
          source: 'GlobalSyncBar',
        });
      }
    };

    const handleResume = () => {
      refreshSession();
      setRuntimeActive(true, 'window-focus');
      runForegroundRefreshFlow('resume');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setRuntimeActive(true, 'visibility-visible');
        runForegroundRefreshFlow('resume');
        return;
      }
      setRuntimeActive(false, 'visibility-hidden');
    };

    let appStateListener = null;

    window.addEventListener(DRIVE_SYNC_EVENT, handleDriveSyncEvent);
    window.addEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
    window.addEventListener(DASHBOARD_STORAGE_WARNING_EVENT, handleStorageWarning);
    if (mobileNative) {
      Promise.resolve(CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        setRuntimeActive(Boolean(isActive), 'capacitor-app-state');
        if (isActive) {
          refreshSession();
          runForegroundRefreshFlow('resume');
        }
      })).then((listener) => {
        appStateListener = listener;
      }).catch((error) => {
        appendSyncDebugLog('GlobalSyncBar', 'capacitor appStateChange listener failed', { error });
      });
    } else {
      window.addEventListener('focus', handleResume);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    runForegroundRefreshFlow('launch');

    return () => {
      clearTimeout(pushTimerRef.current);
      window.removeEventListener(DRIVE_SYNC_EVENT, handleDriveSyncEvent);
      window.removeEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
      window.removeEventListener(DASHBOARD_STORAGE_WARNING_EVENT, handleStorageWarning);
      if (mobileNative) {
        Promise.resolve(appStateListener).then((listener) => listener?.remove?.()).catch(() => {});
      } else {
        window.removeEventListener('focus', handleResume);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [autoPushDebounceMs, mobileNative, targetLabel]);

  return (
    <header
      ref={chromeRef}
      className={`appChrome ${syncCompact ? 'appChromeCompact' : ''} ${mobileChromeMode === 'capture' ? 'appChromeCapture' : ''}`}
      data-app-chrome="true"
      data-route={routeKey}
    >
      <div className="appChromeInner">
        <div className="appChromeLead">
          <Link className="appBrand" to="/">Nutri Sport Hub</Link>
          <span className="appRouteTitle">{mobileTitleShort}</span>
        </div>
        <div className="appChromeActions">
          <div className="appChromeActionsDetailed">
            <span className="appSyncTarget" title={targetLabel}>{prefs.mode === 'visible' ? 'Drive visible' : 'Cache app'}</span>
            <span className="appSyncTarget" title={configured ? `Autosync ${Math.round(autoPushDebounceMs / 1000)}s actif apres changement local.` : 'Configure Drive dans Sync.'}>
              {syncReady ? 'Autosync on' : 'Autosync off'}
            </span>
            <button className="appSyncButton" type="button" disabled={busy} onClick={handleSyncNow}>
              {busy ? 'Sync...' : 'Sync maintenant'}
            </button>
            <Link className="appChromeLink" to="/integrations">Sync</Link>
            {message ? (
              <span className={`appSyncMessage appSyncMessage${toneClassName(tone)}`} title={message}>
                {message}
              </span>
            ) : null}
          </div>
          {syncCompact ? (
            <div className="appChromeActionsCompact">
              <span
                className={`appChromeStatusPill appChromeStatusPill${compactToneClass}`}
                title={message || targetLabel}
              >
                {compactStatusLabel}
              </span>
              <button className="appChromeCompactAction" type="button" disabled={busy} onClick={handleSyncNow}>
                {busy ? 'Sync...' : 'Sync'}
              </button>
              <Link className="appChromeActionLink" to="/integrations">Regler</Link>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
