import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  globalSyncBar: vi.fn(({ mobileChromeMode, mobileTitleShort, routeKey, syncCompact }) => React.createElement(
    'div',
    {
      'data-mobile-chrome-mode': mobileChromeMode,
      'data-mobile-title-short': mobileTitleShort,
      'data-route-key': routeKey,
      'data-sync-compact': syncCompact ? '1' : '0',
    },
    'GlobalSyncBar',
  )),
}));

vi.mock('../src/app/GlobalSyncBar.js', () => ({
  default: mocks.globalSyncBar,
}));

import AppLayout from '../src/app/AppLayout.js';

describe('AppLayout', () => {
  afterEach(() => {
    delete document.body.dataset.mobileChrome;
    delete document.body.dataset.mobileRoute;
    delete document.body.dataset.syncCompact;
  });

  it('applies body chrome datasets and forwards compact chrome props', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/training'] },
        React.createElement(
          AppLayout,
          {
            title: 'Entrainement',
            description: 'Suivi home gym',
            mobileChromeMode: 'capture',
            mobileTitleShort: 'Workout',
          },
          React.createElement('main', null, 'Page'),
        ),
      ),
    );

    expect(document.title).toBe('Entrainement | Nutri Sport Hub');
    expect(document.body.dataset.mobileChrome).toBe('capture');
    expect(document.body.dataset.mobileRoute).toBe('training');
    expect(document.body.dataset.syncCompact).toBe('1');
    const syncBar = screen.getAllByText('GlobalSyncBar').at(-1);
    expect(syncBar).toHaveAttribute('data-mobile-title-short', 'Workout');
    expect(syncBar).toHaveAttribute('data-route-key', 'training');
    expect(syncBar).toHaveAttribute('data-sync-compact', '1');
  });

  it('keeps the sync chrome detailed on integrations', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/integrations'] },
        React.createElement(
          AppLayout,
          {
            title: 'Integrations',
            description: 'Sync Drive',
            mobileChromeMode: 'default',
          },
          React.createElement('main', null, 'Page'),
        ),
      ),
    );

    expect(document.body.dataset.mobileChrome).toBe('default');
    expect(document.body.dataset.mobileRoute).toBe('integrations');
    expect(document.body.dataset.syncCompact).toBe('0');
    const syncBar = screen.getAllByText('GlobalSyncBar').at(-1);
    expect(syncBar).toHaveAttribute('data-mobile-title-short', 'Sync');
    expect(syncBar).toHaveAttribute('data-sync-compact', '0');
  });
});
