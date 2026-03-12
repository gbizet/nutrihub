import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/app/AppLayout.js', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../src/lib/dashboardStore', () => ({
  useDashboardState: () => ({
    state: {
      selectedDate: '2026-03-10',
      foods: [{ id: 'food-1', name: 'Poulet' }],
      neatLogs: [{ id: 'neat-1', date: '2026-03-09', steps: 8000 }],
      stateSnapshots: [{ id: 'snap-1' }],
      healthSync: {
        lastImportAt: '2026-03-10T08:00:00.000Z',
        lastPushAt: '2026-03-10T08:10:00.000Z',
      },
      promptTemplates: {
        daily: 'daily template',
      },
    },
  }),
}));

import SupportPage from '../src/pages/support.js';

describe('SupportPage', () => {
  it('renders the six support surfaces', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SupportPage),
      ),
    );

    expect(screen.getByRole('heading', { name: /^Support$/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Export AI/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Sync/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Foods/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /NEAT/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Audit/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Admin/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Templates perso actifs/i)).toBeInTheDocument();
    expect(screen.getByText(/Dernier log 2026-03-09/i)).toBeInTheDocument();
  });
});
