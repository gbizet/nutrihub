import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import { computeMacrosForAmount, formatMacrosLine, toPositive, useDashboardState } from '../lib/dashboardStore';
import { isoDaysWindow, toSeriesValue } from '../lib/charts';
import { getSessionsForDate } from '../lib/domainModel';
import { getHealthSnapshotForDate } from '../lib/healthState.js';
import { useLocalPageUiState } from '../lib/localUiState.js';
import LayoutBlocks from '../components/LayoutBlocks';
import DateNav from '../components/DateNav';
import InteractiveLineChart from '../components/InteractiveLineChart';
import CoreWorkflowNav from '../components/CoreWorkflowNav';
import {
  MEALS,
  METRICS,
  clampPercent,
  confidenceLabel,
  emptyMacros,
  energyToneKey,
  estimateActivityCalories,
  estimateBaseCalories,
  estimateTrainingCalories,
  foodKey,
  formatDateShort,
  formatMetric,
  formatSignedKcal,
  formatStepActivityMeta,
  formatTrainingMeta,
  resolveDayNutrition,
  resolveMetricForDate,
  round,
  sumEntryMacros,
  todayIso,
} from '../lib/nutritionAnalytics.js';

export default function NutritionPage() {
  const {
    state,
    setState,
    entriesForSelectedDay,
    dailyLogForSelectedDay,
    uid,
  } = useDashboardState();
  const [draftByMeal, setDraftByMeal] = useState({});
  const [pageUi, setPageUi] = useLocalPageUiState('nutrition', {
    libraryQuery: '',
    libraryMeal: 'dejeuner',
    strictMealTags: true,
    hideEmptyMeals: false,
    excludeIncompleteDay: true,
    trendDays: 14,
  });
  const [limitStatus, setLimitStatus] = useState('');
  const detailsRef = useRef(null);
  const inputRefs = useRef({});
  const libraryQuery = pageUi.libraryQuery || '';
  const libraryMeal = pageUi.libraryMeal || 'dejeuner';
  const strictMealTags = pageUi.strictMealTags !== false;
  const hideEmptyMeals = Boolean(pageUi.hideEmptyMeals);
  const excludeIncompleteDay = pageUi.excludeIncompleteDay !== false;
  const trendDays = Number(pageUi.trendDays || 14);

  const limits = state.limits || {
    kcal: { min: 2000, max: 2400 },
    protein: { min: 160, max: 220 },
    carbs: { min: 120, max: 220 },
    fat: { min: 45, max: 90 },
  };

  const [limitsDraft, setLimitsDraft] = useState(limits);
  const [goalsDraft, setGoalsDraft] = useState(state.goals || { kcal: 2200, protein: 180, carbs: 180, fat: 70 });

  useEffect(() => {
    setLimitsDraft(limits);
  }, [limits.carbs?.max, limits.carbs?.min, limits.fat?.max, limits.fat?.min, limits.kcal?.max, limits.kcal?.min, limits.protein?.max, limits.protein?.min]);

  useEffect(() => {
    setGoalsDraft(state.goals || { kcal: 2200, protein: 180, carbs: 180, fat: 70 });
  }, [state.goals]);

  const foods = useMemo(() => {
    const seen = new Set();
    const unique = [];
    state.foods.forEach((food) => {
      const key = foodKey(food);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(food);
    });
    return unique.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [state.foods]);

  const metricsAsc = useMemo(
    () => [...(state.metrics || [])].sort((a, b) => a.date.localeCompare(b.date)),
    [state.metrics],
  );

  const entriesByDate = useMemo(() => {
    const map = new Map();
    (state.entries || []).forEach((entry) => {
      const rows = map.get(entry.date) || [];
      rows.push(entry);
      map.set(entry.date, rows);
    });
    return map;
  }, [state.entries]);

  const dailyLogByDate = useMemo(
    () => new Map((state.dailyLogs || []).map((log) => [log.date, log])),
    [state.dailyLogs],
  );

  const neatByDate = useMemo(
    () => new Map((state.neatLogs || []).map((row) => [row.date, row])),
    [state.neatLogs],
  );

  const entriesByMeal = useMemo(() => {
    const byMeal = Object.fromEntries(MEALS.map((meal) => [meal.value, []]));
    entriesForSelectedDay.forEach((entry) => {
      if (!byMeal[entry.meal]) byMeal[entry.meal] = [];
      byMeal[entry.meal].push(entry);
    });
    return byMeal;
  }, [entriesForSelectedDay]);

  const selectedNutrition = useMemo(
    () => resolveDayNutrition(entriesForSelectedDay, dailyLogForSelectedDay),
    [dailyLogForSelectedDay, entriesForSelectedDay],
  );

  const libraryFoods = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter((food) => `${food.name} ${food.brand || ''}`.toLowerCase().includes(q));
  }, [foods, libraryQuery]);

  const mealTotals = useMemo(() => {
    return MEALS.reduce((acc, meal) => {
      acc[meal.value] = sumEntryMacros(entriesByMeal[meal.value] || []);
      return acc;
    }, {});
  }, [entriesByMeal]);

  const recentFoodsByMeal = useMemo(() => {
    const perMeal = {};
    MEALS.forEach((meal) => {
      const rows = (state.entries || []).filter((entry) => entry.meal === meal.value);
      const seen = new Set();
      perMeal[meal.value] = rows
        .filter((entry) => {
          if (!entry.foodId || seen.has(entry.foodId)) return false;
          seen.add(entry.foodId);
          return true;
        })
        .slice(0, 3)
        .map((entry) => foods.find((food) => food.id === entry.foodId))
        .filter(Boolean);
    });
    return perMeal;
  }, [foods, state.entries]);

  const selectedDateIsToday = state.selectedDate === todayIso();
  const rawWindowDates = useMemo(() => isoDaysWindow(state.selectedDate, trendDays), [state.selectedDate, trendDays]);
  const trendDates = useMemo(() => {
    if (selectedDateIsToday && excludeIncompleteDay && rawWindowDates.length > 1) {
      return rawWindowDates.slice(0, -1);
    }
    return rawWindowDates;
  }, [excludeIncompleteDay, rawWindowDates, selectedDateIsToday]);

  const buildEnergySnapshot = (date) => {
    const rows = entriesByDate.get(date) || [];
    const log = dailyLogByDate.get(date) || null;
    const neatRow = neatByDate.get(date) || null;
    const intake = resolveDayNutrition(rows, log);
    const weightKg = resolveMetricForDate(metricsAsc, date, 'weight');
    const bodyFatPercent = resolveMetricForDate(metricsAsc, date, 'bodyFat');
    const base = estimateBaseCalories({ weightKg, bodyFatPercent });
    const sessions = getSessionsForDate(state, date);
    const activity = estimateActivityCalories({ neatRow, weightKg, hasLoggedTraining: sessions.length > 0 });
    const training = estimateTrainingCalories({ sessions, weightKg });
    const expenditureKcal = base.kcal + activity.kcal + training.kcal;
    const balanceKcal = intake.kcal - expenditureKcal;

    return {
      date,
      intakeKcal: intake.kcal,
      intakeSource: intake.source,
      proteinG: intake.protein,
      carbsG: intake.carbs,
      fatG: intake.fat,
      weightKg,
      bodyFatPercent,
      baseKcal: base.kcal,
      baseMethod: base.method,
      baseFormula: base.formula,
      activityKcal: activity.kcal,
      activitySource: activity.source,
      activityMode: activity.mode,
      steps: activity.steps,
      cardioMin: activity.cardioMin,
      trainingKcal: training.kcal,
      trainingDurationMin: training.durationMin,
      trainingSource: training.source,
      trainingSessions: sessions.length,
      expenditureKcal,
      balanceKcal,
      confidence: confidenceLabel({
        weightKg,
        activityKcal: activity.kcal,
        trainingKcal: training.kcal,
        intakeSource: intake.source,
      }),
    };
  };

  const selectedEnergy = useMemo(
    () => buildEnergySnapshot(state.selectedDate),
    [dailyLogByDate, entriesByDate, metricsAsc, neatByDate, state, state.selectedDate],
  );
  const selectedHealth = useMemo(
    () => getHealthSnapshotForDate(state, state.selectedDate),
    [state, state.selectedDate],
  );

  const trendSnapshots = useMemo(
    () => trendDates.map((date) => buildEnergySnapshot(date)),
    [dailyLogByDate, entriesByDate, metricsAsc, neatByDate, state, trendDates],
  );

  const latestTrendSnapshot = trendSnapshots[trendSnapshots.length - 1] || selectedEnergy;

  const energyChartSeries = useMemo(
    () => ([
      {
        id: 'intake',
        label: 'Apport',
        color: '#0f172a',
        axis: 'left',
        data: trendSnapshots.map((row) => ({ date: row.date, value: row.intakeSource === 'none' ? null : toSeriesValue(row.intakeKcal) })),
      },
      {
        id: 'expenditure',
        label: 'Depense estimee',
        color: '#2563eb',
        axis: 'left',
        data: trendSnapshots.map((row) => ({ date: row.date, value: toSeriesValue(row.expenditureKcal) })),
      },
      {
        id: 'balance',
        label: 'Solde',
        color: '#ea580c',
        axis: 'right',
        data: trendSnapshots.map((row) => ({ date: row.date, value: row.intakeSource === 'none' ? null : toSeriesValue(row.balanceKcal) })),
      },
    ]),
    [trendSnapshots],
  );

  const macroTrendSeries = useMemo(
    () => ([
      {
        id: 'protein',
        label: 'Proteines',
        color: '#f97316',
        axis: 'left',
        data: trendSnapshots.map((row) => ({ date: row.date, value: row.intakeSource === 'none' ? null : toSeriesValue(row.proteinG) })),
      },
      {
        id: 'carbs',
        label: 'Glucides',
        color: '#16a34a',
        axis: 'right',
        data: trendSnapshots.map((row) => ({ date: row.date, value: row.intakeSource === 'none' ? null : toSeriesValue(row.carbsG) })),
      },
      {
        id: 'fat',
        label: 'Lipides',
        color: '#7c3aed',
        axis: 'left',
        data: trendSnapshots.map((row) => ({ date: row.date, value: row.intakeSource === 'none' ? null : toSeriesValue(row.fatG) })),
      },
    ]),
    [trendSnapshots],
  );

  const foodsForMeal = (meal) => {
    const tagged = foods.filter((food) => Array.isArray(food.mealTags) && food.mealTags.includes(meal));
    if (strictMealTags) return tagged;
    if (tagged.length) {
      const untagged = foods.filter((food) => !Array.isArray(food.mealTags) || !food.mealTags.includes(meal));
      return [...tagged, ...untagged];
    }
    return foods;
  };

  const getDraft = (meal) => {
    const mealFoods = foodsForMeal(meal);
    const first = mealFoods[0];
    const existing = draftByMeal[meal];
    if (existing) return existing;
    return {
      foodId: first?.id || '',
      amount: first?.defaultAmount || first?.defaultGrams || 100,
    };
  };

  const setMealDraft = (meal, patch) => {
    const current = getDraft(meal);
    setDraftByMeal((prev) => ({ ...prev, [meal]: { ...current, ...patch } }));
  };

  const addEntryFromFood = (food, meal, rawAmount) => {
    if (!food) return;
    const amount = food.servingMode === 'unit'
      ? toPositive(rawAmount || food.defaultAmount || 1, 1)
      : toPositive(rawAmount || food.defaultAmount || food.defaultGrams || 100, 0);
    const servingMode = food.servingMode || 'grams';
    const entryGrams = servingMode === 'unit' ? amount * toPositive(food.unitGrams, 50) : amount;

    const row = {
      id: uid(),
      date: state.selectedDate,
      foodId: food.id,
      foodName: food.brand ? `${food.name} (${food.brand})` : food.name,
      meal,
      amount,
      amountUnit: servingMode === 'unit' ? (food.unitLabel || 'unite') : 'g',
      grams: entryGrams,
      macros: computeMacrosForAmount(food, amount),
    };

    setState((prev) => ({ ...prev, entries: [row, ...prev.entries] }));
  };

  const addEntry = (meal) => {
    const draft = getDraft(meal);
    const food = foods.find((item) => item.id === draft.foodId);
    addEntryFromFood(food, meal, draft.amount);
  };

  const removeEntry = (entryId) => {
    setState((prev) => ({ ...prev, entries: prev.entries.filter((entry) => entry.id !== entryId) }));
  };

  const metricStates = useMemo(() => {
    return METRICS.map((metric) => {
      const value = selectedNutrition[metric.key] || 0;
      const low = Number(limits?.[metric.key]?.min ?? 0);
      const high = Number(limits?.[metric.key]?.max ?? Number.POSITIVE_INFINITY);
      const stateKey = value < low ? 'bas' : value > high ? 'haut' : 'ok';
      return { ...metric, value, stateKey };
    });
  }, [limits, selectedNutrition]);

  const thresholdSummary = useMemo(
    () => ({
      ok: metricStates.filter((metric) => metric.stateKey === 'ok').length,
      bas: metricStates.filter((metric) => metric.stateKey === 'bas').length,
      haut: metricStates.filter((metric) => metric.stateKey === 'haut').length,
    }),
    [metricStates],
  );

  const metricProgress = useMemo(
    () =>
      metricStates.map((metric) => {
        const min = Number(limits?.[metric.key]?.min ?? 0);
        const max = Number(limits?.[metric.key]?.max ?? 0);
        const safeMax = max > 0 ? max : Math.max(metric.value, 1);
        return {
          ...metric,
          min,
          max,
          fillPercent: clampPercent(metric.value, safeMax),
          minPercent: clampPercent(min, safeMax),
        };
      }),
    [limits, metricStates],
  );

  const thresholdSummaryLabel = `Seuils ${thresholdSummary.ok} OK / ${thresholdSummary.bas} bas / ${thresholdSummary.haut} haut`;
  const heroMacroGaugeItems = useMemo(
    () => metricProgress.map((metric) => {
      const goal = Number(state.goals?.[metric.key] ?? 0);
      const goalLabel = goal > 0
        ? `obj ${formatMetric(goal, metric.unit, 0)}`
        : `cible ${metric.min}-${metric.max} ${metric.unit}`;
      return {
        ...metric,
        goalLabel,
      };
    }),
    [metricProgress, state.goals],
  );

  const dailyInsightItems = useMemo(() => {
    const items = [];
    if (selectedDateIsToday) {
      items.push({
        label: excludeIncompleteDay ? 'Journee en cours exclue des tendances' : 'Journee en cours incluse dans les tendances',
        tone: 'statebas',
      });
    }
    if (selectedNutrition.protein < Number(limits.protein?.min || 0)) {
      items.push({
        label: `Proteines basses (${round(selectedNutrition.protein, 1)} g)`,
        tone: 'statehaut',
      });
    } else {
      items.push({
        label: `Proteines calees (${round(selectedNutrition.protein, 1)} g)`,
        tone: 'stateok',
      });
    }

    if (selectedNutrition.carbs <= Number(limits.carbs?.max || 0)) {
      items.push({
        label: `Glucides dans la cible (${round(selectedNutrition.carbs, 1)} g)`,
        tone: 'stateok',
      });
    } else {
      items.push({
        label: `Glucides au-dessus de la cible (${round(selectedNutrition.carbs, 1)} g)`,
        tone: 'statehaut',
      });
    }

    if (selectedNutrition.source === 'daily-log' && selectedNutrition.entryCount === 0) {
      items.push({
        label: 'Vue basee sur journal importe, pas sur repas detailles',
        tone: 'statebas',
      });
    } else if (selectedEnergy.trainingSessions > 0) {
      items.push({
        label: `Sport auto: ${selectedEnergy.trainingSessions} bloc(s) / ${Math.round(selectedEnergy.trainingDurationMin || 0)} min`,
        tone: 'statebas',
      });
    }

    if (selectedHealth.sleepHours > 0) {
      items.push({
        label: `Sommeil ${round(selectedHealth.sleepHours, 1)} h | FC repos ${round(selectedHealth.restingBpm, 0)}`,
        tone: selectedHealth.sleepHours >= 6.5 ? 'stateok' : 'statehaut',
      });
    }

    return items.slice(0, 4);
  }, [excludeIncompleteDay, limits.carbs?.max, limits.protein?.min, selectedDateIsToday, selectedEnergy.trainingSessions, selectedHealth.restingBpm, selectedHealth.sleepHours, selectedNutrition]);

  const updateDraftLimit = (metric, bound, value) => {
    setLimitsDraft((prev) => ({
      ...prev,
      [metric]: {
        ...(prev[metric] || {}),
        [bound]: toPositive(value, 0),
      },
    }));
    setLimitStatus('');
  };

  const saveLimits = () => {
    setState((prev) => ({ ...prev, limits: limitsDraft, goals: goalsDraft }));
    setLimitStatus('Seuils et objectifs enregistres.');
  };

  const cancelLimits = () => {
    setLimitsDraft(limits);
    setGoalsDraft(state.goals || { kcal: 2200, protein: 180, carbs: 180, fat: 70 });
    setLimitStatus('Modifications annulees.');
  };

  const openThresholdEditor = (metricKey) => {
    if (detailsRef.current) detailsRef.current.open = true;
    const target = inputRefs.current[`${metricKey}-min`];
    if (target) target.focus();
  };

  const visibleMeals = useMemo(() => {
    const rows = MEALS.filter((meal) => {
      const entries = entriesByMeal[meal.value] || [];
      if (!hideEmptyMeals) return true;
      return entries.length > 0;
    });
    return rows.length > 0 ? rows : MEALS;
  }, [entriesByMeal, hideEmptyMeals]);

  const hiddenMealsCount = hideEmptyMeals
    ? MEALS.filter((meal) => (entriesByMeal[meal.value] || []).length === 0).length
    : 0;

  const blocks = [
    {
      id: 'journal',
      label: 'Repas',
      defaultSpan: 12,
      render: () => (
        <section>
          <div className={styles.sectionHead}>
            <div>
              <h2>Journal repas</h2>
              <p className={styles.smallMuted}>
                {selectedNutrition.entryCount} entree(s) aujourd hui.
                {hiddenMealsCount > 0 ? ` ${hiddenMealsCount} repas vide(s) masques.` : ''}
              </p>
            </div>
          </div>
          <div className={styles.journalGrid}>
            {visibleMeals.map((meal) => {
              const draft = getDraft(meal.value);
              const mealFoods = foodsForMeal(meal.value);
              const selectedFood = mealFoods.find((food) => food.id === draft.foodId) || mealFoods[0];
              const amountLabel = selectedFood?.servingMode === 'unit' ? (selectedFood.unitLabel || 'unite(s)') : 'g';
              const rows = entriesByMeal[meal.value] || [];
              const totals = mealTotals[meal.value] || emptyMacros();
              const previewMacros = selectedFood ? computeMacrosForAmount(selectedFood, draft.amount) : null;
              const previewGrams = selectedFood
                ? (selectedFood.servingMode === 'unit'
                  ? toPositive(draft.amount, 1) * toPositive(selectedFood.unitGrams, 50)
                  : toPositive(draft.amount, 0))
                : 0;
              const recentFoods = recentFoodsByMeal[meal.value] || [];
              const showQuickFoods = rows.length === 0 && recentFoods.length > 0;
              const mealMetaLabel = rows.length > 0 ? `${rows.length} item(s)` : `${mealFoods.length} aliments dispos`;

              return (
                <article
                  key={meal.value}
                  className={[
                    styles.mealCard,
                    meal.emphasis === 'main' ? styles.mealCardMain : styles.mealCardSide,
                    rows.length === 0 ? styles.mealCardEmpty : '',
                  ].join(' ').trim()}
                >
                  <div className={styles.mealTop}>
                    <div>
                      <h2 className={styles.mealTitle}>{meal.label}</h2>
                      <span className={styles.mealMeta}>{mealMetaLabel}</span>
                    </div>
                    <span className={`${styles.stateChip} ${styles[`state${rows.length > 0 ? 'ok' : 'bas'}`]}`}>
                      {rows.length > 0 ? 'logge' : 'vide'}
                    </span>
                  </div>

                  <p className={styles.smallMuted}>{formatMacrosLine(totals)}</p>

                  {showQuickFoods && (
                    <div className={styles.mealQuickRow}>
                      <span className={styles.mealQuickLabel}>Recents</span>
                      {recentFoods.map((food) => (
                        <button
                          key={`${meal.value}-${food.id}`}
                          className={styles.mealQuickButton}
                          type="button"
                          onClick={() => addEntryFromFood(food, meal.value, food.defaultAmount)}
                        >
                          {food.name}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className={styles.mealComposer}>
                    <select
                      className={styles.select}
                      value={draft.foodId}
                      onChange={(e) => setMealDraft(meal.value, { foodId: e.target.value })}
                    >
                      {mealFoods.length === 0 && <option value="">Aucun aliment</option>}
                      {mealFoods.map((food) => (
                        <option key={food.id} value={food.id}>
                          {food.name}{food.brand ? ` (${food.brand})` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      className={styles.input}
                      type="number"
                      placeholder={amountLabel}
                      value={draft.amount}
                      onChange={(e) => setMealDraft(meal.value, { amount: e.target.value })}
                    />
                    <button className={styles.button} type="button" onClick={() => addEntry(meal.value)}>+ Ajout</button>
                  </div>

                  {strictMealTags && mealFoods.length === 0 && (
                    <p className={styles.smallMuted} style={{ marginTop: '0.35rem' }}>
                      Aucun aliment tagge pour ce repas. Va dans Base aliments pour cocher les repas utiles.
                    </p>
                  )}

                  {previewMacros && (
                    <p className={styles.smallMuted} style={{ marginTop: '0.2rem' }}>
                      Ajout: {formatMacrosLine(previewMacros)} ({previewGrams.toFixed(0)} g)
                    </p>
                  )}

                  <ul className={styles.entryList}>
                    {rows.map((entry) => (
                      <li key={entry.id} className={styles.entryRow}>
                        <div className={styles.entryText}>
                          <strong>{entry.foodName}</strong>
                          <span className={styles.smallMuted}>
                            {entry.amount ?? entry.grams} {entry.amountUnit || 'g'}{entry.amountUnit !== 'g' ? ` (${entry.grams?.toFixed?.(0) ?? entry.grams} g)` : ''} | {entry.macros.kcal.toFixed(0)} kcal
                          </span>
                        </div>
                        <button className={styles.tinyButton} type="button" onClick={() => removeEntry(entry.id)}>Suppr.</button>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      ),
    },
    {
      id: 'charts',
      label: 'Tendances',
      defaultSpan: 12,
      render: () => (
        <details open className={`${styles.card} ${styles.detailsCard}`}>
          <summary className={styles.cardSummary}>Tendances nutrition</summary>
          <div className={styles.grid2}>
          <article className={styles.card}>
            <div className={styles.sectionHead}>
              <div>
                <h2>Apport vs depense</h2>
                <p className={styles.smallMuted}>
                  Fenetre {trendDates[0] ? formatDateShort(trendDates[0]) : '-'} {'→'} {trendDates[trendDates.length - 1] ? formatDateShort(trendDates[trendDates.length - 1]) : '-'}
                </p>
              </div>
              <select className={styles.layoutSelect} value={trendDays} onChange={(e) => setPageUi((prev) => ({ ...prev, trendDays: Number(e.target.value) || 14 }))}>
                <option value={7}>7 jours</option>
                <option value={14}>14 jours</option>
                <option value={30}>30 jours</option>
              </select>
            </div>
            <InteractiveLineChart
              ariaLabel="Apport et depense sur la fenetre"
              xLabel="Date"
              yLabel="kcal"
              yLabelRight="Solde kcal"
              series={energyChartSeries}
              referenceLines={[{ value: 0, axis: 'right', color: '#94a3b8', label: 'Equilibre' }]}
              valueFormat={(v) => `${Number(v).toFixed(0)}`}
              valueFormatRight={(v) => `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(0)}`}
              dateFormat={formatDateShort}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
            <p className={styles.smallMuted}>
              Fin de fenetre: apport {Math.round(latestTrendSnapshot.intakeKcal)} kcal | depense {Math.round(latestTrendSnapshot.expenditureKcal)} kcal | solde {formatSignedKcal(latestTrendSnapshot.balanceKcal)}.
              {selectedDateIsToday && excludeIncompleteDay ? ' Aujourd hui est exclu du graphe.' : ''}
            </p>
          </article>

          <article className={styles.card}>
            <div className={styles.sectionHead}>
              <div>
                <h2>Proteines, glucides et lipides</h2>
                <p className={styles.smallMuted}>Lecture rapide adherence proteines + low carb + controle lipides.</p>
              </div>
            </div>
            <InteractiveLineChart
              ariaLabel="Proteines glucides lipides sur la fenetre"
              xLabel="Date"
              yLabel="Proteines / lipides (g)"
              yLabelRight="Glucides (g)"
              series={macroTrendSeries}
              referenceLines={[
                { value: limitsDraft.protein?.min ?? 0, axis: 'left', color: '#f97316', label: 'Min proteines' },
                { value: limitsDraft.carbs?.max ?? 0, axis: 'right', color: '#16a34a', label: 'Max glucides' },
                { value: limitsDraft.fat?.max ?? 0, axis: 'left', color: '#7c3aed', label: 'Max lipides' },
              ]}
              valueFormat={(v) => `${Number(v).toFixed(1)}`}
              valueFormatRight={(v) => `${Number(v).toFixed(1)}`}
              dateFormat={formatDateShort}
              onDateClick={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
            />
            <p className={styles.smallMuted}>
              Actuel: P {round(selectedNutrition.protein, 1)} g | G {round(selectedNutrition.carbs, 1)} g | L {round(selectedNutrition.fat, 1)} g | source {selectedNutrition.source === 'entries' ? 'repas logges' : selectedNutrition.source === 'daily-log' ? 'journal importe' : 'aucune'}.
            </p>
          </article>
          </div>
        </details>
      ),
    },
    {
      id: 'library',
      label: 'Bibliotheque',
      defaultSpan: 12,
      render: () => (
        <details className={`${styles.card} ${styles.detailsCard}`}>
          <summary className={styles.cardSummary}>Bibliotheque aliments (avance)</summary>
          <p className={styles.smallMuted}>Surface secondaire. Repliee par defaut pour garder le focus sur le flux par repas.</p>
          <div className={styles.sectionHead}>
            <div />
            <div className={styles.formGrid} style={{ margin: 0 }}>
              <input
                className={styles.input}
                placeholder="Filtrer (nom ou marque)"
                value={libraryQuery}
                onChange={(e) => setPageUi((prev) => ({ ...prev, libraryQuery: e.target.value }))}
              />
              <select className={styles.select} value={libraryMeal} onChange={(e) => setPageUi((prev) => ({ ...prev, libraryMeal: e.target.value }))}>
                {MEALS.map((meal) => (
                  <option key={meal.value} value={meal.value}>{meal.label}</option>
                ))}
              </select>
            </div>
          </div>
          <table className={styles.table}>
            <thead>
              <tr><th>Nom</th><th>Marque</th><th>Format</th><th>Macros (reference)</th><th>Action</th></tr>
            </thead>
            <tbody>
              {libraryFoods.slice(0, 40).map((food) => (
                <tr key={food.id}>
                  <td>{food.name}</td>
                  <td>{food.brand || '-'}</td>
                  <td>{food.servingMode === 'unit' ? `${food.defaultAmount || 1} ${food.unitLabel || 'unite'} (${food.unitGrams || 0}g/u)` : `${food.defaultAmount || 100}g`}</td>
                  <td>
                    {food.servingMode === 'unit'
                      ? `100g: ${food.kcal} kcal | P ${food.protein} | G ${food.carbs} | L ${food.fat} ; 1 ${food.unitLabel || 'unite'}: ${formatMacrosLine(computeMacrosForAmount(food, 1))}`
                      : `${food.kcal} kcal | P ${food.protein} | G ${food.carbs} | L ${food.fat}`}
                  </td>
                  <td>
                    <button className={styles.tinyButton} type="button" onClick={() => addEntryFromFood(food, libraryMeal, food.defaultAmount)}>
                      + {MEALS.find((meal) => meal.value === libraryMeal)?.label}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ),
    },
    {
      id: 'thresholds',
      label: 'Seuils',
      defaultSpan: 12,
      render: () => (
        <details ref={detailsRef} className={`${styles.card} ${styles.detailsCard}`}>
          <summary className={styles.cardSummary}>Regler seuils et objectifs</summary>
          <p className={styles.smallMuted}>Section avancee, repliee par defaut pour garder le focus sur le log quotidien.</p>
          <h3>Objectifs jour (goals)</h3>
          <div className={styles.formGrid}>
            <input className={styles.input} type="number" placeholder="Objectif kcal" value={goalsDraft.kcal ?? 0} onChange={(e) => setGoalsDraft((prev) => ({ ...prev, kcal: toPositive(e.target.value, 0) }))} />
            <input className={styles.input} type="number" placeholder="Objectif proteines (g)" value={goalsDraft.protein ?? 0} onChange={(e) => setGoalsDraft((prev) => ({ ...prev, protein: toPositive(e.target.value, 0) }))} />
            <input className={styles.input} type="number" placeholder="Objectif glucides (g)" value={goalsDraft.carbs ?? 0} onChange={(e) => setGoalsDraft((prev) => ({ ...prev, carbs: toPositive(e.target.value, 0) }))} />
            <input className={styles.input} type="number" placeholder="Objectif lipides (g)" value={goalsDraft.fat ?? 0} onChange={(e) => setGoalsDraft((prev) => ({ ...prev, fat: toPositive(e.target.value, 0) }))} />
          </div>
          <p className={styles.smallMuted}>
            Objectifs actifs: kcal {state.goals?.kcal ?? 0} | P {state.goals?.protein ?? 0} g | G {state.goals?.carbs ?? 0} g | L {state.goals?.fat ?? 0} g
          </p>
          <h3>Seuils min/max</h3>
          <div className={styles.thresholdGrid}>
            {METRICS.map((metric) => (
              <div key={metric.key} className={styles.thresholdRow}>
                <strong>{metric.label}</strong>
                <label>
                  <span className={styles.smallMuted}>Min cible ({metric.unit})</span>
                  <input
                    ref={(node) => {
                      inputRefs.current[`${metric.key}-min`] = node;
                    }}
                    className={styles.input}
                    type="number"
                    value={limitsDraft[metric.key]?.min ?? 0}
                    onChange={(e) => updateDraftLimit(metric.key, 'min', e.target.value)}
                  />
                </label>
                <label>
                  <span className={styles.smallMuted}>Max ({metric.unit})</span>
                  <input
                    ref={(node) => {
                      inputRefs.current[`${metric.key}-max`] = node;
                    }}
                    className={styles.input}
                    type="number"
                    value={limitsDraft[metric.key]?.max ?? 0}
                    onChange={(e) => updateDraftLimit(metric.key, 'max', e.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className={styles.formGrid} style={{ marginTop: '0.65rem' }}>
            <button className={styles.button} type="button" onClick={saveLimits}>Enregistrer seuils</button>
            <button className={styles.buttonGhost} type="button" onClick={cancelLimits}>Annuler modifs</button>
          </div>
          {limitStatus && <p className={styles.smallMuted}>{limitStatus}</p>}
          <div className={styles.stateGrid}>
            {metricStates.map((metric) => (
              <span key={metric.key} className={`${styles.stateChip} ${styles[`state${metric.stateKey}`]}`}>
                {metric.label}: {formatMetric(metric.value, metric.unit, metric.key === 'kcal' ? 0 : 1)}
              </span>
            ))}
          </div>
        </details>
      ),
    },
  ];

  return (
    <Layout title="Journal Nutrition" description="Vue repas en grille pour la journee">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <div className={styles.heroHeaderRow}>
              <div className={styles.heroTitleWrap}>
                <span className={styles.heroEyebrow}>Log quotidien prioritaire</span>
                <h1>Journal nutrition</h1>
                <p>Saisie repas d abord, lecture metabolique ensuite. Les jauges restent le repere central.</p>
              </div>
              <CoreWorkflowNav active="nutrition" supportMode="hub" />
            </div>

            <div className={styles.heroControlGrid}>
              <div className={styles.heroControlCard}>
                <span className={styles.smallMuted}>Date active</span>
                <DateNav
                  value={state.selectedDate}
                  onChange={(date) => setState((prev) => ({ ...prev, selectedDate: date }))}
                />
              </div>

              <div className={styles.heroToggleRow}>
                <label className={styles.togglePill}>
                  <input type="checkbox" checked={strictMealTags} onChange={(e) => setPageUi((prev) => ({ ...prev, strictMealTags: e.target.checked }))} />
                  Tags repas stricts
                </label>
                <label className={styles.togglePill}>
                  <input type="checkbox" checked={hideEmptyMeals} onChange={(e) => setPageUi((prev) => ({ ...prev, hideEmptyMeals: e.target.checked }))} />
                  Masquer repas vides
                </label>
                {selectedDateIsToday && (
                  <label className={styles.togglePill}>
                    <input type="checkbox" checked={excludeIncompleteDay} onChange={(e) => setPageUi((prev) => ({ ...prev, excludeIncompleteDay: e.target.checked }))} />
                    Exclure aujourd hui des tendances
                  </label>
                )}
              </div>

              <div className={styles.heroQuickActions}>
                <span className={styles.pill}>{thresholdSummaryLabel}</span>
                <Link className={styles.compactActionLink} to="/metrics">Saisie poids</Link>
                <Link className={styles.compactActionLink} to="/training">Saisie train</Link>
              </div>
            </div>

            <div className={styles.summaryStrip}>
              <div className={styles.summaryMetric}>
                <div className={styles.summaryMetricLabel}>Repas logges</div>
                <div className={styles.summaryMetricValue}>
                  {MEALS.filter((meal) => (entriesByMeal[meal.value] || []).length > 0).length}
                </div>
                <div className={styles.summaryMetricMeta}>sur {MEALS.length} repas</div>
              </div>
              <div className={styles.summaryMetric}>
                <div className={styles.summaryMetricLabel}>Apport</div>
                <div className={styles.summaryMetricValue}>{Math.round(selectedNutrition.kcal)} kcal</div>
                <div className={styles.summaryMetricMeta}>{formatMacrosLine(selectedNutrition)}</div>
              </div>
              <div className={styles.summaryMetric}>
                <div className={styles.summaryMetricLabel}>Depense</div>
                <div className={styles.summaryMetricValue}>{Math.round(selectedEnergy.expenditureKcal)} kcal</div>
                <div className={styles.summaryMetricMeta}>{selectedEnergy.confidence}</div>
              </div>
              <div className={styles.summaryMetric}>
                <div className={styles.summaryMetricLabel}>Solde</div>
                <div className={styles.summaryMetricValue}>{formatSignedKcal(selectedEnergy.balanceKcal)}</div>
                <div className={styles.summaryMetricMeta}>{thresholdSummaryLabel}</div>
              </div>
            </div>

            <div className={`${styles.macroGaugeGrid} ${styles.nutritionMacroGaugeGrid}`}>
              {heroMacroGaugeItems.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  className={styles.macroGaugeCard}
                  onClick={() => openThresholdEditor(metric.key)}
                >
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
                </button>
              ))}
            </div>

            <div className={styles.heroTargetGrid}>
              {metricProgress.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  className={styles.heroTargetCard}
                  onClick={() => openThresholdEditor(metric.key)}
                >
                  <div className={styles.heroTargetTop}>
                    <strong>{metric.label}</strong>
                    <span>{formatMetric(metric.value, metric.unit, metric.key === 'kcal' ? 0 : 1)}</span>
                  </div>
                  <div className={styles.heroTargetRange}>
                    cible {metric.min}-{metric.max} {metric.unit}
                  </div>
                  <div className={styles.heroProgressTrack}>
                    <div className={styles.heroProgressMin} style={{ left: `${metric.minPercent}%` }} />
                    <div
                      className={`${styles.heroProgressFill} ${styles[`heroFill${metric.stateKey}`]}`}
                      style={{ width: `${metric.fillPercent}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>

            <div className={styles.energyStrip}>
              <article className={styles.energyCard}>
                <span className={styles.energyLabel}>Metabolisme de repos</span>
                <strong className={styles.energyValue}>{Math.round(selectedEnergy.baseKcal)} kcal</strong>
                <span className={styles.energyMeta}>
                  {(selectedEnergy.baseMethod || '').startsWith('BMR') ? 'BMR' : selectedEnergy.baseMethod}
                  {selectedEnergy.baseFormula ? ` | ${selectedEnergy.baseFormula}` : ''}
                </span>
              </article>
              <article className={styles.energyCard}>
                <span className={styles.energyLabel}>Activite</span>
                <strong className={styles.energyValue}>{Math.round(selectedEnergy.activityKcal)} kcal</strong>
                <span className={styles.energyMeta}>
                  {formatStepActivityMeta({
                    steps: selectedEnergy.steps,
                    source: selectedEnergy.activitySource,
                    mode: selectedEnergy.activityMode,
                  })}
                </span>
              </article>
              <article className={styles.energyCard}>
                <span className={styles.energyLabel}>Sport auto</span>
                <strong className={styles.energyValue}>{Math.round(selectedEnergy.trainingKcal)} kcal</strong>
                <span className={styles.energyMeta}>
                  {formatTrainingMeta(selectedEnergy.trainingSessions, selectedEnergy.trainingDurationMin, selectedEnergy.trainingSource)}
                </span>
              </article>
              <article className={styles.energyCard}>
                <span className={styles.energyLabel}>Depense totale</span>
                <strong className={styles.energyValue}>{Math.round(selectedEnergy.expenditureKcal)} kcal</strong>
                <span className={styles.energyMeta}>{selectedEnergy.confidence} | repos + activite + sport</span>
              </article>
              <article className={`${styles.energyCard} ${styles.energyBalanceCard} ${styles[energyToneKey(selectedEnergy.balanceKcal)]}`}>
                <span className={styles.energyLabel}>Solde</span>
                <strong className={styles.energyValue}>{formatSignedKcal(selectedEnergy.balanceKcal)}</strong>
                <span className={styles.energyMeta}>apport {Math.round(selectedEnergy.intakeKcal)} kcal</span>
              </article>
            </div>

            <div className={styles.stateGrid}>
              {dailyInsightItems.map((item) => (
                <span key={item.label} className={`${styles.stateChip} ${styles[item.tone]}`}>
                  {item.label}
                </span>
              ))}
            </div>
          </section>

          <LayoutBlocks pageId="nutrition" state={state} setState={setState} blocks={blocks} />
        </div>
      </main>
    </Layout>
  );
}
