import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const setStateMock = vi.fn();
const setPageUiMock = vi.fn();

vi.mock('../src/app/AppLayout.js', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../src/lib/dashboardStore', () => ({
  computeMacrosForAmount: (food, amount) => {
    const ratio = Number(amount || 0) / 100;
    return {
      kcal: Number(food?.kcal || 0) * ratio,
      protein: Number(food?.protein || 0) * ratio,
      carbs: Number(food?.carbs || 0) * ratio,
      fat: Number(food?.fat || 0) * ratio,
    };
  },
  formatMacrosLine: ({ kcal = 0, protein = 0, carbs = 0, fat = 0 } = {}) =>
    `${Math.round(kcal)} kcal | P ${protein} | G ${carbs} | L ${fat}`,
  toPositive: (value, fallback = 0) => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  },
  useDashboardState: () => ({
    state: {
      selectedDate: '2026-03-10',
      foods: [],
      entries: [],
      metrics: [
        { date: '2026-03-10', weight: 110.30000305175781, bodyFat: 37.5 },
      ],
      dailyLogs: [],
      neatLogs: [
        {
          id: 'neat-2026-03-10',
          date: '2026-03-10',
          steps: 6960,
          activeMinutes: 54,
          cardioMin: 54,
          caloriesActive: 1049.55029296875,
          healthSource: { provider: 'health-connect' },
        },
      ],
      sessions: [
        {
          id: 'session-1',
          date: '2026-03-10',
          exerciseName: 'Face Pull',
          durationMin: 34,
          setDetails: [{ setIndex: 1 }, { setIndex: 2 }, { setIndex: 3 }],
        },
      ],
      goals: { kcal: 2200, protein: 180, carbs: 180, fat: 70 },
      limits: {
        kcal: { min: 2000, max: 2400 },
        protein: { min: 160, max: 220 },
        carbs: { min: 120, max: 220 },
        fat: { min: 45, max: 90 },
      },
      layouts: {},
    },
    setState: setStateMock,
    entriesForSelectedDay: [],
    dailyLogForSelectedDay: null,
    uid: () => 'uid-1',
  }),
}));

vi.mock('../src/lib/localUiState.js', () => ({
  useLocalPageUiState: () => ([{
    libraryQuery: '',
    libraryMeal: 'dejeuner',
    strictMealTags: true,
    hideEmptyMeals: false,
    excludeIncompleteDay: true,
    trendDays: 14,
  }, setPageUiMock]),
}));

vi.mock('../src/components/LayoutBlocks', () => ({
  default: ({ blocks }) => React.createElement(
    React.Fragment,
    null,
    blocks.map((block) => React.createElement(React.Fragment, { key: block.id }, block.render())),
  ),
}));

vi.mock('../src/components/DateNav', () => ({
  default: ({ value }) => React.createElement('div', null, `DateNav ${value}`),
}));

vi.mock('../src/components/InteractiveLineChart', () => ({
  default: ({ ariaLabel }) => React.createElement('div', { 'aria-label': ariaLabel }, 'chart'),
}));

vi.mock('../src/components/CoreWorkflowNav', () => ({
  default: ({ active, supportMode }) => React.createElement('div', null, `nav ${active} ${supportMode}`),
}));

import NutritionPage from '../src/pages/nutrition.js';

describe('NutritionPage', () => {
  it('renders without crashing and keeps the meal journal visible', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(NutritionPage),
      ),
    );

    expect(screen.getByRole('heading', { name: /Journal nutrition/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Journal repas/i })).toBeInTheDocument();
    expect(screen.getByText(/Tendances nutrition/i)).toBeInTheDocument();
  });

  it('labels resting metabolism and training-day NEAT separately from sport auto', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(NutritionPage),
      ),
    );

    expect(screen.getAllByText(/Metabolisme de repos/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BMR \| poids \+ BF/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/NEAT hors seance \| 6960 pas/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/repos \+ activite \+ sport/i).length).toBeGreaterThan(0);
  });
});
