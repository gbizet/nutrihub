import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CoreWorkflowNav from '../src/components/CoreWorkflowNav.js';

const mockMatchMedia = (matches) => {
  const listeners = new Set();
  const mediaQuery = {
    matches,
    media: '(max-width: 700px)',
    addEventListener: (_event, listener) => listeners.add(listener),
    removeEventListener: (_event, listener) => listeners.delete(listener),
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    dispatch(nextValue) {
      this.matches = nextValue;
      listeners.forEach((listener) => listener({ matches: nextValue, media: this.media }));
    },
  };

  vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
  return mediaQuery;
};

describe('CoreWorkflowNav', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders only the four core workflows plus the support hub in hub mode', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(CoreWorkflowNav, { active: 'home', supportMode: 'hub' }),
      ),
    );

    expect(screen.getByRole('link', { name: /Accueil/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Poids/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nutrition/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Training/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Export AI/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Plus/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sync/i })).not.toBeInTheDocument();
  });

  it('renders the full support navigation in full mode', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(CoreWorkflowNav, { active: 'summary', supportMode: 'full' }),
      ),
    );

    expect(screen.getByRole('link', { name: /Sync/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Foods/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /NEAT/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Audit/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Admin/i })).toBeInTheDocument();
  });

  it('renders compact mobile chips without Export AI in the primary row', () => {
    mockMatchMedia(true);

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(CoreWorkflowNav, { active: 'training', supportMode: 'hub' }),
      ),
    );

    expect(screen.getByRole('link', { name: /^Accueil$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Poids$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Nutrition$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Training$/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Export AI$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Plus$/i })).toBeInTheDocument();
  });

  it('keeps the active secondary destination visible on mobile hub pages', () => {
    mockMatchMedia(true);

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(CoreWorkflowNav, { active: 'prompt-builder', supportMode: 'hub' }),
      ),
    );

    expect(screen.getByRole('link', { name: /^Export AI$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Plus$/i })).toBeInTheDocument();
  });
});
