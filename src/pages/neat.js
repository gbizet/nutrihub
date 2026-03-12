import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import DateNav from '../components/DateNav';
import { toPositive, useDashboardState } from '../lib/dashboardStore';
import { getHealthSnapshotForDate, isActionableHealthActivityRow } from '../lib/healthState.js';
import InteractiveLineChart from '../components/InteractiveLineChart';
import CoreWorkflowNav from '../components/CoreWorkflowNav';
import { toSeriesValue } from '../lib/charts.js';

export default function NeatPage() {
  const { state, setState, uid } = useDashboardState();
  const [draft, setDraft] = useState({ steps: '', cardioMin: '', caloriesActive: '' });
  const selectedNeat = useMemo(
    () => (state.neatLogs || []).find((entry) => entry.date === state.selectedDate) || null,
    [state.neatLogs, state.selectedDate],
  );
  const displayNeat = useMemo(
    () => (isActionableHealthActivityRow(selectedNeat) ? selectedNeat : null),
    [selectedNeat],
  );
  const selectedHealth = useMemo(
    () => getHealthSnapshotForDate(state, state.selectedDate, { carryForward: false }),
    [state, state.selectedDate],
  );

  useEffect(() => {
    setDraft({
      steps: displayNeat?.steps ?? selectedHealth.steps ?? '',
      cardioMin: displayNeat?.activeMinutes ?? displayNeat?.cardioMin ?? selectedHealth.activeMinutes ?? '',
      caloriesActive: displayNeat?.caloriesActive ?? selectedHealth.caloriesActive ?? '',
    });
  }, [displayNeat, selectedHealth.activeMinutes, selectedHealth.caloriesActive, selectedHealth.steps]);

  const save = () => {
    const row = {
      id: uid(),
      date: state.selectedDate,
      steps: toPositive(draft.steps, 0),
      cardioMin: toPositive(draft.cardioMin, 0),
      caloriesActive: toPositive(draft.caloriesActive, 0),
    };
    setState((prev) => {
      const keep = (prev.neatLogs || []).filter((x) => x.date !== prev.selectedDate);
      return { ...prev, neatLogs: [row, ...keep] };
    });
  };

  const recent = useMemo(
    () => [...(state.neatLogs || [])]
      .filter((row) => isActionableHealthActivityRow(row))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14),
    [state.neatLogs],
  );

  return (
    <Layout title="NEAT" description="Suivi pas, cardio et depense active">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>NEAT & cardio</h1>
            <p>Tracke le mouvement quotidien pour ajuster nutrition et recuperation.</p>
            <div className={styles.metaRow}>
              <DateNav value={state.selectedDate} onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))} />
              <span className={styles.pill}>Logs: {recent.length}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Source: {selectedHealth.sources.activity?.provider || displayNeat?.healthSource?.provider || 'manuel'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Minutes actives: {selectedHealth.activeMinutes || 0}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Pas: {selectedHealth.steps || '-'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Calories actives: {selectedHealth.caloriesActive || '-'}</span>
            </div>
            <CoreWorkflowNav active="neat" supportMode="full" />
          </section>
          <section className={styles.grid2}>
            <article className={styles.card}>
              <h2>Capture jour</h2>
              <p className={styles.smallMuted}>
                Snapshot actif: {selectedHealth.steps || 0} pas | {selectedHealth.activeMinutes || 0} min actives | {selectedHealth.caloriesActive || 0} kcal actives.
              </p>
              <p className={styles.smallMuted}>
                Saisie editable du jour. Les champs sont precharges avec la valeur exacte importee si elle existe pour {state.selectedDate}.
              </p>
              <div className={styles.formGrid}>
                <input className={styles.input} type="number" placeholder="Pas" value={draft.steps} onChange={(e) => setDraft((p) => ({ ...p, steps: e.target.value }))} />
                <input className={styles.input} type="number" placeholder="Cardio min" value={draft.cardioMin} onChange={(e) => setDraft((p) => ({ ...p, cardioMin: e.target.value }))} />
                <input className={styles.input} type="number" placeholder="Calories actives" value={draft.caloriesActive} onChange={(e) => setDraft((p) => ({ ...p, caloriesActive: e.target.value }))} />
                <button className={styles.button} type="button" onClick={save}>Sauvegarder</button>
              </div>
            </article>
            <article className={styles.card}>
              <h2>Pas / 14 jours</h2>
              <InteractiveLineChart
                ariaLabel="Pas sur 14 jours"
                xLabel="Date"
                yLabel="Pas"
                series={[{
                  id: 'steps',
                  label: 'Pas',
                  color: '#0f172a',
                  data: recent.map((x) => ({ date: x.date, value: toSeriesValue(x.steps, { zeroIsMissing: true }) })),
                }]}
                valueFormat={(v) => `${Number(v).toFixed(0)}`}
                dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
              />
            </article>
          </section>
          <section className={styles.card}>
            <h2>Cardio min / 14 jours</h2>
            <InteractiveLineChart
              ariaLabel="Cardio minutes sur 14 jours"
              xLabel="Date"
              yLabel="Minutes"
              series={[{
                id: 'cardio',
                label: 'Cardio min',
                color: '#f97316',
                data: recent.map((x) => ({ date: x.date, value: toSeriesValue(x.cardioMin, { zeroIsMissing: true }) })),
              }]}
              valueFormat={(v) => `${Number(v).toFixed(0)} min`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
          </section>
          <section className={styles.card}>
            <h2>Calories actives / 14 jours</h2>
            <InteractiveLineChart
              ariaLabel="Calories actives sur 14 jours"
              xLabel="Date"
              yLabel="kcal"
              series={[{
                id: 'active-kcal',
                label: 'Calories actives',
                color: '#2563eb',
                data: recent.map((x) => ({ date: x.date, value: toSeriesValue(x.caloriesActive, { zeroIsMissing: true }) })),
              }]}
              valueFormat={(v) => `${Number(v).toFixed(0)} kcal`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
          </section>
        </div>
      </main>
    </Layout>
  );
}
