import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pushLocalStateToDrive: vi.fn(),
  pullDriveStateToLocal: vi.fn(),
  getHealthIntegrationStatus: vi.fn(),
  importAutoHealthWindow: vi.fn(),
  hasOngoingWorkoutDraft: vi.fn(),
  readPersistedDashboardState: vi.fn(),
  persistDashboardState: vi.fn(),
  emitDashboardStateEvent: vi.fn(),
  markDriveSyncCheckpoint: vi.fn(),
  appendSyncDebugLog: vi.fn(),
  createStateServerSnapshot: vi.fn(),
  isNativeMobileRuntime: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children),
}));

vi.mock('../src/lib/dashboardStore', () => ({
  DASHBOARD_STORAGE_WARNING_EVENT: 'nutri-dashboard-storage-warning',
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
  getLastSuccessfulDrivePushUpdatedAt: () => '',
  getRequiredGoogleDriveScopes: () => ['scope-visible'],
  getStoredGoogleDriveToken: () => ({ accessToken: 'token', scope: 'scope-visible' }),
  isNativeMobileRuntime: mocks.isNativeMobileRuntime,
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

vi.mock('../src/lib/ongoingWorkout.js', () => ({
  hasOngoingWorkoutDraft: mocks.hasOngoingWorkoutDraft,
}));

vi.mock('../src/lib/syncDebug', () => ({
  appendSyncDebugLog: mocks.appendSyncDebugLog,
}));

vi.mock('../src/lib/stateRecovery.js', () => ({
  createStateServerSnapshot: mocks.createStateServerSnapshot,
}));

import GlobalSyncBar, { __resetGlobalSyncBarBootStateForTests } from '../src/app/GlobalSyncBar.js';

describe('GlobalSyncBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    __resetGlobalSyncBarBootStateForTests();
    let currentState = {
      updatedAt: '2026-03-10T08:00:00.000Z',
      selectedDate: '2026-03-10',
      healthSync: {},
      entries: [],
    };
    mocks.readPersistedDashboardState.mockImplementation(() => currentState);
    mocks.persistDashboardState.mockImplementation((nextState) => {
      currentState = nextState;
    });
    mocks.isNativeMobileRuntime.mockReturnValue(false);
    mocks.hasOngoingWorkoutDraft.mockReturnValue(false);
    mocks.pushLocalStateToDrive.mockResolvedValue({
      updatedAt: '2026-03-10T08:00:00.000Z',
      targetLabel: 'Mon Drive/Nutri Sport Hub',
    });
    mocks.pullDriveStateToLocal.mockResolvedValue({
      envelope: null,
      comparison: 'missing',
      mergedState: null,
    });
    mocks.createStateServerSnapshot.mockResolvedValue(null);
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

  it('skips auto pull when an ongoing workout draft is active locally', async () => {
    mocks.hasOngoingWorkoutDraft.mockReturnValue(true);

    render(React.createElement(GlobalSyncBar));

    await waitFor(() => {
      expect(mocks.appendSyncDebugLog).toHaveBeenCalledWith('GlobalSyncBar', 'auto pull skipped', expect.objectContaining({
        cause: 'ongoing-workout-active',
      }));
    });
    expect(mocks.pullDriveStateToLocal).not.toHaveBeenCalled();
  });

  it('forces one health auto-import on launch even when the last auto-import is recent', async () => {
    const recentAutoImportAt = new Date(Date.now() - (5 * 60 * 1000)).toISOString();
    mocks.isNativeMobileRuntime.mockReturnValue(true);
    mocks.getHealthIntegrationStatus.mockResolvedValue({
      healthConnectAvailable: true,
      missingPermissions: [],
      samsungDataSdkFallbackAvailable: false,
    });
    mocks.importAutoHealthWindow.mockResolvedValue({
      importMode: 'auto',
      importedAt: new Date().toISOString(),
      records: {},
      startDate: '2026-02-10',
      endDate: '2026-03-10',
    });
    mocks.readPersistedDashboardState.mockReturnValue({
      updatedAt: '2026-03-10T08:05:00.000Z',
      selectedDate: '2026-03-10',
      healthSync: {
        lastAutoImportAt: recentAutoImportAt,
      },
    });

    render(React.createElement(GlobalSyncBar));

    await waitFor(() => {
      expect(mocks.importAutoHealthWindow).toHaveBeenCalledTimes(1);
    });
  });

  it('applies the 15 minute cooldown on resume after the launch import ran', async () => {
    mocks.isNativeMobileRuntime.mockReturnValue(true);
    mocks.getHealthIntegrationStatus.mockResolvedValue({
      healthConnectAvailable: true,
      missingPermissions: [],
      samsungDataSdkFallbackAvailable: false,
    });
    mocks.importAutoHealthWindow.mockResolvedValue({
      importMode: 'auto',
      importedAt: new Date().toISOString(),
      records: {},
      startDate: '2026-02-10',
      endDate: '2026-03-10',
    });

    render(React.createElement(GlobalSyncBar));

    await waitFor(() => {
      expect(mocks.importAutoHealthWindow).toHaveBeenCalledTimes(1);
    });

    fireEvent.focus(window);

    await waitFor(() => {
      expect(mocks.appendSyncDebugLog).toHaveBeenCalledWith(
        'GlobalSyncBar',
        'auto health import skipped',
        expect.objectContaining({ reason: 'resume', cause: 'cooldown-active' }),
      );
    });
    expect(mocks.importAutoHealthWindow).toHaveBeenCalledTimes(1);
  });

  it('pulls Drive before mobile health import so newer PC data is preserved on launch', async () => {
    const remoteState = {
      updatedAt: '2026-03-10T09:00:00.000Z',
      selectedDate: '2026-03-10',
      healthSync: {
        lastImportAt: '2026-03-09T23:00:00.000Z',
      },
      entries: [
        {
          id: 'entry-pc',
          date: '2026-03-10',
          meal: 'dejeuner',
          foodName: 'Steak hache 5% (Charal) (Charal)',
          macros: { kcal: 500, protein: 80, carbs: 0, fat: 20 },
        },
      ],
    };

    mocks.isNativeMobileRuntime.mockReturnValue(true);
    mocks.getHealthIntegrationStatus.mockResolvedValue({
      healthConnectAvailable: true,
      missingPermissions: [],
      samsungDataSdkFallbackAvailable: false,
    });
    mocks.pullDriveStateToLocal.mockResolvedValue({
      envelope: { payload: remoteState, updated_at: remoteState.updatedAt },
      comparison: 'remote-newer',
      mergedState: remoteState,
      updatedAt: remoteState.updatedAt,
    });
    mocks.importAutoHealthWindow.mockResolvedValue({
      importMode: 'auto',
      importedAt: new Date().toISOString(),
      records: {
        activity: [
          { date: '2026-03-10', steps: 7017, activeMinutes: 54, provider: 'health-connect' },
        ],
      },
      startDate: '2026-03-09',
      endDate: '2026-03-10',
    });

    render(React.createElement(GlobalSyncBar));

    await waitFor(() => {
      expect(mocks.pullDriveStateToLocal).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mocks.importAutoHealthWindow).toHaveBeenCalledTimes(1);
    });

    expect(mocks.pullDriveStateToLocal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.importAutoHealthWindow.mock.invocationCallOrder[0],
    );
    expect(mocks.importAutoHealthWindow).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        endDate: '2026-03-10',
      }),
    );
    expect(mocks.persistDashboardState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({ id: 'entry-pc' }),
        ]),
      }),
    );
  });

  it('forces pull even when phone has unpushed edits so PC nutrition is not lost', async () => {
    // Scenario: phone has local state newer than last push checkpoint,
    // but PC pushed newer nutrition to Drive. Without force, the guard
    // would skip the pull and the health import would overwrite Drive.
    const remoteState = {
      updatedAt: '2026-03-10T12:00:00.000Z',
      selectedDate: '2026-03-10',
      healthSync: {},
      entries: [
        {
          id: 'entry-pc-lunch',
          date: '2026-03-10',
          meal: 'dejeuner',
          foodName: 'Poulet grille',
          macros: { kcal: 300, protein: 50, carbs: 0, fat: 10 },
        },
      ],
    };

    mocks.isNativeMobileRuntime.mockReturnValue(true);
    let currentState = {
      updatedAt: '2026-03-10T10:00:00.000Z',
      selectedDate: '2026-03-10',
      healthSync: {},
      entries: [],
    };
    mocks.readPersistedDashboardState.mockImplementation(() => currentState);
    mocks.persistDashboardState.mockImplementation((nextState) => {
      currentState = nextState;
    });
    mocks.getHealthIntegrationStatus.mockResolvedValue({
      healthConnectAvailable: true,
      missingPermissions: [],
      samsungDataSdkFallbackAvailable: false,
    });
    mocks.pullDriveStateToLocal.mockResolvedValue({
      envelope: { payload: remoteState, updated_at: remoteState.updatedAt },
      comparison: 'remote-newer',
      mergedState: remoteState,
      updatedAt: remoteState.updatedAt,
    });
    mocks.importAutoHealthWindow.mockResolvedValue({
      importMode: 'auto',
      importedAt: new Date().toISOString(),
      records: {
        bodyMetrics: [
          { date: '2026-03-10', weight: 75.2, provider: 'health-connect' },
        ],
      },
      startDate: '2026-03-09',
      endDate: '2026-03-10',
    });

    render(React.createElement(GlobalSyncBar));

    await waitFor(() => {
      expect(mocks.importAutoHealthWindow).toHaveBeenCalledTimes(1);
    });

    // Pull must have succeeded and run before health import
    expect(mocks.pullDriveStateToLocal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.importAutoHealthWindow.mock.invocationCallOrder[0],
    );

    // Final persisted state must contain the PC entry
    expect(mocks.persistDashboardState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({ id: 'entry-pc-lunch' }),
        ]),
      }),
    );
  });

  it('renders the compact mobile chrome outside integrations', () => {
    render(React.createElement(GlobalSyncBar, {
      mobileChromeMode: 'capture',
      mobileTitleShort: 'Workout',
      routeKey: 'training',
      syncCompact: true,
    }));

    expect(screen.getByText('Workout')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sync$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Regler/i })).toHaveAttribute('href', '/integrations');
  });
});
