import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/pages/index', () => ({
  default: () => React.createElement('div', null, 'HomePage'),
}));
vi.mock('../src/pages/metrics', () => ({
  default: () => React.createElement('div', null, 'MetricsPage'),
}));
vi.mock('../src/pages/nutrition', () => ({
  default: () => React.createElement('div', null, 'NutritionPage'),
}));
vi.mock('../src/pages/training', () => ({
  default: () => React.createElement('div', null, 'TrainingPage'),
}));
vi.mock('../src/pages/prompt-builder', () => ({
  default: () => React.createElement('div', null, 'PromptBuilderPage'),
}));
vi.mock('../src/pages/support', () => ({
  default: () => React.createElement('div', null, 'SupportPage'),
}));
vi.mock('../src/pages/foods', () => ({
  default: () => React.createElement('div', null, 'FoodsPage'),
}));
vi.mock('../src/pages/neat', () => ({
  default: () => React.createElement('div', null, 'NeatPage'),
}));
vi.mock('../src/pages/data-admin', () => ({
  default: () => React.createElement('div', null, 'DataAdminPage'),
}));
vi.mock('../src/pages/summary', () => ({
  default: () => React.createElement('div', null, 'SummaryPage'),
}));
vi.mock('../src/pages/integrations', () => ({
  default: () => React.createElement('div', null, 'IntegrationsPage'),
}));
vi.mock('../src/pages/fitness-coach', () => ({
  default: () => React.createElement('div', null, 'FitnessCoachPage'),
}));

import App from '../src/app/App.js';

describe('App routing', () => {
  it('redirects dashboards to support', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/dashboards'] },
        React.createElement(App),
      ),
    );

    expect(screen.getByText('SupportPage')).toBeInTheDocument();
  });
});
