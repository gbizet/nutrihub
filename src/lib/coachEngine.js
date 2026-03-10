import { getDayLog, getSessionsForDate, isoWindow } from './domainModel.js';

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

export const ketoSignalsForDay = (state, isoDate) => {
  const keto = state?.keto || {};
  const macros = dayMacrosForDate(state, isoDate);
  const dayLog = getDayLog(state, isoDate) || {};
  const netCarb = Math.max(0, macros.carbs - toNum(keto.fiberGEstimate));
  const proteinPerLeanKgTarget = toNum(keto.proteinPerLeanKgTarget) || 2.2;
  const leanMassKg = toNum(keto.leanMassKgEstimate) || 70;
  const proteinTarget = proteinPerLeanKgTarget * leanMassKg;
  const carbMax = toNum(keto.netCarbMax) || 35;
  const sodiumMin = toNum(keto.sodiumMgMin) || 3500;
  const potassiumMin = toNum(keto.potassiumMgMin) || 3000;
  const magnesiumMin = toNum(keto.magnesiumMgMin) || 350;
  const hydrationMin = toNum(keto.hydrationMlMin) || 2500;
  const restingBpmMax = toNum(keto.restingBpmMax) || 70;
  const hrvMsMin = toNum(keto.hrvMsMin) || 35;
  const sodiumActual = toNum(dayLog?.sodiumMg);
  const potassiumActual = toNum(dayLog?.potassiumMg);
  const magnesiumActual = toNum(dayLog?.magnesiumMg);
  const hydrationActual = toNum(dayLog?.hydrationMl);
  const restingBpm = toNum(dayLog?.restingBpm);
  const hrvMs = toNum(dayLog?.hrvMs);

  return {
    macros,
    netCarb,
    proteinTarget,
    carbMax,
    sodiumMin,
    potassiumMin,
    magnesiumMin,
    hydrationMin,
    restingBpmMax,
    hrvMsMin,
    sodiumActual,
    potassiumActual,
    magnesiumActual,
    hydrationActual,
    restingBpm,
    hrvMs,
    isNetCarbOk: netCarb <= carbMax,
    isProteinOk: macros.protein >= proteinTarget,
    isSodiumOk: sodiumActual <= 0 ? true : sodiumActual >= sodiumMin,
    isPotassiumOk: potassiumActual <= 0 ? true : potassiumActual >= potassiumMin,
    isMagnesiumOk: magnesiumActual <= 0 ? true : magnesiumActual >= magnesiumMin,
    isHydrationOk: hydrationActual <= 0 ? true : hydrationActual >= hydrationMin,
    isBpmOk: restingBpm <= 0 ? true : restingBpm <= restingBpmMax,
    isHrvOk: hrvMs <= 0 ? true : hrvMs >= hrvMsMin,
  };
};

export const dailyActionPlan = (state, isoDate) => {
  const limits = state?.limits || {};
  const goals = state?.goals || {};
  const macros = dayMacrosForDate(state, isoDate);
  const dayLog = getDayLog(state, isoDate);
  const sessionsCount = getSessionsForDate(state, isoDate).length;
  const keto = ketoSignalsForDay(state, isoDate);

  const actions = [];
  if (macros.protein < toNum(goals.protein) * 0.8) {
    actions.push(`Proteines basses (${macros.protein.toFixed(0)}g): ajouter 40-60g proteines au prochain repas.`);
  }
  if (keto.netCarb > keto.carbMax) {
    actions.push(`Net carbs hauts (${keto.netCarb.toFixed(0)}g): viser < ${keto.carbMax}g sur le reste de la journee.`);
  }
  if (toNum(macros.kcal) < toNum(limits?.kcal?.min) * 0.85 && toNum(dayLog?.fatigueNervousSystem) >= 7) {
    actions.push('Deficit trop aggressif + fatigue elevee: remonter les kcal ce soir et prevoir seance plus legere demain.');
  }
  if (!sessionsCount) {
    actions.push('Aucune seance loggee: planifier un bloc court 30-40 min (mouvement principal + assistance).');
  }
  if (toNum(dayLog?.sleepHours) > 0 && toNum(dayLog?.sleepHours) < 6.5) {
    actions.push('Sommeil court: reduire intensite, garder technique/propre, prioriser coucher plus tot.');
  }
  if (!keto.isSodiumOk) {
    actions.push(`Sodium bas (${keto.sodiumActual.toFixed(0)}mg): ajouter sodium/electrolytes pour limiter fatigue/crampes.`);
  }
  if (!keto.isPotassiumOk || !keto.isMagnesiumOk) {
    actions.push('Electrolytes incomplets: renforcer potassium/magnesium (aliments ou supplementation).');
  }
  if (!keto.isHydrationOk) {
    actions.push(`Hydratation basse (${keto.hydrationActual.toFixed(0)}ml): atteindre ${keto.hydrationMin.toFixed(0)}ml aujourd hui.`);
  }
  if (!actions.length) {
    actions.push('RAS critique: tenir le plan, garder execution propre et constance.');
  }
  return actions.slice(0, 3);
};

