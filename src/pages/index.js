import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import { formatMacrosLine, useDashboardState } from '../lib/dashboardStore';
import {
  aggregateNutritionByDay,
  aggregateSessionsByDay,
  aggregateWeightByDay,
  isoDaysWindow,
  pointDelta,
  toSeriesValue,
} from '../lib/charts';
import { dailyActionPlan, readinessScore } from '../lib/coachEngine';
import { countLoggedMeals, getSessionsForDate, getWorkoutsForDate } from '../lib/domainModel';
import { rankWorkedMuscleGroups } from '../lib/exerciseKnowledge.js';
import { getHealthSnapshotForDate, getHealthSnapshotsForDates } from '../lib/healthState.js';
import { METRICS, clampPercent, formatMetric } from '../lib/nutritionAnalytics.js';
import InteractiveLineChart from '../components/InteractiveLineChart';
import CoreWorkflowNav from '../components/CoreWorkflowNav';
import DateNav from '../components/DateNav';

const formatDelta = (value, unit = '') => `${value >= 0 ? '+' : ''}${value.toFixed(1)}${unit}`;
const formatMuscleFocus = (rows) => rows.map((row) => row.label).join(' / ');
const todayIso = () => new Date().toISOString().slice(0, 10);

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
  const nutritionGoals = useMemo(
    () => state.goals || { kcal: 2200, protein: 180, carbs: 180, fat: 70 },
    [state.goals],
  );
  const nutritionLimits = useMemo(
    () => state.limits || {
      kcal: { min: 2000, max: 2400 },
      protein: { min: 160, max: 220 },
      carbs: { min: 120, max: 220 },
      fat: { min: 45, max: 90 },
    },
    [state.limits],
  );

  const days = useMemo(() => isoDaysWindow(state.selectedDate, 7), [state.selectedDate]);

  const weightSeries = useMemo(() => aggregateWeightByDay(state.metrics, days), [days, state.metrics]);
  const healthWindow = useMemo(
    () => getHealthSnapshotsForDates(state, days, { carryForward: false }),
    [days, state],
  );
  const kcalSeries = useMemo(() => {
    const entryDates = new Set((state.entries || []).map((entry) => entry.date));
    const estimatedCaloriesDates = new Set(
      (state.dailyLogs || [])
        .filter((log) => log?.caloriesEstimated !== null && log?.caloriesEstimated !== undefined && `${log.caloriesEstimated}`.trim() !== '')
        .map((log) => log.date),
    );
    const rows = aggregateNutritionByDay(state.entries, days, state.dailyLogs);
    return rows.map((row) => ({
      date: row.date,
      value: entryDates.has(row.date) || estimatedCaloriesDates.has(row.date) ? toSeriesValue(row.kcal) : null,
    }));
  }, [days, state.dailyLogs, state.entries]);
  const sessionsSeries = useMemo(() => {
    const rows = aggregateSessionsByDay(state.sessions, days, state.dailyLogs, state.cycleLogs);
    const completedCycleLogs = new Set(
      (state.cycleLogs || [])
        .filter((row) => row?.done || Number(row?.load || 0) > 0)
        .map((row) => row.date),
    );
    const trainingLogDates = new Set(
      (state.dailyLogs || [])
        .filter((row) => row?.training)
        .map((row) => row.date),
    );
    const manualSessionDates = new Set((state.sessions || []).map((row) => row.date));
    const isTodaySelected = state.selectedDate === todayIso();
    return rows.map((row) => {
      const hasLoggedTraining = manualSessionDates.has(row.date) || completedCycleLogs.has(row.date) || trainingLogDates.has(row.date);
      const shouldMaskPendingToday = isTodaySelected && row.date === state.selectedDate && !hasLoggedTraining;
      return {
        date: row.date,
        value: shouldMaskPendingToday ? null : toSeriesValue(row.value),
      };
    });
  }, [days, state.cycleLogs, state.dailyLogs, state.selectedDate, state.sessions]);

  const weightDelta = pointDelta(weightSeries);
  const kcalDelta = pointDelta(kcalSeries);
  const sessionsDelta = pointDelta(sessionsSeries);
  const sleepSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: toSeriesValue(row.sleepHours, { zeroIsMissing: true }) })),
    [healthWindow],
  );
  const stepsSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: toSeriesValue(row.steps, { zeroIsMissing: true }) })),
    [healthWindow],
  );
  const bpSystolicSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: row.bloodPressureSystolic ?? null })),
    [healthWindow],
  );
  const bpDiastolicSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: row.bloodPressureDiastolic ?? null })),
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
  const homeSummaryCards = useMemo(() => ([
    {
      label: 'Readiness',
      value: `${readiness}/100`,
      meta: selectedHealth.sleepHours > 0 ? `${selectedHealth.sleepHours.toFixed(1)} h sommeil` : 'Sommeil -',
    },
    {
      label: 'Poids',
      value: metricsForSelectedDay?.weight ? `${Number(metricsForSelectedDay.weight).toFixed(1)} kg` : '-',
      meta: `Kcal 7j ${weeklyCalories.toFixed(0)}`,
    },
    {
      label: 'Training',
      value: workoutsForSelectedDay.length ? `${trainingSetsForSelectedDay} sets` : 'Repos',
      meta: workoutsForSelectedDay.length
        ? `${trainingFocusLabel}${trainingDurationForSelectedDay > 0 ? ` | ${trainingDurationForSelectedDay} min` : ''}`
        : 'Aucun workout logge',
    },
    {
      label: 'Sante',
      value: selectedHealth.steps ? `${selectedHealth.steps} pas` : '-',
      meta: latestHealthDate ? `Maj ${latestHealthDate}` : 'Aucune donnee sante',
    },
  ]), [
    latestHealthDate,
    metricsForSelectedDay?.weight,
    readiness,
    selectedHealth.sleepHours,
    selectedHealth.steps,
    trainingDurationForSelectedDay,
    trainingFocusLabel,
    trainingSetsForSelectedDay,
    weeklyCalories,
    workoutsForSelectedDay.length,
  ]);
  const macroGaugeItems = useMemo(
    () => METRICS.map((metric) => {
      const value = Number(dayMacros?.[metric.key] || 0);
      const min = Number(nutritionLimits?.[metric.key]?.min ?? 0);
      const max = Number(nutritionLimits?.[metric.key]?.max ?? 0);
      const goal = Number(nutritionGoals?.[metric.key] ?? 0);
      const reference = Math.max(goal || 0, max || 0, min || 0, value || 0, 1);
      const stateKey = value < min ? 'bas' : (max > 0 && value > max ? 'haut' : 'ok');
      const goalLabel = goal > 0
        ? `obj ${formatMetric(goal, metric.unit, 0)}`
        : (max > 0 ? `cible ${min}-${max} ${metric.unit}` : `min ${min} ${metric.unit}`);
      return {
        ...metric,
        value,
        stateKey,
        fillPercent: clampPercent(value, reference),
        goalLabel,
      };
    }),
    [dayMacros, nutritionGoals, nutritionLimits],
  );

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
      to: '/support',
      title: 'Support',
      eyebrow: 'Surfaces secondaires',
      value: '6 outils',
      meta: 'Export AI, Sync, NEAT, Audit, Admin',
    },
  ];

  return (
    <Layout
      title="Pilotage cut et home gym"
      description="Hub V2 recentre sur accueil, poids, nutrition et training"
      mobileTitleShort="Accueil"
    >
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <div className={styles.heroHeaderRow}>
              <div className={styles.heroTitleWrap}>
                <span className={styles.heroEyebrow}>Pilotage quotidien</span>
                <h1>Pilotage cut et home gym</h1>
                <p>Vue mobile compacte: les signaux utiles d abord, puis les workflows coeur.</p>
              </div>
              <div className={styles.heroControlCard}>
                <span className={styles.smallMuted}>Jour actif</span>
                <DateNav value={state.selectedDate} onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))} />
                <span className={styles.smallMuted}>Tension {selectedHealth.bloodPressure || '-'} | repas {loggedMealsForSelectedDay}</span>
              </div>
            </div>
            <div className={styles.summaryStrip}>
              {homeSummaryCards.map((item) => (
                <div key={item.label} className={styles.summaryMetric}>
                  <div className={styles.summaryMetricLabel}>{item.label}</div>
                  <div className={styles.summaryMetricValue}>{item.value}</div>
                  <div className={styles.summaryMetricMeta}>{item.meta}</div>
                </div>
              ))}
            </div>
            <div className={styles.macroGaugeGrid}>
              {macroGaugeItems.map((metric) => (
                <Link key={metric.key} className={styles.macroGaugeCard} to="/nutrition">
                  <div className={styles.macroGaugeTop}>
                    <span className={styles.macroGaugeLabel}>{metric.label}</span>
                    <strong className={styles.macroGaugeValue}>{formatMetric(metric.value, metric.unit, 0)}</strong>
                  </div>
                  <div className={styles.macroGaugeMeta}>{metric.goalLabel}</div>
                  <div className={styles.macroGaugeTrack}>
                    <div
                      className={`${styles.macroGaugeFill} ${styles[`heroFill${metric.stateKey}`]}`}
                      style={{ width: `${metric.fillPercent}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
            <CoreWorkflowNav active="home" supportMode="hub" />
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
                <div className={styles.insightItem}><div className={styles.insightLabel}>FC moyenne</div><div className={styles.insightValue}>{selectedHealth.avgHeartRate || '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Tension</div><div className={styles.insightValue}>{selectedHealth.bloodPressure || '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Oxygene</div><div className={styles.insightValue}>{selectedHealth.oxygenSaturationPercent ? `${selectedHealth.oxygenSaturationPercent.toFixed(1)}%` : '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Pas</div><div className={styles.insightValue}>{selectedHealth.steps || '-'}</div></div>
                <div className={styles.insightItem}><div className={styles.insightLabel}>Dernier jour sante</div><div className={styles.insightValue}>{latestHealthDate || '-'}</div></div>
              </div>
              {!selectedHealth.sleepHours && !selectedHealth.steps && !selectedHealth.avgHeartRate && !selectedHealth.bloodPressure ? (
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

          <section>
            <details open className={`${styles.card} ${styles.detailsCard}`}>
              <summary className={styles.cardSummary}>Tendances secondaires</summary>
              <div className={styles.grid2}>
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

                <article className={styles.card}>
                  <div className={styles.sectionHead}>
                    <h2 style={{ marginBottom: 0 }}>Tension 7j</h2>
                    <span className={styles.smallMuted}>systolique / diastolique</span>
                  </div>
                  <InteractiveLineChart
                    ariaLabel="Tension arterielle 7 jours interactif"
                    xLabel="Date"
                    yLabel="mmHg"
                    series={[
                      { id: 'bp-sys', label: 'Systolique', color: '#7c2d12', data: bpSystolicSeries },
                      { id: 'bp-dia', label: 'Diastolique', color: '#b45309', data: bpDiastolicSeries },
                    ]}
                    valueFormat={(v) => `${Number(v).toFixed(0)}`}
                    dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                    onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
                  />
                </article>
              </div>
            </details>
          </section>
        </div>
      </main>
    </Layout>
  );
}
