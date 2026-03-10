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

export default function SessionTimeline({ sessions, exerciseMuscleOverrides = {}, onRemove, onUpdate }) {
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState({
    date: '',
    workoutLabel: '',
    durationMin: '',
    sets: '',
    reps: '',
    load: '',
    rir: '',
    notes: '',
  });

  const workouts = useMemo(() => groupSessionsIntoWorkouts(sessions), [sessions]);

  if (!workouts.length) {
    return <p className={styles.smallMuted}>Aucune session sur cette date.</p>;
  }

  return (
    <div className={styles.trainingTimeline}>
      {workouts.map((workout) => {
        const workoutFocus = rankWorkedMuscleGroups(workout.exercises, exerciseMuscleOverrides, { limit: 2 });
        const workoutFocusLabel = workoutFocus.length ? workoutFocus.map((row) => row.label).join(' / ') : 'Focus non detecte';
        return (
          <article key={workout.id} className={styles.workoutCard}>
          <div className={styles.sectionHead}>
            <div>
              <h3>{workout.title}</h3>
              <p className={styles.smallMuted}>
                {workout.exerciseCount} exercice(s) | {workout.totalSets} series | {workout.totalReps} reps | volume {workout.totalVolume.toFixed(0)}
                {workout.durationMin > 0 ? ` | ${workout.durationMin} min` : ''}
              </p>
              <p className={styles.smallMuted}>Focus: {workoutFocusLabel}</p>
            </div>
            <span className={`${styles.stateChip} ${styles.statebas}`}>{workout.source || 'manual'}</span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr><th>Exercice</th><th>Set</th><th>Reps</th><th>Charge</th><th>Volume</th><th>Notes</th><th>Action</th></tr>
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
                        <td>{detailRow.volume.toFixed(0)}</td>
                        <td>
                          {detailIndex === 0 ? (
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
                                      durationMin: row.durationMin === null || row.durationMin === undefined ? '' : `${row.durationMin}`,
                                      sets: `${sessionSets(row)}`,
                                      reps: `${sessionReps(row)}`,
                                      load: `${sessionTopLoad(row)}`,
                                      rir: row.rir === null || row.rir === undefined ? '' : `${row.rir}`,
                                      notes: row.notes || '',
                                    });
                                  }}
                                >
                                  Editer
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
                        <td colSpan="7">
                          <div className={styles.formGrid} style={{ marginTop: '0.4rem' }}>
                            <input className={styles.input} type="date" value={draft.date} onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))} />
                            <input className={styles.input} placeholder="Workout" value={draft.workoutLabel} onChange={(e) => setDraft((prev) => ({ ...prev, workoutLabel: e.target.value }))} />
                            <input className={styles.input} type="number" placeholder="Duree min" value={draft.durationMin} onChange={(e) => setDraft((prev) => ({ ...prev, durationMin: e.target.value }))} />
                            <input className={styles.input} type="number" placeholder="Sets" value={draft.sets} onChange={(e) => setDraft((prev) => ({ ...prev, sets: e.target.value }))} />
                            <input className={styles.input} type="number" placeholder="Reps" value={draft.reps} onChange={(e) => setDraft((prev) => ({ ...prev, reps: e.target.value }))} />
                            <input className={styles.input} type="number" placeholder="Charge kg" value={draft.load} onChange={(e) => setDraft((prev) => ({ ...prev, load: e.target.value }))} />
                            <input className={styles.input} type="number" placeholder="RIR" value={draft.rir} onChange={(e) => setDraft((prev) => ({ ...prev, rir: e.target.value }))} />
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
