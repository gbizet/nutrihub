const normalizeSpaces = (value) => `${value || ''}`.replace(/\s+/g, ' ').trim();
const stripDiacritics = (value) => `${value || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const toPositive = (value, fallback = 0) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

const normalizeSearchText = (value) => normalizeSpaces(stripDiacritics(value)).toLowerCase();

export const parseNumberishToken = (rawToken, label) => {
  const raw = normalizeSpaces(rawToken);
  const normalized = normalizeSearchText(raw);
  const notes = [];
  if (!raw || /^(n\/a|na|null|-)$/.test(normalized)) {
    notes.push(`${label}: ${raw || 'n/a'}`);
    return { value: null, notes };
  }
  if (/faible|tres?\s*bas|bas/.test(normalized)) {
    notes.push(`${label}: ${raw}`);
    return { value: null, notes };
  }
  if (raw.includes('-')) {
    notes.push(`${label}: approx ${raw}`);
    return { value: null, notes };
  }
  const numeric = Number.parseFloat(raw.replace(/[~g]/gi, '').replace(',', '.'));
  if (!Number.isFinite(numeric)) {
    notes.push(`${label}: ${raw}`);
    return { value: null, notes };
  }
  if (raw.includes('~')) {
    notes.push(`${label}: approx ${raw}`);
  }
  return { value: numeric, notes };
};

export const consumeStart = (text, regex) => {
  const source = normalizeSpaces(stripDiacritics(text));
  const match = source.match(regex);
  if (!match) return null;
  const consumed = match[0];
  return {
    token: normalizeSpaces(match[1] || consumed),
    rest: normalizeSpaces(source.slice(consumed.length)),
  };
};

export const parseJsonRows = (input) => {
  const parsed = JSON.parse(input);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.filter((row) => row && typeof row === 'object' && row.date);
};

export const parseTrainingLogPayload = (input) => {
  const parsed = JSON.parse(input);
  const rows = Array.isArray(parsed?.training_log) ? parsed.training_log : [];
  if (!rows.length) return [];
  return rows
    .filter((row) => row && row.date)
    .map((row) => {
      const iso = `${row.date}`.slice(0, 10);
      return {
        date: iso,
        bodyweight_kg: Number.isFinite(Number(row.bodyweight_kg)) ? Number(row.bodyweight_kg) : null,
        session_duration_min: Number.isFinite(Number(row.session_duration_min)) ? Number(row.session_duration_min) : 0,
        exercises: Array.isArray(row.exercises) ? row.exercises : [],
      };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
};

export const parseCompactTextRows = (input) => {
  const source = stripDiacritics(input);
  const yearMatch = source.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : new Date().getFullYear();
  const segments = [...source.matchAll(/(\d{2})-(\d{2})([\s\S]*?)(?=\b\d{2}-\d{2}\b|$)/g)];
  return segments.map((segment) => {
    const day = Number.parseInt(segment[1], 10);
    const month = Number.parseInt(segment[2], 10);
    const date = `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
    let rest = normalizeSpaces(segment[3]);
    const notes = [];

    const weightField = consumeStart(rest, /^((?:~)?\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?|n\/a|na|null|-)\b/i);
    rest = weightField ? weightField.rest : rest;
    const weightParsed = parseNumberishToken(weightField?.token || 'n/a', 'poids');
    notes.push(...weightParsed.notes);

    const kcalField = consumeStart(rest, /^((?:~)?\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?|n\/a|na|null|-)\b/i);
    rest = kcalField ? kcalField.rest : rest;
    const kcalParsed = parseNumberishToken(kcalField?.token || 'n/a', 'kcal');
    notes.push(...kcalParsed.notes);

    const macroRegex = /^((?:~)?\d+(?:[.,]\d+)?\s*g|faible|tres?\s*bas|n\/a|na)\b/i;

    const proteinField = consumeStart(rest, macroRegex);
    rest = proteinField ? proteinField.rest : rest;
    const proteinParsed = parseNumberishToken((proteinField?.token || '').replace(/\s*g$/i, ''), 'protein');
    notes.push(...proteinParsed.notes);

    const carbsField = consumeStart(rest, macroRegex);
    rest = carbsField ? carbsField.rest : rest;
    const carbsParsed = parseNumberishToken((carbsField?.token || '').replace(/\s*g$/i, ''), 'carbs');
    notes.push(...carbsParsed.notes);

    const fatField = consumeStart(rest, macroRegex);
    rest = fatField ? fatField.rest : rest;
    const fatParsed = parseNumberishToken((fatField?.token || '').replace(/\s*g$/i, ''), 'fat');
    notes.push(...fatParsed.notes);

    const trainingText = normalizeSpaces(rest);
    return {
      date,
      weight_morning_kg: weightParsed.value,
      calories_estimated: kcalParsed.value,
      protein_g: proteinParsed.value,
      carbs_g: carbsParsed.value,
      fat_g: fatParsed.value,
      training: trainingText && !/^n\/a$/i.test(trainingText) ? trainingText : null,
      blood_pressure: null,
      sleep_hours: null,
      fatigue_nervous_system_1_10: null,
      doms_legs_1_10: null,
      mood_1_10: null,
      notes: notes.filter(Boolean).length ? notes.join(' | ') : null,
    };
  });
};

