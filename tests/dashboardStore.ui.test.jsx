import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, useDashboardState } from '../src/lib/dashboardStore.js';

function DashboardStoreProbe() {
  const { state, setState } = useDashboardState();
  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: () => setState((prev) => ({ ...prev, selectedDate: '2026-03-11' })),
    },
    state.selectedDate,
  );
}

describe('dashboardStore selectedDate UI state', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('does not rewrite the full dashboard state when only selectedDate changes', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(React.createElement(DashboardStoreProbe));

    await waitFor(() => {
      expect(setItemSpy.mock.calls.some(([key]) => key === STORAGE_KEY)).toBe(true);
    });

    const fullStateWritesBefore = setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEY).length;

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('2026-03-11');
    });

    const fullStateWritesAfter = setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEY).length;
    expect(fullStateWritesAfter).toBe(fullStateWritesBefore);

    setItemSpy.mockRestore();
  });
});
