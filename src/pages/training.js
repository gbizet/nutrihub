import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import { persistDashboardState, toPositive, useDashboardState } from '../lib/dashboardStore';
import { useLocalPageUiState } from '../lib/localUiState.js';
import LayoutBlocks from '../components/LayoutBlocks';
import DateNav from '../components/DateNav';
import InteractiveLineChart from '../components/InteractiveLineChart';
import CoreWorkflowNav from '../components/CoreWorkflowNav';
import SessionTimeline from '../components/training/SessionTimeline';
import {
  COMMON_EXERCISES,
  EQUIPMENT_OPTIONS,
  EXERCISE_MUSCLE_GROUPS,
  findCommonExerciseByName,
  inferTrainingCategory,
  isMeaningfulExerciseName,
  normalizeExerciseMappingKey,
  normalizeMuscleGroupShares,
  rankWorkedMuscleGroups,
  resolveMuscleGroupShares,
  resolveMuscleGroupSharesWithOverrides,
  resolveMuscleGroupWithOverrides,
} from '../lib/exerciseKnowledge';
import { getSessionsForDate, getSessionsForWindow, getWorkoutsForDate, summarizeWorkoutTiming } from '../lib/domainModel';
import {
  buildEmptyCurrentSetDraft,
  clearOngoingWorkoutDraft,
  persistOngoingWorkoutDraft,
  readOngoingWorkoutDraft,
} from '../lib/ongoingWorkout.js';
import { APP_ACTIVITY_EVENT, isAppActive } from '../lib/appRuntime.js';
import { markPendingCriticalLocalMutation } from '../lib/criticalLocalMutation.js';

const equipment = EQUIPMENT_OPTIONS;
const TRAINING_CATEGORIES = [
  'Push',
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Lower Body',
  'Posterior Chain',
  'Upper Body',
  'Bodyweight',
  'Imported',
];
const MUSCLE_GROUPS = [
  { value: 'chest', label: 'Pecs' },
  { value: 'back', label: 'Dos' },
  { value: 'legs', label: 'Jambes' },
  { value: 'shoulders', label: 'Epaules' },
  { value: 'arms', label: 'Bras' },
  { value: 'other', label: 'Autres' },
];

