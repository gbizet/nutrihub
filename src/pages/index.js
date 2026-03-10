import React, { useMemo } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './dashboard.module.css';
import { formatMacrosLine, useDashboardState } from '../lib/dashboardStore';
import {
  aggregateNutritionByDay,
  aggregateSessionsByDay,
  aggregateWeightByDay,
  isoDaysWindow,
  pointDelta,
} from '../lib/charts';
import { dailyActionPlan, readinessScore } from '../lib/coachEngine';
import { countLoggedMeals, getSessionsForDate, getWorkoutsForDate } from '../lib/domainModel';
import { rankWorkedMuscleGroups } from '../lib/exerciseKnowledge.js';
import { getHealthSnapshotForDate, getHealthSnapshotsForDates } from '../lib/healthState.js';
import InteractiveLineChart from '../components/InteractiveLineChart';
import CoreWorkflowNav from '../components/CoreWorkflowNav';
import DateNav from '../components/DateNav';

const SUPPORT_LINKS = [
  { to: '/foods', title: 'Foods', text: 'Bibliotheque support et nettoyage anti-doublons.' },
  { to: '/neat', title: 'NEAT', text: 'Pas, cardio, depense active et jours off.' },
  { to: '/integrations', title: 'Sync', text: 'Google Drive, wearable CSV et synchro multi-device simple.' },
  { to: '/data-admin', title: 'Data', text: 'Import, export, snapshots et patchs bruts.' },
  { to: '/summary', title: 'Resume', text: 'Vue secondaire de controle, hors parcours principal.' },
];

const formatDelta = (value, unit = '') => `${value >= 0 ? '+' : ''}${value.toFixed(1)}${unit}`;
const formatMuscleFocus = (rows) => rows.map((row) => row.label).join(' / ');

