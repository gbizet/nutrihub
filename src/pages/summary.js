import React, { useMemo, useState } from 'react';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import { formatMacrosLine, toNumber, useDashboardState } from '../lib/dashboardStore';
import { pointDelta, toSeriesValue } from '../lib/charts';
import chatgptDatasetS1S2 from '../lib/chatgptDatasetS1S2';
import LayoutBlocks from '../components/LayoutBlocks';
import DateNav from '../components/DateNav';
import { nutritionSignalsForDay } from '../lib/coachEngine';
import { countLoggedMeals, getSessionsForDate, getWorkoutsForDate } from '../lib/domainModel';
import { getHealthSnapshotForDate, getHealthSnapshotsForDates } from '../lib/healthState.js';
import InteractiveLineChart from '../components/InteractiveLineChart';
import CoreWorkflowNav from '../components/CoreWorkflowNav';

const dayBounds = (selectedDate, days) => {
  const end = new Date(selectedDate);
  const start = new Date(selectedDate);
  start.setDate(end.getDate() - (days - 1));
  return { start, end };
};

const parseDatasetFromText = (rawText) => {
  const matches = rawText.match(/\{[\s\S]*?\}/g) || [];
  const parsed = [];
  matches.forEach((block) => {
    try {
      const row = JSON.parse(block);
      if (row?.date) parsed.push(row);
    } catch (error) {
      // ignore invalid blocks
    }
  });
  return parsed;
};

