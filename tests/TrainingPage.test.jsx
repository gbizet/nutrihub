import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOngoingWorkoutDraft,
  persistOngoingWorkoutDraft,
  readOngoingWorkoutDraft,
} from '../src/lib/ongoingWorkout.js';

const setStateMock = vi.fn();
const setPageUiMock = vi.fn();
let uidCounter = 0;
const DEFAULT_INNER_HEIGHT = window.innerHeight;

const baseState = {
  selectedDate: '2026-03-10',
  entries: [],
  metrics: [],
  dailyLogs: [],
  neatLogs: [],
  exercises: [],
  sessions: [],
  cycleLogs: [],
  exerciseMuscleOverrides: {},
  layouts: {},
  healthSync: {},
  stateSnapshots: [],
};

const buildManualSession = (overrides = {}) => ({
  id: overrides.id || 'session-1',
  date: '2026-03-10',
  workoutId: 'workout-1',
  workoutLabel: 'Pull',
  sessionGroupId: 'workout-1',
  sessionGroupLabel: 'Pull',
  exerciseOrder: 1,
  exerciseId: 'exercise-1',
  exerciseName: 'Face Pull',
  equipment: 'Poulies vis-a-vis',
  category: 'Shoulders',
  durationMin: 55,
  sets: 2,
  reps: 25,
  load: 30,
  notes: '',
  workoutNotes: 'Dos + epaules',
  source: 'manual',
  setDetails: [
    { setIndex: 1, reps: 15, loadDisplayed: 30, loadEstimated: null, timeLabel: '' },
    { setIndex: 2, reps: 10, loadDisplayed: 25, loadEstimated: null, timeLabel: '' },
  ],
  ...overrides,
});