export const parsePortableCutRows = (input) => {
  const source = stripDiacritics(input);
  const yearMatch = source.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : new Date().getFullYear();
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = [];

  lines.forEach((line) => {
    if (!/^\d{2}-\d{2}\b/.test(line)) return;
    if (/synthese|moyennes|indicateur|variable|lecture rapide/i.test(line)) return;
    const normalized = line.replace(/\t+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const tokens = normalized.split(' ');
    const [dd, mm] = (tokens[0] || '').split('-').map((value) => Number.parseInt(value, 10));
    if (!dd || !mm) return;
    const date = `${year}-${`${mm}`.padStart(2, '0')}-${`${dd}`.padStart(2, '0')}`;

    let index = 1;
    let dayCut = null;
    if (/^J\d+$/i.test(tokens[index] || '')) {
      dayCut = tokens[index];
      index += 1;
    }

    const weightToken = tokens[index] || 'n/a'; index += 1;
    const kcalToken = tokens[index] || 'n/a'; index += 1;
    const proteinToken = tokens[index] || 'n/a'; index += 1;
    if (/^g$/i.test(tokens[index] || '')) index += 1;

    let carbsToken = tokens[index] || 'n/a'; index += 1;
    if (/^tres$/i.test(carbsToken) && /^bas$/i.test(tokens[index] || '')) {
      carbsToken = `${carbsToken} ${tokens[index]}`;
      index += 1;
    }
    if (/^g$/i.test(tokens[index] || '')) index += 1;

    let fatToken = tokens[index] || 'n/a'; index += 1;
    if (/^tres$/i.test(fatToken) && /^bas$/i.test(tokens[index] || '')) {
      fatToken = `${fatToken} ${tokens[index]}`;
      index += 1;
    }
    if (/^g$/i.test(tokens[index] || '')) index += 1;

    const training = normalizeSpaces(tokens.slice(index).join(' '));

    const notes = [];
    const weightParsed = parseNumberishToken(weightToken, 'poids'); notes.push(...weightParsed.notes);
    const kcalParsed = parseNumberishToken(kcalToken, 'kcal'); notes.push(...kcalParsed.notes);
    const proteinParsed = parseNumberishToken(proteinToken.replace(/g$/i, ''), 'protein'); notes.push(...proteinParsed.notes);
    const carbsParsed = parseNumberishToken(carbsToken.replace(/g$/i, ''), 'carbs'); notes.push(...carbsParsed.notes);
    const fatParsed = parseNumberishToken(fatToken.replace(/g$/i, ''), 'fat'); notes.push(...fatParsed.notes);
    if (dayCut) notes.push(`jour_cut: ${dayCut}`);

    rows.push({
      date,
      weight_morning_kg: weightParsed.value,
      calories_estimated: kcalParsed.value,
      protein_g: proteinParsed.value,
      carbs_g: carbsParsed.value,
      fat_g: fatParsed.value,
      training: training && !/^n\/a$/i.test(training) ? training : null,
      blood_pressure: null,
      sleep_hours: null,
      fatigue_nervous_system_1_10: null,
      doms_legs_1_10: null,
      mood_1_10: null,
      notes: notes.filter(Boolean).join(' | ') || null,
    });
  });

  return rows;
};

export const parseTrainingToSessions = (row, uid) => {
  const training = normalizeSpaces(row?.training);
  if (!training || /^n\/a$/i.test(training)) return [];
  if (/^repos$/i.test(training) || /debut regime|debut cut/i.test(normalizeSearchText(training))) return [];

  const chunks = training
    .split(/\s*(?:,|\+|\/| puis )\s*/i)
    .map((chunk) => normalizeSpaces(chunk))
    .filter(Boolean);
  const sessions = [];

  chunks.forEach((chunk) => {
    if (!chunk || /^n\/a$/i.test(chunk) || /^repos$/i.test(chunk)) return;
    const timeMatch = chunk.match(/(\d+)\s*(?:min|minutes?)/i);
    if (timeMatch && /marche|walk|cardio/i.test(normalizeSearchText(chunk))) {
      const duration = Number.parseInt(timeMatch[1], 10) || 0;
      sessions.push({
        id: uid(),
        date: row.date,
        exerciseId: `chat-${uid()}`,
        exerciseName: 'Marche',
        equipment: 'Imported',
        category: 'Cardio',
        sets: 1,
        reps: duration,
        load: 0,
        notes: training,
        source: 'chat-free-import',
      });
      return;
    }

    const match = chunk.match(/(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)/);
    if (!match) {
      sessions.push({
        id: uid(),
        date: row.date,
        exerciseId: `chat-${uid()}`,
        exerciseName: chunk,
        equipment: 'Imported',
        category: 'Imported',
        sets: 0,
        reps: 0,
        load: 0,
        notes: training,
        source: 'chat-free-import',
      });
      return;
    }

    const first = Number.parseFloat(match[1].replace(',', '.')) || 0;
    const second = Number.parseFloat(match[2].replace(',', '.')) || 0;
    const name = normalizeSpaces(chunk.replace(match[0], '').replace(/[()]/g, '')) || 'Exercice importe';
    const isLoadRep = first >= 40 && second <= 20;
    sessions.push({
      id: uid(),
      date: row.date,
      exerciseId: `chat-${uid()}`,
      exerciseName: name,
      equipment: 'Imported',
      category: 'Imported',
      sets: isLoadRep ? 1 : toPositive(first, 0),
      reps: toPositive(second, 0),
      load: isLoadRep ? toPositive(first, 0) : 0,
      notes: training,
      source: 'chat-free-import',
    });
  });

  return sessions;
};

export const trainingLogToSessions = (trainingRow, uid) => {
  const date = `${trainingRow?.date || ''}`;
  const duration = Number(trainingRow?.session_duration_min || 0);
  const exercises = Array.isArray(trainingRow?.exercises) ? trainingRow.exercises : [];
  return exercises
    .filter((exercise) => exercise && exercise.name)
    .map((exercise) => ({
      id: uid(),
      date,
      exerciseId: `json-${uid()}`,
      exerciseName: `${exercise.name}`.trim(),
      equipment: 'Imported',
      category: 'Imported',
      sets: toPositive(exercise.sets, 0),
      reps: toPositive(exercise.reps, 0),
      load: toPositive(exercise.weight_kg, 0),
      notes: `${exercise.notes || ''}`.trim(),
      durationMin: duration,
      source: 'training-log-json',
    }));
};
