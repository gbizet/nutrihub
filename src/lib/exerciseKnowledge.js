const normalize = (value) =>
  `${value || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const EXERCISE_CANONICAL_GROUPS = [
  { canonical: 'Bench Press', aliases: ['Bench Press', 'Developpe couche', 'Dev couche', 'Developpe couche barre'] },
  { canonical: 'Incline Bench Press', aliases: ['Incline Bench Press', 'Developpe incline', 'Dev incline'] },
  { canonical: 'Overhead Press', aliases: ['Overhead Press', 'Developpe militaire', 'dev militaire'] },
  { canonical: 'EZ Bar Curl', aliases: ['EZ Bar Curl', 'Curl barre EZ', 'curl barre ez'] },
  { canonical: 'Cable Fly', aliases: ['Cable Fly', 'Ecarte poulie haute'] },
  { canonical: 'Triceps Extension (Poulie)', aliases: ['Triceps Extension (Poulie)', 'Triceps Poulie', 'extension triceps a la poulie haute', 'extension triceps à la poulie haute'] },
  { canonical: 'shrug', aliases: ['shrug', 'Shrug halteres', 'Dumbbell Shrug'] },
  { canonical: 'Traction pdc', aliases: ['Traction pdc', 'Pull-Up', 'Pull Up'] },
  { canonical: 'Tirage row banc haltere mono bras', aliases: ['Tirage row banc haltere mono bras', 'Rowing haltere un bras', 'One Arm Dumbbell Row'] },
  { canonical: 'Elevation laterale', aliases: ['Elevation laterale', 'Élévation latteral', 'Lateral Raise', 'Elevations laterales', 'Elevation laterale halteres'] },
];

const EXERCISE_CANONICAL_LOOKUP = new Map();

for (const group of EXERCISE_CANONICAL_GROUPS) {
  const canonicalKey = normalize(group.canonical);
  if (!canonicalKey) continue;
  EXERCISE_CANONICAL_LOOKUP.set(canonicalKey, group.canonical);
  for (const alias of group.aliases || []) {
    const aliasKey = normalize(alias);
    if (!aliasKey) continue;
    EXERCISE_CANONICAL_LOOKUP.set(aliasKey, group.canonical);
  }
}

export const resolveCanonicalExerciseName = (exerciseName = '') => {
  const raw = `${exerciseName || ''}`.trim();
  if (!raw) return '';
  return EXERCISE_CANONICAL_LOOKUP.get(normalize(raw)) || raw;
};

export const areExerciseNamesEquivalent = (left, right) => (
  normalizeExerciseMappingKey(left) === normalizeExerciseMappingKey(right)
);

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

export const EQUIPMENT_OPTIONS = [
  'Rack + barre olympique + disques',
  'Rack + barre droite + disques',
  'Rack + EZ Bar + disques',
  'Rack + Hex Bar + disques',
  'Banc + barre olympique + disques',
  "Banc + paire d'halteres",
  'Haltere',
  "Paire d'halteres",
  'Barre olympique',
  'Barre droite',
  'Hex Bar',
  'EZ Bar',
  'Landmine',
  'Poulie simple',
  'Poulie double',
  'Poulies vis-a-vis',
  'Machine guidee',
  'Poids du corps',
  'Full Rack',
];

export const COMMON_EXERCISES = [
  { name: 'Bench Press', equipment: 'Banc + barre olympique + disques', category: 'Push' },
  { name: 'Developpe couche', equipment: 'Banc + barre olympique + disques', category: 'Push' },
  { name: 'Dev couche', equipment: 'Banc + barre olympique + disques', category: 'Push' },
  { name: 'Developpe couche barre', equipment: 'Banc + barre olympique + disques', category: 'Push' },
  { name: 'Developpe couche prise serree', equipment: 'Banc + barre olympique + disques', category: 'Push' },
  { name: 'Incline Bench Press', equipment: 'Banc + barre olympique + disques', category: 'Push' },
  { name: 'Developpe incline', equipment: 'Banc + barre olympique + disques', category: 'Push' },
  { name: 'Dev incline', equipment: 'Banc + barre olympique + disques', category: 'Push' },
  { name: 'Developpe incline halteres', equipment: "Banc + paire d'halteres", category: 'Push' },
  { name: 'Developpe couche halteres', equipment: "Banc + paire d'halteres", category: 'Push' },
  { name: 'Overhead Press', equipment: 'Barre olympique', category: 'Shoulders' },
  { name: 'Developpe militaire', equipment: 'Barre olympique', category: 'Shoulders' },
  { name: 'Landmine Press', equipment: 'Landmine', category: 'Shoulders' },
  { name: 'Back Squat', equipment: 'Rack + barre olympique + disques', category: 'Lower Body' },
  { name: 'Front Squat', equipment: 'Rack + barre olympique + disques', category: 'Lower Body' },
  { name: 'Pause Squat', equipment: 'Rack + barre olympique + disques', category: 'Lower Body' },
  { name: 'Romanian Deadlift', equipment: 'Barre olympique', category: 'Posterior Chain' },
  { name: 'Souleve de terre', equipment: 'Barre olympique', category: 'Posterior Chain' },
  { name: 'Hex Bar Deadlift', equipment: 'Hex Bar', category: 'Lower Body' },
  { name: 'Barbell Row', equipment: 'Barre olympique', category: 'Back' },
  { name: 'Pendlay Row', equipment: 'Barre olympique', category: 'Back' },
  { name: 'One Arm Dumbbell Row', equipment: 'Haltere', category: 'Back' },
  { name: 'Rowing haltere un bras', equipment: 'Haltere', category: 'Back' },
  { name: 'Tirage row banc haltere mono bras', equipment: 'Banc + paire d\'halteres', category: 'Back' },
  { name: 'Chest Supported Row', equipment: "Paire d'halteres", category: 'Back' },
  { name: 'EZ Bar Curl', equipment: 'EZ Bar', category: 'Arms' },
  { name: 'Curl barre EZ', equipment: 'EZ Bar', category: 'Arms' },
  { name: 'Hammer Curl', equipment: 'Haltere', category: 'Arms' },
  { name: 'Dumbbell Bench Press', equipment: "Paire d'halteres", category: 'Push' },
  { name: 'Incline Dumbbell Press', equipment: "Paire d'halteres", category: 'Push' },
  { name: 'Lateral Raise', equipment: "Paire d'halteres", category: 'Shoulders' },
  { name: 'Elevation laterale', equipment: "Paire d'halteres", category: 'Shoulders' },
  { name: 'Elevations laterales', equipment: "Paire d'halteres", category: 'Shoulders' },
  { name: 'Elevation laterale halteres', equipment: "Paire d'halteres", category: 'Shoulders' },
  { name: 'Triceps Extension (Poulie)', equipment: 'Poulies vis-a-vis', category: 'Arms' },
  { name: 'Triceps Poulie', equipment: 'Poulie double', category: 'Arms' },
  { name: 'Extension triceps a la poulie haute', equipment: 'Poulie double', category: 'Arms' },
  { name: 'Cable Fly', equipment: 'Poulies vis-a-vis', category: 'Chest' },
  { name: 'Cable Row', equipment: 'Poulies vis-a-vis', category: 'Back' },
  { name: 'Seated Cable Row', equipment: 'Poulie double', category: 'Back' },
  { name: 'Lat Pulldown (Poulie)', equipment: 'Poulies vis-a-vis', category: 'Back' },
  { name: 'Vertical Pulldown', equipment: 'Poulie double', category: 'Back' },
  { name: 'Tirage vertical', equipment: 'Poulie double', category: 'Back' },
  { name: 'Tirage vertical poulie double', equipment: 'Poulie double', category: 'Back' },
  { name: 'Face Pull', equipment: 'Poulies vis-a-vis', category: 'Shoulders' },
  { name: 'Lateral Raise (Poulie)', equipment: 'Poulies vis-a-vis', category: 'Shoulders' },
  { name: 'Oiseau halteres', equipment: "Paire d'halteres", category: 'Shoulders' },
  { name: 'Shrug halteres', equipment: "Paire d'halteres", category: 'Back' },
  { name: 'Cable Cross Over', equipment: 'Poulies vis-a-vis', category: 'Chest' },
  { name: 'Goblet Squat', equipment: 'Haltere', category: 'Lower Body' },
  { name: 'Bulgarian Split Squat', equipment: "Paire d'halteres", category: 'Lower Body' },
  { name: 'Pull Up', equipment: 'Poids du corps', category: 'Back' },
  { name: 'Traction pdc', equipment: 'Poids du corps', category: 'Back' },
  { name: 'Dip', equipment: 'Poids du corps', category: 'Push' },
  { name: 'Farmer Walk', equipment: "Paire d'halteres", category: 'Upper Body' },
  { name: 'Marche du fermier', equipment: "Paire d'halteres", category: 'Upper Body' },
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

export const normalizeExerciseMappingKey = (name = '') => normalize(resolveCanonicalExerciseName(name));

export const buildCanonicalExerciseLibrary = (exercises = COMMON_EXERCISES) => {
  const seen = new Set();
  return (Array.isArray(exercises) ? exercises : [])
    .map((exercise) => ({
      ...exercise,
      name: resolveCanonicalExerciseName(exercise?.name),
    }))
    .filter((exercise) => {
      const key = normalizeExerciseMappingKey(exercise.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const findCommonExerciseByName = (exerciseName = '') => {
  const key = normalizeExerciseMappingKey(exerciseName);
  if (!key) return null;
  return COMMON_EXERCISES.find((exercise) => normalizeExerciseMappingKey(exercise.name) === key) || null;
};

export const normalizeMuscleGroupShares = (candidate = {}) => {
  const positiveEntries = EXERCISE_MUSCLE_GROUPS
    .map((group) => [group, Number(candidate?.[group] || 0)])
    .filter(([, value]) => Number.isFinite(value) && value > 0);
  if (!positiveEntries.length) return null;
  const total = positiveEntries.reduce((acc, [, value]) => acc + value, 0) || 1;
  return Object.fromEntries(positiveEntries.map(([group, value]) => [group, value / total]));
};

export const resolveMuscleGroupShares = (exerciseName, category = '') => {
  const haystack = `${normalize(resolveCanonicalExerciseName(exerciseName))} ${normalize(category)}`.trim();
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
