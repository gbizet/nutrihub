import React, { useMemo, useState } from 'react';
import styles from '../../pages/dashboard.module.css';
import { getSessionSetDetails, groupSessionsIntoWorkouts } from '../../lib/domainModel.js';
import { rankWorkedMuscleGroups } from '../../lib/exerciseKnowledge.js';

const sessionTopLoad = (session) => getSessionSetDetails(session).reduce(
  (max, setRow) => Math.max(max, Number(setRow.loadDisplayed || setRow.loadEstimated || 0)),
  0,
);

const sessionSets = (session) => getSessionSetDetails(session).length;

const sessionReps = (session) => getSessionSetDetails(session).reduce((acc, setRow) => acc + Number(setRow.reps || 0), 0);

const compactText = (raw, max = 120) => {
  const cleaned = `${raw || ''}`.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trimEnd()}...`;
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

const formatClockWithSeconds = (value) => {
  const raw = `${value || ''}`.trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getHours()}`.padStart(2, '0')
    + ':'
    + `${date.getMinutes()}`.padStart(2, '0')
    + ':'
    + `${date.getSeconds()}`.padStart(2, '0');
};

export default function SessionTimeline({
  sessions,
  exerciseMuscleOverrides = {},
  exerciseOptions = [],
  equipmentOptions = [],
  onRemove,
  onUpdate,
  onUpdateWorkout,
}) {
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const [editingId, setEditingId] = useState('');
  const [editingWorkoutId, setEditingWorkoutId] = useState('');
  const [draft, setDraft] = useState({
    date: '',
    workoutLabel: '',
    exerciseName: '',
    equipment: '',
    durationMin: '',
    sets: '',
    reps: '',
    load: '',
    notes: '',
  });
  const [workoutDraft, setWorkoutDraft] = useState({
    date: '',
    workoutLabel: '',
    durationMin: '',
    workoutNotes: '',
  });

  const workouts = useMemo(() => groupSessionsIntoWorkouts(sessions), [sessions]);

  if (!workouts.length) {
    return <p className={styles.smallMuted}>Aucune session sur cette date.</p>;
  }

  return (
    <div className={styles.trainingTimeline}>
      <datalist id="training-timeline-exercise-options">
        {exerciseOptions.map((name) => <option key={name} value={name} />)}
      </datalist>
      {workouts.map((workout) => {
        const workoutFocus = rankWorkedMuscleGroups(workout.exercises, exerciseMuscleOverrides, { limit: 2 });
        const workoutFocusLabel = workoutFocus.length ? workoutFocus.map((row) => row.label).join(' / ') : 'Focus non detecte';
        const workoutNotes = `${workout.exercises.find((row) => `${row?.workoutNotes || ''}`.trim())?.workoutNotes || ''}`.trim();
        const canEditWorkout = typeof onUpdateWorkout === 'function' && workout.exercises.some((row) => row?.source !== 'cycle-log');
        const workoutDurationLabel = workout.durationSec
          ? formatDurationShort(workout.durationSec)
          : (workout.durationMin > 0 ? `${workout.durationMin} min` : '');
        const workoutTimingLabel = workout.startedAt && workout.endedAt
          ? `${formatClockWithSeconds(workout.startedAt)} -> ${formatClockWithSeconds(workout.endedAt)}`
          : '';
        return (
          <article key={workout.id} className={styles.workoutCard}>
          <div className={styles.sectionHead}>
            <div>
              <h3>{workout.title}</h3>
              <p className={styles.smallMuted}>
                {workout.exerciseCount} exercice(s) | {workout.totalSets} series | {workout.totalReps} reps | volume {workout.totalVolume.toFixed(0)}
                {workoutDurationLabel ? ` | duree ${workoutDurationLabel}` : ''}
              </p>
              <p className={styles.smallMuted}>Focus: {workoutFocusLabel}</p>
              {workoutTimingLabel ? <p className={styles.smallMuted}>Timer: {workoutTimingLabel}</p> : null}
              {workoutNotes ? <p className={styles.smallMuted}>Notes workout: {compactText(workoutNotes, 180)}</p> : null}
            </div>
            <div style={{ display: 'grid', gap: '0.35rem', justifyItems: 'end' }}>
              {canEditWorkout ? (
                <button
                  className={styles.tinyButton}
                  type="button"
                  onClick={() => {
                    setEditingWorkoutId(workout.id);
                    setWorkoutDraft({
                      date: workout.date || '',
                      workoutLabel: workout.title || '',
                      durationMin: workout.durationMin > 0 ? `${workout.durationMin}` : '',
                      workoutNotes,
                    });
                  }}
                >
                  Editer workout
                </button>
              ) : null}
              <span className={`${styles.stateChip} ${styles.statebas}`}>{workout.source || 'manual'}</span>
            </div>
          </div>
          {editingWorkoutId === workout.id ? (
            <div className={styles.formGrid} style={{ marginBottom: '0.8rem' }}>
              <input className={styles.input} type="date" value={workoutDraft.date} onChange={(e) => setWorkoutDraft((prev) => ({ ...prev, date: e.target.value }))} />
              <input className={styles.input} placeholder="Nom du workout" value={workoutDraft.workoutLabel} onChange={(e) => setWorkoutDraft((prev) => ({ ...prev, workoutLabel: e.target.value }))} />
              <input className={styles.input} type="number" placeholder="Duree min" value={workoutDraft.durationMin} onChange={(e) => setWorkoutDraft((prev) => ({ ...prev, durationMin: e.target.value }))} />
              <input className={styles.input} placeholder="Notes workout" value={workoutDraft.workoutNotes} onChange={(e) => setWorkoutDraft((prev) => ({ ...prev, workoutNotes: e.target.value }))} />
              <button
                className={styles.button}
                type="button"
                onClick={() => {
                  onUpdateWorkout(workout, workoutDraft);
                  setEditingWorkoutId('');
                }}
              >
                Enregistrer workout
              </button>
              <button className={styles.buttonGhost} type="button" onClick={() => setEditingWorkoutId('')}>Annuler</button>
            </div>
          ) : null}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Exercice</th><th>Set</th><th>Reps</th><th>Charge</th><th>Temps serie</th><th>Volume</th><th>Notes</th><th>Action</th></tr>
              </thead>
              <tbody>
                {workout.exercises.map((row) => {
                const note = `${row.notes || ''}`.replace(/\s+/g, ' ').trim();
                const expanded = expandedNotes.has(row.id);
                const isLong = note.length > 120;
                const canEdit = row?.source !== 'cycle-log' && typeof onUpdate === 'function';
                const detailRows = getSessionSetDetails(row).map((setRow) => ({
                  setIndex: Number(setRow.setIndex || 0),
                  reps: Number(setRow.reps || 0),
                  load: Number(setRow.loadDisplayed || setRow.loadEstimated || 0),
                  loggedAt: `${setRow.loggedAt || ''}`.trim(),
                  timeLabel: `${setRow.timeLabel || ''}`.trim(),
                  restSincePreviousSetSec:
                    setRow.restSincePreviousSetSec === null || setRow.restSincePreviousSetSec === undefined
                      ? null
                      : Number(setRow.restSincePreviousSetSec || 0),
                  elapsedSinceWorkoutStartSec:
                    setRow.elapsedSinceWorkoutStartSec === null || setRow.elapsedSinceWorkoutStartSec === undefined
                      ? null
                      : Number(setRow.elapsedSinceWorkoutStartSec || 0),
                  setNote: `${setRow.setNote || ''}`.trim(),
                  volume: Number(setRow.reps || 0) * Number(setRow.loadDisplayed || setRow.loadEstimated || 0),
                }));
                return (
                  <React.Fragment key={row.id}>
                    {detailRows.map((detailRow, detailIndex) => (
                      <tr key={`${row.id}-${detailIndex}`}>
                        <td>{detailIndex === 0 ? row.exerciseName || 'Exercice' : <span className={styles.smallMuted}>-</span>}</td>
                        <td>{detailRows.length > 1 ? `#${detailRow.setIndex}` : `${sessionSets(row)}x`}</td>
                        <td>{detailRow.reps}</td>
                        <td>{detailRow.load.toFixed(1)} kg</td>
                        <td>
                          <div>{formatClockWithSeconds(detailRow.loggedAt) || detailRow.timeLabel || '-'}</div>
                          {detailRow.elapsedSinceWorkoutStartSec !== null ? (
                            <div className={styles.smallMuted}>t+{formatDurationShort(detailRow.elapsedSinceWorkoutStartSec)}</div>
                          ) : null}
                          <div className={styles.smallMuted}>
                            {detailRow.restSincePreviousSetSec !== null ? `repos ${formatDurationShort(detailRow.restSincePreviousSetSec)}` : 'repos -'}
                          </div>
                        </td>
                        <td>{detailRow.volume.toFixed(0)}</td>
                        <td>
                          {detailRow.setNote ? (
                            <div style={{ maxWidth: '340px', whiteSpace: 'normal', lineHeight: 1.25 }}>
                              {detailRow.setNote}
                            </div>
                          ) : detailIndex === 0 ? (
                            <>
                              <div style={{ maxWidth: '340px', whiteSpace: 'normal', lineHeight: 1.25 }}>
                                {note ? (expanded ? note : compactText(note, 120)) : '-'}
                              </div>
                              {isLong && (
                                <button
                                  className={styles.tinyButton}
                                  type="button"
                                  style={{ marginTop: '0.3rem' }}
                                  onClick={() => {
                                    setExpandedNotes((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(row.id)) next.delete(row.id);
                                      else next.add(row.id);
                                      return next;
                                    });
                                  }}
                                >
                                  {expanded ? 'Replier' : 'Voir plus'}
                                </button>
                              )}
                            </>
                          ) : (
                            <span className={styles.smallMuted}>-</span>
                          )}
                        </td>
                        <td>
                          {detailIndex === 0 ? (
                            <div style={{ display: 'grid', gap: '0.35rem' }}>
                              {canEdit && (
                                <button
                                  className={styles.tinyButton}
                                  type="button"
                                onClick={() => {
                                  setEditingId(row.id);
                                  setDraft({
                                    date: row.date || '',
                                    workoutLabel: row.workoutLabel || row.sessionGroupLabel || workout.title || '',
                                      exerciseName: row.exerciseName || '',
                                      equipment: row.equipment || '',
                                      durationMin: row.durationMin === null || row.durationMin === undefined ? '' : `${row.durationMin}`,
                                      sets: `${sessionSets(row)}`,
                                      reps: `${sessionReps(row)}`,
                                      load: `${sessionTopLoad(row)}`,
                                      notes: row.notes || '',
                                  });
                                }}
                              >
                                  Editer exo
                                </button>
                              )}
                              <button className={styles.tinyButton} type="button" onClick={() => onRemove(row)}>Suppr.</button>
                            </div>
                          ) : (
                            <span className={styles.smallMuted}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {editingId === row.id && (
                      <tr>
                        <td colSpan="8">
                          <div className={styles.formGrid} style={{ marginTop: '0.4rem' }}>
                            <input className={styles.input} type="date" value={draft.date} onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))} />
                            <input className={styles.input} placeholder="Workout" value={draft.workoutLabel} onChange={(e) => setDraft((prev) => ({ ...prev, workoutLabel: e.target.value }))} />
                            <input className={styles.input} list="training-timeline-exercise-options" placeholder="Exercice" value={draft.exerciseName} onChange={(e) => setDraft((prev) => ({ ...prev, exerciseName: e.target.value }))} />
                            <select className={styles.select} value={draft.equipment} onChange={(e) => setDraft((prev) => ({ ...prev, equipment: e.target.value }))}>
                              <option value="">Materiel</option>
                              {equipmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                            <input className={styles.input} type="number" placeholder="Duree min" value={draft.durationMin} onChange={(e) => setDraft((prev) => ({ ...prev, durationMin: e.target.value }))} />
                            <input className={styles.input} type="number" placeholder="Sets" value={draft.sets} onChange={(e) => setDraft((prev) => ({ ...prev, sets: e.target.value }))} />
                            <input className={styles.input} type="number" placeholder="Reps" value={draft.reps} onChange={(e) => setDraft((prev) => ({ ...prev, reps: e.target.value }))} />
                            <input className={styles.input} type="number" placeholder="Charge kg" value={draft.load} onChange={(e) => setDraft((prev) => ({ ...prev, load: e.target.value }))} />
                            <input className={styles.input} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))} />
                            <button
                              className={styles.button}
                              type="button"
                              onClick={() => {
                                onUpdate(row, draft);
                                setEditingId('');
                              }}
                            >
                              Enregistrer
                            </button>
                            <button className={styles.buttonGhost} type="button" onClick={() => setEditingId('')}>Annuler</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.insightGrid} style={{ marginTop: '0.7rem' }}>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Top charge</div>
              <div className={styles.insightValue}>{Math.max(...workout.exercises.map((row) => sessionTopLoad(row)), 0).toFixed(1)} kg</div>
            </div>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Exercices</div>
              <div className={styles.insightValue}>{workout.exerciseCount}</div>
            </div>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Workout ID</div>
              <div className={styles.insightValue}>{workout.workoutId.slice(0, 18)}</div>
            </div>
          </div>
          </article>
        );
      })}
    </div>
  );
}