export default function HomePage() {
  const { state, setState, entriesForSelectedDay, metricsForSelectedDay, dayMacros } = useDashboardState();
  const loggedMealsForSelectedDay = useMemo(
    () => countLoggedMeals(entriesForSelectedDay),
    [entriesForSelectedDay],
  );
  const sessionsForSelectedDay = useMemo(() => getSessionsForDate(state, state.selectedDate), [state, state.selectedDate]);
  const workoutsForSelectedDay = useMemo(() => getWorkoutsForDate(state, state.selectedDate), [state, state.selectedDate]);
  const readiness = useMemo(() => readinessScore(state, state.selectedDate), [state, state.selectedDate]);
  const actions = useMemo(() => dailyActionPlan(state, state.selectedDate).slice(0, 5), [state, state.selectedDate]);
  const selectedHealth = useMemo(
    () => getHealthSnapshotForDate(state, state.selectedDate, { carryForward: false }),
    [state, state.selectedDate],
  );
  const trainingFocus = useMemo(
    () => rankWorkedMuscleGroups(sessionsForSelectedDay, state.exerciseMuscleOverrides, { limit: 3 }),
    [sessionsForSelectedDay, state.exerciseMuscleOverrides],
  );
  const trainingFocusLabel = useMemo(
    () => (trainingFocus.length ? formatMuscleFocus(trainingFocus) : 'Repos'),
    [trainingFocus],
  );
  const trainingSetsForSelectedDay = useMemo(
    () => workoutsForSelectedDay.reduce((sum, workout) => sum + Number(workout.totalSets || 0), 0),
    [workoutsForSelectedDay],
  );
  const trainingDurationForSelectedDay = useMemo(
    () => workoutsForSelectedDay.reduce((sum, workout) => sum + Number(workout.durationMin || 0), 0),
    [workoutsForSelectedDay],
  );

  const days = useMemo(() => isoDaysWindow(state.selectedDate, 7), [state.selectedDate]);

  const weightSeries = useMemo(() => aggregateWeightByDay(state.metrics, days), [days, state.metrics]);
  const healthWindow = useMemo(
    () => getHealthSnapshotsForDates(state, days, { carryForward: false }),
    [days, state],
  );
  const kcalSeries = useMemo(() => {
    const rows = aggregateNutritionByDay(state.entries, days, state.dailyLogs);
    return rows.map((row) => ({ date: row.date, value: row.kcal }));
  }, [days, state.dailyLogs, state.entries]);
  const sessionsSeries = useMemo(
    () => aggregateSessionsByDay(state.sessions, days, state.dailyLogs, state.cycleLogs),
    [days, state.cycleLogs, state.dailyLogs, state.sessions],
  );

  const weightDelta = pointDelta(weightSeries);
  const kcalDelta = pointDelta(kcalSeries);
  const sessionsDelta = pointDelta(sessionsSeries);
  const sleepSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: row.sleepHours || 0 })),
    [healthWindow],
  );
  const stepsSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: row.steps || 0 })),
    [healthWindow],
  );

  const weeklyCalories = useMemo(
    () => kcalSeries.reduce((sum, row) => sum + Number(row.value || 0), 0),
    [kcalSeries],
  );
  const latestHealthDate = useMemo(() => {
    const dates = [
      ...(state.metrics || []).filter((row) => row?.healthSource?.provider).map((row) => row.date),
      ...(state.neatLogs || []).filter((row) => row?.healthSource?.provider).map((row) => row.date),
      ...(state.dailyLogs || []).filter((row) => row?.healthSources?.sleep?.provider || row?.healthSources?.vitals?.provider).map((row) => row.date),
    ].filter(Boolean);
    return dates.sort().at(-1) || '';
  }, [state.dailyLogs, state.metrics, state.neatLogs]);

  const workflowCards = [
    {
      to: '/metrics',
      title: 'Poids',
      eyebrow: 'Thermometre principal',
      value: metricsForSelectedDay?.weight ? `${Number(metricsForSelectedDay.weight).toFixed(1)} kg` : '-',
      meta: `Delta 7j ${formatDelta(weightDelta, ' kg')}`,
    },
    {
      to: '/nutrition',
      title: 'Nutrition',
      eyebrow: 'Adherence du jour',
      value: `${loggedMealsForSelectedDay} repas`,
      meta: formatMacrosLine(dayMacros),
    },
    {
      to: '/training',
      title: 'Training',
      eyebrow: 'Performance du jour',
      value: workoutsForSelectedDay.length ? `${workoutsForSelectedDay.length} workout${workoutsForSelectedDay.length > 1 ? 's' : ''}` : 'Repos',
      meta: workoutsForSelectedDay.length
        ? `${trainingFocusLabel} | ${trainingSetsForSelectedDay} series${trainingDurationForSelectedDay > 0 ? ` | ${trainingDurationForSelectedDay} min` : ''}`
        : 'Aucun workout logge',
    },
    {
      to: '/prompt-builder',
      title: 'Export AI',
      eyebrow: 'Analyse sur periode',
      value: `${days.length} jours`,
      meta: 'JSON propre + prompt pret a coller',
    },
  ];

  return (
    <Layout title="Pilotage cut et home gym" description="Hub V2 recentre sur poids, nutrition, training et export AI">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Pilotage cut et home gym</h1>
            <p>Quatre workflows coeur. Une seule question: ou en es-tu aujourd hui, et quoi faire ensuite.</p>
            <div className={styles.metaRow}>
              <DateNav value={state.selectedDate} onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))} />
              <span className={styles.pill}>Readiness: {readiness}/100</span>
              <span className={styles.pill}>Poids: {metricsForSelectedDay?.weight ? `${Number(metricsForSelectedDay.weight).toFixed(1)} kg` : '-'}</span>
              <span className={styles.pill}>Kcal 7j: {weeklyCalories.toFixed(0)}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Sommeil: {selectedHealth.sleepHours > 0 ? `${selectedHealth.sleepHours.toFixed(1)} h` : '-'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Pas: {selectedHealth.steps || '-'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>FC repos: {selectedHealth.restingBpm || '-'}</span>
            </div>
            <CoreWorkflowNav active="home" showSupport />
          </section>

          <section className={styles.workflowGrid}>
            {workflowCards.map((item) => (
              <Link key={item.to} className={styles.workflowCard} to={item.to}>
                <div className={styles.workflowEyebrow}>{item.eyebrow}</div>
                <h2 style={{ margin: '0.35rem 0 0' }}>{item.title}</h2>
                <div className={styles.workflowValue}>{item.value}</div>
                <div className={styles.workflowMeta}>{item.meta}</div>
              </Link>
            ))}
          </section>

          <section className={styles.grid2}>
            <article className={styles.card}>
              <div className={styles.sectionHead}>
                <h2 style={{ marginBottom: 0 }}>Sante du jour</h2>
                <span className={styles.smallMuted}>valeurs exactes pour {state.selectedDate}</span>
              </div>
              <div className={styles.insightGrid}>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Sommeil</div><div className={styles.insightValue}>{selectedHealth.sleepHours > 0 ? `${selectedHealth.sleepHours.toFixed(1)} h` : '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>FC repos</div><div className={styles.insightValue}>{selectedHealth.restingBpm || '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>FC moyenne</div><div className={styles.insightValue}>{selectedHealth.avgHeartRate || '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>HRV</div><div className={styles.insightValue}>{selectedHealth.hrvMs || '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Tension</div><div className={styles.insightValue}>{selectedHealth.bloodPressure || '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Oxygene</div><div className={styles.insightValue}>{selectedHealth.oxygenSaturationPercent ? `${selectedHealth.oxygenSaturationPercent.toFixed(1)}%` : '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Glycemie</div><div className={styles.insightValue}>{selectedHealth.bloodGlucoseMgDl ? `${selectedHealth.bloodGlucoseMgDl.toFixed(0)} mg/dL` : '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Pas</div><div className={styles.insightValue}>{selectedHealth.steps || '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Dernier jour sante</div><div className={styles.insightValue}>{latestHealthDate || '-'}</div></div>
              </div>
              {!selectedHealth.sleepHours && !selectedHealth.steps && !selectedHealth.restingBpm ? (
                <p className={styles.smallMuted} style={{ marginTop: '0.7rem' }}>
                  Aucune donnee sante exacte sur {state.selectedDate}. Dernier jour remonte: {latestHealthDate || 'inconnu'}.
                </p>
              ) : null}
            </article>

            <article className={styles.card}>
              <h2>Decision du jour</h2>
              <p className={styles.smallMuted}>
                Poids {metricsForSelectedDay?.weight ?? '-'} kg | macros {formatMacrosLine(dayMacros)} | training {workoutsForSelectedDay.length ? `${workoutsForSelectedDay.length} workout(s) ${trainingFocusLabel}` : 'repos'} | sommeil {selectedHealth.sleepHours > 0 ? `${selectedHealth.sleepHours.toFixed(1)}h` : '-'} | pas {selectedHealth.steps || '-'}.
              </p>
              <ul className={styles.list}>
                {actions.map((action) => (
                  <li key={action}>
                    <div className={styles.smallMuted}>{action}</div>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className={styles.grid3}>
            <article className={styles.card}>
              <div className={styles.sectionHead}>
                <h2 style={{ marginBottom: 0 }}>Poids 7j</h2>
                <span className={styles.smallMuted}>{formatDelta(weightDelta, ' kg')}</span>
              </div>
              <InteractiveLineChart
                ariaLabel="Poids 7 jours interactif"
                xLabel="Date"
                yLabel="kg"
                series={[{ id: 'weight', label: 'Poids', color: '#0f172a', data: weightSeries }]}
                valueFormat={(v) => `${Number(v).toFixed(1)}kg`}
                dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
              />
            </article>

            <article className={styles.card}>
              <div className={styles.sectionHead}>
                <h2 style={{ marginBottom: 0 }}>Kcal 7j</h2>
                <span className={styles.smallMuted}>{formatDelta(kcalDelta, ' kcal')}</span>
              </div>
              <InteractiveLineChart
                ariaLabel="Calories 7 jours interactif"
                xLabel="Date"
                yLabel="kcal"
                series={[{ id: 'kcal', label: 'Kcal', color: '#f97316', data: kcalSeries }]}
                valueFormat={(v) => `${Number(v).toFixed(0)}`}
                dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
              />
            </article>

            <article className={styles.card}>
              <div className={styles.sectionHead}>
                <h2 style={{ marginBottom: 0 }}>Training 7j</h2>
                <span className={styles.smallMuted}>{formatDelta(sessionsDelta, '')}</span>
              </div>
              <InteractiveLineChart
                ariaLabel="Workouts 7 jours interactif"
                xLabel="Date"
                yLabel="Nb workouts"
                series={[{ id: 'sessions', label: 'Workouts training', color: '#16a34a', data: sessionsSeries }]}
                valueFormat={(v) => `${Number(v).toFixed(0)}`}
                dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
              />
            </article>
          </section>

          <section className={styles.grid2}>
            <article className={styles.card}>
              <div className={styles.sectionHead}>
                <h2 style={{ marginBottom: 0 }}>Sommeil 7j</h2>
                <span className={styles.smallMuted}>bridge sante commun</span>
              </div>
              <InteractiveLineChart
                ariaLabel="Sommeil 7 jours interactif"
                xLabel="Date"
                yLabel="heures"
                series={[{ id: 'sleep', label: 'Sommeil', color: '#0f172a', data: sleepSeries }]}
                valueFormat={(v) => `${Number(v).toFixed(1)} h`}
                dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
              />
            </article>

            <article className={styles.card}>
              <div className={styles.sectionHead}>
                <h2 style={{ marginBottom: 0 }}>Pas 7j</h2>
                <span className={styles.smallMuted}>NEAT / activite</span>
              </div>
              <InteractiveLineChart
                ariaLabel="Pas 7 jours interactif"
                xLabel="Date"
                yLabel="pas"
                series={[{ id: 'steps', label: 'Pas', color: '#2563eb', data: stepsSeries }]}
                valueFormat={(v) => `${Number(v).toFixed(0)}`}
                dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
              />
            </article>
          </section>

          <section>
            <article className={`${styles.card} ${styles.supportPanel}`}>
              <h2>Support</h2>
              <div className={styles.linkGrid}>
                {SUPPORT_LINKS.map((item) => (
                  <Link key={item.to} className={styles.linkCard} to={item.to}>
                    <strong>{item.title}</strong>
                    <p className={styles.smallMuted}>{item.text}</p>
                  </Link>
                ))}
              </div>
            </article>
          </section>
        </div>
      </main>
    </Layout>
  );
}
