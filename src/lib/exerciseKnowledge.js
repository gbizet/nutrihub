const normalize = (value) =>
  `${value || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const GENERIC_HEADERS = [
  'serie',
  'series',
  'charge',
  'charge affichee',
  'charge affiche',
  'reel estime',
  'reel estimee',
  'reps',
  'duree',
  'seance',
];

const MUSCLE_PATTERNS = [
  { group: 'chest', patterns: ['bench', 'developpe couche', 'developpe incline', 'chest press', 'pec', 'pecs', 'ecarte', 'fly', 'dips'] },
  { group: 'back', patterns: ['tirage', 'tirage horizontal', 'row', 'traction', 'lat pulldown', 'pull up', 'pull down', 'dos', 'pullover', 'shrug'] },
  { group: 'legs', patterns: ['squat', 'deadlift', 'sdt', 'souleve de terre', 'leg press', 'fente', 'extension quadriceps', 'leg curl', 'mollet', 'hip thrust'] },
  { group: 'shoulders', patterns: ['overhead press', 'developpe militaire', 'dev militaire', 'lateral raise', 'elevation laterale', 'epaule', 'epaules', 'rear delt', 'oiseau', 'facepull', 'face pull'] },
  { group: 'arms', patterns: ['curl', 'triceps', 'extension triceps', 'barre front', 'biceps', 'marteau', 'bras'] },
];

export const EXERCISE_MUSCLE_GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'other'];
export const MUSCLE_GROUP_LABELS = {
  chest: 'Pecs',
  back: 'Dos',
  legs: 'Jambes',
  shoulders: 'Epaules',
  arms: 'Bras',
  other: 'Autres',
};

export const COMMON_EXERCISES = [
  { name: 'Bench Press', equipment: 'Full Rack', category: 'Push' },
  { name: 'Incline Bench Press', equipment: 'Full Rack', category: 'Push' },
  { name: 'Overhead Press', equipment: 'Barre olympique', category: 'Shoulders' },
  { name: 'Back Squat', equipment: 'Full Rack', category: 'Lower Body' },
  { name: 'Romanian Deadlift', equipment: 'Barre olympique', category: 'Posterior Chain' },
  { name: 'Hex Bar Deadlift', equipment: 'Hex Bar', category: 'Lower Body' },
  { name: 'EZ Bar Curl', equipment: 'EZ Bar', category: 'Arms' },
  { name: 'Triceps Extension (Poulie)', equipment: 'Poulies vis-a-vis', category: 'Arms' },
  { name: 'Cable Fly', equipment: 'Poulies vis-a-vis', category: 'Chest' },
  { name: 'Cable Row', equipment: 'Poulies vis-a-vis', category: 'Back' },
  { name: 'Lat Pulldown (Poulie)', equipment: 'Poulies vis-a-vis', category: 'Back' },
  { name: 'Face Pull', equipment: 'Poulies vis-a-vis', category: 'Shoulders' },
  { name: 'Lateral Raise (Poulie)', equipment: 'Poulies vis-a-vis', category: 'Shoulders' },
];

export const isMeaningfulExerciseName = (name) => {
  const n = normalize(name);
  if (!n) return false;
  if (/^\d+$/.test(n)) return false;
  if (GENERIC_HEADERS.some((h) => n === h)) return false;
  if (n.includes('serie') && n.includes('reps')) return false;
  if (n.includes('charge') && n.includes('reps')) return false;
  if (n.startsWith('charge affichee')) return false;
  return true;
};

export const normalizeExerciseMappingKey = (name = '') => normalize(name);

export const normalizeMuscleGroupShares = (candidate = {}) => {
  const positiveEntries = EXERCISE_MUSCLE_GROUPS
    .map((group) => [group, Number(candidate?.[group] || 0)])
    .filter(([, value]) => Number.isFinite(value) && value > 0);
  if (!positiveEntries.length) return null;
  const total = positiveEntries.reduce((acc, [, value]) => acc + value, 0) || 1;
  return Object.fromEntries(positiveEntries.map(([group, value]) => [group, value / total]));
};

export const resolveMuscleGroupShares = (exerciseName, category = '') => {
  const haystack = `${normalize(exerciseName)} ${normalize(category)}`.trim();
  const shares = {};
  const bump = (group, value) => {
    shares[group] = (shares[group] || 0) + value;
  };

  // Multi-group defaults for common compounds.
  if (/(bench|developpe couche|developpe incline|chest press|dips|pecs?)/.test(haystack)) {
    bump('chest', 0.65);
    bump('shoulders', 0.2);
    bump('arms', 0.15);
  }
  if (/(traction|pull up|lat pulldown|tirage vertical|tirage horizontal|row|tirage|dos|shrug)/.test(haystack)) {
    bump('back', 0.7);
    bump('arms', 0.3);
  }
  if (/(overhead press|developpe militaire|dev militaire|epaules?|face ?pull)/.test(haystack)) {
    bump('shoulders', 0.7);
    bump('arms', 0.3);
  }
  if (/(squat|leg press|fente)/.test(haystack)) {
    bump('legs', 0.9);
    bump('back', 0.1);
  }
  if (/(deadlift|sdt|souleve de terre|romanian deadlift|rdl)/.test(haystack)) {
    bump('legs', 0.55);
    bump('back', 0.45);
  }
  if (/(curl|triceps|biceps|bras)/.test(haystack)) {
    bump('arms', 0.9);
    bump('shoulders', 0.1);
  }

  // Fallback keyword matches if no compound mapping was detected.
  if (!Object.keys(shares).length) {
    for (const item of MUSCLE_PATTERNS) {
      if (item.patterns.some((p) => haystack.includes(p))) bump(item.group, 1);
    }
  }

  if (!Object.keys(shares).length) {
    if (haystack.includes('push')) bump('chest', 1);
    else if (haystack.includes('back')) bump('back', 1);
    else if (haystack.includes('lower')) bump('legs', 1);
    else if (haystack.includes('arm')) bump('arms', 1);
    else bump('other', 1);
  }

  const total = Object.values(shares).reduce((acc, v) => acc + v, 0) || 1;
  const normalized = {};
  Object.entries(shares).forEach(([group, value]) => {
    normalized[group] = value / total;
  });
  return normalized;
};

export const resolveMuscleGroup = (exerciseName, category = '') => {
  const shares = resolveMuscleGroupShares(exerciseName, category);
  return Object.entries(shares).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
};

export const resolveMuscleGroupSharesWithOverrides = (exerciseName, category = '', overrides = {}) => {
  const overrideKey = normalizeExerciseMappingKey(exerciseName);
  const normalizedOverride = normalizeMuscleGroupShares(overrides?.[overrideKey]);
  if (normalizedOverride) return normalizedOverride;
  return resolveMuscleGroupShares(exerciseName, category);
};

export const resolveMuscleGroupWithOverrides = (exerciseName, category = '', overrides = {}) => {
  const shares = resolveMuscleGroupSharesWithOverrides(exerciseName, category, overrides);
  return Object.entries(shares).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
};

const sessionSetCount = (session) => {
  if (Array.isArray(session?.setDetails) && session.setDetails.length > 0) return session.setDetails.length;
  const sets = Number(session?.sets);
  return Number.isFinite(sets) && sets > 0 ? sets : 1;
};

const sessionVolumeScore = (session) => {
  if (Array.isArray(session?.setDetails) && session.setDetails.length > 0) {
    return session.setDetails.reduce(
      (acc, row) => acc + Number(row?.reps || 0) * Number(row?.loadDisplayed || row?.loadEstimated || 0),
      0,
    );
  }
  return Number(session?.reps || 0) * Number(session?.load || 0);
};

export const rankWorkedMuscleGroups = (sessions = [], overrides = {}, options = {}) => {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 3;
  const metric = options.metric === 'volume' ? 'volume' : 'sets';
  const scores = Object.fromEntries(EXERCISE_MUSCLE_GROUPS.map((group) => [group, 0]));

  (Array.isArray(sessions) ? sessions : []).forEach((session) => {
    const baseScore = metric === 'volume' ? sessionVolumeScore(session) : sessionSetCount(session);
    if (!Number.isFinite(baseScore) || baseScore <= 0) return;
    const shares = resolveMuscleGroupSharesWithOverrides(
      session?.exerciseName,
      session?.category || '',
      overrides,
    );
    Object.entries(shares).forEach(([group, share]) => {
      scores[group] = (scores[group] || 0) + baseScore * Number(share || 0);
    });
  });

  const ranked = Object.entries(scores)
    .filter(([, score]) => Number.isFinite(score) && score > 0)
    .sort((a, b) => b[1] - a[1]);
  const preferred = ranked.filter(([group]) => group !== 'other');
  const source = preferred.length ? preferred : ranked;

  return source.slice(0, Math.max(1, limit)).map(([group, score]) => ({
    group,
    label: MUSCLE_GROUP_LABELS[group] || group,
    score: Number(score.toFixed(2)),
  }));
};

export const inferTrainingCategory = (exerciseName, muscleGroup) => {
  const n = normalize(exerciseName);
  if (n.includes('squat') || n.includes('deadlift') || n.includes('souleve')) return 'Lower Body';
  if (muscleGroup === 'chest') return 'Push';
  if (muscleGroup === 'back') return 'Back';
  if (muscleGroup === 'legs') return 'Lower Body';
  if (muscleGroup === 'shoulders') return 'Shoulders';
  if (muscleGroup === 'arms') return 'Arms';
  return 'Imported';
};
