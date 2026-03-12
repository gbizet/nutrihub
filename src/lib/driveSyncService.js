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

const createDriveSyncError = (
  code,
  userMessage,
  cause = null,
  extras = {},
) => {
  const error = new Error(userMessage || 'Google Drive operation failed.');
  error.name = 'DriveSyncError';
  error.code = code || 'DRIVE_SYNC_ERROR';
  error.userMessage = userMessage || error.message;
  if (cause) error.cause = cause;
  return Object.assign(error, extras);
};

const wrapDriveSyncError = (error, fallbackCode, fallbackMessage, extras = {}) => {
  if (error?.name === 'DriveSyncError') return Object.assign(error, extras);
  return createDriveSyncError(
    error?.code || fallbackCode,
    error?.userMessage || error?.message || fallbackMessage,
    error,
    {
      remote: error?.remote,
      comparison: error?.comparison,
      ...extras,
    },
  );
};

const buildDriveOperation = ({
  status,
  comparison = 'missing',
  updatedAt = '',
  targetLabel = '',
  source = 'manual',
  file = null,
  envelope = null,
  mergedState = null,
}) => ({
  status,
  comparison,
  updatedAt,
  targetLabel,
  source,
  file,
  envelope,
  mergedState,
});

export const ensureDriveSyncToken = async ({
  forceConsent = false,
  preferences = getDriveSyncPreferences(),
} = {}) => {
  const normalized = normalizeDriveSyncPreferences(preferences);
  try {
    const accessToken = await requestGoogleDriveAccessToken({
      forceConsent,
      preferences: normalized,
    });
    return {
      accessToken,
      preferences: normalized,
      targetLabel: describeDriveSyncTarget(normalized.mode),
    };
  } catch (error) {
    throw wrapDriveSyncError(error, 'DRIVE_AUTH_FAILED', 'Connexion Google Drive impossible.');
  }
};

export const readDriveRemoteState = async ({
  forceConsent = false,
  preferences = getDriveSyncPreferences(),
  localState = null,
  source = 'manual',
} = {}) => {
  try {
    const session = await ensureDriveSyncToken({ forceConsent, preferences });
    const remote = await fetchGoogleDriveSyncEnvelope(session.accessToken, { preferences: session.preferences });
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
      file: remote.file,
      envelope: remote.envelope,
    });
  } catch (error) {
    throw wrapDriveSyncError(error, 'DRIVE_READ_FAILED', 'Lecture Google Drive impossible.');
  }
};

export const pushLocalStateToDrive = async ({
  state,
  forceConsent = false,
  preferences = getDriveSyncPreferences(),
  source = 'manual',
  allowRemoteOverwrite = false,
} = {}) => {
  try {
    const session = await ensureDriveSyncToken({ forceConsent, preferences });
    const result = await guardedPushGoogleDriveState(session.accessToken, state, {
      preferences: session.preferences,
      allowRemoteOverwrite,
    });
    return buildDriveOperation({
      status: 'push-success',
      comparison: result.comparison,
      updatedAt: result.envelope?.updated_at || '',
      targetLabel: session.targetLabel,
      source,
      file: result.file,
      envelope: result.envelope,
    });
  } catch (error) {
    throw wrapDriveSyncError(error, 'DRIVE_PUSH_FAILED', 'Push Google Drive impossible.');
  }
};

export const pullDriveStateToLocal = async ({
  localState,
  forceConsent = false,
  preferences = getDriveSyncPreferences(),
  source = 'manual',
} = {}) => {
  try {
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
  } catch (error) {
    throw wrapDriveSyncError(error, 'DRIVE_PULL_FAILED', 'Import Google Drive impossible.');
  }
};
