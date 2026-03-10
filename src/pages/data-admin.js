import React, { useMemo, useState } from 'react';
import Layout from '@theme/Layout';
import styles from './dashboard.module.css';
import { useDashboardState } from '../lib/dashboardStore';
import CoreWorkflowNav from '../components/CoreWorkflowNav';
import {
  parseCompactTextRows,
  parseJsonRows,
  parsePortableCutRows,
  parseTrainingLogPayload,
  parseTrainingToSessions,
  trainingLogToSessions,
} from '../lib/dataImportParsers.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

const toPositive = (value, fallback = 0) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const exportChatgptRows = (state) => {
  const byDate = new Map();
  (state.dailyLogs || []).forEach((row) => {
    byDate.set(row.date, {
      date: row.date,
      weight_morning_kg: null,
      calories_estimated: row.caloriesEstimated ?? null,
      protein_g: row.proteinG ?? null,
      carbs_g: row.carbsG ?? null,
      fat_g: row.fatG ?? null,
      training: row.training ?? null,
      blood_pressure: row.bloodPressure ?? null,
      sleep_hours: row.sleepHours ?? null,
      fatigue_nervous_system_1_10: row.fatigueNervousSystem ?? null,
      doms_legs_1_10: row.domsLegs ?? null,
      mood_1_10: row.mood ?? null,
      notes: row.notes ?? null,
    });
  });
  (state.metrics || []).forEach((row) => {
    const current = byDate.get(row.date) || {
      date: row.date,
      calories_estimated: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      training: null,
      blood_pressure: null,
      sleep_hours: null,
      fatigue_nervous_system_1_10: null,
      doms_legs_1_10: null,
      mood_1_10: null,
      notes: null,
    };
    byDate.set(row.date, {
      ...current,
      weight_morning_kg: row.weight ?? null,
    });
  });
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
};

