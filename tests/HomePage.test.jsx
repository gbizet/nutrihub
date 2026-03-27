import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setStateMock = vi.fn();

const homeState = {
  selectedDate: '2026-03-10',
  entries: [
    { id: 'entry-1', date: '2026-03-01', meal: 'dejeuner', macros: { kcal: 650, protein: 45, carbs: 55, fat: 24 } },
    { id: 'entry-2', date: '2026-03-05', meal: 'diner', macros: { kcal: 720, protein: 52, carbs: 68, fat: 18 } },
    { id: 'entry-3', date: '2026-03-10', meal: 'dejeuner', macros: { kcal: 810, protein: 60, carbs: 70, fat: 22 } },
  ],
  metrics: [
    { date: '2026-03-01', weight: 109.8, healthSource: { provider: 'health-connect' } },
    { date: '2026-03-05', weight: 109.1, healthSource: { provider: 'health-connect' } },
    { date: '2026-03-10', weight: 108.6, healthSource: { provider: 'health-connect' } },
  ],
  dailyLogs: [
    {
      date: '2026-03-01',
      caloriesEstimated: 2200,
      proteinG: 180,
      training: true,
      sleepHours: 7.2,
      avgHeartRate: 68,
      bloodPressureSystolic: 129,
      bloodPressureDiastolic: 82,
      healthSources: {
        sleep: { provider: 'health-connect' },
        vitals: { provider: 'health-connect' },
      },
    },
    {
      date: '2026-03-05',
      caloriesEstimated: 2100,
      proteinG: 172,
      training: false,
      sleepHours: 7.8,
      avgHeartRate: 65,
      bloodPressureSystolic: 126,
      bloodPressureDiastolic: 80,
      healthSources: {
        sleep: { provider: 'health-connect' },
        vitals: { provider: 'health-connect' },
      },
    },
    {
      date: '2026-03-10',
      caloriesEstimated: 2050,
      proteinG: 188,
      training: true,
      sleepHours: 8.1,
      avgHeartRate: 63,
      bloodPressureSystolic: 124,
      bloodPressureDiastolic: 79,
      healthSources: {
        sleep: { provider: 'health-connect' },
        vitals: { provider: 'health-connect' },
      },
    },
  ],
  neatLogs: [
    { id: 'neat-1', date: '2026-03-01', steps: 8100, activeMinutes: 42, caloriesActive: 480, healthSource: { provider: 'health-connect' } },
    { id: 'neat-2', date: '2026-03-05', steps: 9200, activeMinutes: 55, caloriesActive: 520, healthSource: { provider: 'health-connect' } },
    { id: 'neat-3', date: '2026-03-10', steps: 10450, activeMinutes: 64, caloriesActive: 610, healthSource: { provider: 'health-connect' } },
  ],
  sessions: [
    {
      id: 'session-1',
      date: '2026-03-10',
      workoutId: 'workout-1',
      sessionGroupId: 'workout-1',
      workoutLabel: 'Push',
      sessionGroupLabel: 'Push',
      exerciseOrder: 1,
      exerciseId: 'exercise-1',
      exerciseName: 'Bench Press',
      equipment: 'Rack',
      category: 'Chest',
      setDetails: [
        { setIndex: 1, reps: 8, loadDisplayed: 80, loadEstimated: null, timeLabel: '10:00' },
        { setIndex: 2, reps: 8, loadDisplayed: 82.5, loadEstimated: null, timeLabel: '10:03' },
      ],
    },
  ],
  cycleLogs: [],
  exerciseMuscleOverrides: {},
  goals: { kcal: 2200, protein: 180, carbs: 180, fat: 70 },
  limits: {
    kcal: { min: 2000, max: 2400 },
    protein: { min: 160, max: 220 },
    carbs: { min: 120, max: 220 },
    fat: { min: 45, max: 90 },
  },
};

vi.mock('../src/app/AppLayout.js', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../src/lib/dashboardStore', () => ({
  formatMacrosLine: ({ kcal = 0, protein = 0, carbs = 0, fat = 0 } = {}) =>
    `${Math.round(kcal)} kcal | P ${protein} | G ${carbs} | L ${fat}`,
  useDashboardState: () => ({
    state: homeState,
    setState: setStateMock,
    entriesForSelectedDay: homeState.entries.filter((entry) => entry.date === homeState.selectedDate),
    metricsForSelectedDay: homeState.metrics.find((row) => row.date === homeState.selectedDate) || null,
    dayMacros: { kcal: 2050, protein: 188, carbs: 165, fat: 58 },
  }),
}));

vi.mock('../src/lib/localUiState.js', () => ({
  useLocalPageUiState: (_pageId, initialState = {}) => React.useState(initialState),
}));

vi.mock('../src/components/DateNav', () => ({
  default: ({ value }) => React.createElement('div', null, `DateNav ${value}`),
}));

vi.mock('../src/components/CoreWorkflowNav', () => ({
  default: ({ active, supportMode }) => React.createElement('div', null, `nav ${active} ${supportMode}`),
}));

vi.mock('../src/components/InteractiveLineChart', () => ({
  default: ({ ariaLabel, onDateClick }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: () => onDateClick?.('2026-03-05'),
    },
    ariaLabel,
  ),
}));

import HomePage from '../src/pages/index.js';

describe('HomePage', () => {
  beforeEach(() => {
    cleanup();
    setStateMock.mockReset();
  });

  it('defaults to a shared 14-day window across the home charts', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(HomePage),
      ),
    );

    expect(screen.getByRole('heading', { name: /Poids 14j/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Kcal 14j/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Training 14j/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tension 14j/i })).toBeInTheDocument();
  });

  it('updates every home chart title when switching the shared range', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(HomePage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /^Tout$/i }));
    expect(screen.getByRole('heading', { name: /Poids Tout/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tension Tout/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^28j$/i }));
    expect(screen.getByRole('heading', { name: /Kcal 28j/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Training 28j/i })).toBeInTheDocument();
  });

  it('does not move the selected day when clicking a home chart', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(HomePage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Poids 14j interactif/i }));

    expect(setStateMock).not.toHaveBeenCalled();
  });
});