export const readinessScore = (state, isoDate) => {
  const keto = ketoSignalsForDay(state, isoDate);
  const dayLog = getDayLog(state, isoDate);
  let score = 100;
  if (!keto.isNetCarbOk) score -= 18;
  if (!keto.isProteinOk) score -= 16;
  if (!keto.isSodiumOk) score -= 10;
  if (!keto.isPotassiumOk) score -= 8;
  if (!keto.isMagnesiumOk) score -= 8;
  if (!keto.isHydrationOk) score -= 10;
  if (!keto.isBpmOk) score -= 8;
  if (!keto.isHrvOk) score -= 8;
  const sleep = toNum(dayLog?.sleepHours);
  if (sleep > 0 && sleep < 6.5) score -= 15;
  const fatigue = toNum(dayLog?.fatigueNervousSystem);
  if (fatigue >= 7) score -= 20;
  return Math.max(0, Math.min(100, score));
};

export const ketoWeeklyCompliance = (state, selectedDate, days = 14) => {
  const dates = isoWindow(selectedDate, days);
  const rows = dates.map((date) => {
    const signals = ketoSignalsForDay(state, date);
    const checks = [
      signals.isNetCarbOk,
      signals.isProteinOk,
      signals.isSodiumOk,
      signals.isPotassiumOk,
      signals.isMagnesiumOk,
      signals.isHydrationOk,
    ];
    const score = checks.filter(Boolean).length / checks.length;
    return {
      date,
      ...signals,
      complianceScore: score,
    };
  });
  const avgScore = rows.reduce((acc, row) => acc + row.complianceScore, 0) / (rows.length || 1);
  return {
    dates,
    rows,
    avgScore,
    compliantDays: rows.filter((r) => r.complianceScore >= 0.66).length,
  };
};

export const nextMealRecommendation = (state, isoDate) => {
  const keto = ketoSignalsForDay(state, isoDate);
  if (!keto.isProteinOk) {
    return 'Prochain repas: focus proteines (40-60g) + legumes faibles glucides + lipides moderes.';
  }
  if (!keto.isNetCarbOk) {
    return 'Prochain repas: zero sucre/feculents, privilegier viande/poisson/oeufs + verts.';
  }
  if (!keto.isSodiumOk) {
    return 'Prochain repas: ajouter sodium (bouillon/electrolytes/salage) pour soutenir energie et perf.';
  }
  if (!keto.isPotassiumOk || !keto.isMagnesiumOk) {
    return 'Prochain repas: prioriser aliments riches en potassium/magnesium et hydratation.';
  }
  return 'Prochain repas: maintenir le plan ceto, portion proteinee stable et legumes fibres.';
};

export const nextWorkoutRecommendation = (state, isoDate) => {
  const dayLog = getDayLog(state, isoDate);
  const fatigue = toNum(dayLog?.fatigueNervousSystem);
  const sleep = toNum(dayLog?.sleepHours);
  const sessionsCount = getSessionsForDate(state, isoDate).length;
  if (fatigue >= 7 || (sleep > 0 && sleep < 6.5)) {
    return 'Seance suivante: reduire volume (-25%), garder mouvement principal technique, pas d echec.';
  }
  const keto = ketoSignalsForDay(state, isoDate);
  if (!keto.isHydrationOk || !keto.isSodiumOk) {
    return 'Seance suivante: corriger hydratation/electrolytes avant effort intense.';
  }
  if (!sessionsCount) {
    return 'Seance suivante: bloc court 35-45 min, 1 mouvement principal + 2 accessoires.';
  }
  return 'Seance suivante: progression standard, viser +1 rep ou +2.5kg sur le top set propre.';
};
