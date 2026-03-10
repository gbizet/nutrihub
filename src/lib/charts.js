import { getWorkoutKeyForSession } from './domainModel.js';

const parseIsoDate = (isoDate) => {
  const [year, month, day] = `${isoDate || ''}`.split('-').map((chunk) => Number.parseInt(chunk, 10));
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isoDaysWindow = (selectedDate, length) => {
  const end = parseIsoDate(selectedDate);
  const start = new Date(end);
  start.setDate(end.getDate() - (length - 1));

  const days = [];
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    days.push(toIsoDate(date));
  }
  return days;
};

export const aggregateNutritionByDay = (entries, days, dailyLogs = []) => {
  const logMap = new Map(dailyLogs.map((log) => [log.date, log]));
  return days.map((date) => {
    const rows = entries.filter((entry) => entry.date === date);
    const fromEntries = rows.reduce(
      (acc, entry) => ({
        kcal: acc.kcal + (entry.macros?.kcal || 0),
        protein: acc.protein + (entry.macros?.protein || 0),
      }),
      { kcal: 0, protein: 0 },
    );
    const log = logMap.get(date);
    return {
      date,
      kcal: fromEntries.kcal || Number(log?.caloriesEstimated || 0),
      protein: fromEntries.protein || Number(log?.proteinG || 0),
    };
  });
};

export const aggregateSessionsByDay = (sessions, days, dailyLogs = [], cycleLogs = []) => {
  const logMap = new Map(dailyLogs.map((log) => [log.date, log]));
  const cycleCompleted = (Array.isArray(cycleLogs) ? cycleLogs : []).filter((row) => row?.done || Number(row?.load || 0) > 0);
  return days.map((date) => {
    const sessionsCount = new Set(
      (Array.isArray(sessions) ? sessions : [])
        .filter((entry) => entry?.date === date)
        .map((entry) => getWorkoutKeyForSession(entry)),
    ).size;
    const cycleCount = cycleCompleted.filter((entry) => entry.date === date).length;
    const baseCount = sessionsCount + cycleCount;
    const logTraining = logMap.get(date)?.training ? 1 : 0;
    return { date, value: baseCount > 0 ? baseCount : logTraining };
  });
};

export const aggregateWeightByDay = (metrics, days) =>
  days.map((date) => ({ date, value: metrics.find((m) => m.date === date)?.weight || 0 }));

export const scaleSeries = (
  series,
  width,
  height,
  pad,
  accessor = (x) => x.value,
  options = { allowZero: false },
) => {
  const data = series.filter((item) => {
    const value = accessor(item);
    if (!Number.isFinite(value)) return false;
    return options.allowZero ? value >= 0 : value > 0;
  });
  if (!data.length) return [];

  const values = data.map(accessor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;

  return data.map((item, index) => ({
    ...item,
    x: pad + index * step,
    y: height - pad - ((accessor(item) - min) / span) * (height - pad * 2),
  }));
};

export const svgPath = (points) => points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

export const svgAreaPath = (points, height, pad) => {
  if (!points.length) return '';
  const line = svgPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  const yBase = height - pad;
  return `${line} L ${last.x} ${yBase} L ${first.x} ${yBase} Z`;
};

export const pointDelta = (series, accessor = (x) => x.value) => {
  if (series.length < 2) return 0;
  const first = accessor(series[0]) || 0;
  const last = accessor(series[series.length - 1]) || 0;
  return last - first;
};