const MUSCLE_GROUP_QUERY_TERMS = {
  chest: 'pec pecs poitrine chest push bench developpe couche dev couche incline fly',
  back: 'dos back row tirage traction pulldown pulldown vertical horizontal',
  legs: 'jambes jambes cuisses legs squat deadlift souleve terre fente split',
  shoulders: 'epaule epaules shoulder shoulders lateral raise elevation laterale oiseau face pull developpe militaire',
  arms: 'bras arms triceps biceps curl extension marteau hammer',
  other: 'full body upper body',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const parseIso = (iso) => {
  const [y, m, d] = `${iso || ''}`.split('-').map((chunk) => Number.parseInt(chunk, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
};

const toIso = (date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const stripLeadingDecorators = (value) =>
  `${value || ''}`
    .replace(/^[^A-Za-z0-9(]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

const isExerciseHeading = (line) => {
  const raw = `${line || ''}`.trim();
  if (!raw) return false;
  if (/^\d/.test(raw)) return false;
  if (/^s[eÃ©]rie/i.test(raw) || /^series/i.test(raw)) return false;
  if (/^reps?$/i.test(raw)) return false;
  if (/^affich/i.test(raw) || /^reel/i.test(raw) || /^r[Ã©e]el/i.test(raw)) return false;
  if (/^duree/i.test(raw) || /^dur[Ã©e]e/i.test(raw)) return false;
  if (/^charge/i.test(raw) || /^\(/.test(raw)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return false;
  if (/^\d+\s*minutes?$/i.test(raw)) return false;
  return isMeaningfulExerciseName(raw);
};

const parseSetLine = (line) => {
  const raw = `${line || ''}`.trim();
  if (!/^\d+/.test(raw)) return null;
  const numbers = raw.match(/-?\d+(?:[.,]\d+)?/g) || [];
  if (numbers.length < 3) return null;

  const parsed = numbers
    .map((n) => Number.parseFloat(n.replace(',', '.')))
    .filter(Number.isFinite)
    .map((n) => Math.max(n, 0));
  if (parsed.length < 3) return null;

  const setIndex = parsed[0];
  if (!Number.isFinite(setIndex) || setIndex <= 0) return null;

  if (parsed.length >= 4) {
    return {
      setIndex,
      loadDisplayed: parsed[1],
      loadEstimated: parsed[2],
      reps: parsed[3],
    };
  }

  return {
    setIndex,
    loadDisplayed: parsed[1],
    loadEstimated: null,
    reps: parsed[2],
  };
};

const parseWorkoutText = (rawText, fallbackDate) => {
  const lines = `${rawText || ''}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let parsedDate = fallbackDate || todayIso();
  let sessionTitle = '';
  let durationMin = null;
  const exercises = [];
  let currentExercise = null;
  let anonymousCount = 0;

  const ensureCurrentExercise = () => {
    if (currentExercise) return currentExercise;
    anonymousCount += 1;
    currentExercise = { name: `Exercice importe ${anonymousCount}`, sets: [] };
    exercises.push(currentExercise);
    return currentExercise;
  };

  lines.forEach((line) => {
    const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      parsedDate = dateMatch[1];
      const afterDate = line.replace(dateMatch[1], '').replace(/^[-\u2014\s]+/, '').trim();
      if (afterDate) sessionTitle = stripLeadingDecorators(afterDate);
      return;
    }

    const durationMatch = line.match(/(\d+)\s*min(?:ute)?s?/i);
    if (durationMatch) {
      durationMin = Number.parseInt(durationMatch[1], 10) || durationMin;
      return;
    }

    const setRow = parseSetLine(line);
    if (setRow) {
      ensureCurrentExercise().sets.push(setRow);
      return;
    }

    if (isExerciseHeading(line)) {
      const heading = stripLeadingDecorators(line);
      if (!heading || !isMeaningfulExerciseName(heading)) return;
      currentExercise = { name: heading, sets: [] };
      exercises.push(currentExercise);
    }
  });

  const normalized = exercises.filter((ex) => ex.sets.length > 0);
  return {
    date: parsedDate,
    title: sessionTitle || 'Seance importee',
    durationMin,
    exercises: normalized,
  };
};

const parseCompactWorkout = (rawText, fallbackDate) => {
  const source = `${rawText || ''}`.trim();
  if (!source) return null;
  const firstLine = source.split(/\r?\n/).find((line) => `${line || ''}`.trim()) || '';
  const titleMatch = firstLine.match(/^([^:]+)\s*:\s*(.+)$/);
  const sessionTitle = titleMatch ? stripLeadingDecorators(titleMatch[1]) : 'Seance rapide';
  const body = titleMatch ? `${titleMatch[2]}\n${source.split(/\r?\n/).slice(1).join('\n')}` : source;
  const chunks = body
    .split(/[;\n]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const exercises = chunks
    .map((chunk) => {
      const normalized = chunk.replace(/@/g, ' x ').replace(/\s+/g, ' ').trim();
      const match = normalized.match(/^(.+?)\s+(\d+)\s*x\s*(\d+)(?:\s*x\s*(\d+(?:[.,]\d+)?))?$/i);
      if (!match) return null;
      const name = stripLeadingDecorators(match[1]);
      if (!isMeaningfulExerciseName(name)) return null;
      const sets = Number.parseInt(match[2], 10) || 0;
      const reps = Number.parseInt(match[3], 10) || 0;
      const load = Number.parseFloat((match[4] || '0').replace(',', '.')) || 0;
      if (sets <= 0 || reps <= 0) return null;
      const setDetails = Array.from({ length: sets }).map((_, idx) => ({
        setIndex: idx + 1,
        loadDisplayed: load,
        loadEstimated: null,
        reps,
      }));
      return { name, sets: setDetails };
    })
    .filter(Boolean);

  return {
    date: fallbackDate || todayIso(),
    title: sessionTitle,
    durationMin: null,
    exercises,
  };
};

const sessionTopLoad = (session) => {
  if (Array.isArray(session.setDetails) && session.setDetails.length > 0) {
    return session.setDetails.reduce(
      (max, setRow) => Math.max(max, Number(setRow.loadDisplayed || setRow.loadEstimated || 0)),
      0,
    );
  }
  return Number(session.load || 0);
};

const sessionVolume = (session) => {
  if (Array.isArray(session.setDetails) && session.setDetails.length > 0) {
    return session.setDetails.reduce(
      (acc, setRow) => acc + Number(setRow.reps || 0) * Number(setRow.loadDisplayed || setRow.loadEstimated || 0),
      0,
    );
  }
  return Number(session.reps || 0) * Number(session.load || 0);
};

const estimateE1rm = (session) => {
  if (Array.isArray(session.setDetails) && session.setDetails.length > 0) {
    const topSet = session.setDetails.reduce((best, row) => {
      const load = Number(row.loadDisplayed || 0);
      const reps = Math.max(1, Number(row.reps || 1));
      const e1rm = load * (1 + reps / 30);
      if (!best || e1rm > best.e1rm) return { e1rm, load, reps };
      return best;
    }, null);
    return topSet ? topSet.e1rm : 0;
  }
  const load = Number(session.load || 0);
  const reps = Math.max(1, Number(session.reps || 1));
  return load * (1 + reps / 30);
};

const sessionSets = (session) => {
  if (Array.isArray(session.setDetails) && session.setDetails.length > 0) return session.setDetails.length;
  return Number(session.sets || 0);
};

const sessionReps = (session) => {
  if (Array.isArray(session.setDetails) && session.setDetails.length > 0) {
    return session.setDetails.reduce((acc, setRow) => acc + Number(setRow.reps || 0), 0);
  }
  return Number(session.reps || 0);
};

const buildUniformSetDetails = (sets, reps, load) => {
  const safeSets = Math.max(1, Number.parseInt(sets, 10) || 1);
  const safeReps = Math.max(0, Number.parseFloat(reps) || 0);
  const safeLoad = Math.max(0, Number.parseFloat(load) || 0);
  return Array.from({ length: safeSets }).map((_, index) => ({
    setIndex: index + 1,
    loadDisplayed: safeLoad,
    loadEstimated: null,
    reps: safeReps,
  }));
};

const resolveSessionGroupKey = (session) => `${session?.sessionGroupId || session?.date || session?.id || ''}`;
const resolveSessionGroupLabel = (session) => `${session?.sessionGroupLabel || session?.sessionTitle || session?.date || 'Seance'}`.trim();

const progressDateLabel = (key) => {
  const raw = `${key || ''}`;
  if (raw.includes('#')) {
    const [, seq] = raw.split('#');
    return `S${seq}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw.slice(8, 10)}/${raw.slice(5, 7)}`;
  return raw;
};

const formatDateShort = (iso) => {
  const raw = `${iso || ''}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return `${raw.slice(8, 10)}/${raw.slice(5, 7)}`;
};

const formatDelta = (value, digits = 1, suffix = '') => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}${suffix}`;
};

const formatMuscleFocus = (rows) => rows.map((row) => row.label).join(' / ');

const findExerciseById = (exercises = [], exerciseId) => (
  (Array.isArray(exercises) ? exercises : []).find((exercise) => exercise.id === exerciseId) || null
);

const findExerciseByName = (exercises = [], exerciseName) => {
  const key = normalizeExerciseMappingKey(exerciseName);
  if (!key) return null;
  return (Array.isArray(exercises) ? exercises : []).find((exercise) => normalizeExerciseMappingKey(exercise.name) === key) || null;
};

const resolveKnownExercise = (exercises = [], exerciseId = '', exerciseName = '') => {
  const selectedExercise = findExerciseById(exercises, exerciseId);
  const normalizedName = `${exerciseName || selectedExercise?.name || ''}`.trim();
  const libraryExercise = selectedExercise || findExerciseByName(exercises, normalizedName);
  const presetExercise = libraryExercise ? null : findCommonExerciseByName(normalizedName);
  return {
    normalizedName,
    libraryExercise,
    knownExercise: libraryExercise || presetExercise || null,
  };
};

const buildExerciseForm = (exercise = null) => ({
  name: `${exercise?.name || ''}`,
  equipment: `${exercise?.equipment || equipment[0] || ''}`,
  category: `${exercise?.category || 'Upper Body'}`,
});

const resolveExerciseDraft = ({
  exercises = [],
  exerciseId = '',
  exerciseName = '',
  equipmentValue = '',
  exerciseMuscleOverrides = {},
  uid,
}) => {
  const lookup = resolveKnownExercise(exercises, exerciseId, exerciseName);
  const normalizedName = lookup.normalizedName;
  if (!normalizedName) return null;

  const matchedExercise = lookup.knownExercise;
  const resolvedEquipment = `${equipmentValue || matchedExercise?.equipment || ''}`.trim();
  const muscleGroupKey = resolveMuscleGroupWithOverrides(
    normalizedName,
    matchedExercise?.category || '',
    exerciseMuscleOverrides,
  );
  const resolvedCategory = matchedExercise?.category || inferTrainingCategory(normalizedName, muscleGroupKey);

  if (matchedExercise) {
    return {
      exercise: matchedExercise,
      nextExercises: exercises,
      equipment: resolvedEquipment,
      category: resolvedCategory,
    };
  }

  const createdExercise = {
    id: uid(),
    name: normalizedName,
    equipment: resolvedEquipment,
    category: resolvedCategory,
  };

  return {
    exercise: createdExercise,
    nextExercises: [createdExercise, ...exercises],
    equipment: resolvedEquipment,
    category: resolvedCategory,
  };
};

const buildEmptyOngoingExerciseDraft = () => ({
  exerciseId: '',
  exerciseName: '',
  equipment: '',
  notes: '',
});

const normalizeWorkoutDraftInput = (draft = {}, fallbackDate = todayIso()) => ({
  date: `${draft.date || fallbackDate}`,
  workoutLabel: `${draft.workoutLabel || 'Seance manuelle'}`,
  durationMin: `${draft.durationMin ?? ''}`,
  notes: `${draft.notes || ''}`,
});

const toClockTimeLabel = (isoString) => {
  const raw = `${isoString || ''}`.trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getHours()}`.padStart(2, '0') + ':' + `${date.getMinutes()}`.padStart(2, '0');
};

const toClockTimeLabelWithSeconds = (isoString) => {
  const raw = `${isoString || ''}`.trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getHours()}`.padStart(2, '0')
    + ':'
    + `${date.getMinutes()}`.padStart(2, '0')
    + ':'
    + `${date.getSeconds()}`.padStart(2, '0');
};

const secondsBetween = (laterIso, earlierIso) => {
  const later = new Date(`${laterIso || ''}`);
  const earlier = new Date(`${earlierIso || ''}`);
  if (Number.isNaN(later.getTime()) || Number.isNaN(earlier.getTime())) return null;
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 1000));
};

const formatDurationShort = (valueInSeconds) => {
  const seconds = Number(valueInSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  const safe = Math.round(seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins < 60) return `${mins}:${`${secs}`.padStart(2, '0')}`;
  const hours = Math.floor(mins / 60);
  return `${hours}:${`${mins % 60}`.padStart(2, '0')}:${`${secs}`.padStart(2, '0')}`;
};

const finalizeExerciseSetDetails = (setDetails = [], workoutStartedAt = '') => {
  const normalizedRows = (Array.isArray(setDetails) ? setDetails : [])
    .map((row, index) => {
      const loggedAt = `${row?.loggedAt || ''}`.trim();
      const fallbackElapsed =
        row?.elapsedSinceWorkoutStartSec === null || row?.elapsedSinceWorkoutStartSec === undefined || `${row?.elapsedSinceWorkoutStartSec ?? ''}`.trim() === ''
          ? null
          : toPositive(row?.elapsedSinceWorkoutStartSec, 0);
      return {
        setIndex: Number.parseInt(row?.setIndex, 10) || (index + 1),
        reps: toPositive(row?.reps, 0),
        loadDisplayed: toPositive(row?.loadDisplayed, 0),
        loadEstimated:
          row?.loadEstimated === null || row?.loadEstimated === undefined || row?.loadEstimated === ''
            ? null
            : toPositive(row?.loadEstimated, 0),
        loggedAt,
        elapsedSinceWorkoutStartSec: loggedAt && workoutStartedAt
          ? secondsBetween(loggedAt, workoutStartedAt)
          : fallbackElapsed,
        restSincePreviousSetSec:
          row?.restSincePreviousSetSec === null || row?.restSincePreviousSetSec === undefined || `${row?.restSincePreviousSetSec ?? ''}`.trim() === ''
            ? null
            : toPositive(row?.restSincePreviousSetSec, 0),
        timeLabel: `${row?.timeLabel || ''}`.trim() || toClockTimeLabel(loggedAt),
        setNote: `${row?.setNote || ''}`.trim(),
      };
    })
    .sort((a, b) => Number(a.setIndex || 0) - Number(b.setIndex || 0));

  return normalizedRows.map((row, index) => {
    const previous = normalizedRows[index - 1];
    return {
      ...row,
      setIndex: index + 1,
      elapsedSinceWorkoutStartSec:
        row.loggedAt && workoutStartedAt
          ? secondsBetween(row.loggedAt, workoutStartedAt)
          : row.elapsedSinceWorkoutStartSec,
      restSincePreviousSetSec:
        row.loggedAt && previous?.loggedAt
          ? secondsBetween(row.loggedAt, previous.loggedAt)
          : (index === 0 ? null : row.restSincePreviousSetSec),
      timeLabel: row.timeLabel || toClockTimeLabel(row.loggedAt),
    };
  });
};

const summarizeExerciseSetDetails = (setDetails = [], workoutStartedAt = '') => {
  const normalized = finalizeExerciseSetDetails(setDetails, workoutStartedAt);
  const totalReps = normalized.reduce((acc, row) => acc + Number(row.reps || 0), 0);
  const topLoad = normalized.reduce((max, row) => Math.max(max, Number(row.loadDisplayed || row.loadEstimated || 0)), 0);
  return {
    totalReps,
    topLoad,
    setCount: normalized.length,
    setDetails: normalized,
  };
};

const formatSetDraftLabel = (setRow) => {
  if (!setRow) return '-';
  const reps = Number(setRow.reps || 0);
  const load = Number(setRow.loadDisplayed || setRow.loadEstimated || 0);
  const bits = [];
  if (reps > 0) bits.push(`${reps} reps`);
  if (load > 0) bits.push(`${load.toFixed(1)} kg`);
  if (`${setRow.timeLabel || ''}`.trim()) bits.push(`${setRow.timeLabel}`.trim());
  if (setRow.restSincePreviousSetSec !== null && setRow.restSincePreviousSetSec !== undefined) {
    bits.push(`repos ${formatDurationShort(setRow.restSincePreviousSetSec)}`);
  }
  if (`${setRow.setNote || ''}`.trim()) bits.push(`${setRow.setNote}`.trim());
  return bits.join(' | ') || '-';
};

const filterExerciseSuggestions = (exerciseEntries = [], rawQuery = '', limit = 48) => {
  const entries = Array.isArray(exerciseEntries) ? exerciseEntries.filter(Boolean) : [];
  const query = normalizeExerciseMappingKey(rawQuery);
  if (!query) return entries.slice(0, limit).map((entry) => entry.name);
  return entries
    .map((entry, index) => {
      const key = normalizeExerciseMappingKey(entry.name);
      const searchText = normalizeExerciseMappingKey(entry.searchText || entry.name);
      if (!key) return null;
      if (key === query) return { name: entry.name, rank: 0, index };
      if (key.startsWith(query)) return { name: entry.name, rank: 1, index };
      if (searchText.includes(query)) return { name: entry.name, rank: 2, index };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.index - b.index || a.name.localeCompare(b.name, 'fr'))
    .slice(0, limit)
    .map((entry) => entry.name);
};

const findExerciseDraftByTempId = (draft, tempId) => (
  (draft?.exercises || []).find((exercise) => exercise.tempId === tempId) || null
);

const isSmallViewport = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(max-width: 700px)').matches
);

const scrollIntoViewForCapture = (element) => {
  if (typeof element?.scrollIntoView !== 'function') return;
  element.scrollIntoView({
    behavior: isSmallViewport() ? 'auto' : 'smooth',
    block: isSmallViewport() ? 'center' : 'start',
  });
};

const focusWithoutScroll = (element) => {
  if (typeof element?.focus !== 'function') return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
};

export default function TrainingPage() {
  const { state, setState, replaceState, uid } = useDashboardState();
  const [exerciseForm, setExerciseForm] = useState(() => buildExerciseForm());
  const [editingLibraryExerciseId, setEditingLibraryExerciseId] = useState('');
  const [workoutStartForm, setWorkoutStartForm] = useState(() => normalizeWorkoutDraftInput({ date: state.selectedDate }, state.selectedDate));
  const [ongoingWorkout, setOngoingWorkout] = useState(() => readOngoingWorkoutDraft());
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [appActive, setAppActiveState] = useState(() => isAppActive());
  const [showWorkoutMeta, setShowWorkoutMeta] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [setComposerFocused, setSetComposerFocused] = useState(false);
  const exercisePickerRef = useRef(null);
  const setFormRef = useRef(null);
  const repsInputRef = useRef(null);
  const loadInputRef = useRef(null);
  const gymBarRef = useRef(null);
  const actionRailRef = useRef(null);
  const prevActiveExerciseIdRef = useRef(ongoingWorkout?.activeExerciseId ?? null);
  const [pasteText, setPasteText] = useState('');
  const [parseStatus, setParseStatus] = useState('');
  const [parsedWorkout, setParsedWorkout] = useState(null);
  const [quickSessionText, setQuickSessionText] = useState('');
  const [exercisePickerMode, setExercisePickerMode] = useState('');
  const [pageUi, setPageUi] = useLocalPageUiState('training', {
    workflow: 'capture',
    muscleGroup: 'chest',
    focusExercise: 'all',
    progressView: 'session',
    windowDays: 30,
    progressRowsLimit: 25,
    heatmapWeeks: 8,
    heatmapMetric: 'sets',
    mappingExercise: '',
  });
  const [mappingDraft, setMappingDraft] = useState({});
  const sessionsForSelectedDay = useMemo(() => getSessionsForDate(state, state.selectedDate), [state, state.selectedDate]);
  const workoutsForSelectedDay = useMemo(() => getWorkoutsForDate(state, state.selectedDate), [state, state.selectedDate]);
  const muscleGroup = pageUi.muscleGroup || 'chest';
  const workflow = pageUi.workflow === 'analysis' ? 'analysis' : 'capture';
  const workoutCaptureMode = workflow === 'capture' && Boolean(ongoingWorkout);
  const compactMobileCaptureUi = workoutCaptureMode && isSmallViewport();
  const setKeyboardMode = compactMobileCaptureUi && Boolean(ongoingWorkout?.activeExerciseId) && setComposerFocused;
  const focusExercise = pageUi.focusExercise || 'all';
  const progressView = pageUi.progressView || 'session';
  const windowDays = Number(pageUi.windowDays || 30);
  const progressRowsLimit = Number(pageUi.progressRowsLimit || 25);
  const heatmapWeeks = Number(pageUi.heatmapWeeks || 8);
  const heatmapMetric = pageUi.heatmapMetric || 'sets';

  useEffect(() => {
    setWorkoutStartForm((prev) => (
      ongoingWorkout
        ? prev
        : { ...prev, date: state.selectedDate }
    ));
  }, [ongoingWorkout, state.selectedDate]);

  useEffect(() => {
    persistOngoingWorkoutDraft(ongoingWorkout);
  }, [ongoingWorkout]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const updateViewportMetrics = () => {
      const viewport = window.visualViewport;
      const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
      const keyboardInset = viewport
        ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
        : 0;
      root.style.setProperty('--visual-viewport-offset-top', `${offsetTop}px`);
      root.style.setProperty('--visual-keyboard-inset', `${keyboardInset}px`);
      setKeyboardOpen(keyboardInset > 80);
    };

    updateViewportMetrics();

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updateViewportMetrics);
    viewport?.addEventListener('scroll', updateViewportMetrics);
    window.addEventListener('resize', updateViewportMetrics);

    return () => {
      viewport?.removeEventListener('resize', updateViewportMetrics);
      viewport?.removeEventListener('scroll', updateViewportMetrics);
      window.removeEventListener('resize', updateViewportMetrics);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const updateGymBarHeight = () => {
      const nextHeight = Math.ceil(gymBarRef.current?.getBoundingClientRect()?.height || 0);
      root.style.setProperty('--training-gym-bar-height', `${nextHeight}px`);
    };

    updateGymBarHeight();

    if (typeof ResizeObserver === 'function' && gymBarRef.current) {
      const observer = new ResizeObserver(() => updateGymBarHeight());
      observer.observe(gymBarRef.current);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener('resize', updateGymBarHeight);
    return () => {
      window.removeEventListener('resize', updateGymBarHeight);
    };
  }, [ongoingWorkout?.draftId, ongoingWorkout?.startedAt, showWorkoutMeta]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const updateActionRailHeight = () => {
      const nextHeight = compactMobileCaptureUi
        ? Math.ceil(actionRailRef.current?.getBoundingClientRect()?.height || 0)
        : 0;
      root.style.setProperty('--training-action-rail-height', `${nextHeight}px`);
    };

    updateActionRailHeight();

    if (!compactMobileCaptureUi) {
      return () => {
        root.style.setProperty('--training-action-rail-height', '0px');
      };
    }

    if (typeof ResizeObserver === 'function' && actionRailRef.current) {
      const observer = new ResizeObserver(() => updateActionRailHeight());
      observer.observe(actionRailRef.current);
      return () => {
        observer.disconnect();
        root.style.setProperty('--training-action-rail-height', '0px');
      };
    }

    window.addEventListener('resize', updateActionRailHeight);
    return () => {
      window.removeEventListener('resize', updateActionRailHeight);
      root.style.setProperty('--training-action-rail-height', '0px');
    };
  }, [
    compactMobileCaptureUi,
    ongoingWorkout?.activeExerciseId,
    ongoingWorkout?.currentSetDraft?.editingSetIndex,
    ongoingWorkout?.exercises,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const body = document.body;
    if (!body) return undefined;

    if (compactMobileCaptureUi) {
      body.dataset.trainingWorkoutMode = '1';
    } else {
      delete body.dataset.trainingWorkoutMode;
    }

    return () => {
      delete body.dataset.trainingWorkoutMode;
    };
  }, [compactMobileCaptureUi]);

  useEffect(() => {
    if (!setKeyboardMode) return undefined;
    const timer = window.setTimeout(() => {
      const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
      const focusTarget = setFormRef.current?.contains(activeElement)
        ? activeElement
        : (repsInputRef.current || setFormRef.current);
      scrollIntoViewForCapture(focusTarget);
    }, 50);
    return () => {
      window.clearTimeout(timer);
    };
  }, [setKeyboardMode]);

  const resolveSessionShares = (session) => (
    resolveMuscleGroupSharesWithOverrides(session?.exerciseName, session?.category, state.exerciseMuscleOverrides)
  );

  const exerciseCatalog = useMemo(() => {
    const seen = new Set();
    const names = [];
    [
      ...(state.exercises || []).map((exercise) => exercise.name),
      ...(state.sessions || []).map((session) => session.exerciseName),
      ...COMMON_EXERCISES.map((exercise) => exercise.name),
    ]
      .filter(Boolean)
      .forEach((name) => {
        const key = normalizeExerciseMappingKey(name);
        if (!key || seen.has(key)) return;
        seen.add(key);
        names.push(name);
      });
    return names.sort((a, b) => a.localeCompare(b, 'fr'));
  }, [state.exercises, state.sessions]);

  const exerciseCatalogEntries = useMemo(
    () => exerciseCatalog.map((name) => {
      const knownExercise = resolveKnownExercise(state.exercises, '', name).knownExercise;
      const libraryExercise = state.exercises.find((exercise) => normalizeExerciseMappingKey(exercise.name) === normalizeExerciseMappingKey(name)) || null;
      const sessionExercise = state.sessions.find((session) => normalizeExerciseMappingKey(session.exerciseName) === normalizeExerciseMappingKey(name)) || null;
      const category = knownExercise?.category || libraryExercise?.category || sessionExercise?.category || '';
      const equipmentValue = knownExercise?.equipment || libraryExercise?.equipment || sessionExercise?.equipment || '';
      const primaryMuscle = resolveMuscleGroupWithOverrides(name, category, state.exerciseMuscleOverrides);
      const primaryMuscleLabel = MUSCLE_GROUPS.find((item) => item.value === primaryMuscle)?.label || 'Autres';
      return {
        name,
        category,
        equipment: equipmentValue,
        primaryMuscle,
        primaryMuscleLabel,
        searchText: `${name} ${category} ${equipmentValue} ${primaryMuscle} ${primaryMuscleLabel} ${MUSCLE_GROUP_QUERY_TERMS[primaryMuscle] || ''}`,
      };
    }),
    [exerciseCatalog, state.exerciseMuscleOverrides, state.exercises, state.sessions],
  );

  const mappingExercise = pageUi.mappingExercise || exerciseCatalog[0] || '';
  const mappingExerciseMeta = useMemo(
    () => state.exercises.find((exercise) => exercise.name === mappingExercise)
      || state.sessions.find((session) => session.exerciseName === mappingExercise)
      || null,
    [mappingExercise, state.exercises, state.sessions],
  );
  const mappingOverrideKey = normalizeExerciseMappingKey(mappingExercise);
  const mappingOverride = state.exerciseMuscleOverrides?.[mappingOverrideKey] || null;
  const autoMappingShares = useMemo(
    () => resolveMuscleGroupShares(mappingExercise, mappingExerciseMeta?.category || ''),
    [mappingExercise, mappingExerciseMeta?.category],
  );
  const effectiveMappingShares = useMemo(
    () => resolveMuscleGroupSharesWithOverrides(mappingExercise, mappingExerciseMeta?.category || '', state.exerciseMuscleOverrides),
    [mappingExercise, mappingExerciseMeta?.category, state.exerciseMuscleOverrides],
  );
  const mappingRows = useMemo(
    () => exerciseCatalog.slice(0, 18).map((name) => {
      const overrideKey = normalizeExerciseMappingKey(name);
      const shares = resolveMuscleGroupSharesWithOverrides(
        name,
        state.exercises.find((exercise) => exercise.name === name)?.category || '',
        state.exerciseMuscleOverrides,
      );
      return {
        name,
        mode: state.exerciseMuscleOverrides?.[overrideKey] ? 'manuel' : 'auto',
        primary: Object.entries(shares).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other',
      };
    }),
    [exerciseCatalog, state.exerciseMuscleOverrides, state.exercises],
  );

  useEffect(() => {
    if (!exerciseCatalog.length) return;
    if (mappingExercise && exerciseCatalog.includes(mappingExercise)) return;
    setPageUi((prev) => ({ ...prev, mappingExercise: exerciseCatalog[0] }));
  }, [exerciseCatalog, mappingExercise, setPageUi]);

  useEffect(() => {
    setMappingDraft(mappingOverride || autoMappingShares || {});
  }, [autoMappingShares, mappingOverride, mappingExercise]);

  const saveMuscleMapping = () => {
    if (!mappingExercise) return;
    const normalized = normalizeMuscleGroupShares(mappingDraft);
    setState((prev) => ({
      ...prev,
      exerciseMuscleOverrides: normalized
        ? {
          ...(prev.exerciseMuscleOverrides || {}),
          [mappingOverrideKey]: normalized,
        }
        : Object.fromEntries(
          Object.entries(prev.exerciseMuscleOverrides || {}).filter(([key]) => key !== mappingOverrideKey),
        ),
    }));
  };

  const resetMuscleMapping = () => {
    setState((prev) => ({
      ...prev,
      exerciseMuscleOverrides: Object.fromEntries(
        Object.entries(prev.exerciseMuscleOverrides || {}).filter(([key]) => key !== mappingOverrideKey),
      ),
    }));
    setMappingDraft(autoMappingShares || {});
  };

  const resetExerciseLibraryForm = () => {
    setEditingLibraryExerciseId('');
    setExerciseForm(buildExerciseForm());
  };

  const updateExerciseFormName = (nextName) => {
    setExerciseForm((previous) => {
      const lookup = resolveKnownExercise(state.exercises, '', nextName);
      const normalizedName = `${nextName || ''}`.trim();
      const muscleGroupKey = resolveMuscleGroupWithOverrides(
        normalizedName,
        lookup.knownExercise?.category || previous.category || '',
        state.exerciseMuscleOverrides,
      );
      return {
        ...previous,
        name: nextName,
        equipment: lookup.knownExercise?.equipment || previous.equipment || equipment[0] || '',
        category:
          lookup.knownExercise?.category
          || (normalizedName ? inferTrainingCategory(normalizedName, muscleGroupKey) : previous.category || 'Upper Body'),
      };
    });
  };

  const addExercise = (event) => {
    event.preventDefault();
    if (!exerciseForm.name.trim()) return;
    const nextName = exerciseForm.name.trim();
    setState((prev) => {
      const lookup = resolveKnownExercise(
        prev.exercises.filter((exercise) => exercise.id !== editingLibraryExerciseId),
        '',
        nextName,
      );
      const muscleGroupKey = resolveMuscleGroupWithOverrides(
        nextName,
        exerciseForm.category || lookup.knownExercise?.category || '',
        prev.exerciseMuscleOverrides,
      );
      const canonicalName = lookup.knownExercise?.name || nextName;
      const item = {
        id:
          editingLibraryExerciseId
          || prev.exercises.find((exercise) => (
            normalizeExerciseMappingKey(exercise.name) === normalizeExerciseMappingKey(nextName)
          ))?.id
          || uid(),
        name: canonicalName,
        equipment: `${exerciseForm.equipment || lookup.knownExercise?.equipment || equipment[0] || ''}`.trim(),
        category: `${exerciseForm.category || lookup.knownExercise?.category || inferTrainingCategory(nextName, muscleGroupKey)}`.trim() || 'Upper Body',
      };
      const nextExercises = [
        item,
        ...prev.exercises.filter((exercise) => exercise.id !== item.id),
      ];
      return { ...prev, exercises: nextExercises };
    });
    resetExerciseLibraryForm();
  };

  const addCommonExercises = () => {
    setState((prev) => {
      const nextExercises = [...prev.exercises];
      let changed = false;
      COMMON_EXERCISES.forEach((preset) => {
        const existingIndex = nextExercises.findIndex((exercise) => (
          normalizeExerciseMappingKey(exercise.name) === normalizeExerciseMappingKey(preset.name)
        ));
        if (existingIndex >= 0) {
          const existing = nextExercises[existingIndex];
          if (existing.equipment !== preset.equipment || existing.category !== preset.category) {
            nextExercises[existingIndex] = {
              ...existing,
              equipment: preset.equipment,
              category: preset.category,
            };
            changed = true;
          }
          return;
        }
        nextExercises.unshift({ id: uid(), ...preset });
        changed = true;
      });
      if (!changed) return prev;
      return { ...prev, exercises: nextExercises };
    });
  };

  const editLibraryExercise = (exercise) => {
    setEditingLibraryExerciseId(exercise.id);
    setExerciseForm(buildExerciseForm(exercise));
  };

  const removeLibraryExercise = (exerciseId) => {
    setState((prev) => ({
      ...prev,
      exercises: prev.exercises.filter((exercise) => exercise.id !== exerciseId),
    }));
    if (editingLibraryExerciseId === exerciseId) resetExerciseLibraryForm();
  };

  const loadExerciseIntoOngoingDraft = (exercise) => {
    if (!ongoingWorkout || ongoingWorkout.activeExerciseId) return;
    updateOngoingWorkout((previous) => (
      previous
        ? {
          ...previous,
          currentExerciseDraft: {
            exerciseId: exercise.id || '',
            exerciseName: exercise.name || '',
            equipment: exercise.equipment || '',
            notes: previous.currentExerciseDraft?.notes || '',
          },
        }
        : previous
    ));
  };

  const updateOngoingWorkout = (updater) => {
    setOngoingWorkout((previous) => {
      const resolved = typeof updater === 'function' ? updater(previous) : updater;
      if (!resolved) return null;
      return {
        ...resolved,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const activeOngoingExercise = useMemo(
    () => findExerciseDraftByTempId(ongoingWorkout, ongoingWorkout?.activeExerciseId),
    [ongoingWorkout],
  );

  useEffect(() => {
    if (!ongoingWorkout) { prevActiveExerciseIdRef.current = null; return; }
    const currentId = ongoingWorkout.activeExerciseId || '';
    const previousId = prevActiveExerciseIdRef.current || '';
    prevActiveExerciseIdRef.current = currentId;
    if (currentId === previousId) return;
    if (currentId) {
      scrollIntoViewForCapture(repsInputRef.current || setFormRef.current);
      setTimeout(() => focusWithoutScroll(repsInputRef.current), 120);
    } else {
      scrollIntoViewForCapture(exercisePickerRef.current);
      setTimeout(() => focusWithoutScroll(exercisePickerRef.current?.querySelector('input')), 120);
    }
  }, [ongoingWorkout?.activeExerciseId]);

  const ongoingWorkoutSummary = useMemo(() => {
    const exercises = ongoingWorkout?.exercises || [];
    const totalSets = exercises.reduce((acc, exercise) => acc + (exercise.setDetails?.length || 0), 0);
    const totalReps = exercises.reduce((acc, exercise) => (
      acc + (exercise.setDetails || []).reduce((sum, row) => sum + Number(row.reps || 0), 0)
    ), 0);
    return {
      exerciseCount: exercises.length,
      totalSets,
      totalReps,
    };
  }, [ongoingWorkout]);

  const currentExerciseDraftLookup = useMemo(
    () => resolveKnownExercise(
      state.exercises,
      ongoingWorkout?.currentExerciseDraft?.exerciseId,
      ongoingWorkout?.currentExerciseDraft?.exerciseName,
    ),
    [
      state.exercises,
      ongoingWorkout?.currentExerciseDraft?.exerciseId,
      ongoingWorkout?.currentExerciseDraft?.exerciseName,
    ],
  );

  const currentExerciseDraftFocusLabel = useMemo(() => {
    const draftName = `${ongoingWorkout?.currentExerciseDraft?.exerciseName || ''}`.trim();
    if (!draftName) return '';
    const muscleGroupKey = resolveMuscleGroupWithOverrides(
      draftName,
      currentExerciseDraftLookup.knownExercise?.category || '',
      state.exerciseMuscleOverrides,
    );
    return MUSCLE_GROUPS.find((item) => item.value === muscleGroupKey)?.label || 'Autres';
  }, [currentExerciseDraftLookup.knownExercise, ongoingWorkout?.currentExerciseDraft?.exerciseName, state.exerciseMuscleOverrides]);

  const draftExerciseSuggestions = useMemo(
    () => filterExerciseSuggestions(exerciseCatalogEntries, ongoingWorkout?.currentExerciseDraft?.exerciseName),
    [exerciseCatalogEntries, ongoingWorkout?.currentExerciseDraft?.exerciseName],
  );

  const activeExerciseSuggestions = useMemo(
    () => filterExerciseSuggestions(exerciseCatalogEntries, activeOngoingExercise?.exerciseName),
    [activeOngoingExercise?.exerciseName, exerciseCatalogEntries],
  );

  useEffect(() => {
    if (!ongoingWorkout) setExercisePickerMode('');
  }, [ongoingWorkout]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleAppActivity = (event) => {
      setAppActiveState(Boolean(event?.detail?.isActive));
    };
    window.addEventListener(APP_ACTIVITY_EVENT, handleAppActivity);
    return () => {
      window.removeEventListener(APP_ACTIVITY_EVENT, handleAppActivity);
    };
  }, []);

  useEffect(() => {
    if (!ongoingWorkout?.draftId) return undefined;
    if (!appActive) return undefined;
    setLiveNowMs(Date.now());
    const timerId = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [appActive, ongoingWorkout?.draftId]);

  const startOngoingWorkout = (event) => {
    event.preventDefault();
    if (ongoingWorkout) return;
    const normalized = normalizeWorkoutDraftInput(workoutStartForm, state.selectedDate);
    const timestamp = new Date().toISOString();
    setOngoingWorkout({
      draftId: uid(),
      date: normalized.date || state.selectedDate,
      workoutLabel: normalized.workoutLabel.trim() || 'Seance manuelle',
      durationMin: normalized.durationMin,
      notes: normalized.notes.trim(),
      startedAt: '',
      updatedAt: timestamp,
      activeExerciseId: '',
      currentExerciseDraft: buildEmptyOngoingExerciseDraft(),
      exercises: [],
      currentSetDraft: buildEmptyCurrentSetDraft(),
    });
    setTimeout(() => {
      scrollIntoViewForCapture(exercisePickerRef.current);
      setTimeout(() => focusWithoutScroll(exercisePickerRef.current?.querySelector('input')), 120);
    }, 80);
  };

  const abandonOngoingWorkout = () => {
    clearOngoingWorkoutDraft();
    setOngoingWorkout(null);
    setWorkoutStartForm(normalizeWorkoutDraftInput({ date: state.selectedDate }, state.selectedDate));
  };

  const updateWorkoutField = (field, value) => {
    updateOngoingWorkout((previous) => (
      previous
        ? {
          ...previous,
          [field]: value,
        }
        : previous
    ));
  };

  const updateCurrentExerciseDraft = (patch) => {
    updateOngoingWorkout((previous) => {
      if (!previous || previous.activeExerciseId) return previous;
      const next = {
        ...previous.currentExerciseDraft,
        ...patch,
      };
      if (patch.exerciseName !== undefined || patch.exerciseId !== undefined) {
        const lookup = resolveKnownExercise(
          state.exercises,
          patch.exerciseId !== undefined ? patch.exerciseId : next.exerciseId,
          patch.exerciseName !== undefined ? patch.exerciseName : next.exerciseName,
        );
        next.exerciseId = lookup.libraryExercise?.id || '';
        if (patch.equipment === undefined && lookup.knownExercise?.equipment) {
          next.equipment = lookup.knownExercise.equipment;
        }
      }
      return {
        ...previous,
        currentExerciseDraft: next,
      };
    });
  };

  const updateActiveExercise = (patch) => {
    updateOngoingWorkout((previous) => {
      if (!previous || !previous.activeExerciseId) return previous;
      return {
        ...previous,
        exercises: previous.exercises.map((exercise) => {
          if (exercise.tempId !== previous.activeExerciseId) return exercise;
          const nextExercise = { ...exercise, ...patch };
          if (patch.exerciseName !== undefined || patch.exerciseId !== undefined) {
            const lookup = resolveKnownExercise(
              state.exercises,
              patch.exerciseId !== undefined ? patch.exerciseId : nextExercise.exerciseId,
              patch.exerciseName !== undefined ? patch.exerciseName : nextExercise.exerciseName,
            );
            const muscleGroupKey = resolveMuscleGroupWithOverrides(
              nextExercise.exerciseName,
              lookup.knownExercise?.category || nextExercise.category || '',
              state.exerciseMuscleOverrides,
            );
            nextExercise.exerciseId = lookup.libraryExercise?.id || '';
            nextExercise.category = lookup.knownExercise?.category || inferTrainingCategory(nextExercise.exerciseName, muscleGroupKey);
            if (patch.equipment === undefined && lookup.knownExercise?.equipment) {
              nextExercise.equipment = lookup.knownExercise.equipment;
            }
          }
          return nextExercise;
        }),
      };
    });
  };

  const activateExercise = (overrideName) => {
    if (!ongoingWorkout) return;
    const draft = ongoingWorkout.currentExerciseDraft || buildEmptyOngoingExerciseDraft();
    const nextName = `${overrideName || draft.exerciseName || ''}`.trim();
    if (!nextName) return;
    setExercisePickerMode('');
    const lookup = resolveKnownExercise(state.exercises, draft.exerciseId, nextName);
    const matchedExercise = lookup.knownExercise;
    const muscleGroupKey = resolveMuscleGroupWithOverrides(
      nextName,
      matchedExercise?.category || '',
      state.exerciseMuscleOverrides,
    );
    const category = matchedExercise?.category || inferTrainingCategory(nextName, muscleGroupKey);
    const equipmentValue = `${draft.equipment || matchedExercise?.equipment || ''}`.trim();
    const tempId = uid();
    updateOngoingWorkout((previous) => {
      if (!previous) return previous;
      const closedExercises = previous.activeExerciseId
        ? previous.exercises.map((ex) => (ex.tempId === previous.activeExerciseId ? { ...ex, status: 'completed' } : ex))
        : previous.exercises || [];
      const nextOrder = closedExercises.length + 1;
      return {
        ...previous,
        startedAt: (!previous.startedAt && closedExercises.length === 0) ? new Date().toISOString() : previous.startedAt,
        activeExerciseId: tempId,
        currentSetDraft: buildEmptyCurrentSetDraft(),
        currentExerciseDraft: buildEmptyOngoingExerciseDraft(),
        exercises: [
          ...closedExercises,
          {
            tempId,
            exerciseId: lookup.libraryExercise?.id || '',
            exerciseName: nextName,
            equipment: equipmentValue,
            category,
            order: nextOrder,
            notes: `${draft.notes || ''}`.trim(),
            status: 'active',
            setDetails: [],
          },
        ],
      };
    });
  };

  const resumeOngoingExercise = (tempId) => {
    setExercisePickerMode('');
    updateOngoingWorkout((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        activeExerciseId: tempId,
        currentSetDraft: buildEmptyCurrentSetDraft(),
        exercises: previous.exercises.map((exercise) => ({
          ...exercise,
          status: exercise.tempId === tempId ? 'active' : 'completed',
        })),
      };
    });
  };

  const closeActiveExercise = () => {
    setExercisePickerMode('');
    updateOngoingWorkout((previous) => {
      if (!previous || !previous.activeExerciseId) return previous;
      return {
        ...previous,
        activeExerciseId: '',
        currentSetDraft: buildEmptyCurrentSetDraft(),
        exercises: previous.exercises.map((exercise) => (
          exercise.tempId === previous.activeExerciseId
            ? { ...exercise, status: 'completed' }
            : exercise
        )),
      };
    });
  };

  const updateCurrentSetDraft = (patch) => {
    updateOngoingWorkout((previous) => (
      previous
        ? {
          ...previous,
          currentSetDraft: {
            ...previous.currentSetDraft,
            ...patch,
          },
        }
        : previous
    ));
  };

  const syncSetComposerFocus = () => {
    if (typeof document === 'undefined') return;
    const activeElement = document.activeElement;
    setSetComposerFocused(Boolean(activeElement && setFormRef.current?.contains(activeElement)));
  };

  const handleSetComposerInputFocus = (event) => {
    setSetComposerFocused(true);
    setTimeout(() => scrollIntoViewForCapture(event?.currentTarget || setFormRef.current), 40);
  };

  const handleSetComposerInputBlur = () => {
    setTimeout(syncSetComposerFocus, 0);
  };

  const handleRepsInputKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    focusWithoutScroll(loadInputRef.current);
  };

  const handleLoadInputKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    saveCurrentSet();
  };

  const saveCurrentSet = () => {
    updateOngoingWorkout((previous) => {
      if (!previous || !previous.activeExerciseId) return previous;
      const reps = toPositive(previous.currentSetDraft?.reps, 0);
      const load = toPositive(previous.currentSetDraft?.load, 0);
      const setNote = `${previous.currentSetDraft?.setNote || ''}`.trim();
      const editingSetIndex = previous.currentSetDraft?.editingSetIndex;
      if (reps <= 0 && load <= 0) return previous;
      const effectiveStartedAt = previous.startedAt || new Date().toISOString();
      return {
        ...previous,
        startedAt: effectiveStartedAt,
        currentSetDraft: buildEmptyCurrentSetDraft(),
        exercises: previous.exercises.map((exercise) => {
          if (exercise.tempId !== previous.activeExerciseId) return exercise;
          const existingSets = Array.isArray(exercise.setDetails) ? exercise.setDetails.slice() : [];
          const existingSet = editingSetIndex
            ? existingSets.find((row) => Number(row.setIndex || 0) === Number(editingSetIndex))
            : null;
          const loggedAt = `${existingSet?.loggedAt || new Date().toISOString()}`.trim();
          const nextSet = {
            setIndex: editingSetIndex || (existingSets.length + 1),
            reps,
            loadDisplayed: load,
            loadEstimated: null,
            loggedAt,
            elapsedSinceWorkoutStartSec: secondsBetween(loggedAt, effectiveStartedAt),
            restSincePreviousSetSec: existingSet?.restSincePreviousSetSec ?? null,
            timeLabel: existingSet?.timeLabel || toClockTimeLabel(loggedAt),
            setNote,
          };
          const mergedSets = editingSetIndex
            ? existingSets.map((row) => (Number(row.setIndex || 0) === Number(editingSetIndex) ? nextSet : row))
            : [...existingSets, nextSet];
          return {
            ...exercise,
            setDetails: finalizeExerciseSetDetails(mergedSets, effectiveStartedAt),
          };
        }),
      };
    });
    setTimeout(() => focusWithoutScroll(repsInputRef.current), 120);
  };

  const duplicateLastSetIntoDraft = () => {
    if (!activeOngoingExerciseLastSet) return;
    updateCurrentSetDraft({
      reps: `${activeOngoingExerciseLastSet.reps ?? ''}`,
      load: `${activeOngoingExerciseLastSet.loadDisplayed ?? activeOngoingExerciseLastSet.loadEstimated ?? ''}`,
      setNote: `${activeOngoingExerciseLastSet.setNote || ''}`,
      editingSetIndex: null,
    });
  };

  const editOngoingSet = (tempId, setIndex) => {
    updateOngoingWorkout((previous) => {
      if (!previous) return previous;
      const exercise = previous.exercises.find((row) => row.tempId === tempId);
      const setRow = exercise?.setDetails?.find((row) => Number(row.setIndex || 0) === Number(setIndex));
      if (!exercise || !setRow) return previous;
      return {
        ...previous,
        activeExerciseId: tempId,
        currentSetDraft: {
          reps: `${setRow.reps ?? ''}`,
          load: `${setRow.loadDisplayed ?? ''}`,
          setNote: `${setRow.setNote || ''}`,
          editingSetIndex: Number(setRow.setIndex || setIndex),
        },
        exercises: previous.exercises.map((row) => ({
          ...row,
          status: row.tempId === tempId ? 'active' : 'completed',
        })),
      };
    });
  };

  const removeOngoingSet = (tempId, setIndex) => {
    updateOngoingWorkout((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        currentSetDraft:
          previous.activeExerciseId === tempId && Number(previous.currentSetDraft?.editingSetIndex || 0) === Number(setIndex)
            ? buildEmptyCurrentSetDraft()
            : previous.currentSetDraft,
        exercises: previous.exercises.map((exercise) => {
          if (exercise.tempId !== tempId) return exercise;
          return {
            ...exercise,
            setDetails: finalizeExerciseSetDetails(
              (exercise.setDetails || [])
                .filter((row) => Number(row.setIndex || 0) !== Number(setIndex)),
              previous.startedAt,
            ),
          };
        }),
      };
    });
  };

  const removeOngoingExercise = (tempId) => {
    updateOngoingWorkout((previous) => {
      if (!previous) return previous;
      const nextExercises = previous.exercises
        .filter((exercise) => exercise.tempId !== tempId)
        .map((exercise, index) => ({ ...exercise, order: index + 1 }));
      return {
        ...previous,
        activeExerciseId: previous.activeExerciseId === tempId ? '' : previous.activeExerciseId,
        currentSetDraft: previous.activeExerciseId === tempId ? buildEmptyCurrentSetDraft() : previous.currentSetDraft,
        exercises: nextExercises,
      };
    });
  };

  const finalizeOngoingWorkout = () => {
    if (!ongoingWorkout) return;
    if (!ongoingWorkout.exercises?.length) {
      clearOngoingWorkoutDraft();
      setOngoingWorkout(null);
      setWorkoutStartForm(normalizeWorkoutDraftInput({ date: state.selectedDate }, state.selectedDate));
      return;
    }
    let nextExercisesLibrary = state.exercises;
    const workoutLabel = `${ongoingWorkout.workoutLabel || ''}`.trim() || 'Seance manuelle';
    const workoutId = `${ongoingWorkout.draftId || uid()}`.trim() || uid();
    const autoDurationSec = ongoingWorkout.startedAt
      ? secondsBetween(new Date().toISOString(), ongoingWorkout.startedAt)
      : null;
    const durationMin = `${ongoingWorkout.durationMin ?? ''}`.trim()
      ? toPositive(ongoingWorkout.durationMin, 0)
      : (
        autoDurationSec === null || autoDurationSec === undefined
          ? ongoingWorkoutAutoDurationMin
          : Math.max(1, Math.ceil(autoDurationSec / 60))
      );
    const sortedExercises = [...ongoingWorkout.exercises].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const nextSessions = sortedExercises.reduce((acc, exercise, index) => {
      const summary = summarizeExerciseSetDetails(exercise.setDetails, ongoingWorkout.startedAt);
      if (!summary.setCount) return acc;
      const resolution = resolveExerciseDraft({
        exercises: nextExercisesLibrary,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        equipmentValue: exercise.equipment,
        exerciseMuscleOverrides: state.exerciseMuscleOverrides,
        uid,
      });
      if (!resolution) return acc;
      nextExercisesLibrary = resolution.nextExercises;
      acc.push({
        id: uid(),
        date: ongoingWorkout.date || state.selectedDate,
        workoutId,
        workoutLabel,
        exerciseOrder: index + 1,
        exerciseId: resolution.exercise.id,
        exerciseName: resolution.exercise.name,
        equipment: resolution.equipment,
        category: resolution.category,
        durationMin,
        sets: summary.setCount,
        reps: summary.totalReps,
        load: summary.topLoad,
        notes: `${exercise.notes || ''}`.trim(),
        workoutNotes: `${ongoingWorkout.notes || ''}`.trim(),
        source: 'manual',
        sessionGroupId: workoutId,
        sessionGroupLabel: workoutLabel,
        setDetails: summary.setDetails,
      });
      return acc;
    }, []);
    if (!nextSessions.length) return;
    const nextState = {
      ...state,
      updatedAt: new Date().toISOString(),
      exercises: nextExercisesLibrary,
      sessions: [...state.sessions, ...nextSessions],
    };
    markPendingCriticalLocalMutation({
      kind: 'workout-finalize',
      updatedAt: nextState.updatedAt,
      source: 'training.finalize',
      workout: {
        workoutId,
        workoutLabel,
        date: ongoingWorkout.date || state.selectedDate,
        durationMin,
        sessionCount: nextSessions.length,
        sessions: nextSessions,
      },
    });
    const persisted = persistDashboardState(nextState);
    if (!persisted) return;
    replaceState(nextState);
    clearOngoingWorkoutDraft();
    setOngoingWorkout(null);
    setWorkoutStartForm(normalizeWorkoutDraftInput({ date: state.selectedDate }, state.selectedDate));
  };

  const removeSession = (session) => {
    if (session?.source === 'cycle-log') {
      setState((prev) => ({ ...prev, cycleLogs: prev.cycleLogs.filter((s) => s.id !== session.id) }));
      return;
    }
    setState((prev) => ({ ...prev, sessions: prev.sessions.filter((s) => s.id !== session.id) }));
  };

  const updateWorkout = (workout, patch) => {
    if (!workout || !patch) return;
    const workoutKey = `${workout.workoutId || workout.id || ''}`.trim();
    if (!workoutKey) return;
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((row) => {
        if (row?.source === 'cycle-log') return row;
        const rowWorkoutKey = `${row.workoutId || row.sessionGroupId || ''}`.trim();
        if (rowWorkoutKey !== workoutKey) return row;
        const nextWorkoutLabel = `${patch.workoutLabel ?? row.workoutLabel ?? row.sessionGroupLabel ?? workout.title ?? ''}`.trim() || 'Seance manuelle';
        return {
          ...row,
          date: `${patch.date || row.date || workout.date || state.selectedDate}`,
          workoutId: workoutKey,
          workoutLabel: nextWorkoutLabel,
          sessionGroupId: workoutKey,
          sessionGroupLabel: nextWorkoutLabel,
          durationMin:
            `${patch.durationMin ?? ''}`.trim() === ''
              ? null
              : toPositive(patch.durationMin, toPositive(row.durationMin, 0)),
          workoutNotes: `${patch.workoutNotes ?? row.workoutNotes ?? ''}`.trim(),
        };
      }),
    }));
  };

  const updateSession = (session, patch) => {
    if (!session || !patch || session?.source === 'cycle-log') return;
    setState((prev) => ({
      ...prev,
      ...(() => {
        const resolution = resolveExerciseDraft({
          exercises: prev.exercises,
          exerciseId: patch.exerciseId ?? session.exerciseId,
          exerciseName: patch.exerciseName ?? session.exerciseName,
          equipmentValue: patch.equipment ?? session.equipment,
          exerciseMuscleOverrides: prev.exerciseMuscleOverrides,
          uid,
        });
        const nextExercises = resolution?.nextExercises || prev.exercises;
        return {
          exercises: nextExercises,
          sessions: prev.sessions.map((row) => {
            const currentWorkoutKey = session.workoutId || session.sessionGroupId;
            const nextDate = `${patch.date || session.date || state.selectedDate}`;
            const nextWorkoutLabel = `${patch.workoutLabel ?? session.workoutLabel ?? session.sessionGroupLabel ?? ''}`.trim() || 'Seance manuelle';
            const nextWorkoutId = `${currentWorkoutKey || session.workoutId || session.sessionGroupId || uid()}`;
            const nextDurationMin = `${patch.durationMin ?? ''}`.trim() === ''
              ? null
              : toPositive(patch.durationMin, toPositive(row.durationMin, 0));
            const belongsToWorkout = (row.workoutId || row.sessionGroupId) === currentWorkoutKey;

            if (!belongsToWorkout && row.id !== session.id) return row;

            const baseRow = {
              ...row,
              date: nextDate,
              workoutId: nextWorkoutId,
              workoutLabel: nextWorkoutLabel,
              sessionGroupId: nextWorkoutId,
              sessionGroupLabel: nextWorkoutLabel,
              durationMin: nextDurationMin,
              workoutNotes: `${patch.workoutNotes ?? row.workoutNotes ?? ''}`.trim(),
            };

            if (row.id !== session.id) return baseRow;

            const currentSets = sessionSets(row);
            const currentReps = sessionReps(row);
            const currentLoad = sessionTopLoad(row);
            const detailedPatchSummary = Array.isArray(patch.setDetails)
              ? summarizeExerciseSetDetails(patch.setDetails)
              : null;
            const nextSets = toPositive(patch.sets, currentSets);
            const nextReps = toPositive(patch.reps, currentReps);
            const nextLoad = toPositive(patch.load, currentLoad);
            const nextNotes = `${patch.notes ?? row.notes ?? ''}`.trim();

            const updated = {
              ...baseRow,
              exerciseId: resolution?.exercise?.id || row.exerciseId,
              exerciseName: resolution?.exercise?.name || row.exerciseName,
              equipment: resolution?.equipment ?? `${patch.equipment ?? row.equipment ?? ''}`.trim(),
              category: resolution?.category || row.category,
              sets: nextSets,
              reps: nextReps,
              load: nextLoad,
              notes: nextNotes,
            };

            if (detailedPatchSummary?.setDetails?.length) {
              updated.sets = detailedPatchSummary.setCount;
              updated.reps = detailedPatchSummary.totalReps;
              updated.load = detailedPatchSummary.topLoad;
              updated.setDetails = detailedPatchSummary.setDetails;
            } else if (Array.isArray(row.setDetails) && row.setDetails.length > 0) {
              const structureChanged = nextSets !== currentSets || nextReps !== currentReps || nextLoad !== currentLoad;
              updated.setDetails = structureChanged ? buildUniformSetDetails(nextSets, nextReps, nextLoad) : row.setDetails;
            }

            return updated;
          }),
        };
      })(),
    }));
  };

  const analyzePastedWorkout = () => {
    if (!pasteText.trim()) {
      setParseStatus('Colle un texte de seance avant analyse.');
      setParsedWorkout(null);
      return;
    }
    const parsed = parseWorkoutText(pasteText, state.selectedDate);
    if (!parsed.exercises.length) {
      setParseStatus('Aucune serie detectee. Verifie le format du texte colle.');
      setParsedWorkout(null);
      return;
    }
    setParsedWorkout(parsed);
    setParseStatus(`Analyse OK: ${parsed.exercises.length} exercice(s), ${parsed.exercises.reduce((acc, ex) => acc + ex.sets.length, 0)} serie(s).`);
  };

  const importParsedWorkout = () => {
    if (!parsedWorkout || !parsedWorkout.exercises.length) return;

    setState((prev) => {
      const workoutId = uid();
      const importedRows = parsedWorkout.exercises.map((exercise, index) => {
        const topDisplayed = exercise.sets.reduce((max, setRow) => Math.max(max, setRow.loadDisplayed || 0), 0);
        const totalReps = exercise.sets.reduce((acc, setRow) => acc + (setRow.reps || 0), 0);
        const lookup = resolveKnownExercise(prev.exercises, '', exercise.name);
        const canonicalName = lookup.knownExercise?.name || exercise.name;
        const muscleGroupKey = resolveMuscleGroupWithOverrides(canonicalName, '', prev.exerciseMuscleOverrides);
        return {
          id: uid(),
          date: parsedWorkout.date,
          workoutId,
          workoutLabel: parsedWorkout.title,
          exerciseOrder: index + 1,
          exerciseId: `import-${uid()}`,
          exerciseName: canonicalName,
          equipment: 'Imported',
          category: inferTrainingCategory(canonicalName, muscleGroupKey),
          sets: exercise.sets.length,
          reps: totalReps,
          load: topDisplayed,
          notes: parsedWorkout.title,
          source: 'text-session-import',
          sessionTitle: parsedWorkout.title,
          sessionGroupId: workoutId,
          sessionGroupLabel: parsedWorkout.title,
          durationMin: parsedWorkout.durationMin ?? null,
          setDetails: exercise.sets,
        };
      });
      return {
        ...prev,
        sessions: [...prev.sessions, ...importedRows],
      };
    });

    setParseStatus('Seance importee dans le journal training.');
    setPasteText('');
    setQuickSessionText('');
    setParsedWorkout(null);
  };

  const importCompactWorkout = () => {
    const parsed = parseCompactWorkout(quickSessionText, state.selectedDate);
    if (!parsed || !parsed.exercises.length) {
      setParseStatus('Format compact invalide. Exemple: Pecs: Bench 4x8x80; Incline 3x10x26');
      return;
    }
    setParsedWorkout(parsed);
    setParseStatus(`Format compact detecte: ${parsed.exercises.length} exercice(s). Clique Importer.`);
  };

  const selectedDayMuscles = useMemo(
    () => rankWorkedMuscleGroups(sessionsForSelectedDay, state.exerciseMuscleOverrides, { limit: 3 }),
    [sessionsForSelectedDay, state.exerciseMuscleOverrides],
  );

  const sessionsSummary = useMemo(() => {
    const totalSets = sessionsForSelectedDay.reduce((acc, session) => acc + sessionSets(session), 0);
    const totalReps = sessionsForSelectedDay.reduce((acc, session) => acc + sessionReps(session), 0);
    const totalVolume = sessionsForSelectedDay.reduce((acc, session) => acc + sessionVolume(session), 0);
    const topLoad = sessionsForSelectedDay.reduce((max, session) => Math.max(max, sessionTopLoad(session)), 0);
    const sessionDuration = workoutsForSelectedDay.reduce((sum, workout) => sum + Number(workout.durationMin || 0), 0);
    return {
      workoutCount: workoutsForSelectedDay.length,
      exerciseCount: new Set(sessionsForSelectedDay.map((session) => session.exerciseName)).size,
      totalSets,
      totalReps,
      totalVolume,
      topLoad,
      sessionDuration,
      primaryMuscles: selectedDayMuscles,
      primaryMusclesLabel: selectedDayMuscles.length ? formatMuscleFocus(selectedDayMuscles) : 'Repos',
    };
  }, [selectedDayMuscles, sessionsForSelectedDay, workoutsForSelectedDay]);

  const todayPrCount = useMemo(() => {
    if (!sessionsForSelectedDay.length) return 0;
    const perExerciseToday = new Map();
    sessionsForSelectedDay.forEach((session) => {
      const key = session.exerciseName || 'Exercice';
      const top = sessionTopLoad(session);
      perExerciseToday.set(key, Math.max(perExerciseToday.get(key) || 0, top));
    });

    let hits = 0;
    perExerciseToday.forEach((todayTop, exerciseName) => {
      const previousBest = (state.sessions || [])
        .filter((row) => row.date < state.selectedDate && row.exerciseName === exerciseName)
        .reduce((max, row) => Math.max(max, sessionTopLoad(row)), 0);
      if (todayTop > 0 && todayTop > previousBest) hits += 1;
    });
    return hits;
  }, [sessionsForSelectedDay, state.selectedDate, state.sessions]);

  const ongoingExercisesSorted = useMemo(
    () => [...(ongoingWorkout?.exercises || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [ongoingWorkout],
  );

  const activeOngoingExerciseLastSet = useMemo(() => {
    if (!activeOngoingExercise) return null;
    const setDetails = Array.isArray(activeOngoingExercise.setDetails) ? activeOngoingExercise.setDetails : [];
    if (!setDetails.length) return null;
    return setDetails[setDetails.length - 1] || null;
  }, [activeOngoingExercise]);

  const activeOngoingExerciseFocusLabel = useMemo(() => {
    if (!activeOngoingExercise?.exerciseName) return '';
    const muscleGroupKey = resolveMuscleGroupWithOverrides(
      activeOngoingExercise.exerciseName,
      activeOngoingExercise.category || '',
      state.exerciseMuscleOverrides,
    );
    return MUSCLE_GROUPS.find((item) => item.value === muscleGroupKey)?.label || 'Autres';
  }, [activeOngoingExercise?.category, activeOngoingExercise?.exerciseName, state.exerciseMuscleOverrides]);

  const liveNowIso = useMemo(() => new Date(liveNowMs).toISOString(), [liveNowMs]);

  const ongoingWorkoutElapsedSec = useMemo(() => {
    if (!ongoingWorkout?.startedAt) return null;
    return secondsBetween(liveNowIso, ongoingWorkout.startedAt);
  }, [liveNowIso, ongoingWorkout?.startedAt]);

  const ongoingWorkoutAutoDurationMin = useMemo(() => {
    if (ongoingWorkoutElapsedSec === null || ongoingWorkoutElapsedSec === undefined) return null;
    return Math.max(1, Math.ceil(ongoingWorkoutElapsedSec / 60));
  }, [ongoingWorkoutElapsedSec]);

  const activeOngoingExerciseNextSetIndex = useMemo(
    () => Math.max(1, Number(activeOngoingExercise?.setDetails?.length || 0) + 1),
    [activeOngoingExercise?.setDetails?.length],
  );

  const activeOngoingExerciseCurrentRestSec = useMemo(() => {
    if (!activeOngoingExerciseLastSet?.loggedAt) return null;
    return secondsBetween(liveNowIso, activeOngoingExerciseLastSet.loggedAt);
  }, [activeOngoingExerciseLastSet?.loggedAt, liveNowIso]);

  const canFinalizeOngoingWorkout = ongoingExercisesSorted.some((exercise) => (exercise.setDetails || []).length > 0);
  const canCloseOngoingWorkout = canFinalizeOngoingWorkout && !activeOngoingExercise;
  const canActivateDraftExercise = Boolean(
    !activeOngoingExercise && `${ongoingWorkout?.currentExerciseDraft?.exerciseName || ''}`.trim(),
  );
  const setActionPrimaryLabel = ongoingWorkout?.currentSetDraft?.editingSetIndex
    ? 'Mettre a jour la serie'
    : 'Ajouter la serie';
  const activeExerciseEquipmentLabel = activeOngoingExercise?.equipment || ongoingWorkout?.currentExerciseDraft?.equipment || 'Materiel libre';
  const activeOngoingExerciseSetCount = Number(activeOngoingExercise?.setDetails?.length || 0);
  const activeExerciseRestLabel = activeOngoingExerciseCurrentRestSec === null
    ? '-'
    : formatDurationShort(activeOngoingExerciseCurrentRestSec);
  const activeExerciseLastRestLabel = activeOngoingExerciseLastSet?.restSincePreviousSetSec === null
    || activeOngoingExerciseLastSet?.restSincePreviousSetSec === undefined
    ? '-'
    : formatDurationShort(activeOngoingExerciseLastSet.restSincePreviousSetSec);
  const activeExerciseLastSetClockLabel = activeOngoingExerciseLastSet?.loggedAt
    ? toClockTimeLabelWithSeconds(activeOngoingExerciseLastSet.loggedAt)
    : (`${activeOngoingExerciseLastSet?.timeLabel || ''}`.trim() || '-');
  const activeExerciseSetCountLabel = `${activeOngoingExerciseSetCount} serie${activeOngoingExerciseSetCount > 1 ? 's' : ''} loggee${activeOngoingExerciseSetCount > 1 ? 's' : ''}`;
  const activeExerciseLastSetCompactLabel = activeOngoingExerciseLastSet
    ? `${Number(activeOngoingExerciseLastSet.reps || 0)} x ${Number(activeOngoingExerciseLastSet.loadDisplayed || activeOngoingExerciseLastSet.loadEstimated || 0).toFixed(1)} kg`
    : 'Derniere -';
  const activeExerciseLastSetLabel = activeOngoingExerciseLastSet
    ? formatSetDraftLabel(activeOngoingExerciseLastSet)
    : 'Aucune serie loggee';
  const completedOngoingExercises = useMemo(
    () => ongoingExercisesSorted.filter((exercise) => exercise.tempId !== ongoingWorkout?.activeExerciseId),
    [ongoingExercisesSorted, ongoingWorkout?.activeExerciseId],
  );

  const progression = useMemo(() => {
    const end = parseIso(state.selectedDate);
    const start = new Date(end);
    start.setDate(end.getDate() - (windowDays - 1));

    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(toIso(new Date(d)));
    }

    const sessions = getSessionsForWindow(state, days)
      .filter((session) => {
        const shares = resolveSessionShares(session);
        return Number(shares[muscleGroup] || 0) > 0;
      })
      .filter((session) => {
        const d = parseIso(session.date);
        return d >= start && d <= end;
      })
      .sort((a, b) => `${a.date}`.localeCompare(`${b.date}`));

    const exerciseOptions = Array.from(new Set(sessions.map((session) => session.exerciseName || 'Exercice'))).sort((a, b) => a.localeCompare(b, 'fr'));
    const filteredSessions = focusExercise === 'all'
      ? sessions
      : sessions.filter((session) => (session.exerciseName || 'Exercice') === focusExercise);
    const timingSessionsByGroupKey = filteredSessions.reduce((acc, session) => {
      const key = resolveSessionGroupKey(session);
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key).push(session);
      return acc;
    }, new Map());
    const timingByGroupKey = new Map(
      Array.from(timingSessionsByGroupKey.entries()).map(([key, rows]) => [key, summarizeWorkoutTiming(rows)]),
    );

    const previousPerExercise = new Map();
    const sessionRows = filteredSessions
      .slice()
      .sort((a, b) => {
        const dateOrder = `${a.date}`.localeCompare(`${b.date}`);
        if (dateOrder !== 0) return dateOrder;
        return `${a.exerciseName || ''}`.localeCompare(`${b.exerciseName || ''}`);
      })
      .map((session, index) => {
        const exerciseName = session.exerciseName || 'Exercice';
        const topLoad = sessionTopLoad(session);
        const volume = sessionVolume(session);
        const e1rm = estimateE1rm(session);
        const sets = sessionSets(session);
        const reps = sessionReps(session);
        const previous = previousPerExercise.get(exerciseName) || null;
        const sessionGroupKey = resolveSessionGroupKey(session);
        const sessionGroupLabel = resolveSessionGroupLabel(session);
        const deltaTop = previous ? topLoad - previous.topLoad : null;
        const deltaE1rm = previous ? e1rm - previous.e1rm : null;
        const cumulativeVolume = Number(previous?.cumulativeVolume || 0) + volume;
        const isNewPr = Boolean(previous) && topLoad > Number(previous.bestTop || 0);
        previousPerExercise.set(exerciseName, {
          topLoad,
          e1rm,
          bestTop: Math.max(Number(previous?.bestTop || 0), topLoad),
          cumulativeVolume,
        });
        return {
          id: session.id || `${session.date}-${exerciseName}-${index}`,
          date: session.date,
          exerciseName,
          sessionGroupKey,
          sessionGroupLabel,
          sets,
          reps,
          topLoad,
          e1rm,
          volume,
          deltaTop,
          deltaE1rm,
          cumulativeVolume,
          isNewPr,
        };
      });

    const summaryByDate = new Map();
    sessionRows.forEach((row) => {
        const prev = summaryByDate.get(row.sessionGroupKey) || {
          id: row.sessionGroupKey,
          date: row.date,
          sessionGroupKey: row.sessionGroupKey,
          sessionLabel: row.sessionGroupLabel,
          exerciseNames: [],
          startedAt: timingByGroupKey.get(row.sessionGroupKey)?.startedAt || null,
          endedAt: timingByGroupKey.get(row.sessionGroupKey)?.endedAt || null,
          durationSec: timingByGroupKey.get(row.sessionGroupKey)?.durationSec ?? null,
          sets: 0,
          reps: 0,
          topLoad: 0,
        e1rm: 0,
        volume: 0,
        prCount: 0,
      };
      const exerciseNames = prev.exerciseNames.includes(row.exerciseName)
        ? prev.exerciseNames
        : [...prev.exerciseNames, row.exerciseName];
      summaryByDate.set(row.sessionGroupKey, {
        ...prev,
        exerciseNames,
        sets: prev.sets + row.sets,
        reps: prev.reps + row.reps,
        topLoad: Math.max(prev.topLoad, row.topLoad),
        e1rm: Math.max(prev.e1rm, row.e1rm),
        volume: prev.volume + row.volume,
        prCount: prev.prCount + (row.isNewPr ? 1 : 0),
      });
    });

    let previousSummary = null;
    const sessionSummaryRows = Array.from(summaryByDate.values())
      .sort((a, b) => a.date.localeCompare(b.date) || `${a.sessionLabel}`.localeCompare(`${b.sessionLabel}`))
      .map((row, index) => {
        const deltaTop = previousSummary ? row.topLoad - previousSummary.topLoad : null;
        const deltaVolume = previousSummary ? row.volume - previousSummary.volume : null;
        const deltaE1rm = previousSummary ? row.e1rm - previousSummary.e1rm : null;
        const exercisePreview = row.exerciseNames.length <= 2
          ? row.exerciseNames.join(', ')
          : `${row.exerciseNames.slice(0, 2).join(', ')} +${row.exerciseNames.length - 2}`;
        const summary = {
          ...row,
          chartKey: `${row.date}#${index + 1}`,
          exercisePreview,
          deltaTop,
          deltaVolume,
          deltaE1rm,
        };
        previousSummary = summary;
        return summary;
      });

    const byExercise = new Map();
    sessionRows.forEach((row) => {
      const key = row.exerciseName || 'Exercice';
      const top = row.topLoad;
      const vol = row.volume;
      const e1rm = row.e1rm;
      const prev = byExercise.get(key) || {
        name: key,
        topFirst: null,
        topLast: null,
        topPr: 0,
        e1rmBest: 0,
        volumeTotal: 0,
        sessions: 0,
        lastDate: '',
      };
      byExercise.set(key, {
        name: key,
        topFirst: prev.topFirst === null ? top : prev.topFirst,
        topLast: top,
        topPr: Math.max(prev.topPr, top),
        e1rmBest: Math.max(prev.e1rmBest, e1rm),
        volumeTotal: prev.volumeTotal + vol,
        sessions: prev.sessions + 1,
        lastDate: row.date,
      });
    });
    const exercises = Array.from(byExercise.values())
      .sort((a, b) => b.topPr - a.topPr || b.volumeTotal - a.volumeTotal)
      .slice(0, 10);

    const sessionChartRows = sessionSummaryRows.map((row) => ({
      key: row.chartKey,
      baseDate: row.date,
      label: row.date,
      detailLabel: row.sessionLabel === row.date ? row.exercisePreview : `${row.date} | ${row.sessionLabel}`,
      topLoad: row.topLoad,
      volume: row.volume,
      e1rm: row.e1rm,
    }));

    const exerciseChartRows = sessionRows.map((row, index) => ({
      key: `${row.date}#${index + 1}`,
      baseDate: row.date,
      label: row.date,
      detailLabel: `${row.date} | ${row.exerciseName}`,
      topLoad: row.topLoad,
      volume: row.volume,
      e1rm: row.e1rm,
    }));

    const chartLabelMap = {
      session: Object.fromEntries(sessionChartRows.map((row) => [row.key, row.label])),
      exercise: Object.fromEntries(exerciseChartRows.map((row) => [row.key, row.label])),
    };

    const chartDetailMap = {
      session: Object.fromEntries(sessionChartRows.map((row) => [row.key, row.detailLabel])),
      exercise: Object.fromEntries(exerciseChartRows.map((row) => [row.key, row.detailLabel])),
    };

    return {
      start: toIso(start),
      end: toIso(end),
      sessions,
      filteredSessions,
      exercises,
      sessionRows,
      sessionSummaryRows,
      sessionChartRows,
      exerciseChartRows,
      chartLabelMap,
      chartDetailMap,
      exerciseOptions,
    };
  }, [focusExercise, muscleGroup, state, state.selectedDate, windowDays]);

  useEffect(() => {
    if (focusExercise === 'all') return;
    if (!progression.exerciseOptions.includes(focusExercise)) {
      setPageUi((prev) => ({ ...prev, focusExercise: 'all' }));
    }
  }, [focusExercise, progression.exerciseOptions, setPageUi]);

  const muscleHeatmap = useMemo(() => {
    const groups = MUSCLE_GROUPS.map((group) => group.value).filter((g) => g !== 'other');
    const selected = parseIso(state.selectedDate);
    const weekStart = new Date(selected);
    const dow = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - dow);

    const weeks = [];
    for (let i = heatmapWeeks - 1; i >= 0; i -= 1) {
      const start = new Date(weekStart);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const days = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(toIso(new Date(d)));
      }

      const sessions = getSessionsForWindow(state, days);
      const values = Object.fromEntries(groups.map((g) => [g, 0]));
      sessions.forEach((session) => {
        const shares = resolveSessionShares(session);
        const base = heatmapMetric === 'volume' ? sessionVolume(session) : sessionSets(session);
        groups.forEach((group) => {
          values[group] += base * Number(shares[group] || 0);
        });
      });
      const startIso = toIso(start);
      const endIso = toIso(end);
      weeks.push({
        id: startIso,
        startIso,
        endIso,
        label: `${formatDateShort(startIso)}-${formatDateShort(endIso)}`,
        values,
      });
    }

    const max = weeks.reduce((acc, week) => {
      const local = Math.max(...groups.map((g) => week.values[g] || 0), 0);
      return Math.max(acc, local);
    }, 1);

    return {
      weeks,
      groups,
      max,
      start: weeks[0]?.startIso || '-',
      end: weeks[weeks.length - 1]?.endIso || '-',
    };
  }, [heatmapMetric, heatmapWeeks, state, state.selectedDate]);

  const sessionSummaryRowsForTable = useMemo(() => {
    if (!progression.sessionSummaryRows.length) return [];
    const start = Math.max(progression.sessionSummaryRows.length - progressRowsLimit, 0);
    return progression.sessionSummaryRows.slice(start).reverse();
  }, [progressRowsLimit, progression.sessionSummaryRows]);

  const exerciseRowsForTable = useMemo(() => {
    if (!progression.sessionRows.length) return [];
    const start = Math.max(progression.sessionRows.length - Math.min(progressRowsLimit, 20), 0);
    return progression.sessionRows.slice(start).reverse();
  }, [progressRowsLimit, progression.sessionRows]);

  const progressChartRows = useMemo(
    () => (progressView === 'exercise' ? progression.exerciseChartRows : progression.sessionChartRows),
    [progressView, progression.exerciseChartRows, progression.sessionChartRows],
  );

  const renderExercisePicker = ({
    mode,
    value,
    onChange,
    onSelect,
    suggestions,
  }) => {
    const pickerOpen = exercisePickerMode === mode;
    return (
      <>
        <div className={styles.trainingPickerRow}>
          <input
            className={styles.input}
            placeholder="Exercice (libre ou existant)"
            value={value}
            onFocus={() => setExercisePickerMode(mode)}
            onChange={(event) => {
              onChange(event.target.value);
              if (exercisePickerMode !== mode) setExercisePickerMode(mode);
            }}
          />
          <button
            className={styles.buttonGhost}
            type="button"
            onClick={() => setExercisePickerMode((previous) => (previous === mode ? '' : mode))}
          >
            {pickerOpen ? 'Fermer liste' : 'Choisir exo'}
          </button>
        </div>
        {pickerOpen ? (
          <div className={styles.trainingSuggestionCard}>
            <div className={styles.trainingSuggestionHead}>
              <strong>{value ? `Suggestions pour ${value}` : 'Bibliotheque + presets'}</strong>
              <span className={styles.smallMuted}>{suggestions.length} exo(s)</span>
            </div>
            <div className={styles.trainingSuggestionList}>
              {suggestions.map((name) => {
                const knownExercise = resolveKnownExercise(state.exercises, '', name).knownExercise;
                return (
                  <button
                    key={`${mode}-${name}`}
                    className={styles.trainingSuggestionButton}
                    type="button"
                    onClick={() => {
                      onSelect(name);
                      setExercisePickerMode('');
                    }}
                  >
                    <span>{name}</span>
                    <span className={styles.trainingSuggestionMeta}>
                      {knownExercise?.equipment || 'Materiel libre'} | {knownExercise?.category || 'Categorie auto'}
                    </span>
                  </button>
                );
              })}
              {!suggestions.length ? (
                <div className={styles.smallMuted}>Aucun exo ne matche. Continue a taper ou saisis librement.</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </>
    );
  };

  const blocks = [
    {
      id: 'log',
      label: 'Journal',
      defaultSpan: 12,
      render: () => (
        <>
          <section className={`${styles.card} ${styles.trainingCaptureShell}`}>
            {!ongoingWorkout ? (
              <>
                <h2>Logger la seance</h2>
              </>
            ) : null}
            {!ongoingWorkout ? (
              <form className={styles.formGrid} onSubmit={startOngoingWorkout}>
                <input className={styles.input} type="date" value={workoutStartForm.date} onChange={(e) => setWorkoutStartForm((prev) => ({ ...prev, date: e.target.value }))} />
                <input className={styles.input} placeholder="Nom du workout (optionnel)" value={workoutStartForm.workoutLabel} onChange={(e) => setWorkoutStartForm((prev) => ({ ...prev, workoutLabel: e.target.value }))} />
                <input className={styles.input} type="number" inputMode="numeric" placeholder="Duree min (override optionnel)" value={workoutStartForm.durationMin} onChange={(e) => setWorkoutStartForm((prev) => ({ ...prev, durationMin: e.target.value }))} />
                <input className={styles.input} placeholder="Notes workout" value={workoutStartForm.notes} onChange={(e) => setWorkoutStartForm((prev) => ({ ...prev, notes: e.target.value }))} />
                <button className={styles.button} type="submit">Demarrer workout</button>
              </form>
            ) : (
              <div className={styles.trainingCaptureStack}>
                <article
                  className={`${styles.card} ${styles.trainingCaptureCard} ${styles.trainingWorkoutCard} ${showWorkoutMeta ? styles.trainingWorkoutCardOpen : ''}`}
                >
                  <div className={`${styles.sectionHead} ${styles.trainingWorkoutHead}`}>
                    <div>
                      <h3>1. Seance en cours</h3>
                      <p className={styles.smallMuted}>
                        {ongoingWorkout.workoutLabel || 'Seance manuelle'} | {ongoingWorkoutSummary.exerciseCount} exo | {ongoingWorkoutSummary.totalSets} sets | {ongoingWorkoutSummary.totalReps} reps
                      </p>
                    </div>
                    <span className={`${styles.stateChip} ${styles.statehaut}`}>ongoing local</span>
                  </div>
                  <div className={styles.trainingChronoBar}>
                    <span className={styles.trainingMetaPill}>Depart {toClockTimeLabel(ongoingWorkout.startedAt) || '--:--'}</span>
                    <span className={styles.trainingMetaPill}>Chrono {ongoingWorkout.startedAt ? formatDurationShort(ongoingWorkoutElapsedSec) : '--:--'}</span>
                    <span className={styles.trainingMetaPill}>
                      {`${ongoingWorkout.durationMin ?? ''}`.trim() ? `${ongoingWorkout.durationMin} min` : `${ongoingWorkoutAutoDurationMin ?? '-'} min`}
                    </span>
                    {!ongoingWorkout.startedAt && (
                      <button type="button" className={`${styles.button} ${styles.trainingPrimaryButton}`} onClick={() => updateWorkoutField('startedAt', new Date().toISOString())}>Demarrer chrono</button>
                    )}
                    <button type="button" className={styles.trainingMetaToggle} onClick={() => setShowWorkoutMeta((v) => !v)}>
                      {showWorkoutMeta ? 'Masquer details' : 'Details workout'}
                    </button>
                  </div>
                  {!canCloseOngoingWorkout && activeOngoingExercise ? (
                    <p className={styles.smallMuted} style={{ marginTop: '0.55rem' }}>
                      Cloture d abord l exercice actif, puis la seance si besoin.
                    </p>
                  ) : null}
                  <div className={`${styles.formGrid} ${showWorkoutMeta ? styles.trainingWorkoutMetaOpen : styles.trainingWorkoutMeta}`}>
                    <input className={styles.input} type="date" value={ongoingWorkout.date} onChange={(e) => updateWorkoutField('date', e.target.value)} />
                    <input className={styles.input} placeholder="Nom du workout (optionnel)" value={ongoingWorkout.workoutLabel} onChange={(e) => updateWorkoutField('workoutLabel', e.target.value)} />
                    <input className={styles.input} type="number" inputMode="numeric" placeholder="Duree min (laisser vide = auto)" value={ongoingWorkout.durationMin} onChange={(e) => updateWorkoutField('durationMin', e.target.value)} />
                    <input className={styles.input} placeholder="Notes workout" value={ongoingWorkout.notes} onChange={(e) => updateWorkoutField('notes', e.target.value)} />
                  </div>
                  {!compactMobileCaptureUi ? (
                    <div className={`${styles.trainingActionRow} ${styles.trainingWorkoutActions}`}>
                      {canCloseOngoingWorkout ? (
                        <button
                          className={`${styles.button} ${styles.trainingPrimaryButton}`}
                          type="button"
                          onClick={finalizeOngoingWorkout}
                        >
                          Cloturer la seance
                        </button>
                      ) : null}
                      <button className={`${styles.buttonGhost} ${styles.buttonDanger}`} type="button" onClick={abandonOngoingWorkout}>Annuler workout</button>
                    </div>
                  ) : null}
                </article>

                <article
                  ref={exercisePickerRef}
                  className={`${styles.card} ${styles.trainingCaptureCard} ${styles.trainingExerciseCard} ${compactMobileCaptureUi && activeOngoingExercise ? styles.trainingExerciseCardActive : ''}`}
                >
                  <div className={`${styles.sectionHead} ${styles.trainingExoHead}`}>
                    <div>
                      <h3>{activeOngoingExercise ? '2. Exercice en cours' : '2. Choisir le prochain exercice'}</h3>
                      {!compactMobileCaptureUi ? (
                        <p className={styles.smallMuted}>
                          {activeOngoingExercise
                            ? 'Choisis l exo, ajuste si besoin le materiel, puis enchaine tes series dans ce meme bloc jusqu a `Cloturer l exercice`.'
                            : 'Flow vise: exo -> serie -> serie -> cloturer exo -> exo suivant. La categorie ne bloque plus la saisie.'}
                        </p>
                      ) : null}
                    </div>
                    {activeOngoingExercise ? <span className={`${styles.stateChip} ${styles.stateok}`}>actif</span> : null}
                  </div>

                  {!compactMobileCaptureUi || !activeOngoingExercise ? (
                    <div className={styles.formGrid}>
                      {renderExercisePicker({
                        mode: activeOngoingExercise ? 'active' : 'draft',
                        value: activeOngoingExercise ? activeOngoingExercise.exerciseName : (ongoingWorkout.currentExerciseDraft?.exerciseName || ''),
                        onChange: (nextName) => (
                          activeOngoingExercise
                            ? updateActiveExercise({ exerciseName: nextName })
                            : updateCurrentExerciseDraft({ exerciseName: nextName })
                        ),
                        onSelect: (name) => (
                          activeOngoingExercise
                            ? activateExercise(name)
                            : updateCurrentExerciseDraft({ exerciseName: name })
                        ),
                        suggestions: activeOngoingExercise ? activeExerciseSuggestions : draftExerciseSuggestions,
                      })}
                      <select
                        className={`${styles.select} ${styles.trainingExoFields}`}
                        value={activeOngoingExercise ? activeOngoingExercise.equipment : (ongoingWorkout.currentExerciseDraft?.equipment || '')}
                        onChange={(e) => (
                          activeOngoingExercise
                            ? updateActiveExercise({ equipment: e.target.value })
                            : updateCurrentExerciseDraft({ equipment: e.target.value })
                        )}
                      >
                        <option value="">Materiel exercice</option>
                        {equipment.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <input
                        className={`${styles.input} ${styles.trainingExoFields}`}
                        placeholder="Notes exercice"
                        value={activeOngoingExercise ? (activeOngoingExercise.notes || '') : (ongoingWorkout.currentExerciseDraft?.notes || '')}
                        onChange={(e) => (
                          activeOngoingExercise
                            ? updateActiveExercise({ notes: e.target.value })
                            : updateCurrentExerciseDraft({ notes: e.target.value })
                        )}
                      />
                      {!activeOngoingExercise && !compactMobileCaptureUi ? (
                        <button className={`${styles.button} ${styles.trainingPrimaryButton}`} type="button" onClick={() => activateExercise()}>
                          Activer l exercice
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {!compactMobileCaptureUi ? (
                    <div className={`${styles.trainingPillRow} ${styles.trainingExoPills}`}>
                      <span className={styles.trainingMetaPill}>
                        Materiel: {activeOngoingExercise?.equipment || ongoingWorkout.currentExerciseDraft?.equipment || 'auto / libre'}
                      </span>
                      <span className={styles.trainingMetaPill}>
                        Focus: {activeOngoingExercise ? activeOngoingExerciseFocusLabel : currentExerciseDraftFocusLabel || '-'}
                      </span>
                      {activeOngoingExercise ? (
                        <span className={styles.trainingMetaPill}>Serie suivante: #{activeOngoingExerciseNextSetIndex}</span>
                      ) : null}
                      {activeOngoingExercise ? (
                        <span className={styles.trainingMetaPill}>
                          Repos actuel: {activeOngoingExerciseCurrentRestSec === null ? '-' : formatDurationShort(activeOngoingExerciseCurrentRestSec)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {!activeOngoingExercise && compactMobileCaptureUi ? (
                    <div className={styles.trainingCaptureSummary}>
                      <div className={styles.trainingCaptureSummaryMain}>
                        <strong>Choisir exo</strong>
                        <span>{ongoingWorkout.currentExerciseDraft?.equipment || 'Materiel libre'} | {currentExerciseDraftFocusLabel || 'Categorie auto'}</span>
                      </div>
                    </div>
                  ) : null}

                  {activeOngoingExercise ? (
                    <>
                      <div className={`${styles.trainingSetComposer} ${setKeyboardMode ? styles.trainingSetComposerCompact : ''}`}>
                        {!compactMobileCaptureUi ? (
                          <div className={`${styles.sectionHead} ${styles.trainingSetHead}`} style={{ marginTop: '0.45rem' }}>
                            <div>
                              <h3>3. Logger la serie</h3>
                              <p className={styles.smallMuted}>
                                Renseigne reps et charge. L heure de fin de set se cale automatiquement au clic.
                              </p>
                            </div>
                            {ongoingWorkout.currentSetDraft?.editingSetIndex ? (
                              <span className={`${styles.stateChip} ${styles.statehaut}`}>edition set #{ongoingWorkout.currentSetDraft.editingSetIndex}</span>
                            ) : null}
                          </div>
                        ) : null}
                        {setKeyboardMode ? (
                          <div ref={setFormRef} className={`${styles.formGrid} ${styles.trainingSetFormAnchor}`}>
                            <input
                              ref={repsInputRef}
                              className={styles.input}
                              type="number"
                              inputMode="numeric"
                              enterKeyHint="next"
                              placeholder="Reps"
                              value={ongoingWorkout.currentSetDraft?.reps || ''}
                              onFocus={handleSetComposerInputFocus}
                              onBlur={handleSetComposerInputBlur}
                              onKeyDown={handleRepsInputKeyDown}
                              onChange={(e) => updateCurrentSetDraft({ reps: e.target.value })}
                            />
                            <input
                              ref={loadInputRef}
                              className={styles.input}
                              type="number"
                              inputMode="decimal"
                              enterKeyHint="done"
                              placeholder="Charge kg"
                              value={ongoingWorkout.currentSetDraft?.load || ''}
                              onFocus={handleSetComposerInputFocus}
                              onBlur={handleSetComposerInputBlur}
                              onKeyDown={handleLoadInputKeyDown}
                              onChange={(e) => updateCurrentSetDraft({ load: e.target.value })}
                            />
                          </div>
                        ) : null}
                        <div className={`${styles.trainingSetSummary} ${setKeyboardMode ? styles.trainingSetSummaryCompact : ''}`}>
                          <div className={styles.trainingSetSummaryTop}>
                            <div>
                              <strong>{activeOngoingExercise.exerciseName}</strong>
                              <span>{activeExerciseEquipmentLabel} | {activeOngoingExerciseFocusLabel || 'Autres'}</span>
                            </div>
                            {ongoingWorkout.currentSetDraft?.editingSetIndex ? (
                              <span className={`${styles.stateChip} ${styles.statehaut}`}>edit #{ongoingWorkout.currentSetDraft.editingSetIndex}</span>
                            ) : (
                              <span className={styles.trainingSetSummaryBadge}>set #{activeOngoingExerciseNextSetIndex}</span>
                            )}
                          </div>
                          {setKeyboardMode ? (
                            <div className={styles.trainingSetCompactMeta}>
                              <span>{activeExerciseSetCountLabel}</span>
                              <span>prochaine #{activeOngoingExerciseNextSetIndex}</span>
                              <span>repos actuel {activeExerciseRestLabel}</span>
                              <span>dernier repos {activeExerciseLastRestLabel}</span>
                              <span>derniere serie {activeExerciseLastSetCompactLabel}</span>
                              <span>heure {activeExerciseLastSetClockLabel}</span>
                            </div>
                          ) : (
                            <>
                              <div className={styles.trainingSetStatGrid}>
                                <div className={styles.trainingSetStat}>
                                  <strong>{activeOngoingExerciseSetCount}</strong>
                                  <span>{activeExerciseSetCountLabel}</span>
                                </div>
                                <div className={styles.trainingSetStat}>
                                  <strong>#{activeOngoingExerciseNextSetIndex}</strong>
                                  <span>prochaine serie</span>
                                </div>
                                <div className={styles.trainingSetStat}>
                                  <strong>{activeExerciseRestLabel}</strong>
                                  <span>repos actuel</span>
                                </div>
                                <div className={styles.trainingSetStat}>
                                  <strong>{activeExerciseLastRestLabel}</strong>
                                  <span>dernier repos</span>
                                </div>
                              </div>
                              <div className={styles.trainingSetSummaryMeta}>
                                <span>Derniere serie: {activeExerciseLastSetLabel}</span>
                                <span>Heure dernier set: {activeExerciseLastSetClockLabel}</span>
                              </div>
                            </>
                          )}
                        </div>
                        {activeOngoingExerciseLastSet && !ongoingWorkout.currentSetDraft?.editingSetIndex && !setKeyboardMode ? (
                          <button className={`${styles.button} ${styles.trainingRecopierButton}`} type="button" onClick={duplicateLastSetIntoDraft}>
                            Recopier {activeOngoingExerciseLastSet.reps} x {Number(activeOngoingExerciseLastSet.loadDisplayed || 0).toFixed(0)} kg
                          </button>
                        ) : null}
                        {!setKeyboardMode ? (
                          <div ref={setFormRef} className={`${styles.formGrid} ${styles.trainingSetFormAnchor}`}>
                            <input
                              ref={repsInputRef}
                              className={styles.input}
                              type="number"
                              inputMode="numeric"
                              enterKeyHint="next"
                              placeholder="Reps"
                              value={ongoingWorkout.currentSetDraft?.reps || ''}
                              onFocus={handleSetComposerInputFocus}
                              onBlur={handleSetComposerInputBlur}
                              onKeyDown={handleRepsInputKeyDown}
                              onChange={(e) => updateCurrentSetDraft({ reps: e.target.value })}
                            />
                            <input
                              ref={loadInputRef}
                              className={styles.input}
                              type="number"
                              inputMode="decimal"
                              enterKeyHint="done"
                              placeholder="Charge kg"
                              value={ongoingWorkout.currentSetDraft?.load || ''}
                              onFocus={handleSetComposerInputFocus}
                              onBlur={handleSetComposerInputBlur}
                              onKeyDown={handleLoadInputKeyDown}
                              onChange={(e) => updateCurrentSetDraft({ load: e.target.value })}
                            />
                            <input
                              className={`${styles.input} ${styles.trainingSetNoteInput}`}
                              placeholder="Note set (optionnel)"
                              value={ongoingWorkout.currentSetDraft?.setNote || ''}
                              onFocus={handleSetComposerInputFocus}
                              onBlur={handleSetComposerInputBlur}
                              onChange={(e) => updateCurrentSetDraft({ setNote: e.target.value })}
                            />
                          </div>
                        ) : null}
                        {!compactMobileCaptureUi ? (
                          <div className={styles.trainingSetActionRow}>
                            <button className={`${styles.button} ${styles.trainingPrimaryButton}`} type="button" onClick={saveCurrentSet}>
                              {setActionPrimaryLabel}
                            </button>
                            <button className={`${styles.buttonGhost} ${styles.trainingSetSecondaryAction}`} type="button" onClick={closeActiveExercise}>Cloturer l exercice</button>
                            {ongoingWorkout.currentSetDraft?.editingSetIndex ? (
                              <button className={`${styles.buttonGhost} ${styles.trainingSetSecondaryAction}`} type="button" onClick={() => updateCurrentSetDraft(buildEmptyCurrentSetDraft())}>Annuler edition</button>
                            ) : null}
                          </div>
                        ) : null}
                        <div className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead>
                              <tr><th>Set</th><th>Reps</th><th>Charge</th><th className={styles.colHideMobile}>Temps</th><th className={styles.colHideMobile}>Note</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                              {(activeOngoingExercise.setDetails || []).map((setRow) => (
                                <tr key={`${activeOngoingExercise.tempId}-${setRow.setIndex}`}>
                                  <td>#{setRow.setIndex}</td>
                                  <td>{Number(setRow.reps || 0)}</td>
                                  <td>{Number(setRow.loadDisplayed || 0).toFixed(1)} kg</td>
                                  <td className={styles.colHideMobile}>
                                    <div>{setRow.timeLabel || '-'}</div>
                                    <div className={styles.smallMuted}>
                                      {setRow.restSincePreviousSetSec !== null && setRow.restSincePreviousSetSec !== undefined
                                        ? `repos ${formatDurationShort(setRow.restSincePreviousSetSec)}`
                                        : 'repos -'}
                                    </div>
                                  </td>
                                  <td className={styles.colHideMobile}>{setRow.setNote || '-'}</td>
                                  <td>
                                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                                      <button className={styles.tinyButton} type="button" onClick={() => editOngoingSet(activeOngoingExercise.tempId, setRow.setIndex)}>Editer</button>
                                      <button className={styles.tinyButton} type="button" onClick={() => removeOngoingSet(activeOngoingExercise.tempId, setRow.setIndex)}>Suppr.</button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {!(activeOngoingExercise.setDetails || []).length ? (
                                <tr><td colSpan="6" className={styles.smallMuted}>Aucune serie loggee pour cet exercice.</td></tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : null}
                </article>

                {completedOngoingExercises.length ? (
                  <div className={`${styles.grid2} ${styles.trainingCompletedGrid}`}>
                    {completedOngoingExercises.map((exercise) => (
                      <article key={exercise.tempId} className={`${styles.card} ${styles.trainingCaptureCard}`}>
                        <div className={styles.sectionHead}>
                          <div>
                            <h3>{exercise.order}. {exercise.exerciseName || 'Exercice'}</h3>
                            <p className={styles.smallMuted}>
                              {exercise.equipment || 'Materiel libre'} | {exercise.category || 'Categorie auto'} | {(exercise.setDetails || []).length} serie(s)
                            </p>
                          </div>
                          <div style={{ display: 'grid', gap: '0.35rem' }}>
                            <span className={`${styles.stateChip} ${styles.statebas}`}>{exercise.status || 'clos'}</span>
                            <button className={styles.tinyButton} type="button" onClick={() => resumeOngoingExercise(exercise.tempId)}>Reprendre</button>
                            <button className={styles.tinyButton} type="button" onClick={() => removeOngoingExercise(exercise.tempId)}>Suppr. exo</button>
                          </div>
                        </div>
                        {exercise.notes ? <p className={styles.smallMuted}>{exercise.notes}</p> : null}
                        <div className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead>
                              <tr><th>Set</th><th>Reps</th><th>Charge</th><th>Temps</th><th>Note</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                              {(exercise.setDetails || []).map((setRow) => (
                                <tr key={`${exercise.tempId}-${setRow.setIndex}`}>
                                  <td>#{setRow.setIndex}</td>
                                  <td>{Number(setRow.reps || 0)}</td>
                                  <td>{Number(setRow.loadDisplayed || 0).toFixed(1)} kg</td>
                                  <td>
                                    <div>{setRow.timeLabel || '-'}</div>
                                    <div className={styles.smallMuted}>
                                      {setRow.restSincePreviousSetSec !== null && setRow.restSincePreviousSetSec !== undefined
                                        ? `repos ${formatDurationShort(setRow.restSincePreviousSetSec)}`
                                        : 'repos -'}
                                    </div>
                                  </td>
                                  <td>{setRow.setNote || '-'}</td>
                                  <td>
                                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                                      <button className={styles.tinyButton} type="button" onClick={() => editOngoingSet(exercise.tempId, setRow.setIndex)}>Editer</button>
                                      <button className={styles.tinyButton} type="button" onClick={() => removeOngoingSet(exercise.tempId, setRow.setIndex)}>Suppr.</button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {!(exercise.setDetails || []).length ? (
                                <tr><td colSpan="6" className={styles.smallMuted}>Aucune serie loggee pour cet exercice.</td></tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : !activeOngoingExercise ? (
                  <p className={styles.smallMuted}>Aucun exercice ongoing pour le moment. Active un exercice puis logge tes series.</p>
                ) : null}

              </div>
            )}
          </section>

          {!workoutCaptureMode ? (
            <section className={styles.card} style={{ marginTop: '1rem' }}>
              <h2>Synthese du jour</h2>
              <div className={styles.insightGrid}>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Workouts</div>
                  <div className={styles.insightValue}>{sessionsSummary.workoutCount}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Exercices</div>
                  <div className={styles.insightValue}>{sessionsSummary.exerciseCount}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Focus</div>
                  <div className={styles.insightValue}>{sessionsSummary.primaryMusclesLabel}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Series / reps</div>
                  <div className={styles.insightValue}>{sessionsSummary.totalSets} / {sessionsSummary.totalReps}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Top load</div>
                  <div className={styles.insightValue}>{sessionsSummary.topLoad.toFixed(1)} kg</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Volume</div>
                  <div className={styles.insightValue}>{sessionsSummary.totalVolume.toFixed(0)}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>PR detectes</div>
                  <div className={styles.insightValue}>{todayPrCount}</div>
                </div>
                <div className={styles.insightItem}>
                  <div className={styles.insightLabel}>Duree</div>
                  <div className={styles.insightValue}>{sessionsSummary.sessionDuration > 0 ? `${sessionsSummary.sessionDuration} min` : '-'}</div>
                </div>
              </div>
              <p className={styles.smallMuted} style={{ marginTop: '0.7rem' }}>
                Le journal affiche `workout / exercises / sets`, avec duree au niveau seance et focus musculaire dominant pour la lecture rapide.
              </p>
              {ongoingWorkout ? (
                <p className={styles.smallMuted} style={{ color: '#a14a08' }}>
                  1 seance en cours non exportee: elle reste locale et n entre dans la synthese qu apres `Cloturer la seance`.
                </p>
              ) : null}
              <SessionTimeline
                sessions={sessionsForSelectedDay}
                exerciseMuscleOverrides={state.exerciseMuscleOverrides}
                exerciseOptions={exerciseCatalog}
                equipmentOptions={equipment}
                onRemove={removeSession}
                onUpdate={updateSession}
                onUpdateWorkout={updateWorkout}
              />
            </section>
          ) : null}
        </>
      ),
    },
    {
      id: 'progress',
      label: 'Progression',
      defaultSpan: 12,
      render: () => (
        <section className={styles.card}>
          <div className={styles.sectionHead}>
            <h2>Progression exploitable</h2>
            <div className={styles.formGrid} style={{ margin: 0 }}>
              <select className={styles.select} value={muscleGroup} onChange={(e) => setPageUi((prev) => ({ ...prev, muscleGroup: e.target.value }))}>
                {MUSCLE_GROUPS.map((group) => (
                  <option key={group.value} value={group.value}>{group.label}</option>
                ))}
              </select>
              <select className={styles.select} value={progressView} onChange={(e) => setPageUi((prev) => ({ ...prev, progressView: e.target.value }))}>
                <option value="session">Vue seance</option>
                <option value="exercise">Vue exercice</option>
              </select>
              <select className={styles.select} value={focusExercise} onChange={(e) => setPageUi((prev) => ({ ...prev, focusExercise: e.target.value }))}>
                <option value="all">Tous les exercices ({progression.exerciseOptions.length})</option>
                {progression.exerciseOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <select className={styles.select} value={`${windowDays}`} onChange={(e) => setPageUi((prev) => ({ ...prev, windowDays: Number.parseInt(e.target.value, 10) || 30 }))}>
                <option value="14">14 jours</option>
                <option value="30">30 jours</option>
                <option value="60">60 jours</option>
                <option value="90">90 jours</option>
              </select>
              <select className={styles.select} value={`${progressRowsLimit}`} onChange={(e) => setPageUi((prev) => ({ ...prev, progressRowsLimit: Number.parseInt(e.target.value, 10) || 25 }))}>
                <option value="15">15 lignes table</option>
                <option value="25">25 lignes table</option>
                <option value="40">40 lignes table</option>
                <option value="80">80 lignes table</option>
              </select>
            </div>
          </div>
          <p className={styles.smallMuted}>
            Fenetre {progression.start} {'→'} {progression.end} | {progression.sessions.length} session(s) du groupe | {progression.filteredSessions.length} session(s) affichees.
            {progressView === 'session' ? ' Lecture agregee par seance/date.' : ' Lecture bloc par bloc pour voir la vraie progression exercice par exercice.'}
          </p>
          <InteractiveLineChart
            ariaLabel="Progression training interactive"
            xLabel={progressView === 'exercise' ? 'Bloc exercice' : 'Seance'}
            yLabel="Charge / e1RM (kg)"
            yLabelRight="Volume"
            series={[
              {
                id: 'top-load',
                label: 'Top charge',
                color: '#0f172a',
                axis: 'left',
                data: progressChartRows.map((r) => ({ date: r.key, value: r.topLoad })),
              },
              {
                id: 'e1rm',
                label: 'e1RM',
                color: '#2563eb',
                axis: 'left',
                data: progressChartRows.map((r) => ({ date: r.key, value: r.e1rm || 0 })),
              },
              {
                id: 'volume',
                label: 'Volume',
                color: '#f97316',
                axis: 'right',
                data: progressChartRows.map((r) => ({ date: r.key, value: r.volume })),
              },
            ]}
            valueFormat={(v) => `${Number(v).toFixed(1)}kg`}
            valueFormatRight={(v) => `${Number(v).toFixed(0)}`}
            dateFormat={(key) => progression.chartLabelMap[progressView]?.[key] || progressDateLabel(key)}
            onDateClick={(key) => {
              const target = progressChartRows.find((row) => row.key === key);
              setState((prev) => ({ ...prev, selectedDate: target?.baseDate || `${key}`.split('#')[0] }));
            }}
            pointMode="always"
            defaultType={progressView === 'exercise' ? 'bar' : 'line'}
          />
          <p className={styles.smallMuted} style={{ marginTop: '0.45rem' }}>
            Dernier point: {progressChartRows.length ? (progression.chartDetailMap[progressView]?.[progressChartRows[progressChartRows.length - 1].key] || '-') : '-'}.
          </p>
          <div className={styles.insightGrid} style={{ marginTop: '0.7rem' }}>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Top charge (dernier)</div>
              <div className={styles.insightValue}>
                {progressChartRows.length ? `${progressChartRows[progressChartRows.length - 1].topLoad.toFixed(1)} kg` : '-'}
              </div>
            </div>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>e1RM (dernier)</div>
              <div className={styles.insightValue}>
                {progressChartRows.length ? `${Number(progressChartRows[progressChartRows.length - 1].e1rm || 0).toFixed(1)} kg` : '-'}
              </div>
            </div>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Volume (dernier)</div>
              <div className={styles.insightValue}>
                {progressChartRows.length ? Number(progressChartRows[progressChartRows.length - 1].volume || 0).toFixed(0) : '-'}
              </div>
            </div>
          </div>
          <h3 style={{ marginTop: '0.8rem' }}>Analyse par seance du groupe</h3>
          <table className={styles.table}>
            <thead>
              <tr><th>Date</th><th>Focus seance</th><th>Temps</th><th>Series</th><th>Reps</th><th>Top</th><th>Delta top</th><th>e1RM</th><th>Delta e1RM</th><th>Volume</th><th>Delta volume</th><th>PR</th></tr>
            </thead>
            <tbody>
              {sessionSummaryRowsForTable.map((row) => {
                const deltaTop = Number(row.deltaTop);
                const deltaE1rm = Number(row.deltaE1rm);
                const deltaVolume = Number(row.deltaVolume);
                return (
                  <tr key={row.id}>
                    <td>
                      <button className={styles.tinyButton} type="button" onClick={() => setState((prev) => ({ ...prev, selectedDate: row.date }))}>
                        {row.date}
                      </button>
                    </td>
                    <td>{row.sessionLabel === row.date ? row.exercisePreview : `${row.sessionLabel} | ${row.exercisePreview}`}</td>
                    <td>
                      <div>{row.durationSec !== null && row.durationSec !== undefined ? formatDurationShort(row.durationSec) : '-'}</div>
                      {row.startedAt && row.endedAt ? (
                        <div className={styles.smallMuted}>
                          {toClockTimeLabelWithSeconds(row.startedAt)}
                          {' -> '}
                          {toClockTimeLabelWithSeconds(row.endedAt)}
                        </div>
                      ) : null}
                    </td>
                    <td>{row.sets}</td>
                    <td>{row.reps}</td>
                    <td>{Number(row.topLoad || 0).toFixed(1)} kg</td>
                    <td style={{ color: Number.isFinite(deltaTop) ? (deltaTop > 0 ? '#166534' : (deltaTop < 0 ? '#991b1b' : '#64748b')) : '#94a3b8' }}>
                      {formatDelta(row.deltaTop, 1, ' kg')}
                    </td>
                    <td>{Number(row.e1rm || 0).toFixed(1)} kg</td>
                    <td style={{ color: Number.isFinite(deltaE1rm) ? (deltaE1rm > 0 ? '#166534' : (deltaE1rm < 0 ? '#991b1b' : '#64748b')) : '#94a3b8' }}>
                      {formatDelta(row.deltaE1rm, 1, ' kg')}
                    </td>
                    <td>{Number(row.volume || 0).toFixed(0)}</td>
                    <td style={{ color: Number.isFinite(deltaVolume) ? (deltaVolume > 0 ? '#166534' : (deltaVolume < 0 ? '#991b1b' : '#64748b')) : '#94a3b8' }}>
                      {formatDelta(row.deltaVolume, 0, '')}
                    </td>
                    <td>{row.prCount || '-'}</td>
                  </tr>
                );
              })}
              {sessionSummaryRowsForTable.length === 0 && (
                <tr>
                  <td colSpan="12" className={styles.smallMuted}>Aucune donnee sur cette fenetre pour ce groupe.</td>
                </tr>
              )}
            </tbody>
          </table>
          <h3 style={{ marginTop: '0.8rem' }}>Detail recent par exercice</h3>
          <table className={styles.table}>
            <thead>
              <tr><th>Date</th><th>Exercice</th><th>Series</th><th>Reps</th><th>Top</th><th>Delta top</th><th>e1RM</th><th>Volume</th><th>PR</th></tr>
            </thead>
            <tbody>
              {exerciseRowsForTable.map((row) => {
                const deltaTop = Number(row.deltaTop);
                return (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.exerciseName}</td>
                    <td>{row.sets}</td>
                    <td>{row.reps}</td>
                    <td>{Number(row.topLoad || 0).toFixed(1)} kg</td>
                    <td style={{ color: Number.isFinite(deltaTop) ? (deltaTop > 0 ? '#166534' : (deltaTop < 0 ? '#991b1b' : '#64748b')) : '#94a3b8' }}>
                      {formatDelta(row.deltaTop, 1, ' kg')}
                    </td>
                    <td>{Number(row.e1rm || 0).toFixed(1)} kg</td>
                    <td>{Number(row.volume || 0).toFixed(0)}</td>
                    <td>{row.isNewPr ? 'Oui' : '-'}</td>
                  </tr>
                );
              })}
              {exerciseRowsForTable.length === 0 && (
                <tr>
                  <td colSpan="9" className={styles.smallMuted}>Aucune donnee recente par exercice pour ce groupe.</td>
                </tr>
              )}
            </tbody>
          </table>
          <h3 style={{ marginTop: '0.8rem' }}>Resume cumule par exercice</h3>
          <table className={styles.table}>
            <thead>
              <tr><th>Exercice</th><th>Sessions</th><th>Top debut</th><th>Top recent</th><th>Delta top</th><th>PR</th><th>e1RM best</th><th>Volume cumule</th><th>Derniere date</th></tr>
            </thead>
            <tbody>
              {progression.exercises.map((exercise) => (
                <tr key={exercise.name}>
                  <td>{exercise.name}</td>
                  <td>{exercise.sessions}</td>
                  <td>{Number(exercise.topFirst || 0).toFixed(1)}</td>
                  <td>{Number(exercise.topLast || 0).toFixed(1)}</td>
                  <td style={{ color: (exercise.topLast - exercise.topFirst) > 0 ? '#166534' : ((exercise.topLast - exercise.topFirst) < 0 ? '#991b1b' : '#64748b') }}>
                    {formatDelta(exercise.topLast - exercise.topFirst, 1, ' kg')}
                  </td>
                  <td>{Number(exercise.topPr || 0).toFixed(1)}</td>
                  <td>{Number(exercise.e1rmBest || 0).toFixed(1)}</td>
                  <td>{Number(exercise.volumeTotal || 0).toFixed(0)}</td>
                  <td>{exercise.lastDate}</td>
                </tr>
              ))}
              {progression.exercises.length === 0 && (
                <tr>
                  <td colSpan="9" className={styles.smallMuted}>Aucune donnee sur cette fenetre pour ce groupe.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ),
    },
    {
      id: 'forms',
      label: 'Import et bibliotheque',
      defaultSpan: 12,
      render: () => (
        <section className={styles.grid2}>
          <article className={styles.card}>
            <h2>Importer un workout</h2>
            <p className={styles.smallMuted}>
              Colle ton recap brut, analyse, verifie la preview, puis importe.
            </p>
            <input
              className={styles.input}
              value={quickSessionText}
              onChange={(e) => setQuickSessionText(e.target.value)}
              placeholder="Format rapide: Pecs: Bench 4x8x80; Incline halteres 3x10x26"
            />
            <div className={styles.formGrid}>
              <button className={styles.buttonGhost} type="button" onClick={importCompactWorkout}>Parser format rapide</button>
            </div>
            <textarea
              className={styles.textarea}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'Exemple:\n2026-02-25 - Seance Pecs + Dos\nDeveloppe couche\n1 20 kg 20\n2 60 kg 8\n...\nDuree\n47 minutes'}
            />
            <div className={styles.formGrid}>
              <button className={styles.button} type="button" onClick={analyzePastedWorkout}>Analyser</button>
              <button className={styles.buttonGhost} type="button" onClick={importParsedWorkout} disabled={!parsedWorkout}>Importer</button>
            </div>
            {parseStatus && <p className={styles.smallMuted}>{parseStatus}</p>}
            {parsedWorkout && (
              <div style={{ marginTop: '0.7rem' }}>
                <p className={styles.smallMuted}>
                  Preview workout: {parsedWorkout.date} | {parsedWorkout.title} | duree {parsedWorkout.durationMin ? `${parsedWorkout.durationMin} min` : '-'}
                </p>
                <ul className={styles.list}>
                  {parsedWorkout.exercises.map((exercise) => (
                    <li key={exercise.name}>
                      <div>
                        <strong>{exercise.name}</strong>
                        <div className={styles.smallMuted}>
                          {exercise.sets.length} series | reps totales {exercise.sets.reduce((acc, setRow) => acc + (setRow.reps || 0), 0)} | top {Math.max(...exercise.sets.map((setRow) => setRow.loadDisplayed || 0))} kg
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>

          <article className={styles.card}>
            <h2>Bibliotheque d exercices</h2>
            <p className={styles.smallMuted}>
              Cette zone sert a preparer ta base d exercices et leur materiel par defaut. Elle est separee du logger de seance.
            </p>
            <form className={styles.formGrid} onSubmit={addExercise}>
              <input className={styles.input} placeholder="Nom exercice" value={exerciseForm.name} onChange={(e) => updateExerciseFormName(e.target.value)} />
              <select className={styles.select} value={exerciseForm.equipment} onChange={(e) => setExerciseForm((p) => ({ ...p, equipment: e.target.value }))}>
                {equipment.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className={styles.select} value={exerciseForm.category} onChange={(e) => setExerciseForm((p) => ({ ...p, category: e.target.value }))}>
                {TRAINING_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <button className={styles.button} type="submit">{editingLibraryExerciseId ? 'Enregistrer exo' : 'Ajouter a la bibliotheque'}</button>
              {editingLibraryExerciseId ? (
                <button className={styles.buttonGhost} type="button" onClick={resetExerciseLibraryForm}>Annuler edition</button>
              ) : null}
            </form>
            <button className={styles.buttonGhost} type="button" onClick={addCommonExercises} style={{ marginTop: '0.6rem' }}>
              Importer ma base home gym (rack / barres / halteres / poulies)
            </button>

            <h3 style={{ marginTop: '1rem' }}>Bibliotheque ({state.exercises.length})</h3>
            <ul className={styles.list}>
              {state.exercises.slice(0, 18).map((exercise) => (
                <li key={exercise.id}>
                  <div style={{ display: 'grid', gap: '0.5rem', width: '100%' }}>
                    <div>
                      <strong>{exercise.name}</strong>
                      <div className={styles.smallMuted}>{exercise.equipment} | {exercise.category}</div>
                    </div>
                    <div className={styles.libraryListActions}>
                      <button
                        className={styles.tinyButton}
                        type="button"
                        disabled={!ongoingWorkout || Boolean(activeOngoingExercise)}
                        onClick={() => loadExerciseIntoOngoingDraft(exercise)}
                      >
                        Utiliser dans la seance
                      </button>
                      <button className={styles.tinyButton} type="button" onClick={() => editLibraryExercise(exercise)}>
                        Editer
                      </button>
                      <button className={styles.tinyButton} type="button" onClick={() => removeLibraryExercise(exercise.id)}>
                        Suppr.
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      ),
    },
    {
      id: 'muscle-map',
      label: 'Mapping muscles',
      defaultSpan: 12,
      render: () => (
        <section className={styles.grid2}>
          <article className={styles.card}>
              <div className={styles.sectionHead}>
                <div>
                  <h2>Mapping exercice / muscles</h2>
                  <p className={styles.smallMuted}>Rends le moteur lisible et corrigeable. Le manuel ecrase l auto.</p>
                </div>
              <span className={`${styles.stateChip} ${mappingOverride ? styles.statehaut : styles.stateok}`}>
                {mappingOverride ? 'override manuel' : 'mapping auto'}
              </span>
            </div>
            <div className={styles.formGrid}>
              <select className={styles.select} value={mappingExercise} onChange={(e) => setPageUi((prev) => ({ ...prev, mappingExercise: e.target.value }))}>
                {exerciseCatalog.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <input className={styles.input} value={mappingExerciseMeta?.category || ''} readOnly placeholder="Categorie" />
            </div>
            <div className={styles.thresholdGrid} style={{ marginTop: '0.8rem' }}>
              {EXERCISE_MUSCLE_GROUPS.map((group) => (
                <label key={group}>
                  <span className={styles.smallMuted}>{MUSCLE_GROUPS.find((item) => item.value === group)?.label || group}</span>
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.1"
                    value={mappingDraft[group] ?? 0}
                    onChange={(e) => setMappingDraft((prev) => ({ ...prev, [group]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <p className={styles.smallMuted} style={{ marginTop: '0.7rem' }}>
              Auto: {Object.entries(autoMappingShares || {}).map(([group, value]) => `${group} ${(value * 100).toFixed(0)}%`).join(' | ') || '-'}
            </p>
            <p className={styles.smallMuted}>
              Effectif: {Object.entries(effectiveMappingShares || {}).map(([group, value]) => `${group} ${(value * 100).toFixed(0)}%`).join(' | ') || '-'}
            </p>
            <div className={styles.formGrid} style={{ marginTop: '0.65rem' }}>
              <button className={styles.button} type="button" onClick={saveMuscleMapping}>Enregistrer override</button>
              <button className={styles.buttonGhost} type="button" onClick={resetMuscleMapping}>Revenir a l auto</button>
            </div>
          </article>

          <article className={styles.card}>
            <h2>Vue rapide de la bibliotheque</h2>
            <table className={styles.table}>
              <thead>
                <tr><th>Exercice</th><th>Mode</th><th>Primaire</th></tr>
              </thead>
              <tbody>
                {mappingRows.map((row) => (
                  <tr key={row.name}>
                    <td>
                      <button className={styles.tinyButton} type="button" onClick={() => setPageUi((prev) => ({ ...prev, mappingExercise: row.name }))}>
                        {row.name}
                      </button>
                    </td>
                    <td>{row.mode}</td>
                    <td>{MUSCLE_GROUPS.find((item) => item.value === row.primary)?.label || row.primary}</td>
                  </tr>
                ))}
                {mappingRows.length === 0 && (
                  <tr><td colSpan="3" className={styles.smallMuted}>Aucun exercice a mapper.</td></tr>
                )}
              </tbody>
            </table>
          </article>
        </section>
      ),
    },
    {
      id: 'muscle-balance',
      label: 'Equilibre',
      defaultSpan: 12,
      render: () => (
        <section className={styles.card}>
          <div className={styles.sectionHead}>
            <h2>Equilibre musculaire - charge hebdo</h2>
            <div className={styles.formGrid} style={{ margin: 0 }}>
              <select className={styles.select} value={`${heatmapWeeks}`} onChange={(e) => setPageUi((prev) => ({ ...prev, heatmapWeeks: Number.parseInt(e.target.value, 10) || 8 }))}>
                <option value="4">4 semaines</option>
                <option value="8">8 semaines</option>
                <option value="12">12 semaines</option>
                <option value="16">16 semaines</option>
              </select>
              <select className={styles.select} value={heatmapMetric} onChange={(e) => setPageUi((prev) => ({ ...prev, heatmapMetric: e.target.value }))}>
                <option value="sets">Hard sets ponderes</option>
                <option value="volume">Volume pondere (kg x reps)</option>
              </select>
            </div>
          </div>
          <p className={styles.smallMuted}>
            Fenetre {muscleHeatmap.start} {'→'} {muscleHeatmap.end}. Chaque colonne = 1 semaine (lundi-dimanche). Survole une date pour la plage complete.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.heatmapTable}>
              <thead>
                <tr>
                  <th>Groupe</th>
                  {muscleHeatmap.weeks.map((week) => <th key={week.id} title={`${week.startIso} → ${week.endIso}`}>{week.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {muscleHeatmap.groups.map((group) => {
                  const label = MUSCLE_GROUPS.find((x) => x.value === group)?.label || group;
                  return (
                    <tr key={group}>
                      <td>{label}</td>
                      {muscleHeatmap.weeks.map((week) => {
                        const value = Number(week.values[group] || 0);
                        const ratio = Math.max(0, Math.min(value / Math.max(muscleHeatmap.max, 1), 1));
                        const alpha = (0.12 + ratio * 0.38).toFixed(2);
                        return (
                          <td key={`${group}-${week.id}`} style={{ background: `rgba(15, 23, 42, ${alpha})`, color: ratio > 0.45 ? '#ffffff' : '#0f172a' }}>
                            {heatmapMetric === 'volume' ? value.toFixed(0) : value.toFixed(1)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ),
    },
    {
      id: 'equipment',
      label: 'Materiel',
      defaultSpan: 12,
      render: () => (
        <section className={styles.grid3}>
          {equipment.map((item) => (
            <article className={styles.kpi} key={item}>
              <div className={styles.kpiLabel}>Materiel</div>
              <div className={styles.kpiValue} style={{ fontSize: '1.05rem' }}>{item}</div>
            </article>
          ))}
        </section>
      ),
    },
  ];

  const captureBlocks = useMemo(
    () => blocks.filter((block) => block.id === 'log'),
    [blocks],
  );
  const captureSupportBlock = useMemo(
    () => blocks.find((block) => block.id === 'forms') || null,
    [blocks],
  );
  const analysisBlocks = useMemo(
    () => blocks.filter((block) => block.id === 'progress'),
    [blocks],
  );
  const analysisMappingBlock = useMemo(
    () => blocks.find((block) => block.id === 'muscle-map') || null,
    [blocks],
  );
  const analysisBalanceBlock = useMemo(
    () => blocks.find((block) => block.id === 'muscle-balance') || null,
    [blocks],
  );
  const mobileCaptureActionRail = compactMobileCaptureUi ? (
    <div ref={actionRailRef} className={styles.captureActionRail}>
      {activeOngoingExercise ? (
        <>
          <button className={`${styles.button} ${styles.captureActionPrimary}`} type="button" onClick={saveCurrentSet}>
            {setActionPrimaryLabel}
          </button>
          <button className={`${styles.buttonGhost} ${styles.captureActionSecondary}`} type="button" onClick={closeActiveExercise}>
            Cloturer l exercice
          </button>
          {ongoingWorkout.currentSetDraft?.editingSetIndex ? (
            <button className={`${styles.buttonGhost} ${styles.captureActionTertiary}`} type="button" onClick={() => updateCurrentSetDraft(buildEmptyCurrentSetDraft())}>
              Annuler edition
            </button>
          ) : null}
        </>
      ) : (
        <>
          <button
            className={`${styles.button} ${styles.captureActionPrimary}`}
            type="button"
            onClick={() => activateExercise()}
            disabled={!canActivateDraftExercise}
          >
            Activer l exercice
          </button>
          {canCloseOngoingWorkout ? (
            <button className={`${styles.buttonGhost} ${styles.captureActionSecondary}`} type="button" onClick={finalizeOngoingWorkout}>
              Cloturer la seance
            </button>
          ) : null}
          <button className={`${styles.buttonGhost} ${styles.captureActionTertiary} ${styles.buttonDanger}`} type="button" onClick={abandonOngoingWorkout}>
            Annuler workout
          </button>
        </>
      )}
    </div>
  ) : null;

  return (
    <Layout
      title="Entrainement"
      description="Suivi home gym"
      mobileChromeMode={compactMobileCaptureUi ? 'capture' : 'compact'}
      mobileTitleShort={compactMobileCaptureUi ? (activeOngoingExercise?.exerciseName || 'Workout') : 'Training'}
    >
      <main className={`${styles.page} ${compactMobileCaptureUi ? styles.gymMode : ''} ${keyboardOpen ? styles.mobileKeyboardOpen : ''} ${setKeyboardMode ? styles.setKeyboardMode : ''}`}>
        <div className={styles.container}>
          {!workoutCaptureMode ? (
            <section className={styles.hero}>
              <div className={styles.heroHeaderRow}>
                <div className={styles.heroTitleWrap}>
                  <span className={styles.heroEyebrow}>Capture prioritaire</span>
                  <h1>Entrainement home gym</h1>
                  <p>Log workout d abord, progression ensuite. Le flux mobile reste centre sur workout, exercice actif et series.</p>
                </div>
                <div className={styles.heroControlCard}>
                  <span className={styles.smallMuted}>Date active</span>
                  <DateNav
                    value={state.selectedDate}
                    onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
                  />
                  <span className={styles.smallMuted}>
                    Focus {sessionsSummary.primaryMusclesLabel} | {sessionsSummary.workoutCount} workout(s)
                  </span>
                </div>
              </div>
              <div className={styles.summaryStrip}>
                <div className={styles.summaryMetric}>
                  <div className={styles.summaryMetricLabel}>Workouts</div>
                  <div className={styles.summaryMetricValue}>{sessionsSummary.workoutCount}</div>
                  <div className={styles.summaryMetricMeta}>{state.selectedDate}</div>
                </div>
                <div className={styles.summaryMetric}>
                  <div className={styles.summaryMetricLabel}>Series</div>
                  <div className={styles.summaryMetricValue}>{sessionsSummary.totalSets}</div>
                  <div className={styles.summaryMetricMeta}>{sessionsSummary.totalReps} reps</div>
                </div>
                <div className={styles.summaryMetric}>
                  <div className={styles.summaryMetricLabel}>Focus</div>
                  <div className={styles.summaryMetricValue}>{sessionsSummary.primaryMusclesLabel}</div>
                  <div className={styles.summaryMetricMeta}>Volume {sessionsSummary.totalVolume.toFixed(0)}</div>
                </div>
                <div className={styles.summaryMetric}>
                  <div className={styles.summaryMetricLabel}>Duree</div>
                  <div className={styles.summaryMetricValue}>{sessionsSummary.sessionDuration > 0 ? `${sessionsSummary.sessionDuration} min` : '-'}</div>
                  <div className={styles.summaryMetricMeta}>
                    {ongoingWorkout ? `${ongoingWorkoutSummary.exerciseCount} exo ongoing` : 'Aucun draft ongoing'}
                  </div>
                </div>
              </div>
              <div className={styles.heroToggleRow} style={{ marginTop: '0.75rem' }}>
                <button
                  className={`${styles.heroModeButton} ${workflow === 'capture' ? styles.heroModeButtonActive : ''}`}
                  type="button"
                  onClick={() => setPageUi((prev) => ({ ...prev, workflow: 'capture' }))}
                >
                  Saisie
                </button>
                <button
                  className={`${styles.heroModeButton} ${workflow === 'analysis' ? styles.heroModeButtonActive : ''}`}
                  type="button"
                  onClick={() => setPageUi((prev) => ({ ...prev, workflow: 'analysis' }))}
                >
                  Analyse
                </button>
                <Link className={styles.compactActionLink} to="/metrics">Saisie poids</Link>
                {ongoingWorkout ? (
                  <span className={styles.heroModeStatus}>
                    Ongoing {ongoingWorkoutSummary.exerciseCount} exo / {ongoingWorkoutSummary.totalSets} series
                  </span>
                ) : null}
              </div>
              <CoreWorkflowNav active="training" supportMode="hub" />
            </section>
          ) : null}

          {workflow === 'capture' ? (
            <>
              {ongoingWorkout ? (
                <div ref={gymBarRef} className={styles.gymBar}>
                  <div className={styles.gymBarLeft}>
                    <span className={styles.gymBarChrono}>{ongoingWorkout.startedAt ? formatDurationShort(ongoingWorkoutElapsedSec) : '--:--'}</span>
                    <span className={styles.gymBarLabel}>{activeOngoingExercise?.exerciseName || ongoingWorkout.workoutLabel || 'Seance'}</span>
                    <span className={styles.gymBarMeta}>
                      {ongoingWorkoutSummary.totalSets}s / {ongoingWorkoutSummary.totalReps}r
                      {activeOngoingExerciseCurrentRestSec !== null ? ` \u00b7 R ${formatDurationShort(activeOngoingExerciseCurrentRestSec)}` : ''}
                    </span>
                  </div>
                  <div className={styles.gymBarActions}>
                    {!ongoingWorkout.startedAt && (
                      <button type="button" className={styles.gymBarButton} onClick={() => updateWorkoutField('startedAt', new Date().toISOString())}>Chrono</button>
                    )}
                    {canCloseOngoingWorkout ? (
                      <button type="button" className={styles.gymBarButton} onClick={finalizeOngoingWorkout}>Clore</button>
                    ) : null}
                    <button type="button" className={styles.gymBarButtonGhost} onClick={() => setShowWorkoutMeta((v) => !v)}>
                      {showWorkoutMeta ? 'Fermer' : 'Infos'}
                    </button>
                    <button type="button" className={`${styles.gymBarButtonGhost} ${styles.gymBarButtonDanger}`} onClick={abandonOngoingWorkout}>Annuler</button>
                  </div>
                </div>
              ) : null}
              {captureBlocks.map((block) => (
                <React.Fragment key={block.id}>
                  {block.render()}
                </React.Fragment>
              ))}
              {mobileCaptureActionRail}
              {captureSupportBlock && !workoutCaptureMode ? (
                <details className={`${styles.card} ${styles.detailsCard}`}>
                  <summary className={styles.cardSummary}>Importer un workout et gerer la bibliotheque</summary>
                  <p className={styles.smallMuted}>Import texte et gestion des exercices restent accessibles, mais hors du flux de saisie principal.</p>
                  {captureSupportBlock.render()}
                </details>
              ) : null}
            </>
          ) : (
            <>
              <section className={styles.card}>
                <h2>Analyse / progression / muscles</h2>
                <p className={styles.smallMuted}>Bloc lecture: progression exploitable, mapping editable et equilibre musculaire sur la fenetre choisie.</p>
              </section>
              <LayoutBlocks pageId="training-analysis" state={state} setState={setState} blocks={analysisBlocks} />
              {analysisMappingBlock ? (
                <details className={`${styles.card} ${styles.detailsCard}`}>
                  <summary className={styles.cardSummary}>Mapping exercice / muscles</summary>
                  <p className={styles.smallMuted}>Lisible et editable, sans noyer la progression exploitable.</p>
                  {analysisMappingBlock.render()}
                </details>
              ) : null}
              {analysisBalanceBlock ? (
                <details className={`${styles.card} ${styles.detailsCard}`}>
                  <summary className={styles.cardSummary}>Equilibre musculaire</summary>
                  <p className={styles.smallMuted}>Charge hebdo et repartition musculaire sur la fenetre choisie.</p>
                  {analysisBalanceBlock.render()}
                </details>
              ) : null}
            </>
          )}
        </div>
      </main>
    </Layout>
  );
}