export default function DataAdminPage() {
  const { state, setState, uid } = useDashboardState();
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState('');
  const snapshots = useMemo(() => (state.stateSnapshots || []), [state.stateSnapshots]);

  const restoreSnapshot = (snapshot) => {
    if (!snapshot?.payload) return;
    setState((prev) => ({ ...prev, ...snapshot.payload }));
  };

  const exportState = () => {
    setImportText(JSON.stringify(state, null, 2));
    setStatus('Export etat complet genere.');
  };

  const importState = () => {
    try {
      const parsed = JSON.parse(importText);
      setState((prev) => ({ ...prev, ...parsed }));
      setStatus('Import etat complet OK.');
    } catch {
      setStatus('JSON etat invalide.');
    }
  };

  const exportChatgptPayload = () => {
    const rows = exportChatgptRows(state);
    const payload = JSON.stringify(rows, null, 2);
    setImportText(payload);
    navigator.clipboard?.writeText(payload).catch(() => {});
    setStatus(`Payload ChatGPT exporte (${rows.length} jours).`);
  };

  const importChatgptPayload = () => {
    try {
      let rows = [];
      let trainingRows = [];
      try {
        trainingRows = parseTrainingLogPayload(importText);
      } catch {
        trainingRows = [];
      }
      if (trainingRows.length > 0) {
        const today = todayIso();
        const droppedFuture = trainingRows.filter((row) => row.date > today).length;
        const filteredTrainingRows = trainingRows.filter((row) => row.date <= today);
        if (!filteredTrainingRows.length) {
          setStatus('Training_log detecte, mais toutes les dates sont dans le futur.');
          return;
        }
        setState((prev) => {
          const importedDates = new Set(filteredTrainingRows.map((row) => row.date));
          const metricsByDate = new Map((prev.metrics || []).map((entry) => [entry.date, entry]));
          filteredTrainingRows.forEach((row) => {
            const existing = metricsByDate.get(row.date) || { date: row.date };
            metricsByDate.set(row.date, {
              ...existing,
              date: row.date,
              weight: row.bodyweight_kg === null ? existing.weight : row.bodyweight_kg,
            });
          });

          const keptSessions = (prev.sessions || []).filter((entry) => !importedDates.has(entry.date));
          const importedSessions = filteredTrainingRows.flatMap((row) => trainingLogToSessions(row, uid));
          const latestDate = filteredTrainingRows.reduce((max, row) => (row.date > max ? row.date : max), prev.selectedDate);

          return {
            ...prev,
            selectedDate: latestDate,
            metrics: Array.from(metricsByDate.values()),
            sessions: [...importedSessions, ...keptSessions],
          };
        });
        const droppedLabel = droppedFuture > 0 ? ` | ${droppedFuture} date(s) future(s) ignoree(s)` : '';
        setStatus(`Training_log importe: ${filteredTrainingRows.length} jour(s), ${filteredTrainingRows.reduce((acc, row) => acc + (row.exercises?.length || 0), 0)} exo(s). Date active mise a jour.${droppedLabel}`);
        return;
      }

      try {
        rows = parseJsonRows(importText);
      } catch {
        rows = parsePortableCutRows(importText);
        if (!rows.length) rows = parseCompactTextRows(importText);
      }
      if (!rows.length) {
        setStatus('Aucune ligne valide dans le payload.');
        return;
      }
      const today = todayIso();
      const droppedFuture = rows.filter((row) => row.date > today).length;
      rows = rows.filter((row) => row.date <= today);
      if (!rows.length) {
        setStatus('Toutes les lignes sont dans le futur, rien a importer.');
        return;
      }
      setState((prev) => {
        const importedDates = new Set(rows.map((row) => row.date));
        const metricsByDate = new Map((prev.metrics || []).map((entry) => [entry.date, entry]));
        const logsByDate = new Map((prev.dailyLogs || []).map((entry) => [entry.date, entry]));
        const keptSessions = (prev.sessions || []).filter((entry) => !(entry.source === 'chat-free-import' && importedDates.has(entry.date)));
        const importedSessions = [];
        rows.forEach((row) => {
          const existingMetric = metricsByDate.get(row.date) || { date: row.date };
          metricsByDate.set(row.date, {
            ...existingMetric,
            date: row.date,
            weight: row.weight_morning_kg === null || row.weight_morning_kg === undefined
              ? existingMetric.weight
              : toPositive(row.weight_morning_kg, 0),
          });

          const existingLog = logsByDate.get(row.date) || { id: uid(), date: row.date };
          const mergedNotes = [row.notes, existingLog.notes].filter(Boolean).join(' | ');
          logsByDate.set(row.date, {
            ...existingLog,
            caloriesEstimated: row.calories_estimated,
            proteinG: row.protein_g,
            carbsG: row.carbs_g,
            fatG: row.fat_g,
            training: row.training,
            bloodPressure: row.blood_pressure,
            sleepHours: row.sleep_hours,
            fatigueNervousSystem: row.fatigue_nervous_system_1_10,
            domsLegs: row.doms_legs_1_10,
            mood: row.mood_1_10,
            notes: mergedNotes || null,
          });
          importedSessions.push(...parseTrainingToSessions(row, uid));
        });
        return {
          ...prev,
          metrics: Array.from(metricsByDate.values()),
          dailyLogs: Array.from(logsByDate.values()),
          sessions: [...importedSessions, ...keptSessions],
        };
      });
      const droppedLabel = droppedFuture > 0 ? ` | ${droppedFuture} ligne(s) futures ignoree(s)` : '';
      setStatus(`Payload ChatGPT importe (${rows.length} jours) avec overwrite + parse training.${droppedLabel}`);
    } catch {
      setStatus('Payload ChatGPT invalide.');
    }
  };

  return (
    <Layout title="Data Admin" description="Rollback snapshots, export/import state">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Data admin</h1>
            <p>Support technique: snapshots, patchs, export/import complet de l etat.</p>
            <CoreWorkflowNav active="data-admin" showSupport />
          </section>
          <section className={styles.grid2}>
            <article className={styles.card}>
              <h2>Snapshots</h2>
              <ul className={styles.list}>
                {snapshots.map((snapshot) => (
                  <li key={snapshot.id}>
                    <div className={styles.smallMuted}>{snapshot.at} | {snapshot.selectedDate} | {snapshot.size} bytes</div>
                    <button className={styles.tinyButton} type="button" onClick={() => restoreSnapshot(snapshot)}>Restaurer</button>
                  </li>
                ))}
              </ul>
            </article>
            <article className={styles.card}>
              <h2>Export / Import</h2>
              <div className={styles.formGrid}>
                <button className={styles.buttonGhost} type="button" onClick={exportState}>Exporter</button>
                <button className={styles.button} type="button" onClick={importState}>Importer</button>
                <button className={styles.buttonGhost} type="button" onClick={exportChatgptPayload}>Exporter payload ChatGPT</button>
                <button className={styles.button} type="button" onClick={importChatgptPayload}>Importer payload ChatGPT</button>
              </div>
              <p className={styles.smallMuted}>
                Schema ChatGPT: date, weight_morning_kg, calories_estimated, protein_g, carbs_g, fat_g, training, blood_pressure, sleep_hours, fatigue_nervous_system_1_10, doms_legs_1_10, mood_1_10, notes
              </p>
              <textarea className={styles.textarea} value={importText} onChange={(event) => setImportText(event.target.value)} />
              {status && <p className={styles.smallMuted}>{status}</p>}
            </article>
          </section>
        </div>
      </main>
    </Layout>
  );
}