export default function SummaryPage() {
  const {
    state,
    setState,
    entriesForSelectedDay,
    sessionsForSelectedDay,
    metricsForSelectedDay,
    dailyLogForSelectedDay,
    dayMacros,
    uid,
  } = useDashboardState();
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [windowDays, setWindowDays] = useState(7);
  const selectedHealth = useMemo(
    () => getHealthSnapshotForDate(state, state.selectedDate, { carryForward: false }),
    [state, state.selectedDate],
  );
  const workoutsForSelectedDay = useMemo(
    () => getWorkoutsForDate(state, state.selectedDate),
    [state, state.selectedDate],
  );
  const loggedMealsForSelectedDay = useMemo(
    () => countLoggedMeals(entriesForSelectedDay),
    [entriesForSelectedDay],
  );

  const weeklyRows = useMemo(() => {
    const { start, end } = dayBounds(state.selectedDate, windowDays);
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().slice(0, 10));
    }

    return dates.map((date) => {
      const dayEntries = state.entries.filter((entry) => entry.date === date);
      const daySessions = getSessionsForDate(state, date);
      const dayWorkouts = getWorkoutsForDate(state, date);
      const dayMetrics = state.metrics.find((m) => m.date === date);
      const dayLog = state.dailyLogs.find((m) => m.date === date);
      const health = getHealthSnapshotForDate(state, date, { carryForward: false });
      const macros = dayEntries.reduce(
        (acc, entry) => ({
          kcal: acc.kcal + entry.macros.kcal,
          protein: acc.protein + entry.macros.protein,
          carbs: acc.carbs + entry.macros.carbs,
          fat: acc.fat + entry.macros.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      );
      return {
        date,
        meals: countLoggedMeals(dayEntries),
        workouts: dayWorkouts.length,
        exerciseBlocks: daySessions.length,
        weight: dayMetrics?.weight ?? null,
        bf: dayMetrics?.bodyFat ?? null,
        kcal: dayEntries.length > 0
          ? macros.kcal
          : (dayLog?.caloriesEstimated !== null && dayLog?.caloriesEstimated !== undefined && `${dayLog.caloriesEstimated}`.trim() !== ''
            ? toNumber(dayLog?.caloriesEstimated)
            : null),
        fatigue: dayLog?.fatigueNervousSystem ?? null,
        sleep: health.sleepHours,
        steps: health.steps,
        restingBpm: health.restingBpm,
        oxygen: health.oxygenSaturationPercent,
        bloodPressureSystolic: health.bloodPressureSystolic,
        bloodPressureDiastolic: health.bloodPressureDiastolic,
      };
    });
  }, [state.cycleLogs, state.dailyLogs, state.entries, state.metrics, state.neatLogs, state.selectedDate, state.sessions, windowDays]);

  const weeklyTotals = useMemo(
    () =>
      weeklyRows.reduce(
        (acc, row) => ({
          kcal: acc.kcal + row.kcal,
          meals: acc.meals + row.meals,
          sessions: acc.sessions + row.workouts,
        }),
        { kcal: 0, meals: 0, sessions: 0 },
      ),
    [weeklyRows],
  );

  const limits = state.limits || {
    kcal: { min: 2000, max: 2400 },
    protein: { min: 160, max: 220 },
    carbs: { min: 120, max: 220 },
    fat: { min: 45, max: 90 },
  };

  const kcalSeries = useMemo(() => weeklyRows.map((row) => ({ date: row.date, value: toSeriesValue(row.kcal) })), [weeklyRows]);
  const fatigueSeries = useMemo(
    () => weeklyRows.map((row) => ({ date: row.date, value: toSeriesValue(row.fatigue) })),
    [weeklyRows],
  );
  const weightSeries = useMemo(
    () => weeklyRows.map((row) => ({ date: row.date, value: toSeriesValue(row.weight, { zeroIsMissing: true }) })),
    [weeklyRows],
  );
  const healthWindow = useMemo(
    () => getHealthSnapshotsForDates(state, weeklyRows.map((row) => row.date), { carryForward: false }),
    [state, weeklyRows],
  );
  const sleepSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: toSeriesValue(row.sleepHours, { zeroIsMissing: true }) })),
    [healthWindow],
  );
  const stepsSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: toSeriesValue(row.steps, { zeroIsMissing: true }) })),
    [healthWindow],
  );
  const restingBpmSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: row.restingBpm })),
    [healthWindow],
  );
  const hrvSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: row.hrvMs })),
    [healthWindow],
  );
  const oxygenSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: row.oxygenSaturationPercent })),
    [healthWindow],
  );
  const bloodPressureSystolicSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: row.bloodPressureSystolic })),
    [healthWindow],
  );
  const bloodPressureDiastolicSeries = useMemo(
    () => healthWindow.map((row) => ({ date: row.date, value: row.bloodPressureDiastolic })),
    [healthWindow],
  );

  const alerts = useMemo(() => {
    const lowKcalDays = weeklyRows.filter((row) => row.kcal > 0 && row.kcal < (limits.kcal?.min ?? 0));
    const highFatigueDays = weeklyRows.filter((row) => row.fatigue >= 7);
    const comboDays = weeklyRows.filter((row) => row.kcal > 0 && row.kcal < (limits.kcal?.min ?? 0) && row.fatigue >= 7);

    const output = [];
    if (highFatigueDays.length) {
      output.push({
        severity: 'warn',
        text: `Fatigue SNC elevee (${highFatigueDays.length} j): ${highFatigueDays.map((row) => row.date).join(', ')}`,
      });
    }
    if (lowKcalDays.length) {
      output.push({
        severity: 'danger',
        text: `Kcal sous le seuil min ${limits.kcal?.min ?? 0} (${lowKcalDays.length} j): ${lowKcalDays.map((row) => row.date).join(', ')}`,
      });
    }
    if (comboDays.length) {
      output.push({
        severity: 'danger',
        text: `Risque recup (fatigue>=7 + kcal bas) sur ${comboDays.length} j: ${comboDays.map((row) => row.date).join(', ')}`,
      });
    }
    const nutritionDays = weeklyRows.map((row) => ({ date: row.date, signals: nutritionSignalsForDay(state, row.date) }));
    const highCarbDays = nutritionDays.filter((row) => !row.signals.isCarbsOk);
    const proteinLowDays = nutritionDays.filter((row) => !row.signals.isProteinOk);
    const hydrationLowDays = nutritionDays.filter((row) => !row.signals.isHydrationOk);
    if (highCarbDays.length) {
      output.push({
        severity: 'warn',
        text: `Glucides au-dessus du plafond (${highCarbDays.length} j): ${highCarbDays.map((row) => row.date).join(', ')}`,
      });
    }
    if (proteinLowDays.length) {
      output.push({
        severity: 'warn',
        text: `Proteines sous cible (${proteinLowDays.length} j): ${proteinLowDays.map((row) => row.date).join(', ')}`,
      });
    }
    if (hydrationLowDays.length) {
      output.push({
        severity: 'warn',
        text: `Hydratation basse (${hydrationLowDays.length} j): ${hydrationLowDays.map((row) => row.date).join(', ')}`,
      });
    }
    if (!output.length) {
      output.push({ severity: 'ok', text: 'Aucune alerte critique sur les 7 derniers jours.' });
    }
    return output;
  }, [limits.kcal?.min, state, weeklyRows]);

  const importedHistory = useMemo(() => {
    return [...state.dailyLogs]
      .filter((row) => row.source === 'chatgpt-import')
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((row) => {
        const metric = state.metrics.find((m) => m.date === row.date);
        return {
          date: row.date,
          weight: metric?.weight ?? '-',
          kcal: row.caloriesEstimated ?? '-',
          protein: row.proteinG ?? '-',
          carbs: row.carbsG ?? '-',
          fat: row.fatG ?? '-',
          fatigue: row.fatigueNervousSystem ?? '-',
          sleep: row.sleepHours ?? '-',
          training: row.training || '-',
        };
      });
  }, [state.dailyLogs, state.metrics]);

  const applyDatasetRows = (rows) => {
    if (!rows.length) {
      setImportStatus('Aucune ligne valide detectee.');
      return;
    }

    setState((prev) => {
      const baseDailyLogs = prev.dailyLogs.filter((log) => log.source !== 'chatgpt-import');

      const importedLogs = rows.map((row) => ({
        id: uid(),
        date: row.date,
        caloriesEstimated: row.calories_estimated,
        proteinG: row.protein_g,
        carbsG: row.carbs_g,
        fatG: row.fat_g,
        bloodPressure: row.blood_pressure,
        sleepHours: row.sleep_hours,
        fatigueNervousSystem: row.fatigue_nervous_system_1_10,
        domsLegs: row.doms_legs_1_10,
        mood: row.mood_1_10,
        training: row.training,
        notes: row.notes,
        source: 'chatgpt-import',
      }));

      const metricsMap = new Map(prev.metrics.map((item) => [item.date, item]));
      rows.forEach((row) => {
        if (row.weight_morning_kg === null || row.weight_morning_kg === undefined) return;
        const existing = metricsMap.get(row.date) || { date: row.date };
        metricsMap.set(row.date, {
          ...existing,
          date: row.date,
          weight: row.weight_morning_kg,
        });
      });

      const metricsMerged = Array.from(metricsMap.values());
      const latestDate = rows.reduce((max, row) => (row.date > max ? row.date : max), prev.selectedDate);

      return {
        ...prev,
        selectedDate: latestDate,
        dailyLogs: [...importedLogs, ...baseDailyLogs],
        metrics: metricsMerged,
      };
    });

    setImportStatus(`Import OK: ${rows.length} jours charges.`);
  };

  const importFromText = () => {
    const rows = parseDatasetFromText(importText);
    applyDatasetRows(rows);
  };

  const loadPresetS1S2 = () => {
    setImportText(JSON.stringify(chatgptDatasetS1S2, null, 2));
    applyDatasetRows(chatgptDatasetS1S2);
  };

  const blocks = [
    {
      id: 'kpis',
      label: 'KPIs',
      defaultSpan: 12,
      render: () => (
        <section className={styles.grid4}>
          <article className={styles.kpi}><div className={styles.kpiLabel}>Macros jour</div><div className={styles.smallMuted}>{formatMacrosLine(dayMacros)}</div></article>
          <article className={styles.kpi}><div className={styles.kpiLabel}>Repas jour</div><div className={styles.kpiValue}>{loggedMealsForSelectedDay}</div></article>
          <article className={styles.kpi}><div className={styles.kpiLabel}>Workouts jour</div><div className={styles.kpiValue}>{workoutsForSelectedDay.length}</div></article>
          <article className={styles.kpi}><div className={styles.kpiLabel}>Exercices jour</div><div className={styles.kpiValue}>{sessionsForSelectedDay.length}</div></article>
          <article className={styles.kpi}><div className={styles.kpiLabel}>Poids/BF</div><div className={styles.smallMuted}>{metricsForSelectedDay?.weight ?? '-'} kg / {metricsForSelectedDay?.bodyFat ?? '-'}%</div></article>
          <article className={styles.kpi}><div className={styles.kpiLabel}>Recup</div><div className={styles.smallMuted}>{selectedHealth.sleepHours > 0 ? `${selectedHealth.sleepHours.toFixed(1)} h` : '-'} / FC {selectedHealth.restingBpm || '-'}</div></article>
          <article className={styles.kpi}><div className={styles.kpiLabel}>NEAT</div><div className={styles.smallMuted}>{selectedHealth.steps || '-'} pas / {selectedHealth.activeMinutes || 0} min</div></article>
          <article className={styles.kpi}><div className={styles.kpiLabel}>Cardio</div><div className={styles.smallMuted}>FC moy {selectedHealth.avgHeartRate || '-'} / HRV {selectedHealth.hrvMs || '-'}</div></article>
          <article className={styles.kpi}><div className={styles.kpiLabel}>Sante</div><div className={styles.smallMuted}>TA {selectedHealth.bloodPressure || '-'} / O2 {selectedHealth.oxygenSaturationPercent ? `${selectedHealth.oxygenSaturationPercent.toFixed(1)}%` : '-'} / Gly {selectedHealth.bloodGlucoseMgDl ? `${selectedHealth.bloodGlucoseMgDl.toFixed(0)}` : '-'}</div></article>
        </section>
      ),
    },
    {
      id: 'charts',
      label: 'Courbes',
      defaultSpan: 12,
      render: () => (
        <details className={`${styles.card} ${styles.detailsCard}`}>
          <summary className={styles.cardSummary}>Courbes nutrition et poids</summary>
          <div className={styles.grid2}>
          <article className={styles.card}>
            <div className={styles.sectionHead}>
              <h2>Courbe kcal + fatigue</h2>
              <select className={styles.select} value={`${windowDays}`} onChange={(e) => setWindowDays(Number.parseInt(e.target.value, 10) || 7)}>
                <option value="7">7 jours</option>
                <option value="14">14 jours</option>
                <option value="30">30 jours</option>
              </select>
            </div>
            <InteractiveLineChart
              ariaLabel="Courbe calories et fatigue interactive"
              xLabel="Date"
              yLabel="Valeur"
              series={[
                { id: 'kcal', label: 'Kcal', color: '#f97316', data: kcalSeries },
                { id: 'fatigue', label: 'Fatigue SNC', color: '#0f172a', data: fatigueSeries },
              ]}
              valueFormat={(v) => `${Number(v).toFixed(0)}`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
            <p className={styles.smallMuted}>Orange: kcal | Bleu fonce: fatigue SNC | delta kcal: {pointDelta(kcalSeries).toFixed(0)}</p>
          </article>

          <article className={styles.card}>
            <h2>Courbe poids</h2>
            <InteractiveLineChart
              ariaLabel="Courbe poids interactive"
              xLabel="Date"
              yLabel="kg"
              series={[{ id: 'weight', label: 'Poids', color: '#0f172a', data: weightSeries }]}
              valueFormat={(v) => `${Number(v).toFixed(1)}kg`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
            <p className={styles.smallMuted}>Delta poids 7j: {pointDelta(weightSeries).toFixed(1)} kg</p>
          </article>
          </div>
        </details>
      ),
    },
    {
      id: 'healthCharts',
      label: 'Sante',
      defaultSpan: 12,
      render: () => (
        <details className={`${styles.card} ${styles.detailsCard}`}>
          <summary className={styles.cardSummary}>Tendances sante</summary>
          <div className={styles.grid2}>
          <article className={styles.card}>
            <h2>Sommeil</h2>
            <InteractiveLineChart
              ariaLabel="Sommeil sur la fenetre"
              xLabel="Date"
              yLabel="heures"
              series={[{ id: 'sleep', label: 'Sommeil', color: '#0f172a', data: sleepSeries }]}
              valueFormat={(v) => `${Number(v).toFixed(1)} h`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
          </article>
          <article className={styles.card}>
            <h2>Pas</h2>
            <InteractiveLineChart
              ariaLabel="Pas sur la fenetre"
              xLabel="Date"
              yLabel="pas"
              series={[{ id: 'steps', label: 'Pas', color: '#2563eb', data: stepsSeries }]}
              valueFormat={(v) => `${Number(v).toFixed(0)}`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
          </article>
          <article className={styles.card}>
            <h2>FC repos</h2>
            <InteractiveLineChart
              ariaLabel="FC repos sur la fenetre"
              xLabel="Date"
              yLabel="bpm"
              series={[{ id: 'resting-bpm', label: 'FC repos', color: '#ef4444', data: restingBpmSeries }]}
              valueFormat={(v) => `${Number(v).toFixed(0)} bpm`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
          </article>
          <article className={styles.card}>
            <h2>HRV</h2>
            <InteractiveLineChart
              ariaLabel="HRV sur la fenetre"
              xLabel="Date"
              yLabel="ms"
              series={[{ id: 'hrv', label: 'HRV', color: '#0f766e', data: hrvSeries }]}
              valueFormat={(v) => `${Number(v).toFixed(0)} ms`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
          </article>
          <article className={styles.card}>
            <h2>Oxygene</h2>
            <InteractiveLineChart
              ariaLabel="Oxygene sur la fenetre"
              xLabel="Date"
              yLabel="%"
              series={[{ id: 'oxygen', label: 'Oxygene', color: '#1d4ed8', data: oxygenSeries }]}
              valueFormat={(v) => `${Number(v).toFixed(1)}%`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
          </article>
          <article className={styles.card}>
            <h2>Tension</h2>
            <InteractiveLineChart
              ariaLabel="Tension sur la fenetre"
              xLabel="Date"
              yLabel="mmHg"
              series={[
                { id: 'bp-sys', label: 'Systolique', color: '#7c2d12', data: bloodPressureSystolicSeries },
                { id: 'bp-dia', label: 'Diastolique', color: '#b45309', data: bloodPressureDiastolicSeries },
              ]}
              valueFormat={(v) => `${Number(v).toFixed(0)}`}
              dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
          </article>
          </div>
        </details>
      ),
    },
    {
      id: 'alerts',
      label: 'Alertes',
      defaultSpan: 12,
      render: () => (
        <section className={styles.card}>
          <h2>Alertes automatiques ({windowDays} jours)</h2>
          <div className={styles.stateGrid}>
            {alerts.map((alert) => (
              <div
                key={alert.text}
                className={`${styles.stateChip} ${alert.severity === 'ok' ? styles.stateok : styles.statedanger}`}
              >
                {alert.text}
              </div>
            ))}
          </div>
          <p className={styles.smallMuted}>
            Journal du jour: sommeil {selectedHealth.sleepHours > 0 ? selectedHealth.sleepHours.toFixed(1) : '-'}h | tension {selectedHealth.bloodPressure || '-'} | fatigue SNC {dailyLogForSelectedDay?.fatigueNervousSystem ?? '-'} | pas {selectedHealth.steps || '-'} | FC repos {selectedHealth.restingBpm || '-'}
          </p>
        </section>
      ),
    },
    {
      id: 'import',
      label: 'Import GPT',
      defaultSpan: 12,
      render: () => (
        <details className={`${styles.card} ${styles.detailsCard}`}>
          <summary className={styles.cardSummary}>Import dataset ChatGPT</summary>
          <h2>Import dataset ChatGPT</h2>
          <p className={styles.smallMuted}>Colle le texte brut (avec JSON par jour) puis importe. Les imports precedents ChatGPT sont remplaces.</p>
          <textarea className={styles.textarea} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Colle ici le bloc ChatGPT..." />
          <div className={styles.formGrid}>
            <button className={styles.button} type="button" onClick={importFromText}>Importer texte colle</button>
            <button className={styles.buttonGhost} type="button" onClick={loadPresetS1S2}>Charger S1+S2 pre-rempli</button>
          </div>
          {importStatus && <p className={styles.smallMuted}>{importStatus}</p>}
        </details>
      ),
    },
    {
      id: 'weekTable',
      label: 'Vue 7j',
      defaultSpan: 12,
      render: () => (
        <details className={`${styles.card} ${styles.detailsCard}`}>
          <summary className={styles.cardSummary}>Vue {windowDays} jours</summary>
          <h2>Vue {windowDays} jours</h2>
          <table className={styles.table}>
            <thead>
              <tr><th>Date</th><th>Kcal</th><th>Repas</th><th>Workouts</th><th>Exercices</th><th>Poids</th><th>BF</th><th>Sommeil</th><th>Pas</th><th>FC repos</th><th>Fatigue SNC</th></tr>
            </thead>
            <tbody>
              {weeklyRows.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.kcal === null ? '-' : row.kcal.toFixed(0)}</td>
                  <td>{row.meals}</td>
                  <td>{row.workouts}</td>
                  <td>{row.exerciseBlocks}</td>
                  <td>{row.weight ?? '-'}</td>
                  <td>{row.bf ?? '-'}</td>
                  <td>{row.sleep ? row.sleep.toFixed(1) : '-'}</td>
                  <td>{row.steps || '-'}</td>
                  <td>{row.restingBpm || '-'}</td>
                  <td>{row.fatigue || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.smallMuted}>
            Total periode: {weeklyTotals.kcal.toFixed(0)} kcal | {weeklyTotals.meals} repas | {weeklyTotals.sessions} workouts
          </p>
        </details>
      ),
    },
    {
      id: 'history',
      label: 'Historique',
      defaultSpan: 12,
      render: () => (
        <details className={`${styles.card} ${styles.detailsCard}`}>
          <summary className={styles.cardSummary}>Historique dataset GPT</summary>
          <h2>Historique dataset GPT ({importedHistory.length} jours)</h2>
          <table className={styles.table}>
            <thead>
              <tr><th>Date</th><th>Poids</th><th>Kcal</th><th>P</th><th>G</th><th>L</th><th>Sommeil</th><th>Fatigue SNC</th><th>Training</th><th>Action</th></tr>
            </thead>
            <tbody>
              {importedHistory.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.weight}</td>
                  <td>{row.kcal}</td>
                  <td>{row.protein}</td>
                  <td>{row.carbs}</td>
                  <td>{row.fat}</td>
                  <td>{row.sleep}</td>
                  <td>{row.fatigue}</td>
                  <td>{row.training}</td>
                  <td>
                    <button className={styles.tinyButton} type="button" onClick={() => setState((prev) => ({ ...prev, selectedDate: row.date }))}>
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ),
    },
  ];

  return (
    <Layout title="Audit" description="Vue secondaire de controle et d audit">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Audit</h1>
            <p>Vue secondaire de controle. Le parcours principal reste Accueil, Poids, Nutrition et Training.</p>
            <div className={styles.metaRow}>
              <label>
                <span className={styles.smallMuted}>Date de reference</span>
                <DateNav
                  value={state.selectedDate}
                  onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
                />
              </label>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Sommeil exact: {selectedHealth.sleepHours > 0 ? `${selectedHealth.sleepHours.toFixed(1)} h` : '-'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Pas exacts: {selectedHealth.steps || '-'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>FC repos: {selectedHealth.restingBpm || '-'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Tension: {selectedHealth.bloodPressure || '-'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>O2: {selectedHealth.oxygenSaturationPercent ? `${selectedHealth.oxygenSaturationPercent.toFixed(1)}%` : '-'}</span>
            </div>
            <CoreWorkflowNav active="summary" supportMode="full" />
          </section>

          <LayoutBlocks pageId="summary" state={state} setState={setState} blocks={blocks} />
        </div>
      </main>
    </Layout>
  );
}
