import React, { useEffect, useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './dashboard.module.css';
import { toPositive, useDashboardState } from '../lib/dashboardStore';
import { useLocalPageUiState } from '../lib/localUiState.js';
import LayoutBlocks from '../components/LayoutBlocks';
import DateNav from '../components/DateNav';
import InteractiveLineChart from '../components/InteractiveLineChart';
import CoreWorkflowNav from '../components/CoreWorkflowNav';
import SessionTimeline from '../components/training/SessionTimeline';
import {
  COMMON_EXERCISES,
  EXERCISE_MUSCLE_GROUPS,
  inferTrainingCategory,
  isMeaningfulExerciseName,
  normalizeExerciseMappingKey,
  normalizeMuscleGroupShares,
  rankWorkedMuscleGroups,
  resolveMuscleGroupShares,
  resolveMuscleGroupSharesWithOverrides,
  resolveMuscleGroupWithOverrides,
} from '../lib/exerciseKnowledge';
import { getSessionsForDate, getSessionsForWindow, getWorkoutsForDate } from '../lib/domainModel';

const equipment = ['Full Rack', 'Poulies vis-a-vis', 'Barre olympique', 'Hex Bar', 'EZ Bar'];
const MUSCLE_GROUPS = [
  { value: 'chest', label: 'Pecs' },
  { value: 'back', label: 'Dos' },
  { value: 'legs', label: 'Jambes' },
  { value: 'shoulders', label: 'Epaules' },
  { value: 'arms', label: 'Bras' },
  { value: 'other', label: 'Autres' },
];

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

export default function TrainingPage() {
  const { state, setState, uid } = useDashboardState();
  const [exerciseForm, setExerciseForm] = useState({ name: '', equipment: 'Full Rack', category: 'Upper Body' });
  const [sessionForm, setSessionForm] = useState({
    date: state.selectedDate,
    workoutLabel: 'Seance manuelle',
    durationMin: '',
    exerciseId: '',
    equipment: '',
    sets: '',
    reps: '',
    load: '',
    rir: '',
    notes: '',
  });
  const [pasteText, setPasteText] = useState('');
  const [parseStatus, setParseStatus] = useState('');
  const [parsedWorkout, setParsedWorkout] = useState(null);
  const [quickSessionText, setQuickSessionText] = useState('');
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
  const focusExercise = pageUi.focusExercise || 'all';
  const progressView = pageUi.progressView || 'session';
  const windowDays = Number(pageUi.windowDays || 30);
  const progressRowsLimit = Number(pageUi.progressRowsLimit || 25);
  const heatmapWeeks = Number(pageUi.heatmapWeeks || 8);
  const heatmapMetric = pageUi.heatmapMetric || 'sets';

  useEffect(() => {
    setSessionForm((prev) => ({ ...prev, date: state.selectedDate }));
  }, [state.selectedDate]);

  const resolveSessionShares = (session) => (
    resolveMuscleGroupSharesWithOverrides(session?.exerciseName, session?.category, state.exerciseMuscleOverrides)
  );

  const exerciseCatalog = useMemo(() => {
    const seen = new Set();
    const names = [];
    [...(state.exercises || []).map((exercise) => exercise.name), ...(state.sessions || []).map((session) => session.exerciseName)]
      .filter(Boolean)
      .forEach((name) => {
        const key = normalizeExerciseMappingKey(name);
        if (!key || seen.has(key)) return;
        seen.add(key);
        names.push(name);
      });
    return names.sort((a, b) => a.localeCompare(b, 'fr'));
  }, [state.exercises, state.sessions]);

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

  const addExercise = (event) => {
    event.preventDefault();
    if (!exerciseForm.name.trim()) return;
    const item = { id: uid(), name: exerciseForm.name.trim(), equipment: exerciseForm.equipment, category: exerciseForm.category };
    setState((prev) => ({ ...prev, exercises: [item, ...prev.exercises] }));
    setExerciseForm({ name: '', equipment: 'Full Rack', category: 'Upper Body' });
  };

  const addCommonExercises = () => {
    setState((prev) => {
      const keyOf = (x) => `${(x.name || '').trim().toLowerCase()}|${(x.equipment || '').trim().toLowerCase()}`;
      const seen = new Set(prev.exercises.map(keyOf));
      const toAdd = COMMON_EXERCISES.filter((ex) => !seen.has(keyOf(ex))).map((ex) => ({ id: uid(), ...ex }));
      if (!toAdd.length) return prev;
      return { ...prev, exercises: [...toAdd, ...prev.exercises] };
    });
  };

  const addSession = (event) => {
    event.preventDefault();
    const exercise = state.exercises.find((x) => x.id === sessionForm.exerciseId);
    if (!exercise) return;
    const workoutLabel = sessionForm.workoutLabel.trim() || 'Seance manuelle';
    const workoutId = `${sessionForm.date}::${normalizeExerciseMappingKey(workoutLabel) || 'seance-manuelle'}`;
    const durationMin = `${sessionForm.durationMin}`.trim() ? toPositive(sessionForm.durationMin) : null;
    const row = {
      id: uid(),
      date: sessionForm.date,
      workoutId,
      workoutLabel,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      equipment: sessionForm.equipment || exercise.equipment,
      category: exercise.category,
      durationMin,
      sets: toPositive(sessionForm.sets),
      reps: toPositive(sessionForm.reps),
      load: toPositive(sessionForm.load),
      rir: `${sessionForm.rir}`.trim() ? toPositive(sessionForm.rir) : null,
      notes: sessionForm.notes.trim(),
      source: 'manual',
    };
    setState((prev) => ({
      ...prev,
      sessions: [
        row,
        ...prev.sessions.map((existing) => (
          existing.workoutId === workoutId
            ? {
              ...existing,
              date: sessionForm.date,
              workoutId,
              workoutLabel,
              sessionGroupId: workoutId,
              sessionGroupLabel: workoutLabel,
              durationMin,
            }
            : existing
        )),
      ],
    }));
    setSessionForm((prev) => ({
      ...prev,
      exerciseId: '',
      equipment: '',
      sets: '',
      reps: '',
      load: '',
      rir: '',
      notes: '',
    }));
  };

  const removeSession = (session) => {
    if (session?.source === 'cycle-log') {
      setState((prev) => ({ ...prev, cycleLogs: prev.cycleLogs.filter((s) => s.id !== session.id) }));
      return;
    }
    setState((prev) => ({ ...prev, sessions: prev.sessions.filter((s) => s.id !== session.id) }));
  };

  const updateSession = (session, patch) => {
    if (!session || !patch || session?.source === 'cycle-log') return;
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((row) => {
        const currentWorkoutKey = session.workoutId || session.sessionGroupId;
        const nextDate = `${patch.date || session.date || state.selectedDate}`;
        const nextWorkoutLabel = `${patch.workoutLabel ?? session.workoutLabel ?? session.sessionGroupLabel ?? ''}`.trim() || 'Seance manuelle';
        const nextWorkoutId = `${nextDate}::${normalizeExerciseMappingKey(nextWorkoutLabel) || 'seance-manuelle'}`;
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
        };

        if (row.id !== session.id) return baseRow;

        const currentSets = sessionSets(row);
        const currentReps = sessionReps(row);
        const currentLoad = sessionTopLoad(row);
        const nextSets = toPositive(patch.sets, currentSets);
        const nextReps = toPositive(patch.reps, currentReps);
        const nextLoad = toPositive(patch.load, currentLoad);
        const nextRir = `${patch.rir ?? ''}`.trim() === '' ? null : toPositive(patch.rir, toPositive(row.rir, 0));
        const nextNotes = `${patch.notes ?? row.notes ?? ''}`.trim();

        const updated = {
          ...baseRow,
          sets: nextSets,
          reps: nextReps,
          load: nextLoad,
          rir: nextRir,
          notes: nextNotes,
        };

        if (Array.isArray(row.setDetails) && row.setDetails.length > 0) {
          const structureChanged = nextSets !== currentSets || nextReps !== currentReps || nextLoad !== currentLoad;
          updated.setDetails = structureChanged ? buildUniformSetDetails(nextSets, nextReps, nextLoad) : row.setDetails;
        }

        return updated;
      }),
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
      const importedRows = parsedWorkout.exercises.map((exercise) => {
        const topDisplayed = exercise.sets.reduce((max, setRow) => Math.max(max, setRow.loadDisplayed || 0), 0);
        const totalReps = exercise.sets.reduce((acc, setRow) => acc + (setRow.reps || 0), 0);
        const muscleGroupKey = resolveMuscleGroupWithOverrides(exercise.name, '', state.exerciseMuscleOverrides);
        return {
          id: uid(),
          date: parsedWorkout.date,
          workoutId,
          workoutLabel: parsedWorkout.title,
          exerciseId: `import-${uid()}`,
          exerciseName: exercise.name,
          equipment: 'Imported',
          category: inferTrainingCategory(exercise.name, muscleGroupKey),
          sets: exercise.sets.length,
          reps: totalReps,
          load: topDisplayed,
          rir: null,
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
        sessions: [...importedRows, ...prev.sessions],
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

  const blocks = [
    {
      id: 'log',
      label: 'Journal',
      defaultSpan: 12,
      render: () => (
        <>
          <section className={styles.card}>
            <h2>Composer le workout</h2>
            <p className={styles.smallMuted}>Une duree pour la seance, puis les exercices et leurs sets. La timeline du jour reste groupee par workout.</p>
            <form className={styles.formGrid} onSubmit={addSession}>
              <input className={styles.input} type="date" value={sessionForm.date} onInput={(e) => setSessionForm((p) => ({ ...p, date: e.target.value }))} onChange={(e) => setSessionForm((p) => ({ ...p, date: e.target.value }))} />
              <input className={styles.input} placeholder="Nom du workout" value={sessionForm.workoutLabel} onChange={(e) => setSessionForm((p) => ({ ...p, workoutLabel: e.target.value }))} />
              <input className={styles.input} type="number" placeholder="Duree min" value={sessionForm.durationMin} onChange={(e) => setSessionForm((p) => ({ ...p, durationMin: e.target.value }))} />
              <select className={styles.select} value={sessionForm.exerciseId} onChange={(e) => setSessionForm((p) => ({ ...p, exerciseId: e.target.value }))}>
                <option value="">Choisir exercice</option>
                {state.exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
              </select>
              <select className={styles.select} value={sessionForm.equipment} onChange={(e) => setSessionForm((p) => ({ ...p, equipment: e.target.value }))}>
                <option value="">Materiel exercice</option>
                {equipment.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input className={styles.input} type="number" placeholder="Series" value={sessionForm.sets} onChange={(e) => setSessionForm((p) => ({ ...p, sets: e.target.value }))} />
              <input className={styles.input} type="number" placeholder="Reps" value={sessionForm.reps} onChange={(e) => setSessionForm((p) => ({ ...p, reps: e.target.value }))} />
              <input className={styles.input} type="number" placeholder="Charge kg" value={sessionForm.load} onChange={(e) => setSessionForm((p) => ({ ...p, load: e.target.value }))} />
              <input className={styles.input} type="number" placeholder="RIR" value={sessionForm.rir} onChange={(e) => setSessionForm((p) => ({ ...p, rir: e.target.value }))} />
              <input className={styles.input} placeholder="Notes" value={sessionForm.notes} onChange={(e) => setSessionForm((p) => ({ ...p, notes: e.target.value }))} />
              <button className={styles.button} type="submit">Ajouter exercice au workout</button>
            </form>
          </section>

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
            <SessionTimeline
              sessions={sessionsForSelectedDay}
              exerciseMuscleOverrides={state.exerciseMuscleOverrides}
              onRemove={removeSession}
              onUpdate={updateSession}
            />
          </section>
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
              <tr><th>Date</th><th>Focus seance</th><th>Series</th><th>Reps</th><th>Top</th><th>Delta top</th><th>e1RM</th><th>Delta e1RM</th><th>Volume</th><th>Delta volume</th><th>PR</th></tr>
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
                  <td colSpan="11" className={styles.smallMuted}>Aucune donnee sur cette fenetre pour ce groupe.</td>
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
            <h2>Ajouter un exercice</h2>
            <form className={styles.formGrid} onSubmit={addExercise}>
              <input className={styles.input} placeholder="Nom exercice" value={exerciseForm.name} onChange={(e) => setExerciseForm((p) => ({ ...p, name: e.target.value }))} />
              <select className={styles.select} value={exerciseForm.equipment} onChange={(e) => setExerciseForm((p) => ({ ...p, equipment: e.target.value }))}>
                {equipment.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input className={styles.input} placeholder="Categorie" value={exerciseForm.category} onChange={(e) => setExerciseForm((p) => ({ ...p, category: e.target.value }))} />
              <button className={styles.button} type="submit">Ajouter</button>
            </form>
            <button className={styles.buttonGhost} type="button" onClick={addCommonExercises} style={{ marginTop: '0.6rem' }}>
              Ajouter base exos communs (libre + poulie)
            </button>

            <h3 style={{ marginTop: '1rem' }}>Bibliotheque</h3>
            <ul className={styles.list}>
              {state.exercises.slice(0, 12).map((exercise) => (
                <li key={exercise.id}>
                  <div>
                    <strong>{exercise.name}</strong>
                    <div className={styles.smallMuted}>{exercise.equipment} | {exercise.category}</div>
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
    () => blocks.filter((block) => ['log', 'forms'].includes(block.id)),
    [blocks],
  );
  const analysisBlocks = useMemo(
    () => blocks.filter((block) => !['log', 'forms'].includes(block.id)),
    [blocks],
  );

  return (
    <Layout title="Entrainement" description="Suivi home gym">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Entrainement home gym</h1>
            <p>Capture d abord le workout, lis ensuite la progression et l equilibre musculaire. Le modele distingue workout, exercice et sets.</p>
            <div className={styles.metaRow}>
              <label>
                <span className={styles.smallMuted}>Date active</span>
                <DateNav
                  value={state.selectedDate}
                  onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
                />
              </label>
              <span className={styles.pill}>Focus jour: {sessionsSummary.primaryMusclesLabel}</span>
              <span className={styles.pill}>Workouts jour: {sessionsSummary.workoutCount}</span>
              <span className={styles.pill}>Series jour: {sessionsSummary.totalSets}</span>
              <span className={styles.pill}>
                Duree loggee: {sessionsSummary.sessionDuration > 0 ? `${sessionsSummary.sessionDuration} min` : '-'}
              </span>
              <Link className={`${styles.pill} ${styles.pillMuted}`} to="/metrics">Saisie poids</Link>
            </div>
            <div className={styles.formGrid} style={{ marginTop: '0.8rem' }}>
              <button
                className={workflow === 'capture' ? styles.button : styles.buttonGhost}
                type="button"
                onClick={() => setPageUi((prev) => ({ ...prev, workflow: 'capture' }))}
              >
                Saisie
              </button>
              <button
                className={workflow === 'analysis' ? styles.button : styles.buttonGhost}
                type="button"
                onClick={() => setPageUi((prev) => ({ ...prev, workflow: 'analysis' }))}
              >
                Analyse
              </button>
            </div>
            <CoreWorkflowNav active="training" showSupport />
          </section>

          {workflow === 'capture' ? (
            <>
              <section className={styles.card}>
                <h2>Saisie seance</h2>
                <p className={styles.smallMuted}>Bloc capture prioritaire: composer le workout, renseigner la duree, importer, puis corriger rapidement.</p>
              </section>
              {captureBlocks.map((block) => (
                <React.Fragment key={block.id}>
                  {block.render()}
                </React.Fragment>
              ))}
            </>
          ) : (
            <>
              <section className={styles.card}>
                <h2>Analyse / progression / muscles</h2>
                <p className={styles.smallMuted}>Bloc lecture: progression exploitable, mapping editable et equilibre musculaire sur la fenetre choisie.</p>
              </section>
              <LayoutBlocks pageId="training-analysis" state={state} setState={setState} blocks={analysisBlocks} />
            </>
          )}
        </div>
      </main>
    </Layout>
  );
}

