import { getDayLog, getSessionsForDate } from './domainModel.js';

const toNum = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const sumEntryMacros = (entries = []) =>
  entries.reduce(
    (acc, entry) => ({
      kcal: acc.kcal + toNum(entry?.macros?.kcal),
      protein: acc.protein + toNum(entry?.macros?.protein),
      carbs: acc.carbs + toNum(entry?.macros?.carbs),
      fat: acc.fat + toNum(entry?.macros?.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

export const dayMacrosForDate = (state, isoDate) => {
  const dayEntries = (state?.entries || []).filter((entry) => entry.date === isoDate);
  const fromEntries = sumEntryMacros(dayEntries);
  if (fromEntries.kcal > 0) return fromEntries;
  const dayLog = (state?.dailyLogs || []).find((entry) => entry.date === isoDate);
  return {
    kcal: toNum(dayLog?.caloriesEstimated),
    protein: toNum(dayLog?.proteinG),
    carbs: toNum(dayLog?.carbsG),
    fat: toNum(dayLog?.fatG),
  };
};

export const nutritionSignalsForDay = (state, isoDate) => {
  const macros = dayMacrosForDate(state, isoDate);
  const dayLog = getDayLog(state, isoDate) || {};
  const goals = state?.goals || {};
  const limits = state?.limits || {};
  const recoveryBaselines = state?.recoveryBaselines || {};

  const proteinTarget = Math.max(toNum(goals.protein), toNum(limits?.protein?.min));
  const carbCeiling = Math.max(toNum(goals.carbs), toNum(limits?.carbs?.max));
  const kcalFloor = toNum(limits?.kcal?.min);
  const hydrationMin = 2500;
  const sodiumMin = 3000;
  const potassiumMin = 3000;
  const magnesiumMin = 350;
  const restingBpmMax = Math.max(toNum(recoveryBaselines.restingBpm), 70);
  const hrvMsMin = Math.max(toNum(recoveryBaselines.hrvMs), 35);

  const hydrationActual = toNum(dayLog?.hydrationMl);
  const sodiumActual = toNum(dayLog?.sodiumMg);
  const potassiumActual = toNum(dayLog?.potassiumMg);
  const magnesiumActual = toNum(dayLog?.magnesiumMg);
  const restingBpm = toNum(dayLog?.restingBpm);
  const hrvMs = toNum(dayLog?.hrvMs);

  return {
    macros,
    proteinTarget,
    carbCeiling,
    kcalFloor,
    hydrationMin,
    hydrationActual,
    sodiumMin,
    sodiumActual,
    potassiumMin,
    potassiumActual,
    magnesiumMin,
    magnesiumActual,
    restingBpmMax,
    restingBpm,
    hrvMsMin,
    hrvMs,
    isProteinOk: proteinTarget <= 0 ? true : macros.protein >= proteinTarget,
    isCarbsOk: carbCeiling <= 0 ? true : macros.carbs <= carbCeiling,
    isCaloriesOk: kcalFloor <= 0 ? true : macros.kcal >= kcalFloor,
    isHydrationOk: hydrationActual <= 0 ? true : hydrationActual >= hydrationMin,
    isSodiumOk: sodiumActual <= 0 ? true : sodiumActual >= sodiumMin,
    isPotassiumOk: potassiumActual <= 0 ? true : potassiumActual >= potassiumMin,
    isMagnesiumOk: magnesiumActual <= 0 ? true : magnesiumActual >= magnesiumMin,
    isBpmOk: restingBpm <= 0 ? true : restingBpm <= restingBpmMax,
    isHrvOk: hrvMs <= 0 ? true : hrvMs >= hrvMsMin,
  };
};

export const dailyActionPlan = (state, isoDate) => {
  const limits = state?.limits || {};
  const goals = state?.goals || {};
  const dayLog = getDayLog(state, isoDate);
  const sessionsCount = getSessionsForDate(state, isoDate).length;
  const signals = nutritionSignalsForDay(state, isoDate);

  const actions = [];
  if (!signals.isProteinOk) {
    actions.push(
      `Proteines basses (${signals.macros.protein.toFixed(0)}g): ajouter 40-60g proteines au prochain repas.`,
    );
  }
  if (!signals.isCarbsOk && signals.carbCeiling > 0) {
    actions.push(
      `Glucides hauts (${signals.macros.carbs.toFixed(0)}g): rester sous ${signals.carbCeiling.toFixed(0)}g aujourd hui.`,
    );
  }
  if (toNum(signals.macros.kcal) < toNum(limits?.kcal?.min) * 0.85 && toNum(dayLog?.fatigueNervousSystem) >= 7) {
    actions.push('Deficit trop aggressif + fatigue elevee: remonter les kcal ce soir et prevoir seance plus legere demain.');
  }
  if (!sessionsCount) {
    actions.push('Aucune seance loggee: planifier un bloc court 30-40 min (mouvement principal + assistance).');
  }
  if (toNum(dayLog?.sleepHours) > 0 && toNum(dayLog?.sleepHours) < 6.5) {
    actions.push('Sommeil court: reduire intensite, garder technique propre et prioriser le coucher.');
  }
  if (!signals.isHydrationOk) {
    actions.push(`Hydratation basse (${signals.hydrationActual.toFixed(0)}ml): atteindre ${signals.hydrationMin.toFixed(0)}ml aujourd hui.`);
  }
  if (!signals.isSodiumOk || !signals.isPotassiumOk || !signals.isMagnesiumOk) {
    actions.push('Electrolytes incomplets: renforcer sodium, potassium et magnesium si tu les logs.');
  }
  if (!actions.length) {
    actions.push('RAS critique: tenir le plan, garder execution propre et constance.');
  }
  return actions.slice(0, 3);
};

export const readinessScore = (state, isoDate) => {
  const signals = nutritionSignalsForDay(state, isoDate);
  const dayLog = getDayLog(state, isoDate);

  let score = 100;
  if (!signals.isProteinOk) score -= 16;
  if (!signals.isCarbsOk) score -= 12;
  if (!signals.isHydrationOk) score -= 10;
  if (!signals.isSodiumOk) score -= 6;
  if (!signals.isPotassiumOk) score -= 5;
  if (!signals.isMagnesiumOk) score -= 5;
  if (!signals.isBpmOk) score -= 8;
  if (!signals.isHrvOk) score -= 8;

  const sleep = toNum(dayLog?.sleepHours);
  if (sleep > 0 && sleep < 6.5) score -= 15;

  const fatigue = toNum(dayLog?.fatigueNervousSystem);
  if (fatigue >= 7) score -= 20;

  return Math.max(0, Math.min(100, score));
};
