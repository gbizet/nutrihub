import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import {
  DASHBOARD_STATE_EVENT,
  mergeIncomingStatePreservingLocalSession,
  persistDashboardState,
  readPersistedDashboardState,
  toPositive,
  useDashboardState,
} from '../lib/dashboardStore';
import { useLocalPageUiState } from '../lib/localUiState.js';
import CoreWorkflowNav from '../components/CoreWorkflowNav';
import { mergeHealthImportIntoState } from '../lib/healthImport';
import {
  appendHealthDebugEntries,
  buildHealthDebugEntry,
  updateHealthSyncAfterDriveOperation,
  updateHealthSyncError,
} from '../lib/healthSchema.js';
import {
  defaultHealthPlatformStatus,
} from '../lib/platformHealth';
import {
  DRIVE_SYNC_MODES,
  buildSyncEnvelope,
  compareSyncEnvelopes,
  describeDriveSyncTarget,
  ensureDeviceId,
  getDriveSyncPreferences,
  getGoogleDriveConfig,
  getRequiredGoogleDriveScopes,
  getStoredGoogleDriveToken,
  ensureGoogleIdentityScript,
  getCompanionDriveSession,
  hasActiveCompanionDriveSession,
  isNativeMobileRuntime,
  markDriveSyncCheckpoint,
  revokeGoogleDriveAccess,
  saveDriveSyncPreferences,
  tokenHasScopes,
} from '../lib/googleDriveSync';
import {
  pushLocalStateToDrive,
  pullDriveStateToLocal,
  readDriveRemoteState,
} from '../lib/driveSyncService.js';
import {
  classifyHealthImportFailure,
  deriveHealthStreamDiagnostics,
  getHealthIntegrationStatus,
  importManualHealthWindow,
  requestHealthIntegrationPermissions,
} from '../lib/healthSyncService.js';
import {
  appendSyncDebugLog,
  clearSyncDebugLog,
  formatSyncDebugEntries,
} from '../lib/syncDebug';
import { hasOngoingWorkoutDraft } from '../lib/ongoingWorkout.js';
import {
  canUseStateServerSnapshots,
  createStateServerSnapshot,
  listStateServerSnapshots,
  restoreStateServerSnapshot,
} from '../lib/stateRecovery.js';

const parseCsvRows = (text) =>
  `${text || ''}`
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((row) => row.split(',').map((c) => c.trim()));

const syncToneClass = (stylesModule, comparison) => {
  if (comparison === 'local-newer') return stylesModule.stateok;
  if (comparison === 'remote-newer') return stylesModule.statehaut;
  if (comparison === 'equal') return stylesModule.statebas;
  return stylesModule.statebas;
};

const syncLabel = (comparison) => {
  if (comparison === 'local-newer') return 'local plus recent';
  if (comparison === 'remote-newer') return 'drive plus recent';
  if (comparison === 'equal') return 'local = drive';
  return 'aucun fichier drive';
};

const healthCoverageLabel = (status) => {
  if (status === 'available') return 'disponible';
  if (status === 'permission-missing') return 'permission manquante';
  if (status === 'runtime-error') return 'runtime Samsung';
  if (status === 'source-absent') return 'source absente';
  if (status === 'unavailable') return 'indisponible';
  return 'inconnu';
};

const formatTargetLabel = (preferences, config) => describeDriveSyncTarget(preferences.mode, config);
const formatMissingRemoteLabel = (preferences, config) => (
  preferences.mode === DRIVE_SYNC_MODES.visible
    ? `Aucun fichier de sync trouve dans ${describeDriveSyncTarget(DRIVE_SYNC_MODES.visible, config)}.`
    : 'Aucun fichier de sync trouve dans appDataFolder.'
);

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

const HEALTH_PERMISSION_LABELS = {
  'android.permission.health.READ_WEIGHT': 'Poids',
  'android.permission.health.READ_BODY_FAT': 'Body fat',
  'android.permission.health.READ_LEAN_BODY_MASS': 'Masse maigre',
  'android.permission.health.READ_STEPS': 'Pas',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED': 'Calories actives',
  'android.permission.health.READ_TOTAL_CALORIES_BURNED': 'Calories totales',
  'android.permission.health.READ_EXERCISE': 'Exercice',
  'android.permission.health.READ_SLEEP': 'Sommeil',
  'android.permission.health.READ_HEART_RATE': 'FC moyenne',
  'android.permission.health.READ_RESTING_HEART_RATE': 'FC repos',
  'android.permission.health.READ_HEART_RATE_VARIABILITY': 'HRV',
  'android.permission.health.READ_BLOOD_PRESSURE': 'Tension',
  'android.permission.health.READ_OXYGEN_SATURATION': 'Oxygene',
  'android.permission.health.READ_BLOOD_GLUCOSE': 'Glycemie',
  'samsung.permission.BODY_COMPOSITION_READ': 'Samsung poids/composition',
  'samsung.permission.STEPS_READ': 'Samsung pas',
  'samsung.permission.SLEEP_READ': 'Samsung sommeil',
  'samsung.permission.HEART_RATE_READ': 'Samsung FC moyenne',
  'samsung.permission.ACTIVITY_SUMMARY_READ': 'Samsung activite',
  'samsung.permission.BLOOD_PRESSURE_READ': 'Samsung tension',
  'samsung.permission.BLOOD_OXYGEN_READ': 'Samsung oxygene',
  'samsung.permission.BLOOD_GLUCOSE_READ': 'Samsung glycemie',
};

const formatHealthPermissions = (permissions = []) => (
  permissions.length
    ? permissions.map((permission) => HEALTH_PERMISSION_LABELS[permission] || permission).join(', ')
    : '-'
);

const withHealthDebug = (prev, message, payload = null, patch = {}) => ({
  ...prev,
  ...patch,
  healthSync: {
    ...appendHealthDebugEntries(prev.healthSync, buildHealthDebugEntry(message, payload)),
    ...(patch.healthSync || {}),
  },
});

