import React, { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@theme/Layout';
import styles from './dashboard.module.css';
import { useDashboardState } from '../lib/dashboardStore';
import { useLocalPageUiState } from '../lib/localUiState.js';
import LayoutBlocks from '../components/LayoutBlocks';
import DateNav from '../components/DateNav';
import CoreWorkflowNav from '../components/CoreWorkflowNav';
import { getDriveSyncPreferences, getGoogleDriveConfig } from '../lib/googleDriveSync';
import {
  PLACEHOLDER_DEFS,
  applyTemplate,
  buildIsoRange,
  buildPeriodExport,
  buildPromptContexts,
  buildWeeklyData,
  fallbackTemplate,
  parseIso,
  toIso,
  truncatePreview,
} from '../lib/promptExport.js';

export default function PromptBuilderPage() {
  const {
    state,
    setState,
    entriesForSelectedDay,
    sessionsForSelectedDay,
    metricsForSelectedDay,
    dailyLogForSelectedDay,
    dayMacros,
  } = useDashboardState();
  const [pageUi, setPageUi] = useLocalPageUiState('prompt-builder', {
    mode: 'daily',
    activeTemplateKey: 'daily',
    periodStart: '',
    periodEnd: '',
    templateJson: '',
  });
  const [draftTemplates, setDraftTemplates] = useState(() => ({
    daily: state.promptTemplates?.daily || fallbackTemplate.daily,
    weekly: state.promptTemplates?.weekly || fallbackTemplate.weekly,
  }));
  const [templateStatus, setTemplateStatus] = useState('');
  const dailyTemplateRef = useRef(null);
  const weeklyTemplateRef = useRef(null);

  const limits = state.limits || {
    kcal: { min: 2000, max: 2400 },
    protein: { min: 160, max: 220 },
    carbs: { min: 120, max: 220 },
    fat: { min: 45, max: 90 },
  };
  const drivePrefs = getDriveSyncPreferences();
  const driveConfig = getGoogleDriveConfig();

  useEffect(() => {
    setDraftTemplates({
      daily: state.promptTemplates?.daily || fallbackTemplate.daily,
      weekly: state.promptTemplates?.weekly || fallbackTemplate.weekly,
    });
  }, [state.promptTemplates?.daily, state.promptTemplates?.weekly]);

  const mode = pageUi.mode || 'daily';
  const activeTemplateKey = pageUi.activeTemplateKey || 'daily';
  const periodEnd = pageUi.periodEnd || state.selectedDate;
  const periodStart = pageUi.periodStart || (() => {
    const end = parseIso(state.selectedDate);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return toIso(start);
  })();
  const templateJson = pageUi.templateJson || '';

  const weeklyData = useMemo(
    () => buildWeeklyData(state, state.selectedDate),
    [state, state.selectedDate],
  );

  const contexts = useMemo(
    () => buildPromptContexts({
      state,
      entriesForSelectedDay,
      sessionsForSelectedDay,
      metricsForSelectedDay,
      dailyLogForSelectedDay,
      dayMacros,
      limits,
      drivePrefs,
      driveConfig,
      weeklyData,
    }),
    [
      dailyLogForSelectedDay,
      dayMacros,
      driveConfig,
      drivePrefs,
      entriesForSelectedDay,
      limits,
      metricsForSelectedDay,
      sessionsForSelectedDay,
      state,
      weeklyData,
    ],
  );

  const dailyPrompt = useMemo(
    () => applyTemplate(draftTemplates.daily || fallbackTemplate.daily, contexts.daily),
    [contexts.daily, draftTemplates.daily],
  );
  const weeklyPrompt = useMemo(
    () => applyTemplate(draftTemplates.weekly || fallbackTemplate.weekly, contexts.weekly),
    [contexts.weekly, draftTemplates.weekly],
  );

  const periodRange = useMemo(
    () => buildIsoRange(periodStart, periodEnd),
    [periodEnd, periodStart],
  );

  const periodExport = useMemo(
    () => buildPeriodExport({ state, periodRange, limits }),
    [limits, periodRange, state],
  );

  const saveTemplates = () => {
    setState((prev) => ({
      ...prev,
      promptTemplates: {
        daily: draftTemplates.daily,
        weekly: draftTemplates.weekly,
      },
    }));
    setTemplateStatus('Templates enregistres.');
  };

  const resetTemplates = () => {
    setDraftTemplates({
      daily: state.promptTemplates?.daily || fallbackTemplate.daily,
      weekly: state.promptTemplates?.weekly || fallbackTemplate.weekly,
    });
    setTemplateStatus('Modifs annulees.');
  };

  const resetTemplatesToDefault = () => {
    setDraftTemplates({ ...fallbackTemplate });
    setTemplateStatus('Templates par defaut rechargees (non enregistrees).');
  };

  const exportTemplateJson = () => {
    const payload = JSON.stringify(draftTemplates, null, 2);
    setPageUi((prev) => ({ ...prev, templateJson: payload }));
    navigator.clipboard?.writeText(payload).catch(() => {});
    setTemplateStatus('Templates exportes en JSON.');
  };

  const importTemplateJson = () => {
    try {
      const parsed = JSON.parse(templateJson);
      setDraftTemplates((prev) => ({
        daily: `${parsed.daily || prev.daily || ''}`,
        weekly: `${parsed.weekly || prev.weekly || ''}`,
      }));
      setTemplateStatus('Templates JSON charges dans l editeur.');
    } catch {
      setTemplateStatus('JSON templates invalide.');
    }
  };

  const copyPeriodJson = () => {
    navigator.clipboard?.writeText(periodExport.payloadJson).catch(() => {});
    setTemplateStatus('Export periode JSON copie.');
  };

  const copyPeriodPrompt = () => {
    navigator.clipboard?.writeText(periodExport.prompt).catch(() => {});
    setTemplateStatus('Prompt periode copie.');
  };

  const setRangeFromSelectedDate = (days) => {
    const end = parseIso(state.selectedDate);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    setPageUi((prev) => ({
      ...prev,
      periodStart: toIso(start),
      periodEnd: toIso(end),
    }));
  };

  const insertPlaceholderToken = (token) => {
    const field = activeTemplateKey === 'weekly' ? 'weekly' : 'daily';
    const textarea = field === 'weekly' ? weeklyTemplateRef.current : dailyTemplateRef.current;
    setDraftTemplates((prev) => {
      const current = `${prev[field] || ''}`;
      const start = textarea?.selectionStart ?? current.length;
      const end = textarea?.selectionEnd ?? current.length;
      return {
        ...prev,
        [field]: `${current.slice(0, start)}${token}${current.slice(end)}`,
      };
    });
    setTemplateStatus(`${token} insere dans ${field}.`);
  };

  const placeholderPreviewRows = useMemo(
    () => PLACEHOLDER_DEFS.map((item) => {
      const key = item.token.replace(/[{}]/g, '');
      const value = item.scope === 'weekly'
        ? contexts.weekly[key]
        : contexts.daily[key] || contexts.weekly[key];
      return {
        ...item,
        preview: truncatePreview(value),
      };
    }),
    [contexts.daily, contexts.weekly],
  );

  const blocks = [
    {
      id: 'editor',
      label: 'Templates',
      defaultSpan: 12,
      render: () => (
        <section className={styles.card}>
          <h2>Templates modifiables</h2>
          <p className={styles.smallMuted}>Placeholders documentes, insertion rapide et preview direct du rendu final.</p>
          <div className={styles.formGrid}>
            <label>
              <span className={styles.smallMuted}>Cible insertion</span>
              <select className={styles.select} value={activeTemplateKey} onChange={(e) => setPageUi((prev) => ({ ...prev, activeTemplateKey: e.target.value }))}>
                <option value="daily">Template daily</option>
                <option value="weekly">Template weekly</option>
              </select>
            </label>
          </div>
          <table className={styles.table} style={{ marginTop: '0.7rem' }}>
            <thead>
              <tr><th>Placeholder</th><th>Scope</th><th>Description</th><th>Preview</th><th>Action</th></tr>
            </thead>
            <tbody>
              {placeholderPreviewRows.map((row) => (
                <tr key={row.token}>
                  <td>{row.token}</td>
                  <td>{row.scope}</td>
                  <td>{row.description}</td>
                  <td>{row.preview}</td>
                  <td>
                    <button className={styles.tinyButton} type="button" onClick={() => insertPlaceholderToken(row.token)}>
                      Inserer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.grid2}>
            <div>
              <h3>Template daily</h3>
              <textarea
                ref={dailyTemplateRef}
                className={styles.textarea}
                value={draftTemplates.daily}
                onFocus={() => setPageUi((prev) => ({ ...prev, activeTemplateKey: 'daily' }))}
                onChange={(e) => setDraftTemplates((prev) => ({ ...prev, daily: e.target.value }))}
              />
            </div>
            <div>
              <h3>Template weekly</h3>
              <textarea
                ref={weeklyTemplateRef}
                className={styles.textarea}
                value={draftTemplates.weekly}
                onFocus={() => setPageUi((prev) => ({ ...prev, activeTemplateKey: 'weekly' }))}
                onChange={(e) => setDraftTemplates((prev) => ({ ...prev, weekly: e.target.value }))}
              />
            </div>
          </div>
          <div className={styles.formGrid} style={{ marginTop: '0.65rem' }}>
            <button className={styles.button} type="button" onClick={saveTemplates}>Enregistrer templates</button>
            <button className={styles.buttonGhost} type="button" onClick={resetTemplates}>Annuler modifs</button>
            <button className={styles.buttonGhost} type="button" onClick={resetTemplatesToDefault}>Recharger templates par defaut</button>
            <button className={styles.buttonGhost} type="button" onClick={exportTemplateJson}>Exporter JSON</button>
            <button className={styles.button} type="button" onClick={importTemplateJson}>Importer JSON</button>
          </div>
          <textarea
            className={styles.textarea}
            style={{ marginTop: '0.6rem' }}
            value={templateJson}
            onChange={(e) => setPageUi((prev) => ({ ...prev, templateJson: e.target.value }))}
            placeholder='{"daily":"...","weekly":"..."}'
          />
          {templateStatus && <p className={styles.smallMuted}>{templateStatus}</p>}
        </section>
      ),
    },
    {
      id: 'output',
      label: 'Prompt genere',
      defaultSpan: 12,
      render: () => (
        <section className={styles.card}>
          <h2>Prompt genere ({mode})</h2>
          <textarea className={styles.textarea} readOnly value={mode === 'daily' ? dailyPrompt : weeklyPrompt} />
        </section>
      ),
    },
    {
      id: 'period-export',
      label: 'Export AI',
      defaultSpan: 12,
      render: () => (
        <section className={styles.card}>
          <h2>Export complet pour ChatGPT (periode)</h2>
          <p className={styles.smallMuted}>Dataset complet nutrition + training (avec details de series) pour analyse AI sur une plage personnalisee.</p>
          <div className={styles.formGrid}>
            <label>
              <span className={styles.smallMuted}>Date debut</span>
              <input className={styles.input} type="date" value={periodStart} onChange={(e) => setPageUi((prev) => ({ ...prev, periodStart: e.target.value }))} />
            </label>
            <label>
              <span className={styles.smallMuted}>Date fin</span>
              <input className={styles.input} type="date" value={periodEnd} onChange={(e) => setPageUi((prev) => ({ ...prev, periodEnd: e.target.value }))} />
            </label>
            <button className={styles.buttonGhost} type="button" onClick={() => setRangeFromSelectedDate(14)}>14j jusqu a date active</button>
            <button className={styles.buttonGhost} type="button" onClick={() => setRangeFromSelectedDate(30)}>30j jusqu a date active</button>
            <button className={styles.buttonGhost} type="button" onClick={() => setRangeFromSelectedDate(60)}>60j jusqu a date active</button>
          </div>
          <div className={styles.insightGrid} style={{ marginTop: '0.7rem' }}>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Jours</div>
              <div className={styles.insightValue}>{periodExport.payload.summary.days}</div>
            </div>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Jours nutrition</div>
              <div className={styles.insightValue}>{periodExport.payload.summary.days_with_nutrition}</div>
            </div>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Jours training</div>
              <div className={styles.insightValue}>{periodExport.payload.summary.days_with_training}</div>
            </div>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Workouts / sets</div>
              <div className={styles.insightValue}>{periodExport.payload.summary.workouts_total} / {periodExport.payload.summary.sets_total}</div>
            </div>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Kcal moy</div>
              <div className={styles.insightValue}>{periodExport.payload.summary.kcal_avg ?? '-'}</div>
            </div>
            <div className={styles.insightItem}>
              <div className={styles.insightLabel}>Delta poids</div>
              <div className={styles.insightValue}>
                {periodExport.payload.summary.weight_delta_kg === null ? '-' : `${periodExport.payload.summary.weight_delta_kg} kg`}
              </div>
            </div>
          </div>
          <div className={styles.formGrid} style={{ marginTop: '0.65rem' }}>
            <button className={styles.button} type="button" onClick={copyPeriodPrompt}>Copier prompt complet</button>
            <button className={styles.buttonGhost} type="button" onClick={copyPeriodJson}>Copier JSON dataset</button>
          </div>
          <h3 style={{ marginTop: '0.8rem' }}>Prompt complet pret a coller</h3>
          <textarea className={styles.textarea} readOnly value={periodExport.prompt} />
          <h3 style={{ marginTop: '0.8rem' }}>JSON dataset</h3>
          <textarea className={styles.textarea} readOnly value={periodExport.payloadJson} />
        </section>
      ),
    },
  ];

  return (
    <Layout title="Prompt ChatGPT" description="Generation de prompt daily/weekly">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Generateur de resume IA</h1>
            <p>Hub export: prompts courts, revue hebdo et dataset complet sur periode.</p>
            <div className={styles.metaRow}>
              <label>
                <span className={styles.smallMuted}>Date de reference</span>
                <DateNav
                  value={state.selectedDate}
                  onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
                />
              </label>
              <select className={styles.select} value={mode} onChange={(e) => setPageUi((prev) => ({ ...prev, mode: e.target.value }))}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <CoreWorkflowNav active="prompt-builder" showSupport />
          </section>

          <LayoutBlocks pageId="prompt-builder" state={state} setState={setState} blocks={blocks} />
        </div>
      </main>
    </Layout>
  );
}
