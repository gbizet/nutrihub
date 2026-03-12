import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  hasActiveCompanionDriveSession,
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

const AUTO_PUSH_DEBOUNCE_MS = 10_000;
const AUTO_HEALTH_RUNTIME_KEY = 'nutri-health-auto-runtime-v1';
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

const resolveAutoHealthCooldownTimestamp = (runtime = {}, state = null, bootTs = 0) => {
  const runtimeTs = Number(runtime?.lastAutoImportTs) || 0;
  const stateTs = Date.parse(`${state?.healthSync?.lastAutoImportAt || ''}`) || 0;
  return Math.max(runtimeTs, stateTs, Number(bootTs) || 0, 0);
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
  const launchFlowBusyRef = useRef(false);
  const ignoredDashboardUpdatedAtRef = useRef('');

  const refreshSession = () => setSessionTick((value) => value + 1);

  const prefs = useMemo(() => getDriveSyncPreferences(), [sessionTick]);
  const config = useMemo(() => getGoogleDriveConfig(), [sessionTick]);
  const mobileNative = isNativeMobileRuntime();
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
      await createStateServerSnapshot(localState, {
        reason: mode === 'manual' ? 'before-manual-sync-push' : 'before-auto-sync-push',
        label: `${mode}:${localState.updatedAt || ''}`,
      }).catch(() => null);
      const result = await pushLocalStateToDrive({
        state: localState,
        preferences: currentPrefs,
        source: mode,
      });
      appendSyncDebugLog('GlobalSyncBar', `${mode} sync success`, {
        localUpdatedAt: localState.updatedAt,
        remoteUpdatedAt: result.updatedAt || null,
      });
      setTone('ok');
      setMessage(mode === 'manual' ? `Sync OK vers ${currentTargetLabel}.` : `Autosync OK vers ${currentTargetLabel}.`);
      refreshSession();
      return true;
    } catch (error) {
      appendSyncDebugLog('GlobalSyncBar', `${mode} sync failed`, { error });
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
    const currentPrefs = getDriveSyncPreferences();
    const currentConfig = getGoogleDriveConfig();
    const currentToken = getStoredGoogleDriveToken();
    const currentScopes = getRequiredGoogleDriveScopes(currentPrefs);
    if (!currentConfig.clientId || !currentToken?.accessToken || !(currentToken?.companion || tokenHasScopes(currentToken, currentScopes))) {
      appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', {
        reason,
        cause: !currentConfig.clientId ? 'no-client-id' : !currentToken?.accessToken ? 'no-token' : 'scope-mismatch',
      });
      return false;
    }

    try {
      if (hasOngoingWorkoutDraft()) {
        appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', {
          reason,
          cause: 'ongoing-workout-active',
        });
        return false;
      }
      const localState = readPersistedDashboardState();
      if (!localState) {
        appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', { reason, cause: 'no-local-state' });
        return false;
      }
      await createStateServerSnapshot(localState, {
        reason: 'before-auto-pull',
        label: `${reason}:${localState.updatedAt || ''}`,
      }).catch(() => null);
      const result = await pullDriveStateToLocal({
        localState,
        preferences: currentPrefs,
        source: reason,
      });
      if (!result.envelope || result.comparison !== 'remote-newer' || !result.mergedState) {
        appendSyncDebugLog('GlobalSyncBar', 'auto pull skipped', {
          reason,
          cause: !result.envelope ? 'no-remote-envelope' : 'local-up-to-date',
          comparison: result.comparison || 'unknown',
        });
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
      setTone('ok');
      setMessage(`Pull auto OK depuis ${describeDriveSyncTarget(currentPrefs.mode, currentConfig)}.`);
      refreshSession();
      return true;
    } catch (error) {
      appendSyncDebugLog('GlobalSyncBar', 'auto pull failed', { reason, error });
      return false;
    }
  };

  const runAutoHealthImport = async (reason = 'launch') => {
    const launchAttempt = reason === 'launch';
    if (launchAttempt && bootAutoHealthLaunchAttempted) {
      appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', {
        reason,
        cause: 'launch-already-attempted',
      });
      return false;
    }
    if (!mobileNative || autoHealthBusyRef.current) {
      appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', {
        reason,
        cause: !mobileNative ? 'not-mobile-native' : 'already-busy',
      });
      return false;
    }
    if (launchAttempt) bootAutoHealthLaunchAttempted = true;
    autoHealthBusyRef.current = true;
    try {
      const currentState = readPersistedDashboardState();
      if (!currentState) {
        appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', { reason, cause: 'no-local-state' });
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
        return false;
      }

      const today = todayIso();
      const runtime = parseJsonStorage(AUTO_HEALTH_RUNTIME_KEY);
      const AUTO_HEALTH_COOLDOWN_MS = 15 * 60 * 1000;
      const lastAutoTs = resolveAutoHealthCooldownTimestamp(runtime, currentState, bootAutoHealthImportTs);
      const bypassCooldownForLaunch = launchAttempt;
      if (!bypassCooldownForLaunch && lastAutoTs && Date.now() - lastAutoTs < AUTO_HEALTH_COOLDOWN_MS) {
        appendSyncDebugLog('GlobalSyncBar', 'auto health import skipped', {
          reason,
          cause: 'cooldown-active',
          lastAutoImportTs: new Date(lastAutoTs).toISOString(),
          cooldownMin: 15,
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
      saveJsonStorage(AUTO_HEALTH_RUNTIME_KEY, {
        lastAutoImportTs: Date.parse(`${nextState.healthSync?.lastAutoImportAt || nextState.healthSync?.lastImportAt || ''}`) || bootAutoHealthImportTs || Date.now(),
        lastAutoImportDate: today,
        lastReason: reason,
      });
      appendSyncDebugLog('GlobalSyncBar', 'auto health import success', {
        reason,
        startDate: payload.startDate,
        endDate: today,
        importedDates,
        lastImportedDate,
      });
      if (importedDates.length) {
        setTone('ok');
        setMessage(`Sante auto OK: ${importedDates.length} jour(s) maj.`);
      }
      refreshSession();

      // Chain auto-push to Drive after successful health import
      if (importedDates.length > 0) {
        runSyncAttempt('auto');
      }

      return true;
    } catch (error) {
      appendSyncDebugLog('GlobalSyncBar', 'auto health import failed', { reason, error });
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
      if (!detail.updatedAt || detail.source === 'auto-pull') return;
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = setTimeout(() => {
        if (!busyRef.current) runSyncAttempt('auto');
      }, AUTO_PUSH_DEBOUNCE_MS);
    };

    const handleStorageWarning = (event) => {
      const detail = event?.detail || {};
      if (!detail.message) return;
      setTone('warn');
      setMessage(detail.message);
    };

    const runMobileRefreshFlow = async (reason = 'resume') => {
      if (!mobileNative) {
        runAutoPull(reason);
        runAutoHealthImport(reason);
        return;
      }
      if (reason === 'launch' && launchFlowBusyRef.current) return;
      if (reason === 'launch') launchFlowBusyRef.current = true;
      try {
        await runAutoPull(reason, { force: true });
        await runAutoHealthImport(reason);
      } finally {
        if (reason === 'launch') launchFlowBusyRef.current = false;
      }
    };

    const handleResume = () => {
      refreshSession();
      runMobileRefreshFlow('resume');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleResume();
    };

    window.addEventListener(DRIVE_SYNC_EVENT, handleDriveSyncEvent);
    window.addEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
    window.addEventListener(DASHBOARD_STORAGE_WARNING_EVENT, handleStorageWarning);
    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    runMobileRefreshFlow('launch');

    return () => {
      clearTimeout(pushTimerRef.current);
      window.removeEventListener(DRIVE_SYNC_EVENT, handleDriveSyncEvent);
      window.removeEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
      window.removeEventListener(DASHBOARD_STORAGE_WARNING_EVENT, handleStorageWarning);
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mobileNative, targetLabel]);

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
            <span className="appSyncTarget" title={configured ? 'Autosync 10s actif apres changement local.' : 'Configure Drive dans Sync.'}>
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
