import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import { useDashboardState } from '../lib/dashboardStore';
import { useLocalPageUiState } from '../lib/localUiState.js';
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

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

const CopyButton = ({ text, label, ghost = false }) => {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }, [text]);
  return (
    <button
      className={ghost ? styles.buttonGhost : styles.button}
      type="button"
      onClick={copy}
    >
      {copied ? 'Copie !' : label}
    </button>
  );
};

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

  const promptText = mode === 'daily' ? dailyPrompt : weeklyPrompt;
  const promptSize = new Blob([promptText]).size;
  const periodPromptSize = new Blob([periodExport.prompt]).size;
  const periodJsonSize = new Blob([periodExport.payloadJson]).size;

  return (
    <Layout title="Export AI" description="Prompts coach et dataset IA">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Export AI</h1>
            <p>Prompt daily/weekly pret a coller, ou dataset complet sur periode.</p>
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
            <CoreWorkflowNav active="prompt-builder" supportMode="hub" />
          </section>

          {/* ── Prompt généré ── */}
          <section className={styles.card}>
            <div className={styles.sectionHead}>
              <h2>Prompt {mode} — {state.selectedDate}</h2>
              <span className={styles.smallMuted}>{formatBytes(promptSize)}</span>
            </div>
            <div className={styles.formGrid} style={{ marginTop: '0.5rem' }}>
              <CopyButton text={promptText} label="Copier le prompt" />
            </div>
            <textarea className={styles.textarea} style={{ marginTop: '0.6rem' }} readOnly value={promptText} />
          </section>

          {/* ── Export période ── */}
          <section className={styles.card}>
            <div className={styles.sectionHead}>
              <h2>Dataset periode</h2>
              <span className={styles.smallMuted}>
                Prompt {formatBytes(periodPromptSize)} · JSON {formatBytes(periodJsonSize)}
              </span>
            </div>
            <div className={styles.formGrid} style={{ marginTop: '0.5rem' }}>
              <label>
                <span className={styles.smallMuted}>Debut</span>
                <input className={styles.input} type="date" value={periodStart} onChange={(e) => setPageUi((prev) => ({ ...prev, periodStart: e.target.value }))} />
              </label>
              <label>
                <span className={styles.smallMuted}>Fin</span>
                <input className={styles.input} type="date" value={periodEnd} onChange={(e) => setPageUi((prev) => ({ ...prev, periodEnd: e.target.value }))} />
              </label>
              <button className={styles.buttonGhost} type="button" onClick={() => setRangeFromSelectedDate(14)}>14j</button>
              <button className={styles.buttonGhost} type="button" onClick={() => setRangeFromSelectedDate(30)}>30j</button>
              <button className={styles.buttonGhost} type="button" onClick={() => setRangeFromSelectedDate(60)}>60j</button>
            </div>
            <div className={styles.insightGrid} style={{ marginTop: '0.7rem' }}>
              <div className={styles.insightItem}>
                <div className={styles.insightLabel}>Jours</div>
                <div className={styles.insightValue}>{periodExport.payload.summary.days}</div>
              </div>
              <div className={styles.insightItem}>
                <div className={styles.insightLabel}>Nutrition</div>
                <div className={styles.insightValue}>{periodExport.payload.summary.days_with_nutrition}j</div>
              </div>
              <div className={styles.insightItem}>
                <div className={styles.insightLabel}>Training</div>
                <div className={styles.insightValue}>{periodExport.payload.summary.days_with_training}j</div>
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
              <CopyButton text={periodExport.prompt} label="Copier prompt periode" />
              <CopyButton text={periodExport.payloadJson} label="Copier JSON dataset" ghost />
            </div>
            <details className={`${styles.detailsCard}`} style={{ marginTop: '0.7rem' }}>
              <summary className={styles.cardSummary}>Voir le contenu brut</summary>
              <h3 style={{ marginTop: '0.6rem' }}>Prompt complet</h3>
              <textarea className={styles.textarea} readOnly value={periodExport.prompt} />
              <h3 style={{ marginTop: '0.6rem' }}>JSON dataset</h3>
              <textarea className={styles.textarea} readOnly value={periodExport.payloadJson} />
            </details>
          </section>

          {/* ── Templates ── */}
          <details className={`${styles.card} ${styles.detailsCard}`}>
            <summary className={styles.cardSummary}>Personnaliser les templates</summary>
            <div className={styles.formGrid} style={{ marginTop: '0.6rem' }}>
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
                <tr><th>Placeholder</th><th>Scope</th><th>Description</th><th>Preview</th><th></th></tr>
              </thead>
              <tbody>
                {placeholderPreviewRows.map((row) => (
                  <tr key={row.token}>
                    <td><strong>{row.token}</strong></td>
                    <td>{row.scope}</td>
                    <td>{row.description}</td>
                    <td className={styles.smallMuted}>{row.preview}</td>
                    <td>
                      <button className={styles.tinyButton} type="button" onClick={() => insertPlaceholderToken(row.token)}>
                        +
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.grid2} style={{ marginTop: '0.6rem' }}>
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
              <button className={styles.button} type="button" onClick={saveTemplates}>Enregistrer</button>
              <button className={styles.buttonGhost} type="button" onClick={resetTemplates}>Annuler</button>
              <button className={styles.buttonGhost} type="button" onClick={resetTemplatesToDefault}>Defaut</button>
              <button className={styles.buttonGhost} type="button" onClick={exportTemplateJson}>Export JSON</button>
              <button className={styles.button} type="button" onClick={importTemplateJson}>Import JSON</button>
            </div>
            {templateJson !== '' && (
              <textarea
                className={styles.textarea}
                style={{ marginTop: '0.6rem' }}
                value={templateJson}
                onChange={(e) => setPageUi((prev) => ({ ...prev, templateJson: e.target.value }))}
                placeholder='{"daily":"...","weekly":"..."}'
              />
            )}
            {templateStatus && <p className={styles.smallMuted} style={{ marginTop: '0.4rem' }}>{templateStatus}</p>}
          </details>
        </div>
      </main>
    </Layout>
  );
}
