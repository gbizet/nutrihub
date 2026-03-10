import {
  hydrateStateFromSyncEnvelope,
  mergeIncomingStatePreservingLocalSession,
} from './dashboardStore.js';
import {
  buildSyncEnvelope,
  compareSyncEnvelopes,
  describeDriveSyncTarget,
  ensureDeviceId,
  fetchGoogleDriveSyncEnvelope,
  getDriveSyncPreferences,
  guardedPushGoogleDriveState,
  normalizeDriveSyncPreferences,
  requestGoogleDriveAccessToken,
} from './googleDriveSync.js';

const buildDriveOperation = ({
  status,
  comparison = 'missing',
  updatedAt = '',
  targetLabel = '',
  source = 'manual',
  token = '',
  file = null,
  envelope = null,
  mergedState = null,
}) => ({
  status,
  comparison,
  updatedAt,
  targetLabel,
  source,
  token,
  file,
  envelope,
  mergedState,
});

export const ensureDriveSyncToken = async ({ forceConsent = false, preferences = getDriveSyncPreferences() } = {}) => {
  const normalized = normalizeDriveSyncPreferences(preferences);
  const token = await requestGoogleDriveAccessToken({
    forceConsent,
    preferences: normalized,
  });
  return {
    token,
    preferences: normalized,
    targetLabel: describeDriveSyncTarget(normalized.mode),
  };
};

export const readDriveRemoteState = async ({ forceConsent = false, preferences = getDriveSyncPreferences(), localState = null, source = 'manual' } = {}) => {
  const session = await ensureDriveSyncToken({ forceConsent, preferences });
  const remote = await fetchGoogleDriveSyncEnvelope(session.token, { preferences: session.preferences });
  const localEnvelope = localState ? buildSyncEnvelope(localState, { deviceId: ensureDeviceId() }) : null;
  const comparison = remote.envelope && localEnvelope
    ? compareSyncEnvelopes(localEnvelope, remote.envelope)
    : remote.envelope
      ? 'available'
      : 'missing';

  return buildDriveOperation({
    status: remote.file ? 'remote-loaded' : 'missing',
    comparison,
    updatedAt: remote.envelope?.updated_at || '',
    targetLabel: session.targetLabel,
    source,
    token: session.token,
    file: remote.file,
    envelope: remote.envelope,
  });
};

export const pushLocalStateToDrive = async ({ state, forceConsent = false, preferences = getDriveSyncPreferences(), source = 'manual', allowRemoteOverwrite = false } = {}) => {
  const session = await ensureDriveSyncToken({ forceConsent, preferences });
  const result = await guardedPushGoogleDriveState(session.token, state, {
    preferences: session.preferences,
    allowRemoteOverwrite,
  });
  return buildDriveOperation({
    status: 'push-success',
    comparison: result.comparison,
    updatedAt: result.envelope?.updated_at || '',
    targetLabel: session.targetLabel,
    source,
    token: session.token,
    file: result.file,
    envelope: result.envelope,
  });
};

export const pullDriveStateToLocal = async ({ localState, forceConsent = false, preferences = getDriveSyncPreferences(), source = 'manual' } = {}) => {
  const remote = await readDriveRemoteState({
    forceConsent,
    preferences,
    localState,
    source,
  });
  if (!remote.envelope?.payload) {
    return remote;
  }
  const hydrated = hydrateStateFromSyncEnvelope(remote.envelope);
  if (!hydrated) {
    return buildDriveOperation({
      ...remote,
      status: 'invalid-payload',
    });
  }
  const mergedState = mergeIncomingStatePreservingLocalSession(localState, hydrated);
  return buildDriveOperation({
    ...remote,
    status: 'pull-success',
    mergedState,
  });
};
