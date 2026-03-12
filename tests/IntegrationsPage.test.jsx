import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setState: vi.fn(),
  replaceState: vi.fn(),
  readPersistedDashboardState: vi.fn(),
  pullDriveStateToLocal: vi.fn(),
  pushLocalStateToDrive: vi.fn(),
  readDriveRemoteState: vi.fn(),
  getHealthIntegrationStatus: vi.fn(),
  importManualHealthWindow: vi.fn(),
  requestHealthIntegrationPermissions: vi.fn(),
  hasOngoingWorkoutDraft: vi.fn(),
  appendSyncDebugLog: vi.fn(),
  canUseStateServerSnapshots: vi.fn(),
  listStateServerSnapshots: vi.fn(),
  createStateServerSnapshot: vi.fn(),
  restoreStateServerSnapshot: vi.fn(),
}));

const baseState = {
  selectedDate: '2026-03-10',
  updatedAt: '2026-03-10T08:00:00.000Z',
  healthSync: {},
  stateSnapshots: [],
  entries: [],
  exercises: [],
  sessions: [],
  metrics: [],
  dailyLogs: [],
  neatLogs: [],
};

vi.mock('../src/app/AppLayout.js', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../src/components/CoreWorkflowNav', () => ({
  default: () => React.createElement('div', null, 'CoreWorkflowNav'),
}));

vi.mock('../src/lib/dashboardStore', () => ({
  DASHBOARD_STATE_EVENT: 'nutri-dashboard-state',
  mergeIncomingStatePreservingLocalSession: (prev, next) => ({ ...(prev || {}), ...(next || {}) }),
  persistDashboardState: vi.fn(),
  readPersistedDashboardState: mocks.readPersistedDashboardState,
  toPositive: (value, fallback = 0) => {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
  },
  useDashboardState: () => ({
    state: baseState,
    setState: mocks.setState,
    replaceState: mocks.replaceState,
    uid: () => 'uid-1',
  }),
}));

vi.mock('../src/lib/localUiState.js', () => ({
  useLocalPageUiState: () => ([{ debugOpen: false, advancedToolsOpen: false }, vi.fn()]),
}));

vi.mock('../src/lib/healthImport', () => ({
  mergeHealthImportIntoState: (state) => state,
}));

vi.mock('../src/lib/healthSchema.js', () => ({
  appendHealthDebugEntries: () => ({}),
  buildHealthDebugEntry: () => ({}),
  updateHealthSyncAfterDriveOperation: (healthSync = {}) => healthSync,
  updateHealthSyncError: (healthSync = {}) => healthSync,
}));

vi.mock('../src/lib/platformHealth', () => ({
  defaultHealthPlatformStatus: () => ({
    platform: 'web',
    healthConnectAvailable: false,
    samsungHealthAvailable: false,
    samsungDataSdkBundled: false,
    samsungDataSdkFallbackAvailable: false,
    reason: 'n/a',
    grantedPermissions: [],
    missingPermissions: [],
    samsungDataSdkGrantedPermissions: [],
    samsungDataSdkMissingPermissions: [],
    supportedStreams: [],
  }),
}));

vi.mock('../src/lib/googleDriveSync', () => ({
  DRIVE_SYNC_MODES: { visible: 'visible', appData: 'appData' },
  buildSyncEnvelope: (state) => ({ updated_at: state?.updatedAt || '', payload: state }),
  compareSyncEnvelopes: () => 'equal',
  describeDriveSyncTarget: () => 'Mon Drive/Nutri Sport Hub',
  ensureDeviceId: () => 'device-1',
  getDriveSyncPreferences: () => ({ mode: 'visible', mirrorAppData: false }),
  getGoogleDriveConfig: () => ({ clientId: 'client-id', fileName: 'sync.json', visibleFolderName: 'Nutri Sport Hub' }),
  getRequiredGoogleDriveScopes: () => ['scope-visible'],
  getStoredGoogleDriveToken: () => ({ accessToken: 'token', scope: 'scope-visible' }),
  ensureGoogleIdentityScript: vi.fn().mockResolvedValue(undefined),
  getCompanionDriveSession: vi.fn().mockResolvedValue(null),
  hasActiveCompanionDriveSession: () => false,
  isNativeMobileRuntime: () => false,
  markDriveSyncCheckpoint: vi.fn(),
  revokeGoogleDriveAccess: vi.fn(),
  saveDriveSyncPreferences: (prefs) => prefs,
  tokenHasScopes: () => true,
}));

vi.mock('../src/lib/driveSyncService.js', () => ({
  pushLocalStateToDrive: mocks.pushLocalStateToDrive,
  pullDriveStateToLocal: mocks.pullDriveStateToLocal,
  readDriveRemoteState: mocks.readDriveRemoteState,
}));

vi.mock('../src/lib/healthSyncService.js', () => ({
  classifyHealthImportFailure: () => ({ category: 'unknown', message: 'unknown' }),
  deriveHealthStreamDiagnostics: () => [],
  getHealthIntegrationStatus: mocks.getHealthIntegrationStatus,
  importManualHealthWindow: mocks.importManualHealthWindow,
  requestHealthIntegrationPermissions: mocks.requestHealthIntegrationPermissions,
}));

vi.mock('../src/lib/syncDebug', () => ({
  appendSyncDebugLog: mocks.appendSyncDebugLog,
  clearSyncDebugLog: vi.fn(),
  formatSyncDebugEntries: () => '',
}));

vi.mock('../src/lib/ongoingWorkout.js', () => ({
  hasOngoingWorkoutDraft: mocks.hasOngoingWorkoutDraft,
}));

vi.mock('../src/lib/stateRecovery.js', () => ({
  canUseStateServerSnapshots: mocks.canUseStateServerSnapshots,
  listStateServerSnapshots: mocks.listStateServerSnapshots,
  createStateServerSnapshot: mocks.createStateServerSnapshot,
  restoreStateServerSnapshot: mocks.restoreStateServerSnapshot,
}));

import IntegrationsPage from '../src/pages/integrations.js';

describe('IntegrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readPersistedDashboardState.mockReturnValue(baseState);
    mocks.getHealthIntegrationStatus.mockResolvedValue({
      platform: 'web',
      healthConnectAvailable: false,
      samsungHealthAvailable: false,
      samsungDataSdkBundled: false,
      samsungDataSdkFallbackAvailable: false,
      reason: 'n/a',
      grantedPermissions: [],
      missingPermissions: [],
      samsungDataSdkGrantedPermissions: [],
      samsungDataSdkMissingPermissions: [],
      supportedStreams: [],
    });
    mocks.hasOngoingWorkoutDraft.mockReturnValue(true);
    mocks.canUseStateServerSnapshots.mockReturnValue(false);
    mocks.listStateServerSnapshots.mockResolvedValue([]);
    mocks.createStateServerSnapshot.mockResolvedValue(null);
    mocks.restoreStateServerSnapshot.mockResolvedValue(null);
  });

  it('blocks manual pull while an ongoing workout draft exists', () => {
    render(React.createElement(IntegrationsPage));

    const pullButtons = screen.getAllByRole('button', { name: /Pull Drive vers local/i });
    pullButtons.forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByText(/Seance en cours detectee/i)).toBeInTheDocument();

    fireEvent.click(pullButtons[0]);
    expect(mocks.pullDriveStateToLocal).not.toHaveBeenCalled();
  });
});
