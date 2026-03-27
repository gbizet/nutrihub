export const DRIVE_SCOPES = {
  appData: 'https://www.googleapis.com/auth/drive.appdata',
  visible: 'https://www.googleapis.com/auth/drive.file',
};

export const DRIVE_FILE_NAME = 'nutri-sport-hub-sync.json';
export const DRIVE_VISIBLE_FOLDER_NAME = 'Nutri Sport Hub';
export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export const DRIVE_SYNC_MODES = {
  appData: 'appData',
  visible: 'visible',
};

export const normalizeDriveSyncPreferences = (input = {}) => {
  const mode = input?.mode === DRIVE_SYNC_MODES.visible ? DRIVE_SYNC_MODES.visible : DRIVE_SYNC_MODES.appData;
  return {
    mode,
    mirrorAppData: mode === DRIVE_SYNC_MODES.visible ? Boolean(input?.mirrorAppData) : false,
  };
};

export const describeDriveSyncTarget = (
  mode,
  config = {
    visibleFolderName: DRIVE_VISIBLE_FOLDER_NAME,
  },
) => (
  mode === DRIVE_SYNC_MODES.visible ? `Mon Drive/${config.visibleFolderName}` : 'appDataFolder'
);

export const buildSyncEnvelope = (state, options = {}) => {
  const sanitizedState = !state || typeof state !== 'object'
    ? state
    : (() => {
      const next = { ...state };
      delete next.selectedDate;
      delete next.stateSnapshots;
      delete next.layouts;
      delete next.dashboards;
      return next;
    })();
  const updatedAt = options.updatedAt || sanitizedState?.updatedAt || new Date().toISOString();
  const deviceId = options.deviceId || 'server-device';
  return {
    schema_version: 1,
    app: 'nutri-sport-hub',
    updated_at: updatedAt,
    device_id: deviceId,
    selected_date: null,
    payload: sanitizedState,
  };
};

export const compareSyncEnvelopes = (localEnvelope, remoteEnvelope) => {
  const localAt = Date.parse(localEnvelope?.updated_at || 0);
  const remoteAt = Date.parse(remoteEnvelope?.updated_at || 0);
  let comparison = 'equal';
  if (!Number.isFinite(localAt) && !Number.isFinite(remoteAt)) comparison = 'equal';
  else if (localAt > remoteAt) comparison = 'local-newer';
  else if (remoteAt > localAt) comparison = 'remote-newer';
  return comparison;
};

export const escapeDriveQueryValue = (value = '') => `${value}`.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const buildMultipartRequest = (metadata, payload, boundaryFactory) => {
  const boundary = boundaryFactory();
  const body =
    `--${boundary}\r\n`
    + 'Content-Type: application/json; charset=UTF-8\r\n\r\n'
    + `${JSON.stringify(metadata)}\r\n`
    + `--${boundary}\r\n`
    + 'Content-Type: application/json; charset=UTF-8\r\n\r\n'
    + `${JSON.stringify(payload)}\r\n`
    + `--${boundary}--`;

  return {
    boundary,
    body,
  };
};