export default function IntegrationsPage() {
  const { state, setState, replaceState, uid } = useDashboardState();
  const [localStateSnapshot, setLocalStateSnapshot] = useState(() => readPersistedDashboardState() || state);
  const [pageUi, setPageUi] = useLocalPageUiState('integrations', {
    debugOpen: false,
    advancedToolsOpen: false,
  });
  const mobileNative = isNativeMobileRuntime();
  const [wearableCsv, setWearableCsv] = useState('date,steps,restingBpm,hrvMs\n2026-02-25,8500,63,41');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [status, setStatus] = useState('');
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveAction, setDriveAction] = useState('');
  const [remoteFile, setRemoteFile] = useState(null);
  const [remoteEnvelope, setRemoteEnvelope] = useState(null);
  const [drivePrefs, setDrivePrefs] = useState(() => getDriveSyncPreferences());
  const [syncDebugText, setSyncDebugText] = useState('');
  const [healthStatus, setHealthStatus] = useState(() => defaultHealthPlatformStatus());
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthNotice, setHealthNotice] = useState('');
  const [recoverySnapshots, setRecoverySnapshots] = useState([]);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  const driveConfig = getGoogleDriveConfig();
  const deviceId = ensureDeviceId();
  const storedToken = getStoredGoogleDriveToken();
  const canonicalLocalState = localStateSnapshot || state;
  const localEnvelope = useMemo(() => buildSyncEnvelope(canonicalLocalState, { deviceId }), [canonicalLocalState, deviceId]);
  const syncPreview = JSON.stringify(localEnvelope, null, 2);
  const comparison = remoteEnvelope ? compareSyncEnvelopes(localEnvelope, remoteEnvelope) : 'missing';
  const targetLabel = formatTargetLabel(drivePrefs, driveConfig);
  const requiredScopes = useMemo(
    () => getRequiredGoogleDriveScopes(drivePrefs),
    [drivePrefs.mode, drivePrefs.mirrorAppData],
  );
  const healthStreamDiagnostics = useMemo(
    () => deriveHealthStreamDiagnostics(healthStatus, state.healthSync?.lastCoverage),
    [healthStatus, state.healthSync?.lastCoverage],
  );
  const ongoingWorkoutActive = hasOngoingWorkoutDraft();
  const stateServerSnapshotsEnabled = canUseStateServerSnapshots();

  const refreshSyncDebugText = () => {
    setSyncDebugText(formatSyncDebugEntries());
  };

  const refreshHealthStatus = async () => {
    const next = await getHealthIntegrationStatus();
    setHealthStatus(next);
    return next;
  };

  const refreshRecoverySnapshots = async () => {
    if (!stateServerSnapshotsEnabled) {
      setRecoverySnapshots([]);
      return [];
    }
    try {
      const snapshots = await listStateServerSnapshots();
      setRecoverySnapshots(snapshots);
      return snapshots;
    } catch (error) {
      appendSyncDebugLog('IntegrationsPage', 'refreshRecoverySnapshots failed', { error });
      setStatus(error.message || 'Lecture snapshots impossible.');
      return [];
    }
  };

  const createRecoverySnapshot = async (reason, label, stateForSnapshot = canonicalLocalState) => {
    if (!stateServerSnapshotsEnabled || !stateForSnapshot) return null;
    try {
      const snapshot = await createStateServerSnapshot(stateForSnapshot, { reason, label });
      await refreshRecoverySnapshots();
      return snapshot;
    } catch (error) {
      appendSyncDebugLog('IntegrationsPage', 'createRecoverySnapshot failed', {
        error,
        reason,
        label,
      });
      return null;
    }
  };

  const handleCreateSnapshotNow = async () => {
    setSnapshotBusy(true);
    try {
      const snapshot = await createRecoverySnapshot('manual-ui', `manual:${canonicalLocalState?.updatedAt || ''}`);
      setStatus(snapshot?.id ? `Snapshot de secours cree: ${snapshot.id}.` : 'Snapshots serveur indisponibles.');
    } finally {
      setSnapshotBusy(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId) => {
    if (!snapshotId) return;
    setSnapshotBusy(true);
    setStatus('Restauration snapshot en cours...');
    try {
      await createRecoverySnapshot('before-snapshot-restore', `before-restore:${snapshotId}`);
      const result = await restoreStateServerSnapshot(snapshotId);
      if (!result?.state) {
        setStatus('Snapshot introuvable ou invalide.');
        return;
      }
      replaceState(result.state);
      persistDashboardState(result.state);
      setLocalStateSnapshot(result.state);
      await refreshRecoverySnapshots();
      setStatus(`Etat local restaure depuis snapshot ${snapshotId}.`);
    } catch (error) {
      appendSyncDebugLog('IntegrationsPage', 'handleRestoreSnapshot failed', { error, snapshotId });
      setStatus(error.message || 'Restauration snapshot impossible.');
    } finally {
      setSnapshotBusy(false);
    }
  };

  const importWearable = () => {
    const rows = parseCsvRows(wearableCsv);
    if (rows.length < 2) return;
    const header = rows[0].map((h) => h.toLowerCase());
    const dataRows = rows.slice(1);
    setState((prev) => {
      let neatLogs = [...(prev.neatLogs || [])];
      let dailyLogs = [...(prev.dailyLogs || [])];
      dataRows.forEach((cells) => {
        const date = cells[header.indexOf('date')];
        if (!date) return;
        const steps = toPositive(cells[header.indexOf('steps')], 0);
        const bpm = toPositive(cells[header.indexOf('restingbpm')], 0);
        const hrv = toPositive(cells[header.indexOf('hrvms')], 0);
        if (steps > 0) {
          neatLogs = [{ id: uid(), date, steps, cardioMin: 0, caloriesActive: 0 }, ...neatLogs.filter((x) => x.date !== date)];
        }
        const i = dailyLogs.findIndex((x) => x.date === date);
        if (i < 0) dailyLogs = [{ id: uid(), date, restingBpm: bpm, hrvMs: hrv }, ...dailyLogs];
        else dailyLogs[i] = { ...dailyLogs[i], restingBpm: bpm || dailyLogs[i].restingBpm, hrvMs: hrv || dailyLogs[i].hrvMs };
      });
      return { ...prev, neatLogs, dailyLogs };
    });
    setStatus('Import wearable termine.');
  };

  const updateDrivePreferences = (patch) => {
    const next = saveDriveSyncPreferences({ ...drivePrefs, ...patch });
    appendSyncDebugLog('IntegrationsPage', 'updateDrivePreferences', {
      from: drivePrefs,
      to: next,
    });
    setDrivePrefs(next);
    setRemoteFile(null);
    setRemoteEnvelope(null);
    setStatus(`Mode sync actif: ${formatTargetLabel(next, driveConfig)}${next.mirrorAppData ? ' + miroir cache app' : ''}.`);
  };

  const refreshDriveSnapshot = async (forceConsent = false) => {
    setDriveBusy(true);
    setDriveAction(forceConsent ? 'connect' : 'refresh');
    setStatus(forceConsent ? 'Connexion Drive en cours...' : 'Lecture Drive en cours...');
    appendSyncDebugLog('IntegrationsPage', 'refreshDriveSnapshot start', {
      forceConsent,
      localUpdatedAt: canonicalLocalState?.updatedAt || null,
      remoteUpdatedAt: remoteEnvelope?.updated_at || null,
    });
    try {
      const remote = await readDriveRemoteState({
        forceConsent,
        preferences: drivePrefs,
        localState: canonicalLocalState,
        source: forceConsent ? 'connect' : 'refresh',
      });
      setRemoteFile(remote.file);
      setRemoteEnvelope(remote.envelope);
      setStatus(
        remote.file
          ? `Drive OK: fichier ${remote.file.name} charge depuis ${remote.targetLabel}.`
          : formatMissingRemoteLabel(drivePrefs, driveConfig),
      );
      appendSyncDebugLog('IntegrationsPage', 'refreshDriveSnapshot success', {
        remoteUpdatedAt: remote.updatedAt || null,
        fileId: remote.file?.id || null,
        comparison: remote.comparison,
      });
    } catch (error) {
      appendSyncDebugLog('IntegrationsPage', 'refreshDriveSnapshot failed', { error });
      setStatus(error.message || 'Lecture Google Drive impossible.');
    } finally {
      setDriveBusy(false);
      setDriveAction('');
    }
  };

  const pushLocalToDrive = async () => {
    setDriveBusy(true);
    setDriveAction('push');
    setStatus('Push Drive en cours...');
    appendSyncDebugLog('IntegrationsPage', 'pushLocalToDrive start', {
      stateUpdatedAt: state?.updatedAt || null,
      snapshotUpdatedAt: canonicalLocalState?.updatedAt || null,
      remoteUpdatedAt: remoteEnvelope?.updated_at || null,
    });
    try {
      const latestLocalState = readPersistedDashboardState() || canonicalLocalState;
      await createRecoverySnapshot('before-drive-push', `push:${latestLocalState?.updatedAt || ''}`, latestLocalState);
      const result = await pushLocalStateToDrive({
        state: latestLocalState,
        preferences: drivePrefs,
        source: 'push',
      });
      setRemoteFile(result.file);
      setRemoteEnvelope(result.envelope);
      setStatus(
        `Push OK vers ${result.targetLabel} (${result.file?.modifiedTime || result.updatedAt}).`,
      );
      replaceState((prev) => ({
        ...prev,
        healthSync: updateHealthSyncAfterDriveOperation(prev.healthSync, 'push', result.updatedAt),
      }));
      appendSyncDebugLog('IntegrationsPage', 'pushLocalToDrive success', {
        localUpdatedAt: latestLocalState?.updatedAt || null,
        remoteUpdatedAt: result.updatedAt || null,
      });
    } catch (error) {
      appendSyncDebugLog('IntegrationsPage', 'pushLocalToDrive failed', {
        error,
        remoteUpdatedAt: error?.remote?.envelope?.updated_at || null,
      });
      if (error?.code === 'REMOTE_NEWER' && error.remote) {
        setRemoteFile(error.remote.file);
        setRemoteEnvelope(error.remote.envelope);
      }
      setStatus(error.message || 'Push Google Drive impossible.');
    } finally {
      setDriveBusy(false);
      setDriveAction('');
    }
  };

  const pullDriveToLocal = async () => {
    if (ongoingWorkoutActive) {
      appendSyncDebugLog('IntegrationsPage', 'pullDriveToLocal blocked', {
        cause: 'ongoing-workout-active',
      });
      setStatus('Pull bloque: termine ou abandonne la seance en cours avant d importer Drive.');
      return;
    }
    setDriveBusy(true);
    setDriveAction('pull');
    setStatus('Pull Drive en cours...');
    appendSyncDebugLog('IntegrationsPage', 'pullDriveToLocal start', {
      stateUpdatedAt: state?.updatedAt || null,
      snapshotUpdatedAt: canonicalLocalState?.updatedAt || null,
      remoteUpdatedAt: remoteEnvelope?.updated_at || null,
    });
    try {
      await createRecoverySnapshot('before-drive-pull', `pull:${canonicalLocalState?.updatedAt || ''}`, canonicalLocalState);
      const result = await pullDriveStateToLocal({
        localState: state,
        preferences: drivePrefs,
        source: 'pull',
      });
      if (!result.envelope?.payload) {
        setRemoteFile(result.file || null);
        setRemoteEnvelope(result.envelope || null);
        setStatus(
          result.file
            ? 'Aucun payload distant a importer.'
            : formatMissingRemoteLabel(drivePrefs, driveConfig),
        );
        return;
      }
      if (result.status === 'invalid-payload' || !result.mergedState) {
        appendSyncDebugLog('IntegrationsPage', 'pullDriveToLocal invalid payload', {
          remoteUpdatedAt: result.updatedAt || null,
        });
        setStatus('Payload Drive invalide.');
        return;
      }
      const merged = {
        ...result.mergedState,
        healthSync: updateHealthSyncAfterDriveOperation(result.mergedState.healthSync, 'pull', result.updatedAt),
      };
      replaceState(merged);
      persistDashboardState(merged);
      setLocalStateSnapshot(merged);
      const persistedAfterPull = readPersistedDashboardState();
      appendSyncDebugLog('IntegrationsPage', 'pullDriveToLocal persisted', {
        hydratedUpdatedAt: merged.updatedAt,
        persistedUpdatedAt: persistedAfterPull?.updatedAt || null,
        hydratedSelectedDate: merged.selectedDate,
      });
      // A pull aligns local with Drive; treat it as the latest synced checkpoint.
      markDriveSyncCheckpoint(result.updatedAt, drivePrefs, {
        kind: 'pull-success',
        targetLabel: formatTargetLabel(drivePrefs, driveConfig),
      });
      setRemoteFile(result.file);
      setRemoteEnvelope(result.envelope);
      setStatus(`Etat local remplace depuis ${result.targetLabel} (${result.updatedAt}).`);
    } catch (error) {
      appendSyncDebugLog('IntegrationsPage', 'pullDriveToLocal failed', { error });
      setStatus(error.message || 'Import Google Drive impossible.');
    } finally {
      setDriveBusy(false);
      setDriveAction('');
    }
  };

  const disconnectDrive = async () => {
    setDriveBusy(true);
    setDriveAction('disconnect');
    setStatus('Deconnexion Drive en cours...');
    try {
      await revokeGoogleDriveAccess();
      setRemoteFile(null);
      setRemoteEnvelope(null);
      setStatus('Session Google Drive fermee.');
    } catch (error) {
      setStatus(error.message || 'Deconnexion Google Drive impossible.');
    } finally {
      setDriveBusy(false);
      setDriveAction('');
    }
  };

  const handleHealthPermissions = async () => {
    setHealthBusy(true);
    const startPayload = {
      reason: healthStatus.reason,
      healthConnectAvailable: healthStatus.healthConnectAvailable,
      samsungDataSdkBundled: healthStatus.samsungDataSdkBundled,
      samsungLastError: healthStatus.samsungLastError,
      samsungMissingPermissions: healthStatus.samsungDataSdkMissingPermissions,
    };
    appendSyncDebugLog('Health', 'request permissions start', startPayload);
    replaceState((prev) => withHealthDebug(prev, 'request permissions start', startPayload));
    try {
      const permissionStatus = await requestHealthIntegrationPermissions();
      setHealthStatus(permissionStatus);
      const healthConnectGranted = permissionStatus.grantedPermissions?.length || 0;
      const healthConnectMissing = permissionStatus.missingPermissions?.length || 0;
      const samsungBlocked = permissionStatus.samsungLastError
        ? ` Samsung direct bloque: ${permissionStatus.samsungLastError}.`
        : '';
      const message = (
        healthConnectGranted === 0
          ? `Aucune permission sante Health Connect effectivement accordee.${samsungBlocked}`
          : healthConnectMissing
            ? `Permissions sante partielles. Accordees: ${healthConnectGranted}, manquantes: ${healthConnectMissing}.${samsungBlocked}`
            : `Permissions sante Health Connect accordees.${samsungBlocked}`
      );
      setHealthNotice(message);
      setStatus(message);
      const successPayload = {
        grantedPermissions: permissionStatus.grantedPermissions,
        missingPermissions: permissionStatus.missingPermissions,
        samsungGrantedPermissions: permissionStatus.samsungDataSdkGrantedPermissions,
        samsungMissingPermissions: permissionStatus.samsungDataSdkMissingPermissions,
        samsungLastError: permissionStatus.samsungLastError,
      };
      appendSyncDebugLog('Health', 'request permissions success', successPayload);
      replaceState((prev) => withHealthDebug(prev, 'request permissions success', successPayload, {
        healthSync: {
          ...prev.healthSync,
          lastError: '',
          permissions: permissionStatus.grantedPermissions || [],
        },
      }));
      refreshSyncDebugText();
    } catch (error) {
      const message = error.message || 'Permissions sante indisponibles.';
      setHealthNotice(message);
      setStatus(message);
      appendSyncDebugLog('Health', 'request permissions failed', { error });
      replaceState((prev) => withHealthDebug(prev, 'request permissions failed', { error }, {
        healthSync: updateHealthSyncError(prev.healthSync, {
          message,
          category: classifyHealthImportFailure(error),
        }),
      }));
      refreshSyncDebugText();
    } finally {
      setHealthBusy(false);
    }
  };

  const handleHealthImport = async () => {
    setHealthBusy(true);
    const startPayload = {
      grantedPermissions: healthStatus.grantedPermissions,
      missingPermissions: healthStatus.missingPermissions,
      samsungGrantedPermissions: healthStatus.samsungDataSdkGrantedPermissions,
      samsungMissingPermissions: healthStatus.samsungDataSdkMissingPermissions,
      samsungLastError: healthStatus.samsungLastError,
      reason: healthStatus.reason,
    };
    appendSyncDebugLog('Health', 'import start', startPayload);
    replaceState((prev) => withHealthDebug(prev, 'import start', startPayload));
    try {
      const payload = await importManualHealthWindow();
      const importedDates = healthPayloadDates(payload);
      const lastImportedDate = [...importedDates].sort().at(-1) || state.selectedDate;
      const records = payload.records || {};

      setState((prev) => {
        const merged = mergeHealthImportIntoState(prev, payload);
        return mergeIncomingStatePreservingLocalSession(prev, merged);
      });

      const refreshedStatus = await refreshHealthStatus();
      const totalImported = (
        (Array.isArray(records.bodyMetrics) ? records.bodyMetrics.length : 0)
        + (Array.isArray(records.activity) ? records.activity.length : 0)
        + (Array.isArray(records.sleep) ? records.sleep.length : 0)
        + (Array.isArray(records.vitals) ? records.vitals.length : 0)
      );
      const samsungBlocked = refreshedStatus.samsungLastError
        ? ` Samsung direct bloque: ${refreshedStatus.samsungLastError}.`
        : '';
      const message = (
        totalImported === 0
          ? `Import sante OK mais aucune donnee n a ete exposee par Health Connect/Samsung pour la plage demandee.${samsungBlocked}`
          : payload?.records
          ? `Import sante termine. Derniere date importee: ${lastImportedDate}.${samsungBlocked}`
          : 'Import sante termine.'
      );
      setHealthNotice(message);
      setStatus(message);
      const successPayload = {
        lastImportedDate,
        bodyMetrics: Array.isArray(records.bodyMetrics) ? records.bodyMetrics.length : 0,
        activity: Array.isArray(records.activity) ? records.activity.length : 0,
        sleep: Array.isArray(records.sleep) ? records.sleep.length : 0,
        vitals: Array.isArray(records.vitals) ? records.vitals.length : 0,
        samsungGrantedPermissions: refreshedStatus.samsungDataSdkGrantedPermissions,
        samsungMissingPermissions: refreshedStatus.samsungDataSdkMissingPermissions,
        samsungLastError: refreshedStatus.samsungLastError,
      };
      appendSyncDebugLog('Health', 'import success', successPayload);
      replaceState((prev) => withHealthDebug(prev, 'import success', successPayload, {
        healthSync: {
          ...prev.healthSync,
          lastError: '',
        },
      }));
      refreshSyncDebugText();
    } catch (error) {
      const message = error.message || 'Import sante indisponible.';
      setHealthNotice(message);
      setStatus(message);
      appendSyncDebugLog('Health', 'import failed', { error });
      replaceState((prev) => withHealthDebug(prev, 'import failed', { error }, {
        healthSync: updateHealthSyncError(prev.healthSync, {
          message,
          category: classifyHealthImportFailure(error),
        }),
      }));
      refreshSyncDebugText();
    } finally {
      setHealthBusy(false);
    }
  };

  useEffect(() => {
    refreshSyncDebugText();
  }, []);

  useEffect(() => {
    refreshRecoverySnapshots();
  }, [stateServerSnapshotsEnabled]);

  useEffect(() => {
    refreshHealthStatus().then((next) => {
      const statusPayload = {
        healthConnectAvailable: next.healthConnectAvailable,
        samsungHealthAvailable: next.samsungHealthAvailable,
        grantedPermissions: next.grantedPermissions,
        missingPermissions: next.missingPermissions,
        reason: next.reason,
      };
      appendSyncDebugLog('Health', 'status refresh', statusPayload);
      replaceState((prev) => withHealthDebug(prev, 'status refresh', statusPayload));
      refreshSyncDebugText();
    });
  }, []);

  useEffect(() => {
    if (mobileNative || !driveConfig.clientId) return;
    ensureGoogleIdentityScript().catch((error) => {
      appendSyncDebugLog('IntegrationsPage', 'ensureGoogleIdentityScript preload failed', { error });
    });
    // Refresh companion session status on mount
    getCompanionDriveSession().then((session) => {
      if (session?.active) {
        appendSyncDebugLog('IntegrationsPage', 'companion session refreshed on mount', {
          scope: session.scope,
        });
      }
    }).catch(() => {});
  }, [mobileNative, driveConfig.clientId]);

  useEffect(() => {
    if (!driveConfig.clientId || !storedToken?.accessToken) return;
    const isCompanion = storedToken?.companion;
    const scopeReady = isCompanion || tokenHasScopes(storedToken, requiredScopes);
    if (!scopeReady) {
      setStatus(`Session Drive presente, mais scopes insuffisants pour ${targetLabel}. Clique "Connecter / verifier Drive".`);
      return;
    }
    setStatus(isCompanion
      ? `Session Drive companion active pour ${targetLabel}. Session geree cote serveur.`
      : `Session Drive prete pour ${targetLabel}. Clique "Rafraichir distant" ou "Pull Drive vers local".`);
  }, [driveConfig.clientId, requiredScopes, storedToken, targetLabel]);

  useEffect(() => {
    setLocalStateSnapshot(readPersistedDashboardState() || state);
  }, [state]);

  useEffect(() => {
    const handleDashboardState = () => {
      setLocalStateSnapshot(readPersistedDashboardState() || state);
    };

    window.addEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
    return () => {
      window.removeEventListener(DASHBOARD_STATE_EVENT, handleDashboardState);
    };
  }, [state]);

  return (
    <Layout
      title="Integrations"
      description="Imports wearable et sync Google Drive"
      mobileChromeMode="default"
      mobileTitleShort="Sync"
    >
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Integrations & sync</h1>
            <p>Sync perso simple: un seul fichier JSON, soit dans un dossier Drive visible, soit dans `appDataFolder`, avec comparaison local/distant avant push ou pull.</p>
            <div className={styles.stateGrid}>
              <span className={`${styles.stateChip} ${storedToken?.accessToken ? styles.stateok : styles.statebas}`}>Drive {storedToken?.accessToken ? 'connecte' : 'off'}</span>
              <span className={`${styles.stateChip} ${comparison === 'remote-newer' ? styles.statehaut : comparison === 'local-newer' ? styles.stateok : styles.statebas}`}>Sync {syncLabel(comparison)}</span>
              <span className={`${styles.stateChip} ${healthStatus.healthConnectAvailable ? styles.stateok : styles.statehaut}`}>Health Connect {healthStatus.healthConnectAvailable ? 'pret' : 'off'}</span>
              <span className={`${styles.stateChip} ${state.healthSync?.lastImportAt ? styles.stateok : styles.statebas}`}>Dernier import {state.healthSync?.lastImportAt || '-'}</span>
              <span className={`${styles.stateChip} ${status ? styles.statebas : styles.stateok}`}>{status || 'Aucune alerte bloquante'}</span>
            </div>
            <CoreWorkflowNav active="integrations" supportMode="full" />
          </section>

          <section className={styles.grid2}>
            <article className={styles.card}>
              <h2>Sante Android</h2>
              <div className={styles.insightGrid}>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Health Connect</div><div className={styles.insightValue}>{healthStatus.healthConnectAvailable ? 'pret' : 'indisponible'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Samsung Health</div><div className={styles.insightValue}>{healthStatus.samsungHealthAvailable ? 'installe' : 'non detecte'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Samsung SDK</div><div className={styles.insightValue}>{healthStatus.samsungDataSdkBundled ? 'bundle' : 'absent'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Fallback Samsung</div><div className={styles.insightValue}>{healthStatus.samsungDataSdkFallbackAvailable ? 'pret' : 'off'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Dernier import</div><div className={styles.insightValue}>{state.healthSync?.lastImportAt || '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Flux reconnus</div><div className={styles.insightValue}>{healthStatus.supportedStreams?.length || 0}</div></div>
              </div>
              <div className={styles.formGrid} style={{ marginTop: '0.8rem' }}>
                <button className={styles.buttonGhost} type="button" disabled={healthBusy} onClick={handleHealthPermissions}>
                  {healthBusy ? 'Permissions...' : 'Permissions sante'}
                </button>
                <button className={styles.button} type="button" disabled={healthBusy} onClick={handleHealthImport}>
                  {healthBusy ? 'Import...' : 'Importer sante'}
                </button>
              </div>
              <p className={styles.smallMuted} style={{ marginTop: '0.7rem' }}>
                Permissions accordees: {formatHealthPermissions(healthStatus.grantedPermissions)}
              </p>
              <p className={styles.smallMuted}>
                Permissions Samsung OK: {formatHealthPermissions(healthStatus.samsungDataSdkGrantedPermissions)}
              </p>
              <p className={styles.smallMuted}>
                Fallback Samsung direct: {healthStatus.samsungWeightFallbackReason}
              </p>
            </article>

            <article className={styles.card}>
              <h2>Sync multi-device</h2>
              <div className={styles.insightGrid}>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Session Drive</div><div className={styles.insightValue}>{storedToken?.accessToken ? 'connectee' : 'non connectee'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Mode</div><div className={styles.insightValue}>{drivePrefs.mode === DRIVE_SYNC_MODES.visible ? 'visible' : 'cache app'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Comparaison</div><div className={styles.insightValue}>{syncLabel(comparison)}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Target</div><div className={styles.insightValue}>{targetLabel}</div></div>
              </div>
              <div className={styles.formGrid} style={{ marginTop: '0.8rem' }}>
                <button className={styles.button} type="button" disabled={driveBusy || !driveConfig.clientId} onClick={() => refreshDriveSnapshot(true)}>
                  {driveBusy && driveAction === 'connect' ? 'Connexion...' : 'Connecter / verifier Drive'}
                </button>
                <button className={styles.button} type="button" disabled={driveBusy || !storedToken?.accessToken} onClick={pushLocalToDrive}>
                  {driveBusy && driveAction === 'push' ? 'Push...' : 'Push local vers Drive'}
                </button>
                <button className={styles.buttonGhost} type="button" disabled={driveBusy || !storedToken?.accessToken || ongoingWorkoutActive} onClick={pullDriveToLocal}>
                  {driveBusy && driveAction === 'pull' ? 'Pull...' : 'Pull Drive vers local'}
                </button>
              </div>
              <p className={styles.smallMuted} style={{ marginTop: '0.7rem' }}>
                Autosync: push debounce 10s sur changement local. Pull auto et import sante a l ouverture/reprise quand la session Drive est valide.
              </p>
              {ongoingWorkoutActive ? (
                <p className={styles.smallMuted} style={{ color: '#a14a08' }}>
                  Seance en cours detectee: le pull Drive est bloque tant que le logger ongoing n est pas finalise ou abandonne.
                </p>
              ) : null}
            </article>
          </section>

          <section>
            <article className={styles.card}>
              <h2>Snapshots de secours</h2>
              <p className={styles.smallMuted}>
                Avant un pull ou un push Drive, l app cree un snapshot disque via le companion local quand il est disponible. Ces snapshots survivent a un refresh navigateur et a une erreur de sync PC.
              </p>
              {!stateServerSnapshotsEnabled ? (
                <p className={styles.smallMuted}>
                  Snapshots serveur indisponibles sur ce runtime. Active le state server local pour obtenir des sauvegardes disque versionnees.
                </p>
              ) : (
                <>
                  <div className={styles.formGrid} style={{ marginTop: '0.8rem' }}>
                    <button className={styles.button} type="button" disabled={snapshotBusy} onClick={handleCreateSnapshotNow}>
                      {snapshotBusy ? 'Snapshot...' : 'Creer un snapshot maintenant'}
                    </button>
                    <button className={styles.buttonGhost} type="button" disabled={snapshotBusy} onClick={refreshRecoverySnapshots}>
                      Rafraichir les snapshots
                    </button>
                    <button
                      className={styles.buttonGhost}
                      type="button"
                      disabled={snapshotBusy || !recoverySnapshots[0]?.id}
                      onClick={() => handleRestoreSnapshot(recoverySnapshots[0]?.id)}
                    >
                      Restaurer le plus recent
                    </button>
                  </div>
                  <div className={styles.insightGrid} style={{ marginTop: '0.8rem' }}>
                    <div className={styles.insightItem}>
                      <div className={styles.insightLabel}>Snapshots disponibles</div>
                      <div className={styles.insightValue}>{recoverySnapshots.length}</div>
                    </div>
                    <div className={styles.insightItem}>
                      <div className={styles.insightLabel}>Dernier snapshot</div>
                      <div className={styles.insightValue}>{recoverySnapshots[0]?.createdAt || '-'}</div>
                    </div>
                    <div className={styles.insightItem}>
                      <div className={styles.insightLabel}>Dernier state sauvegarde</div>
                      <div className={styles.insightValue}>{recoverySnapshots[0]?.stateUpdatedAt || '-'}</div>
                    </div>
                    <div className={styles.insightItem}>
                      <div className={styles.insightLabel}>Raison</div>
                      <div className={styles.insightValue}>{recoverySnapshots[0]?.reason || '-'}</div>
                    </div>
                  </div>
                  {recoverySnapshots.length ? (
                    <table className={styles.table} style={{ marginTop: '0.9rem' }}>
                      <thead>
                        <tr>
                          <th>Snapshot</th>
                          <th>State</th>
                          <th>Raison</th>
                          <th>Date active</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recoverySnapshots.slice(0, 8).map((snapshot) => (
                          <tr key={snapshot.id}>
                            <td>{snapshot.createdAt || snapshot.id}</td>
                            <td>{snapshot.stateUpdatedAt || '-'}</td>
                            <td>{snapshot.reason || '-'}</td>
                            <td>{snapshot.selectedDate || '-'}</td>
                            <td>
                              <button
                                className={styles.tinyButton}
                                type="button"
                                disabled={snapshotBusy}
                                onClick={() => handleRestoreSnapshot(snapshot.id)}
                              >
                                Restaurer
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className={styles.smallMuted} style={{ marginTop: '0.8rem' }}>
                      Aucun snapshot disque disponible pour le moment.
                    </p>
                  )}
                </>
              )}
            </article>
          </section>

          <section className={styles.grid2}>
            <article className={styles.card}>
              <h2>Google Drive</h2>
              <div className={styles.stateGrid}>
                <span className={`${styles.stateChip} ${styles.stateok}`}>Device: {deviceId.slice(0, 8)}...</span>
                <span className={`${styles.stateChip} ${storedToken?.accessToken ? styles.stateok : styles.statebas}`}>
                  Session: {storedToken?.accessToken ? 'connectee' : 'non connectee'}
                </span>
                <span className={`${styles.stateChip} ${driveConfig.clientId ? styles.stateok : styles.statehaut}`}>
                  Client ID: {driveConfig.clientId ? 'configure' : 'manquant'}
                </span>
                <span className={`${styles.stateChip} ${syncToneClass(styles, comparison)}`}>
                  Sync: {syncLabel(comparison)}
                </span>
              </div>

              <p className={styles.smallMuted}>
                Fichier cible: {driveConfig.fileName}. Emplacement actif: {targetLabel}. Seule la variable `VITE_GOOGLE_DRIVE_CLIENT_ID` est necessaire.
              </p>
              {mobileNative ? (
                <p className={styles.smallMuted} style={{ color: '#a14a08' }}>
                  Drive mobile Android: connexion native Google active. Si Google refuse, il faudra ajouter le client OAuth Android dans Google Cloud.
                </p>
              ) : null}

              <div className={styles.formGrid} style={{ marginBottom: '0.8rem' }}>
                <label>
                  <span className={styles.smallMuted}>Mode de sync</span>
                  <select
                    className={styles.select}
                    value={drivePrefs.mode}
                    onChange={(e) => updateDrivePreferences({ mode: e.target.value })}
                  >
                    <option value={DRIVE_SYNC_MODES.visible}>Dossier visible Mon Drive</option>
                    <option value={DRIVE_SYNC_MODES.appData}>Cache app (appDataFolder)</option>
                  </select>
                </label>
                <label className={styles.togglePill} style={{ alignSelf: 'end', opacity: drivePrefs.mode === DRIVE_SYNC_MODES.visible ? 1 : 0.55 }}>
                  <input
                    type="checkbox"
                    checked={drivePrefs.mirrorAppData}
                    disabled={drivePrefs.mode !== DRIVE_SYNC_MODES.visible}
                    onChange={(e) => updateDrivePreferences({ mirrorAppData: e.target.checked })}
                  />
                  Copier aussi vers le cache app
                </label>
              </div>

              <div className={styles.insightGrid} style={{ marginBottom: '0.75rem' }}>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Mode actif</div>
                  <div className={styles.insightValue}>{drivePrefs.mode === DRIVE_SYNC_MODES.visible ? 'visible' : 'cache app'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Miroir cache</div>
                  <div className={styles.insightValue}>{drivePrefs.mirrorAppData ? 'actif' : 'off'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Emplacement</div>
                  <div className={styles.insightValue}>{targetLabel}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Scopes OAuth</div>
                  <div className={styles.insightValue}>{requiredScopes.length}</div>
                </div>
              </div>

              <div className={styles.formGrid}>
                <button className={styles.button} type="button" disabled={driveBusy || !driveConfig.clientId} onClick={() => refreshDriveSnapshot(true)}>
                  {driveBusy && driveAction === 'connect' ? 'Connexion Drive...' : 'Connecter / verifier Drive'}
                </button>
                <button className={styles.buttonGhost} type="button" disabled={driveBusy || !storedToken?.accessToken} onClick={() => refreshDriveSnapshot(false)}>
                  {driveBusy && driveAction === 'refresh' ? 'Lecture Drive...' : 'Rafraichir distant'}
                </button>
                <button className={styles.button} type="button" disabled={driveBusy || !storedToken?.accessToken} onClick={pushLocalToDrive}>
                  {driveBusy && driveAction === 'push' ? 'Push en cours...' : 'Push local vers Drive'}
                </button>
                <button className={styles.buttonGhost} type="button" disabled={driveBusy || !storedToken?.accessToken || ongoingWorkoutActive} onClick={pullDriveToLocal}>
                  {driveBusy && driveAction === 'pull' ? 'Pull en cours...' : 'Pull Drive vers local'}
                </button>
                <button className={styles.buttonGhost} type="button" disabled={driveBusy || !storedToken?.accessToken} onClick={disconnectDrive}>
                  {driveBusy && driveAction === 'disconnect' ? 'Deconnexion...' : 'Deconnecter Drive'}
                </button>
              </div>

              <div className={styles.insightGrid} style={{ marginTop: '0.75rem' }}>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Local updatedAt</div>
                  <div className={styles.insightValue}>{localEnvelope.updated_at || '-'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Drive updatedAt</div>
                  <div className={styles.insightValue}>{remoteEnvelope?.updated_at || '-'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Fichier Drive</div>
                  <div className={styles.insightValue}>{remoteFile?.id ? remoteFile.name : 'aucun'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Target distant</div>
                  <div className={styles.insightValue}>{targetLabel}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Device distant</div>
                  <div className={styles.insightValue}>{remoteEnvelope?.device_id ? `${remoteEnvelope.device_id.slice(0, 8)}...` : '-'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Dernier push</div>
                  <div className={styles.insightValue}>{state.healthSync?.lastPushAt || '-'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Dernier pull</div>
                  <div className={styles.insightValue}>{state.healthSync?.lastPullAt || '-'}</div>
                </div>
              </div>
              {status && <p className={styles.smallMuted}>{status}</p>}
            </article>

          </section>

          <section>
            <details className={`${styles.card} ${styles.detailsCard}`}>
              <summary className={styles.cardSummary}>Payload de sync</summary>
              <p className={styles.smallMuted}>
                Enveloppe envoyee a Drive. `stateSnapshots` est retire pour eviter un fichier qui grossit sans fin.
              </p>
              <textarea className={styles.textarea} value={syncPreview} readOnly />
            </details>
          </section>

          <section>
            <details className={`${styles.card} ${styles.detailsCard}`} open={pageUi.debugOpen} onToggle={(e) => setPageUi((prev) => ({ ...prev, debugOpen: e.currentTarget.open }))}>
              <summary className={styles.cardSummary}>Logs sync debug</summary>
              <p className={styles.smallMuted}>
                Trace persistante locale des actions sync. Repliee par defaut pour ne pas monopoliser l ecran.
              </p>
              <div className={styles.formGrid}>
                <button className={styles.buttonGhost} type="button" onClick={refreshSyncDebugText}>Rafraichir logs</button>
                <button className={styles.buttonGhost} type="button" onClick={() => { clearSyncDebugLog(); setSyncDebugText(''); }}>Vider logs</button>
              </div>
              <textarea className={styles.textarea} value={syncDebugText} readOnly />
            </details>
          </section>

          <section>
            <details className={`${styles.card} ${styles.detailsCard}`} open={pageUi.advancedToolsOpen} onToggle={(e) => setPageUi((prev) => ({ ...prev, advancedToolsOpen: e.currentTarget.open }))}>
              <summary className={styles.cardSummary}>Outils avances / faible valeur</summary>
              <div className={styles.grid2}>
                <article>
                  <h2>Wearable CSV</h2>
                  <textarea className={styles.textarea} value={wearableCsv} onChange={(e) => setWearableCsv(e.target.value)} />
                  <button className={styles.button} type="button" onClick={importWearable}>Importer wearable</button>
                </article>
                <article>
                  <h2>Barcode quick add</h2>
                  <input className={styles.input} placeholder="Code barre" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} />
                  <p className={styles.smallMuted}>Workflow recommande: scanner vers ouvrir page Aliments vers coller code vers enrichir macros vers sauvegarder.</p>
                </article>
              </div>
            </details>
          </section>

          <section className={styles.grid2}>
            <article className={styles.card}>
              <h2>Health Connect / Samsung</h2>
              <p className={styles.smallMuted}>
                Cible Android only. Le web/PC affiche ensuite les memes donnees via le store commun + sync Drive.
              </p>
              <div className={styles.insightGrid}>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Plateforme</div>
                  <div className={styles.insightValue}>{healthStatus.platform}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Provider cible</div>
                  <div className={styles.insightValue}>{state.healthSync?.provider || 'health-connect'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Health Connect</div>
                  <div className={styles.insightValue}>{healthStatus.healthConnectAvailable ? 'pret' : 'indisponible'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Samsung Health</div>
                  <div className={styles.insightValue}>{healthStatus.samsungHealthAvailable ? 'installe' : 'non detecte'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Samsung SDK</div>
                  <div className={styles.insightValue}>{healthStatus.samsungDataSdkBundled ? 'bundle' : 'absent'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Fallback Samsung</div>
                  <div className={styles.insightValue}>{healthStatus.samsungDataSdkFallbackAvailable ? 'pret' : 'non pret'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Dernier import</div>
                  <div className={styles.insightValue}>{state.healthSync?.lastImportAt || '-'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Resume import</div>
                  <div className={styles.insightValue}>{state.healthSync?.lastImportSummary || '-'}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Permissions OK</div>
                  <div className={styles.insightValue}>{healthStatus.grantedPermissions?.length || 0}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Permissions manquees</div>
                  <div className={styles.insightValue}>{healthStatus.missingPermissions?.length || 0}</div>
                </div>
              </div>
              <div className={styles.metaRow} style={{ marginTop: '0.8rem' }}>
                {healthStatus.supportedStreams.map((stream) => (
                  <span key={stream.id} className={`${styles.pill} ${styles.pillMuted}`}>{stream.label}</span>
                ))}
              </div>
              <div className={styles.formGrid} style={{ marginTop: '0.8rem' }}>
                <button className={styles.buttonGhost} type="button" disabled={healthBusy} onClick={handleHealthPermissions}>
                  {healthBusy ? 'Permissions...' : 'Permissions sante'}
                </button>
                <button className={styles.button} type="button" disabled={healthBusy} onClick={handleHealthImport}>
                  {healthBusy ? 'Import...' : 'Importer sante'}
                </button>
              </div>
              <p className={styles.smallMuted} style={{ marginTop: '0.7rem' }}>
                Permissions accordees: {formatHealthPermissions(healthStatus.grantedPermissions)}
              </p>
              <p className={styles.smallMuted}>
                Permissions Samsung OK: {formatHealthPermissions(healthStatus.samsungDataSdkGrantedPermissions)}
              </p>
              <p className={styles.smallMuted}>
                Permissions manquantes: {formatHealthPermissions(healthStatus.missingPermissions)}
              </p>
              <p className={styles.smallMuted}>
                Permissions Samsung manquantes: {formatHealthPermissions(healthStatus.samsungDataSdkMissingPermissions)}
              </p>
              {healthStatus.samsungReadDataRuntimeError ? (
                <p className={styles.smallMuted}>Runtime Samsung lecture: {healthStatus.samsungReadDataRuntimeError}</p>
              ) : null}
              {healthStatus.samsungLastError ? (
                <p className={styles.smallMuted}>Erreur Samsung directe: {healthStatus.samsungLastError}</p>
              ) : null}
              {healthNotice ? <p className={styles.smallMuted}>{healthNotice}</p> : null}
              <p className={styles.smallMuted} style={{ marginTop: '0.7rem' }}>{healthStatus.reason}</p>
              <p className={styles.smallMuted}>
                {healthStatus.samsungWeightFallbackReason}
                {healthStatus.samsungDataSdkRequiresDeveloperMode ? ' Tant que l app n est pas enregistree chez Samsung, active aussi le developer mode Samsung Health.' : ''}
              </p>
              <details className={`${styles.card} ${styles.detailsCard}`} style={{ marginTop: '0.9rem' }}>
                <summary className={styles.cardSummary}>Diagnostic par flux</summary>
                <p className={styles.smallMuted}>Dernier import, permissions, fallback Samsung et couverture par flux.</p>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Flux</th>
                      <th>Etat</th>
                      <th>Provider</th>
                      <th>Derniere date</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthStreamDiagnostics.map((stream) => (
                      <tr key={stream.id}>
                        <td>{stream.label}</td>
                        <td>{healthCoverageLabel(stream.status)}</td>
                        <td>{stream.usedFallback ? 'Samsung fallback' : stream.provider || '-'}</td>
                        <td>{stream.lastSeenDate || '-'}</td>
                        <td>{stream.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </article>

            <article className={styles.card}>
              <h2>Schema commun sante</h2>
              <p className={styles.smallMuted}>
                Android enrichira `metrics`, `neatLogs` et `dailyLogs` avec des metadonnees de source. Le PC/Web n a pas besoin d acces direct Samsung Health.
              </p>
              <ul className={styles.list}>
                <li><div className={styles.smallMuted}>Poids / composition -&gt; `metrics`</div></li>
                <li><div className={styles.smallMuted}>Pas / calories actives / minutes actives -&gt; `neatLogs`</div></li>
                <li><div className={styles.smallMuted}>Sommeil / coeur / HRV / tension -&gt; `dailyLogs`</div></li>
              </ul>
            </article>
          </section>
        </div>
      </main>
    </Layout>
  );
}
