import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import { toBounded, toPositive, useDashboardState } from '../lib/dashboardStore';
import { getHealthSnapshotForDate } from '../lib/healthState.js';
import LayoutBlocks from '../components/LayoutBlocks';
import InteractiveLineChart from '../components/InteractiveLineChart';
import DateNav from '../components/DateNav';
import CoreWorkflowNav from '../components/CoreWorkflowNav';

const toIso = (date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const movingAverage = (rows, windowSize = 7) => rows.map((row, index) => {
  const start = Math.max(0, index - (windowSize - 1));
  const sample = rows.slice(start, index + 1).filter((entry) => Number(entry.weight || 0) > 0);
  const avg = sample.length ? sample.reduce((acc, entry) => acc + Number(entry.weight || 0), 0) / sample.length : 0;
  return {
    date: row.date,
    value: avg,
  };
});

const formatDelta = (value, unit = '') => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}${unit}`;
};

const formatPositiveValue = (value, formatter = (next) => `${next}`) => (
  Number(value || 0) > 0 ? formatter(Number(value)) : '-'
);

export default function MetricsPage() {
  const { state, setState, metricsForSelectedDay } = useDashboardState();
  const [windowDays, setWindowDays] = useState(30);
  const [showBodyFat, setShowBodyFat] = useState(true);
  const [status, setStatus] = useState('');
  const dailyLogForSelectedDay = useMemo(
    () => state.dailyLogs.find((entry) => entry.date === state.selectedDate) || null,
    [state.dailyLogs, state.selectedDate],
  );
  const metricHealthSource = metricsForSelectedDay?.healthSource || null;
  const selectedHealth = useMemo(
    () => getHealthSnapshotForDate(state, state.selectedDate, { carryForward: false }),
    [state, state.selectedDate],
  );

  const [quickWeight, setQuickWeight] = useState('');
  const [form, setForm] = useState({
    date: state.selectedDate,
    weight: '',
    bodyFat: '',
    muscleMass: '',
    visceralFat: '',
    water: '',
    bloodPressure: '',
    sleepHours: '',
    fatigueNervousSystem: '',
    notes: '',
  });

  useEffect(() => {
    const currentWeight = metricsForSelectedDay?.weight ?? '';
    setQuickWeight(currentWeight === '' ? '' : `${currentWeight}`);
    setForm({
      date: state.selectedDate,
      weight: currentWeight,
      bodyFat: metricsForSelectedDay?.bodyFat ?? '',
      muscleMass: metricsForSelectedDay?.muscleMass ?? '',
      visceralFat: metricsForSelectedDay?.visceralFat ?? '',
      water: metricsForSelectedDay?.water ?? '',
      bloodPressure: dailyLogForSelectedDay?.bloodPressure ?? '',
      sleepHours: dailyLogForSelectedDay?.sleepHours ?? '',
      fatigueNervousSystem: dailyLogForSelectedDay?.fatigueNervousSystem ?? '',
      notes: metricsForSelectedDay?.notes || dailyLogForSelectedDay?.notes || '',
    });
  }, [dailyLogForSelectedDay, metricsForSelectedDay, state.selectedDate]);

  const metricsAsc = useMemo(
    () => [...(state.metrics || [])].sort((a, b) => a.date.localeCompare(b.date)),
    [state.metrics],
  );

  const chartRows = useMemo(() => metricsAsc.slice(-windowDays), [metricsAsc, windowDays]);

  const weightSeries = useMemo(
    () => chartRows.filter((row) => Number(row.weight || 0) > 0).map((row) => ({ date: row.date, value: Number(row.weight || 0) })),
    [chartRows],
  );

  const weightMaSeries = useMemo(
    () => movingAverage(chartRows.filter((row) => Number(row.weight || 0) > 0), 7),
    [chartRows],
  );

  const bfSeries = useMemo(
    () => chartRows.filter((row) => Number(row.bodyFat || 0) > 0).map((row) => ({ date: row.date, value: Number(row.bodyFat || 0) })),
    [chartRows],
  );

  const chartSeries = useMemo(() => {
    const base = [
      {
        id: 'weight',
        label: 'Poids',
        color: '#0f172a',
        axis: 'left',
        data: weightSeries,
      },
      {
        id: 'weight-ma7',
        label: 'Poids MA7',
        color: '#2563eb',
        axis: 'left',
        data: weightMaSeries,
      },
    ];
    if (showBodyFat) {
      base.push({
        id: 'bf',
        label: 'Body fat',
        color: '#f97316',
        axis: 'right',
        data: bfSeries,
      });
    }
    return base;
  }, [bfSeries, showBodyFat, weightMaSeries, weightSeries]);

  const latestWeight = metricsAsc.length ? Number(metricsAsc[metricsAsc.length - 1].weight || 0) : 0;
  const firstWeight = metricsAsc.length ? Number(metricsAsc[0].weight || 0) : 0;
  const deltaTotal = metricsAsc.length > 1 ? latestWeight - firstWeight : 0;
  const delta7d = metricsAsc.length > 1
    ? Number(metricsAsc[metricsAsc.length - 1].weight || 0) - Number(metricsAsc[Math.max(0, metricsAsc.length - 8)].weight || 0)
    : 0;

  const recent = useMemo(
    () => [...metricsAsc].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20),
    [metricsAsc],
  );

  const weightDeltaByDate = useMemo(() => {
    const map = new Map();
    metricsAsc.forEach((row, index) => {
      const prev = index > 0 ? metricsAsc[index - 1] : null;
      const value = prev ? Number(row.weight || 0) - Number(prev.weight || 0) : null;
      map.set(row.date, value);
    });
    return map;
  }, [metricsAsc]);

  const upsertMetricsAndLog = ({
    date,
    weight,
    bodyFat,
    muscleMass,
    visceralFat,
    water,
    notes,
    bloodPressure,
    sleepHours,
    fatigueNervousSystem,
  }) => {
    setState((prev) => {
      const record = {
        date,
        weight: toPositive(weight),
        bodyFat: toBounded(bodyFat, 0, 100, 0),
        muscleMass: toPositive(muscleMass),
        visceralFat: toPositive(visceralFat),
        water: toBounded(water, 0, 100, 0),
        notes: `${notes || ''}`.trim(),
      };

      const filteredMetrics = (prev.metrics || []).filter((entry) => entry.date !== date);
      const nextMetrics = [record, ...filteredMetrics].sort((a, b) => b.date.localeCompare(a.date));

      const nextDailyLogs = [...(prev.dailyLogs || [])];
      const logIndex = nextDailyLogs.findIndex((entry) => entry.date === date);
      const logPatch = {
        bloodPressure: `${bloodPressure || ''}`.trim(),
        sleepHours: toPositive(sleepHours, 0),
        fatigueNervousSystem: toPositive(fatigueNervousSystem, 0),
        notes: `${notes || ''}`.trim(),
      };
      if (logIndex < 0) {
        nextDailyLogs.unshift({ id: `log-${Date.now()}`, date, ...logPatch });
      } else {
        nextDailyLogs[logIndex] = { ...nextDailyLogs[logIndex], ...logPatch };
      }

      return {
        ...prev,
        metrics: nextMetrics,
        dailyLogs: nextDailyLogs,
      };
    });
  };

  const saveMetrics = (event) => {
    event.preventDefault();
    upsertMetricsAndLog({
      date: form.date,
      weight: form.weight,
      bodyFat: form.bodyFat,
      muscleMass: form.muscleMass,
      visceralFat: form.visceralFat,
      water: form.water,
      notes: form.notes,
      bloodPressure: form.bloodPressure,
      sleepHours: form.sleepHours,
      fatigueNervousSystem: form.fatigueNervousSystem,
    });
    setStatus(`Mesures enregistrees pour ${form.date}.`);
  };

  const saveQuickWeight = (event) => {
    event.preventDefault();
    upsertMetricsAndLog({
      date: state.selectedDate,
      weight: quickWeight,
      bodyFat: metricsForSelectedDay?.bodyFat ?? 0,
      muscleMass: metricsForSelectedDay?.muscleMass ?? 0,
      visceralFat: metricsForSelectedDay?.visceralFat ?? 0,
      water: metricsForSelectedDay?.water ?? 0,
      notes: metricsForSelectedDay?.notes || '',
      bloodPressure: dailyLogForSelectedDay?.bloodPressure || '',
      sleepHours: dailyLogForSelectedDay?.sleepHours || 0,
      fatigueNervousSystem: dailyLogForSelectedDay?.fatigueNervousSystem || 0,
    });
    setStatus(`Poids rapide enregistre pour ${state.selectedDate}.`);
  };

  const removeMetric = (date) => {
    setState((prev) => ({
      ...prev,
      metrics: (prev.metrics || []).filter((row) => row.date !== date),
    }));
    setStatus(`Mesure supprimee pour ${date}.`);
  };

  const blocks = [
    {
      id: 'quick-weight',
      label: 'Poids rapide',
      defaultSpan: 12,
      render: () => (
        <section className={styles.card}>
          <div className={styles.sectionHead}>
            <h2>Saisie poids rapide</h2>
            <div className={styles.formGrid} style={{ margin: 0 }}>
              <button className={styles.buttonGhost} type="button" onClick={() => setState((prev) => ({ ...prev, selectedDate: toIso(new Date()) }))}>Aller aujourd hui</button>
              <Link className={styles.buttonGhost} to="/training">Training</Link>
              <Link className={styles.buttonGhost} to="/nutrition">Nutrition</Link>
            </div>
          </div>
          <div className={styles.metaRow}>
            <span className={`${styles.pill} ${styles.pillMuted}`}>Source poids: {metricHealthSource?.provider || 'manuel'}</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>Sommeil: {formatPositiveValue(selectedHealth.sleepHours, (next) => `${next.toFixed(1)} h`)}</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>FC repos: {formatPositiveValue(selectedHealth.restingBpm)}</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>FC moy: {formatPositiveValue(selectedHealth.avgHeartRate)}</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>HRV: {formatPositiveValue(selectedHealth.hrvMs)}</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>Tension: {selectedHealth.bloodPressure || '-'}</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>O2: {formatPositiveValue(selectedHealth.oxygenSaturationPercent, (next) => `${next.toFixed(1)}%`)}</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>Gly: {formatPositiveValue(selectedHealth.bloodGlucoseMgDl, (next) => `${next.toFixed(0)}`)}</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>Pas: {selectedHealth.steps || '-'}</span>
            <span className={`${styles.pill} ${styles.pillMuted}`}>Actives: {selectedHealth.activeMinutes || '-'}</span>
          </div>
          <div className={styles.formGrid}>
            <label>
              <span className={styles.smallMuted}>Date active</span>
              <DateNav value={state.selectedDate} onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))} />
            </label>
            <label>
              <span className={styles.smallMuted}>Poids (kg)</span>
              <input className={styles.input} type="number" step="0.1" value={quickWeight} onChange={(e) => setQuickWeight(e.target.value)} />
            </label>
            <button className={styles.button} type="button" onClick={saveQuickWeight}>Enregistrer poids</button>
          </div>
          <div className={styles.insightGrid} style={{ marginTop: '0.65rem' }}>
            <div className={styles.insightItem}><div className={styles.insightLabel}>Dernier poids</div><div className={styles.insightValue}>{latestWeight ? `${latestWeight.toFixed(1)} kg` : '-'}</div></div>
            <div className={styles.insightItem}><div className={styles.insightLabel}>Delta total</div><div className={styles.insightValue}>{formatDelta(deltaTotal, ' kg')}</div></div>
            <div className={styles.insightItem}><div className={styles.insightLabel}>Delta 7j</div><div className={styles.insightValue}>{formatDelta(delta7d, ' kg')}</div></div>
            <div className={styles.insightItem}><div className={styles.insightLabel}>Points suivis</div><div className={styles.insightValue}>{metricsAsc.length}</div></div>
          </div>
          {status && <p className={styles.smallMuted}>{status}</p>}
        </section>
      ),
    },
    {
      id: 'chart',
      label: 'Courbes',
      defaultSpan: 12,
      render: () => (
        <section className={styles.card}>
          <div className={styles.sectionHead}>
            <h2>Evolution poids et composition</h2>
            <div className={styles.formGrid} style={{ margin: 0 }}>
              <select className={styles.select} value={`${windowDays}`} onChange={(e) => setWindowDays(Number.parseInt(e.target.value, 10) || 30)}>
                <option value="14">14 points</option>
                <option value="30">30 points</option>
                <option value="60">60 points</option>
                <option value="90">90 points</option>
              </select>
              <label className={styles.smallMuted} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input type="checkbox" checked={showBodyFat} onChange={(e) => setShowBodyFat(e.target.checked)} />
                Afficher BF
              </label>
            </div>
          </div>
          <InteractiveLineChart
            ariaLabel="Poids et composition"
            yLabel="Poids (kg)"
            yLabelRight="Body fat (%)"
            xLabel="Date"
            series={chartSeries}
            valueFormat={(v) => `${Number(v).toFixed(1)}kg`}
            valueFormatRight={(v) => `${Number(v).toFixed(1)}%`}
            dateFormat={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
            onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            pointMode="always"
            defaultType="line"
            emptyLabel="Ajoute des mesures pour afficher les tendances."
          />
          <p className={styles.smallMuted}>Courbe noire: poids reel. Bleu: moyenne glissante 7 mesures. Orange: body fat (optionnel).</p>
        </section>
      ),
    },
    {
      id: 'detail',
      label: 'Saisie + historique',
      defaultSpan: 12,
      render: () => (
        <section className={styles.grid2}>
          <details className={`${styles.card} ${styles.detailsCard}`}>
            <summary className={styles.cardSummary}>Saisie complete</summary>
            <p className={styles.smallMuted}>Bloc secondaire pour ajuster composition, sommeil et notes sans ralentir la saisie rapide.</p>
            <form className={styles.formGrid} onSubmit={saveMetrics}>
              <input className={styles.input} type="date" value={form.date} onInput={(e) => setForm((p) => ({ ...p, date: e.target.value }))} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
              <input className={styles.input} type="number" step="0.1" placeholder="Poids kg" value={form.weight} onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))} />
              <input className={styles.input} type="number" step="0.1" placeholder="Body fat %" value={form.bodyFat} onChange={(e) => setForm((p) => ({ ...p, bodyFat: e.target.value }))} />
              <input className={styles.input} type="number" step="0.1" placeholder="Masse musculaire kg" value={form.muscleMass} onChange={(e) => setForm((p) => ({ ...p, muscleMass: e.target.value }))} />
              <input className={styles.input} type="number" step="0.1" placeholder="Graisse viscerale" value={form.visceralFat} onChange={(e) => setForm((p) => ({ ...p, visceralFat: e.target.value }))} />
              <input className={styles.input} type="number" step="0.1" placeholder="Eau %" value={form.water} onChange={(e) => setForm((p) => ({ ...p, water: e.target.value }))} />
              <input className={styles.input} placeholder="Tension (ex: 123/83)" value={form.bloodPressure} onChange={(e) => setForm((p) => ({ ...p, bloodPressure: e.target.value }))} />
              <input className={styles.input} type="number" step="0.1" placeholder="Sommeil h" value={form.sleepHours} onChange={(e) => setForm((p) => ({ ...p, sleepHours: e.target.value }))} />
              <input className={styles.input} type="number" step="1" placeholder="Fatigue SNC 1-10" value={form.fatigueNervousSystem} onChange={(e) => setForm((p) => ({ ...p, fatigueNervousSystem: e.target.value }))} />
              <input className={styles.input} placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              <button className={styles.button} type="submit">Enregistrer mesures</button>
            </form>
          </details>

          <details className={`${styles.card} ${styles.detailsCard}`}>
            <summary className={styles.cardSummary}>Historique recent</summary>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th><th>Poids</th><th>Delta</th><th>BF</th><th>Muscle</th><th>Eau</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{Number(row.weight || 0).toFixed(1)}</td>
                    <td>{weightDeltaByDate.get(row.date) === null ? '-' : formatDelta(weightDeltaByDate.get(row.date), ' kg')}</td>
                    <td>{row.bodyFat || '-'}</td>
                    <td>{row.muscleMass || '-'}</td>
                    <td>{row.water || '-'}</td>
                    <td>
                      <div style={{ display: 'grid', gap: '0.35rem' }}>
                        <button className={styles.tinyButton} type="button" onClick={() => setState((prev) => ({ ...prev, selectedDate: row.date }))}>Ouvrir</button>
                        <button className={styles.tinyButton} type="button" onClick={() => removeMetric(row.date)}>Suppr.</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr><td colSpan="7" className={styles.smallMuted}>Aucune mesure enregistree.</td></tr>
                )}
              </tbody>
            </table>
          </details>
        </section>
      ),
    },
  ];

  return (
    <Layout title="Poids et composition" description="Hub central de suivi poids, BF et recuperation courte">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <div className={styles.heroHeaderRow}>
              <div className={styles.heroTitleWrap}>
                <span className={styles.heroEyebrow}>Suivi corporel quotidien</span>
                <h1>Poids et composition</h1>
                <p>Lecture rapide d abord, saisie et historique ensuite. Le hero mobile ne garde que les signaux utiles.</p>
              </div>
              <div className={styles.heroControlCard}>
                <span className={styles.smallMuted}>Date active</span>
                <DateNav
                  value={state.selectedDate}
                  onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
                />
                <span className={styles.smallMuted}>Source {metricHealthSource?.provider || 'manuel'}</span>
              </div>
            </div>
            <div className={styles.summaryStrip}>
              <div className={styles.summaryMetric}>
                <div className={styles.summaryMetricLabel}>Poids</div>
                <div className={styles.summaryMetricValue}>{latestWeight ? `${latestWeight.toFixed(1)} kg` : '-'}</div>
                <div className={styles.summaryMetricMeta}>{state.selectedDate}</div>
              </div>
              <div className={styles.summaryMetric}>
                <div className={styles.summaryMetricLabel}>Delta total</div>
                <div className={styles.summaryMetricValue}>{formatDelta(deltaTotal, ' kg')}</div>
                <div className={styles.summaryMetricMeta}>depuis le premier point</div>
              </div>
              <div className={styles.summaryMetric}>
                <div className={styles.summaryMetricLabel}>Delta 7j</div>
                <div className={styles.summaryMetricValue}>{formatDelta(delta7d, ' kg')}</div>
                <div className={styles.summaryMetricMeta}>tendance courte</div>
              </div>
              <div className={styles.summaryMetric}>
                <div className={styles.summaryMetricLabel}>Source</div>
                <div className={styles.summaryMetricValue}>{metricHealthSource?.provider || 'manuel'}</div>
                <div className={styles.summaryMetricMeta}>saisie / import sante</div>
              </div>
            </div>
            <CoreWorkflowNav active="metrics" supportMode="hub" />
          </section>

          <LayoutBlocks pageId="metrics" state={state} setState={setState} blocks={blocks} />
        </div>
      </main>
    </Layout>
  );
}
