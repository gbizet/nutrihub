import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
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
  markDriveSyncCheckpoint,
  tokenHasScopes,
} from '../lib/googleDriveSync';
import { pullDriveStateToLocal, pushLocalStateToDrive } from '../lib/driveSyncService.js';
import { getHealthIntegrationStatus, importAutoHealthWindow } from '../lib/healthSyncService.js';
import { appendSyncDebugLog } from '../lib/syncDebug';

const AUTO_PUSH_DEBOUNCE_MS = 10_000;
const AUTO_HEALTH_RUNTIME_KEY = 'nutri-health-auto-runtime-v1';

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

export default function GlobalSyncBar() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('idle');
  const [sessionTick, setSessionTick] = useState(0);
  const busyRef = useRef(false);
  const pushTimerRef = useRef(null);
  const autoHealthBusyRef = useRef(false);
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
  const scopeReady = tokenHasScopes(storedToken, requiredScopes);

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
    const currentScopeReady = tokenHasScopes(currentToken, currentScopes);

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

  const runAutoPull = async (reason = 'resume') => {
    const currentPrefs = getDriveSyncPreferences();
    const currentConfig = getGoogleDriveConfig();
    const currentToken = getStoredGoogleDriveToken();
    const currentScopes = getRequiredGoogleDriveScopes(currentPrefs);
    if (!currentConfig.clientId || !currentToken?.accessToken || !tokenHasScopes(currentToken, currentScopes)) return false;

    try {
      const localState = readPersistedDashboardState();
      if (!localState) return false;
      const result = await pullDriveStateToLocal({
        localState,
        preferences: currentPrefs,
        source: reason,
      });
      if (!result.envelope || result.comparison !== 'remote-newer' || !result.mergedState) return false;
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
    if (!mobileNative || autoHealthBusyRef.current) return false;
    autoHealthBusyRef.current = true;
    try {
      const currentState = readPersistedDashboardState();
      if (!currentState) return false;
      const status = await getHealthIntegrationStatus();
      if (!status.healthConnectAvailable || (status.missingPermissions || []).length > 0) return false;

      const today = todayIso();
      const runtime = parseJsonStorage(AUTO_HEALTH_RUNTIME_KEY);
      const hasImportedBefore = Boolean(currentState.healthSync?.lastImportAt);
      const lastImportSummary = `${currentState.healthSync?.lastImportSummary || ''}`.toLowerCase();
      const lastImportWasEmpty = !lastImportSummary || lastImportSummary.includes('aucune donnee importee');
      if (hasImportedBefore && runtime.lastAutoImportDate === today && !lastImportWasEmpty) return false;

      const payload = await importAutoHealthWindow(currentState.healthSync, {
        overlapDays: 2,
        bootstrapDays: 30,
        endDate: today,
      });
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
      if (importedDates.length > 0) {
        saveJsonStorage(AUTO_HEALTH_RUNTIME_KEY, {
          lastAutoImportDate: today,
          lastReason: reason,
        });
      }
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

    const handleResume = () => {
      refreshSession();
      runAutoPull('resume');
      runAutoHealthImport('resume');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleResume();
    };

    window.addEventListener(DRIVE_SYNC_EVENT, handleDriveSyncEvent);
    window.addEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    runAutoPull('launch');
    runAutoHealthImport('launch');

    return () => {
      clearTimeout(pushTimerRef.current);
      window.removeEventListener(DRIVE_SYNC_EVENT, handleDriveSyncEvent);
      window.removeEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mobileNative, targetLabel]);

  return (
    <header className="appChrome">
      <div className="appChromeInner">
        <Link className="appBrand" to="/">Nutri Sport Hub</Link>
        <div className="appChromeActions">
          <span className="appSyncTarget" title={targetLabel}>{prefs.mode === 'visible' ? 'Drive visible' : 'Cache app'}</span>
          <span className="appSyncTarget" title={configured ? 'Autosync 10s actif apres changement local.' : 'Configure Drive dans Sync.'}>
            {configured && scopeReady ? 'Autosync on' : 'Autosync off'}
          </span>
          <button className="appSyncButton" type="button" disabled={busy} onClick={handleSyncNow}>
            {busy ? 'Sync...' : 'Sync maintenant'}
          </button>
          <Link className="appChromeLink" to="/integrations">Sync</Link>
          {message ? (
            <span className={`appSyncMessage appSyncMessage${tone.charAt(0).toUpperCase()}${tone.slice(1)}`} title={message}>
              {message}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
