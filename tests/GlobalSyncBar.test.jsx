import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pushLocalStateToDrive: vi.fn(),
  pullDriveStateToLocal: vi.fn(),
  getHealthIntegrationStatus: vi.fn(),
  importAutoHealthWindow: vi.fn(),
  readPersistedDashboardState: vi.fn(),
  persistDashboardState: vi.fn(),
  emitDashboardStateEvent: vi.fn(),
  markDriveSyncCheckpoint: vi.fn(),
  appendSyncDebugLog: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children),
}));

vi.mock('../src/lib/dashboardStore', () => ({
  DASHBOARD_STATE_EVENT: 'nutri-dashboard-state',
  emitDashboardStateEvent: mocks.emitDashboardStateEvent,
  persistDashboardState: mocks.persistDashboardState,
  readPersistedDashboardState: mocks.readPersistedDashboardState,
  todayIso: () => '2026-03-10',
}));

vi.mock('../src/lib/googleDriveSync', () => ({
  DRIVE_SYNC_EVENT: 'nutri-drive-sync',
  describeDriveSyncTarget: () => 'Mon Drive/Nutri Sport Hub',
  getDriveSyncPreferences: () => ({ mode: 'visible', mirrorAppData: false }),
  getGoogleDriveConfig: () => ({ clientId: 'client-id', visibleFolderName: 'Nutri Sport Hub' }),
  getRequiredGoogleDriveScopes: () => ['scope-visible'],
  getStoredGoogleDriveToken: () => ({ accessToken: 'token', scope: 'scope-visible' }),
  isNativeMobileRuntime: () => false,
  markDriveSyncCheckpoint: mocks.markDriveSyncCheckpoint,
  tokenHasScopes: () => true,
}));

vi.mock('../src/lib/driveSyncService.js', () => ({
  pullDriveStateToLocal: mocks.pullDriveStateToLocal,
  pushLocalStateToDrive: mocks.pushLocalStateToDrive,
}));

vi.mock('../src/lib/healthSyncService.js', () => ({
  getHealthIntegrationStatus: mocks.getHealthIntegrationStatus,
  importAutoHealthWindow: mocks.importAutoHealthWindow,
}));

vi.mock('../src/lib/syncDebug', () => ({
  appendSyncDebugLog: mocks.appendSyncDebugLog,
}));

import GlobalSyncBar from '../src/app/GlobalSyncBar.js';

describe('GlobalSyncBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readPersistedDashboardState.mockReturnValue({
      updatedAt: '2026-03-10T08:00:00.000Z',
      selectedDate: '2026-03-10',
      healthSync: {},
    });
    mocks.pushLocalStateToDrive.mockResolvedValue({
      updatedAt: '2026-03-10T08:00:00.000Z',
      targetLabel: 'Mon Drive/Nutri Sport Hub',
    });
    mocks.pullDriveStateToLocal.mockResolvedValue({
      envelope: null,
      comparison: 'missing',
      mergedState: null,
    });
    mocks.getHealthIntegrationStatus.mockResolvedValue({
      healthConnectAvailable: false,
      missingPermissions: [],
      samsungHealthAvailable: false,
    });
    mocks.importAutoHealthWindow.mockResolvedValue({
      records: {},
      startDate: '2026-02-10',
      endDate: '2026-03-10',
    });
  });

  it('uses the shared drive push service on manual sync', async () => {
    render(React.createElement(GlobalSyncBar));

    fireEvent.click(screen.getByRole('button', { name: /sync maintenant/i }));

    await waitFor(() => {
      expect(mocks.pushLocalStateToDrive).toHaveBeenCalledTimes(1);
    });
    expect(mocks.pushLocalStateToDrive).toHaveBeenCalledWith(expect.objectContaining({
      source: 'manual',
      state: expect.objectContaining({
        updatedAt: '2026-03-10T08:00:00.000Z',
      }),
    }));
    await waitFor(() => {
      expect(screen.getByText(/Sync OK vers Mon Drive\/Nutri Sport Hub\./i)).toBeInTheDocument();
    });
  });
});