const stubMobileViewport = ({ width = 390, innerHeight = 780, visualHeight = 438 } = {}) => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: innerHeight,
  });
  vi.stubGlobal('matchMedia', vi.fn((query) => ({
      matches: query === '(max-width: 700px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })));
  vi.stubGlobal('visualViewport', {
    width,
    height: visualHeight,
    offsetTop: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
};

vi.mock('../src/app/AppLayout.js', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../src/lib/dashboardStore', () => ({
  toPositive: (value, fallback = 0) => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  },
  useDashboardState: () => ({
    state: baseState,
    setState: setStateMock,
    uid: () => {
      uidCounter += 1;
      return `uid-${uidCounter}`;
    },
  }),
}));

vi.mock('../src/lib/localUiState.js', () => ({
  useLocalPageUiState: () => ([{
    workflow: 'capture',
    muscleGroup: 'chest',
    focusExercise: 'all',
    progressView: 'session',
    windowDays: 30,
    progressRowsLimit: 25,
    heatmapWeeks: 8,
    heatmapMetric: 'sets',
    mappingExercise: '',
  }, setPageUiMock]),
}));

vi.mock('../src/components/LayoutBlocks', () => ({
  default: () => React.createElement('div', null, 'LayoutBlocks'),
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

import TrainingPage from '../src/pages/training.js';

describe('TrainingPage', () => {
  beforeEach(() => {
    cleanup();
    setStateMock.mockReset();
    setPageUiMock.mockReset();
    uidCounter = 0;
    baseState.exercises = [];
    baseState.sessions = [];
    clearOngoingWorkoutDraft();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: DEFAULT_INNER_HEIGHT,
    });
  });

  it('restores an ongoing workout draft including the current set draft after refresh', () => {
    persistOngoingWorkoutDraft({
      draftId: 'ongoing-1',
      date: '2026-03-10',
      workoutLabel: 'Dos / Epaules',
      durationMin: '42',
      notes: '',
      startedAt: '2026-03-10T10:00:00.000Z',
      updatedAt: '2026-03-10T10:10:00.000Z',
      activeExerciseId: 'exercise-1',
      currentExerciseDraft: {
        exerciseId: '',
        exerciseName: '',
        equipment: '',
        notes: '',
      },
      exercises: [
        {
          tempId: 'exercise-1',
          exerciseId: '',
          exerciseName: 'Face Pull',
          equipment: 'Poulie double',
          category: 'Shoulders',
          order: 1,
          notes: '',
          status: 'active',
          setDetails: [
            { setIndex: 1, reps: 15, loadDisplayed: 30, loadEstimated: null, timeLabel: '17:50' },
          ],
        },
      ],
      currentSetDraft: {
        reps: '12',
        load: '32',
        timeLabel: '19:10',
        editingSetIndex: null,
      },
    });

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    expect(screen.getByText(/ongoing local/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Dos / Epaules')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Face Pull')).toBeInTheDocument();
    expect(screen.getByDisplayValue('19:10')).toBeInTheDocument();
    expect(screen.getByText(/#1/i)).toBeInTheDocument();
    expect(screen.queryByText(/Synthese du jour/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saisie seance/i)).not.toBeInTheDocument();
  });

  it('lets the user cancel a workout draft immediately without logging a set', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /Annuler workout/i })[0]);

    expect(screen.getByRole('button', { name: /Demarrer workout/i })).toBeInTheDocument();
    expect(readOngoingWorkoutDraft()).toBeNull();
  });

  it('keeps Cloturer l exercice available immediately after activation without forcing a set', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));
    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'Face Pull' } });
    fireEvent.click(screen.getByRole('button', { name: /Activer l exercice/i }));

    const closeButton = screen.getByRole('button', { name: /Cloturer l exercice/i });
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);

    expect(screen.getByRole('button', { name: /Activer l exercice/i })).toBeInTheDocument();
  });

  it('commits an ongoing workout atomically into ordered session rows when finalized', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));

    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'Landmine Press' } });
    fireEvent.click(screen.getByRole('button', { name: /Activer l exercice/i }));

    vi.setSystemTime(new Date('2026-03-10T10:02:00.000Z'));
    fireEvent.change(screen.getByPlaceholderText(/^Reps$/i), { target: { value: '8' } });
    fireEvent.change(screen.getByPlaceholderText(/Charge kg/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la serie/i }));

    vi.setSystemTime(new Date('2026-03-10T10:05:30.000Z'));
    fireEvent.change(screen.getByPlaceholderText(/^Reps$/i), { target: { value: '8' } });
    fireEvent.change(screen.getByPlaceholderText(/Charge kg/i), { target: { value: '52.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la serie/i }));

    vi.setSystemTime(new Date('2026-03-10T10:09:00.000Z'));
    fireEvent.change(screen.getByPlaceholderText(/^Reps$/i), { target: { value: '6' } });
    fireEvent.change(screen.getByPlaceholderText(/Charge kg/i), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la serie/i }));

    expect(screen.queryByRole('button', { name: /Cloturer la seance/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cloturer l exercice/i }));

    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'Face Pull' } });
    fireEvent.change(screen.getByPlaceholderText(/Notes exercice/i), { target: { value: 'Finisher' } });
    fireEvent.click(screen.getByRole('button', { name: /Activer l exercice/i }));

    vi.setSystemTime(new Date('2026-03-10T10:12:15.000Z'));
    fireEvent.change(screen.getByPlaceholderText(/^Reps$/i), { target: { value: '15' } });
    fireEvent.change(screen.getByPlaceholderText(/Charge kg/i), { target: { value: '30' } });
    fireEvent.change(screen.getByPlaceholderText(/Note set \(optionnel\)/i), { target: { value: 'Tempo strict' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la serie/i }));

    vi.setSystemTime(new Date('2026-03-10T10:20:00.000Z'));
    fireEvent.click(screen.getByRole('button', { name: /Cloturer l exercice/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cloturer la seance/i }));

    expect(setStateMock).toHaveBeenCalledTimes(1);
    const updater = setStateMock.mock.calls[0][0];
    const next = updater(baseState);

    expect(next.sessions).toHaveLength(2);
    expect(next.sessions[0].exerciseName).toBe('Landmine Press');
    expect(next.sessions[0].exerciseOrder).toBe(1);
    expect(next.sessions[0].durationMin).toBe(20);
    expect(next.sessions[0].setDetails).toHaveLength(3);
    expect(next.sessions[0].setDetails[0].setIndex).toBe(1);
    expect(next.sessions[0].setDetails[2].loadDisplayed).toBe(55);
    expect(next.sessions[0].setDetails[0].loggedAt).toBe('2026-03-10T10:02:00.000Z');
    expect(next.sessions[0].setDetails[0].elapsedSinceWorkoutStartSec).toBe(120);
    expect(next.sessions[0].setDetails[0].restSincePreviousSetSec).toBeNull();
    expect(next.sessions[0].setDetails[1].elapsedSinceWorkoutStartSec).toBe(330);
    expect(next.sessions[0].setDetails[1].restSincePreviousSetSec).toBe(210);
    expect(next.sessions[0].setDetails[2].elapsedSinceWorkoutStartSec).toBe(540);
    expect(next.sessions[0].setDetails[2].restSincePreviousSetSec).toBe(210);

    expect(next.sessions[1].exerciseName).toBe('Face Pull');
    expect(next.sessions[1].exerciseOrder).toBe(2);
    expect(next.sessions[1].setDetails[0].loggedAt).toBe('2026-03-10T10:12:15.000Z');
    expect(next.sessions[1].setDetails[0].timeLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(next.sessions[1].setDetails[0].elapsedSinceWorkoutStartSec).toBe(735);
    expect(next.sessions[1].setDetails[0].restSincePreviousSetSec).toBeNull();
    expect(next.sessions[1].setDetails[0].setNote).toBe('Tempo strict');

    expect(readOngoingWorkoutDraft()).toBeNull();
  });

  it('auto-fills equipment from the home gym preset catalog when choosing a known exercise', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));
    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'Face Pull' } });

    expect(screen.getByDisplayValue('Poulies vis-a-vis')).toBeInTheDocument();
    expect(screen.getByText(/Focus: Epaules/i)).toBeInTheDocument();
  });

  it('suggests chest exercises when searching by muscle keywords like pec', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));
    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'pec' } });

    expect(screen.getAllByRole('button', { name: /Bench Press/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Developpe couche/i }).length).toBeGreaterThan(0);
  });

  it('duplicates the last logged set into the current draft for fast mobile logging', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));
    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'Face Pull' } });
    fireEvent.click(screen.getByRole('button', { name: /Activer l exercice/i }));

    fireEvent.change(screen.getByPlaceholderText(/^Reps$/i), { target: { value: '15' } });
    fireEvent.change(screen.getByPlaceholderText(/Charge kg/i), { target: { value: '30' } });
    fireEvent.change(screen.getByPlaceholderText(/Note set \(optionnel\)/i), { target: { value: 'Tempo strict' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la serie/i }));

    fireEvent.click(screen.getByRole('button', { name: /Recopier 15/i }));

    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tempo strict')).toBeInTheDocument();
  });

  it('still allows closing the exercise after deleting the last set', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));
    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'Face Pull' } });
    fireEvent.click(screen.getByRole('button', { name: /Activer l exercice/i }));

    fireEvent.change(screen.getByPlaceholderText(/^Reps$/i), { target: { value: '12' } });
    fireEvent.change(screen.getByPlaceholderText(/Charge kg/i), { target: { value: '32.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la serie/i }));

    fireEvent.click(screen.getByRole('button', { name: /Suppr\./i }));

    const closeButton = screen.getByRole('button', { name: /Cloturer l exercice/i });
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);

    expect(screen.getByRole('button', { name: /Activer l exercice/i })).toBeInTheDocument();
  });

  it('shows exact set timing and workout timer in the finalized recap', () => {
    baseState.sessions = [
      buildManualSession({
        setDetails: [
          {
            setIndex: 1,
            reps: 10,
            loadDisplayed: 70,
            loadEstimated: null,
            timeLabel: '10:02',
            loggedAt: '2026-03-10T10:02:00',
            elapsedSinceWorkoutStartSec: 120,
            restSincePreviousSetSec: null,
          },
          {
            setIndex: 2,
            reps: 8,
            loadDisplayed: 72.5,
            loadEstimated: null,
            timeLabel: '10:05',
            loggedAt: '2026-03-10T10:05:30',
            elapsedSinceWorkoutStartSec: 330,
            restSincePreviousSetSec: 210,
          },
        ],
      }),
    ];

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    expect(screen.getByText(/duree 5:30/i)).toBeInTheDocument();
    expect(screen.getByText(/Timer: 10:00:00 -> 10:05:30/i)).toBeInTheDocument();
    expect(screen.getByText(/^10:02:00$/i)).toBeInTheDocument();
    expect(screen.getByText(/t\+5:30/i)).toBeInTheDocument();
    expect(screen.getByText(/repos 3:30/i)).toBeInTheDocument();
  });

  it('saves the current set when pressing Enter on the load field', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));
    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'Face Pull' } });
    fireEvent.click(screen.getByRole('button', { name: /Activer l exercice/i }));

    fireEvent.change(screen.getByPlaceholderText(/^Reps$/i), { target: { value: '12' } });
    const loadInput = screen.getByPlaceholderText(/Charge kg/i);
    fireEvent.change(loadInput, { target: { value: '32.5' } });
    fireEvent.keyDown(loadInput, { key: 'Enter', code: 'Enter' });

    expect(screen.getByText(/#1/)).toBeInTheDocument();
    expect(screen.getAllByText(/32.5 kg/).length).toBeGreaterThan(0);
  });

  it('keeps Cloturer l exercice visible in compact mobile capture and avoids duplicate active summaries', () => {
    stubMobileViewport();

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));
    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'Face Pull' } });
    fireEvent.click(screen.getByRole('button', { name: /Activer l exercice/i }));

    fireEvent.focus(screen.getByPlaceholderText(/^Reps$/i));

    expect(screen.getByRole('button', { name: /Cloturer l exercice/i })).toBeInTheDocument();
    expect(screen.getAllByText(/set #1/i)).toHaveLength(1);
  });

  it('reopens the exercise picker without clearing the current selection', () => {
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Demarrer workout/i }));
    fireEvent.change(screen.getByPlaceholderText(/Exercice \(libre ou existant\)/i), { target: { value: 'Face' } });
    fireEvent.click(screen.getByRole('button', { name: /Face Pull/i }));

    expect(screen.getByDisplayValue('Face Pull')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Choisir exo/i }));

    expect(screen.getByRole('button', { name: /Face Pull/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Face Pull')).toBeInTheDocument();
  });

  it('edits workout metadata across all rows of the same finalized workout', () => {
    baseState.sessions = [
      buildManualSession(),
      buildManualSession({
        id: 'session-2',
        exerciseOrder: 2,
        exerciseId: 'exercise-2',
        exerciseName: 'Tirage vertical poulie double',
        equipment: 'Poulie double',
        category: 'Back',
        setDetails: [
          { setIndex: 1, reps: 10, loadDisplayed: 70, loadEstimated: null, timeLabel: '' },
        ],
      }),
    ];

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(TrainingPage),
      ),
    );

    setStateMock.mockReset();
    fireEvent.click(screen.getByRole('button', { name: /Editer workout/i }));
    const workoutNameInputs = screen.getAllByPlaceholderText(/Nom du workout/i);
    const workoutNotesInputs = screen.getAllByPlaceholderText(/Notes workout/i);
    fireEvent.change(workoutNameInputs[workoutNameInputs.length - 1], { target: { value: 'Pull lourd' } });
    fireEvent.change(workoutNotesInputs[workoutNotesInputs.length - 1], { target: { value: 'Accent dos epaisseur' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer workout/i }));

    expect(setStateMock).toHaveBeenCalledTimes(1);
    const updater = setStateMock.mock.calls[0][0];
    const next = updater(baseState);

    expect(next.sessions).toHaveLength(2);
    expect(next.sessions.every((session) => session.workoutLabel === 'Pull lourd')).toBe(true);
    expect(next.sessions.every((session) => session.sessionGroupLabel === 'Pull lourd')).toBe(true);
    expect(next.sessions.every((session) => session.workoutNotes === 'Accent dos epaisseur')).toBe(true);
  });
});
