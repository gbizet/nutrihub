import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import { computeMacrosForAmount, normalizeFood, toNumber, toPositive, useDashboardState } from '../lib/dashboardStore';
import { searchFoodWeb } from '../lib/foodSearch';
import CoreWorkflowNav from '../components/CoreWorkflowNav';

const mealOptions = [
  { value: 'petit-dejeuner', label: 'Petit dejeuner' },
  { value: 'dejeuner', label: 'Dejeuner' },
  { value: 'collation', label: 'Collation' },
  { value: 'diner', label: 'Diner' },
  { value: 'avant-coucher', label: 'Avant coucher' },
];

const emptyFood = {
  name: '',
  brand: '',
  kcal: '',
  protein: '',
  carbs: '',
  fat: '',
  servingMode: 'grams',
  unitLabel: 'oeuf',
  unitGrams: '50',
  defaultAmount: '100',
  defaultGrams: '100',
  mealTags: ['dejeuner'],
};
const foodKey = (food) => `${(food.name || '').trim().toLowerCase()}|${(food.brand || '').trim().toLowerCase()}`;
const normalizeText = (value) =>
  `${value || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
const tokenizeQuery = (query) => normalizeText(query).split(/[^a-z0-9]+/).filter(Boolean);
const expandTokens = (tokens) => {
  const synonyms = {
    chicken: ['poulet'],
    poulet: ['chicken'],
    beef: ['boeuf'],
    boeuf: ['beef'],
    steak: ['boeuf'],
    egg: ['oeuf'],
    oeuf: ['egg'],
    whey: ['protein', 'isolate'],
    isolate: ['whey'],
    protein: ['proteine', 'whey'],
    proteine: ['protein'],
  };
  const out = [...tokens];
  tokens.forEach((t) => {
    if (synonyms[t]) out.push(...synonyms[t]);
  });
  return [...new Set(out)];
};
const scoreFood = (food, tokens) => {
  if (!tokens.length) return 0;
  const name = normalizeText(food.name);
  const brand = normalizeText(food.brand);
  const hay = `${brand} ${name}`.trim();
  const words = hay.split(/\s+/).filter(Boolean);
  let score = 0;
  let matched = 0;
  tokens.forEach((token) => {
    if (!token) return;
    if (brand === token || name === token) {
      score += 8;
      matched += 1;
      return;
    }
    if (words.some((w) => w.startsWith(token))) {
      score += 5;
      matched += 1;
      return;
    }
    if (hay.includes(token)) {
      score += 3;
      matched += 1;
      return;
    }
  });
  if (matched === tokens.length) score += 6;
  return score;
};

const parseMacrosFromText = (text) => {
  const normalized = text.toLowerCase().replace(/,/g, '.');
  const pick = (pattern, group = 1) => {
    const match = normalized.match(pattern);
    return match ? Number.parseFloat(match[group]) : 0;
  };
  return {
    kcal: pick(/(kcal|energie)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/, 2) || pick(/([0-9]+(?:\.[0-9]+)?)\s*kcal/),
    protein: pick(/(proteines?|protein)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/, 2),
    carbs: pick(/(glucides?|carbs?)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/, 2),
    fat: pick(/(lipides?|fat)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/, 2),
  };
};

const curatedFallbackFoods = [
  {
    id: 'fallback-eafit-pure-isolate',
    name: 'Pure Isolate - Whey Protein Isolate',
    brand: 'EAFIT',
    kcal: 366,
    protein: 86,
    carbs: 3.3,
    fat: 0.9,
    source: 'fallback',
    defaultGrams: 30,
    defaultAmount: 30,
    servingMode: 'grams',
    unitLabel: 'portion',
    unitGrams: 100,
    mealTags: ['collation', 'avant-coucher'],
  },
];

export default function FoodsPage() {
  const { state, setState, uid } = useDashboardState();
  const [form, setForm] = useState(emptyFood);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState('idle');
  const [webResults, setWebResults] = useState([]);
  const [ocrKey, setOcrKey] = useState('helloworld');
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState('');
  const [webEnabled, setWebEnabled] = useState(true);
  const [searchDiagnostics, setSearchDiagnostics] = useState([]);

  const unitPreview = useMemo(() => {
    if (form.servingMode !== 'unit') return null;
    const unitGrams = toNumber(form.unitGrams || 0);
    if (!unitGrams) return null;
    const ratio = unitGrams / 100;
    return {
      kcal: toPositive(form.kcal) * ratio,
      protein: toPositive(form.protein) * ratio,
      carbs: toPositive(form.carbs) * ratio,
      fat: toPositive(form.fat) * ratio,
      unitGrams,
    };
  }, [form.carbs, form.fat, form.kcal, form.protein, form.servingMode, form.unitGrams]);

  const uniqueFoods = useMemo(() => {
    const map = new Map();
    state.foods.forEach((food) => {
      const key = foodKey(food);
      if (!map.has(key)) map.set(key, food);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [state.foods]);

  const queryTokens = useMemo(() => expandTokens(tokenizeQuery(searchQuery)), [searchQuery]);
  const hasQuery = queryTokens.length > 0;

  const localResults = useMemo(() => {
    if (!queryTokens.length) return [];
    const scored = uniqueFoods
      .map((food) => ({ food, score: scoreFood(food, queryTokens) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((row) => ({ ...row.food, source: 'local' }));
    if (scored.length) return scored;
    const raw = normalizeText(searchQuery);
    return uniqueFoods
      .filter((food) => normalizeText(`${food.brand} ${food.name}`).includes(raw))
      .slice(0, 8)
      .map((food) => ({ ...food, source: 'local' }));
  }, [queryTokens, uniqueFoods]);

  const upsertFood = (candidate, askConfirm = true) => {
    const normalized = normalizeFood({ id: uid(), ...candidate });

    if (!normalized.name) return false;

    let didWrite = false;
    setState((prev) => {
      const key = foodKey(normalized);
      const index = prev.foods.findIndex((food) => foodKey(food) === key);
      if (index < 0) {
        didWrite = true;
        return {
          ...prev,
          foods: [normalized, ...prev.foods],
          deletedFoodKeys: (prev.deletedFoodKeys || []).filter((k) => k !== key),
        };
      }

      if (askConfirm) {
        const ok = window.confirm(`Doublon detecte (${normalized.name}${normalized.brand ? ` / ${normalized.brand}` : ''}). Remplacer la fiche existante ?`);
        if (!ok) return prev;
      }

      const copy = [...prev.foods];
      copy[index] = { ...copy[index], ...normalized, id: copy[index].id };
      didWrite = true;
      return {
        ...prev,
        foods: copy,
        deletedFoodKeys: (prev.deletedFoodKeys || []).filter((k) => k !== key),
      };
    });

    return didWrite;
  };

  const prefillFormFromFood = (food) => {
    setForm({
      name: food.name || '',
      brand: food.brand || '',
      kcal: `${food.kcal ?? ''}`,
      protein: `${food.protein ?? ''}`,
      carbs: `${food.carbs ?? ''}`,
      fat: `${food.fat ?? ''}`,
      servingMode: food.servingMode || 'grams',
      unitLabel: food.unitLabel || 'portion',
      unitGrams: `${food.unitGrams ?? 100}`,
      defaultAmount: `${food.defaultAmount ?? food.defaultGrams ?? 100}`,
      defaultGrams: `${food.defaultGrams ?? 100}`,
      mealTags: Array.isArray(food.mealTags) ? food.mealTags : [],
    });
    setStatus(`Fiche "${food.name}" chargee dans le formulaire.`);
  };

  const deleteFood = (food) => {
    const ok = window.confirm(`Supprimer "${food.name}"${food.brand ? ` (${food.brand})` : ''} ?`);
    if (!ok) return;
    const key = foodKey(food);
    setState((prev) => ({
      ...prev,
      foods: prev.foods.filter((item) => foodKey(item) !== key),
      deletedFoodKeys: Array.from(new Set([...(prev.deletedFoodKeys || []), key])),
    }));
    setStatus(`Fiche "${food.name}" supprimee.`);
  };

  const onSubmitManual = (e) => {
    e.preventDefault();
    const wrote = upsertFood({ ...form, source: 'manual' }, true);
    setStatus(wrote ? 'Fiche enregistree.' : 'Aucune modification.');
    setForm(emptyFood);
  };

  const toggleMealTag = (meal) => {
    setForm((prev) => {
      const has = prev.mealTags.includes(meal);
      return { ...prev, mealTags: has ? prev.mealTags.filter((m) => m !== meal) : [...prev.mealTags, meal] };
    });
  };

  const searchWeb = async () => {
    if (!searchQuery.trim()) return;
    if (searchQuery.trim().length < 2) {
      setStatus('Tape au moins 2 caracteres pour lancer la recherche web.');
      return;
    }
    if (!webEnabled) {
      setWebResults([]);
      setSearchDiagnostics([]);
      setSearchStatus('done');
      setStatus(`Recherche locale uniquement. ${localResults.length} resultat(s) dans ta base.`);
      return;
    }
    setSearchStatus('loading');
    try {
      const tokens = expandTokens(tokenizeQuery(searchQuery));
      const web = await searchFoodWeb(searchQuery, { pageSize: 12, timeoutMs: 12000 });
      setSearchDiagnostics(web.diagnostics || []);
      const mappedRaw = (web.results || []).map((item) => normalizeFood({
        ...item,
        source: item.source || 'openfoodfacts',
        defaultGrams: 100,
        servingMode: /(oeuf|egg)/i.test(`${item.name} ${item.brand || ''}`) ? 'unit' : 'grams',
        unitLabel: 'oeuf',
        unitGrams: 50,
        defaultAmount: /(oeuf|egg)/i.test(`${item.name} ${item.brand || ''}`) ? 2 : 100,
        mealTags: ['dejeuner'],
      }));
      const mappedScored = mappedRaw
        .map((item) => ({ item, score: scoreFood(item, tokens) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      const hasPositive = mappedScored.some((row) => row.score > 0);
      const mapped = hasPositive ? mappedScored.filter((row) => row.score > 0).map((row) => row.item) : mappedRaw.slice(0, 6);
      if (mapped.length) {
        setWebResults(mapped);
        const endpointUsed = (web.diagnostics || []).find((d) => d.ok && d.count > 0)?.endpoint || 'OFF';
        setStatus(`Recherche OK: ${mapped.length} resultat(s) web via ${endpointUsed}, ${localResults.length} en base locale.`);
      } else {
        const fallback = curatedFallbackFoods.filter((item) =>
          scoreFood(item, tokens) > 0,
        );
        setWebResults(fallback);
        if (fallback.length) {
          setStatus(`Aucun OFF exploitable. ${fallback.length} resultat(s) fallback proposes.`);
        } else {
          setStatus(`Aucun resultat web. ${localResults.length} resultat(s) existent deja dans ta base locale.`);
        }
      }
      setSearchStatus('done');
    } catch (error) {
      console.error(error);
      setSearchStatus('error');
      setWebResults([]);
      setSearchDiagnostics([]);
      setStatus(`Recherche web indisponible. Resultats locaux: ${localResults.length}.`);
    }
  };

  const importPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const body = new FormData();
      body.append('apikey', ocrKey || 'helloworld');
      body.append('language', 'fre');
      body.append('isOverlayRequired', 'false');
      body.append('file', file);
      const response = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body });
      const payload = await response.json();
      const text = payload?.ParsedResults?.[0]?.ParsedText || '';
      const macros = parseMacrosFromText(text);
      const wrote = upsertFood({
        name: file.name.replace(/\.[^.]+$/, ''),
        brand: 'photo-ocr',
        ...macros,
        source: 'photo-ocr',
        mealTags: ['dejeuner'],
        servingMode: 'grams',
        defaultAmount: 100,
        defaultGrams: 100,
      }, true);
      setStatus(wrote ? 'Import photo effectue.' : 'Import photo annule.');
    } catch (error) {
      console.error(error);
      setStatus('Erreur import photo.');
    } finally {
      event.target.value = '';
    }
  };

  const exportJson = () => {
    const payload = JSON.stringify(uniqueFoods, null, 2);
    setImportText(payload);
    navigator.clipboard?.writeText(payload).catch(() => {});
    setStatus('Export JSON copie dans le champ (et presse-papiers si autorise).');
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const ok = window.confirm(`Importer ${list.length} fiche(s) avec fusion des doublons ?`);
      if (!ok) return;

      setState((prev) => {
        const map = new Map(prev.foods.map((food) => [foodKey(food), food]));
        list.forEach((item) => {
          const normalized = {
            id: uid(),
            source: item.source || 'json-import',
            mealTags: Array.isArray(item.mealTags) ? item.mealTags : [],
            servingMode: item.servingMode || 'grams',
            unitLabel: item.unitLabel || 'portion',
            unitGrams: toNumber(item.unitGrams || 100),
            defaultAmount: toNumber(item.defaultAmount || item.defaultGrams || 100),
            defaultGrams: toNumber(item.defaultGrams || 100),
            name: (item.name || '').trim(),
            brand: (item.brand || '').trim(),
            kcal: toPositive(item.kcal),
            protein: toPositive(item.protein),
            carbs: toPositive(item.carbs),
            fat: toPositive(item.fat),
          };
          const food = normalizeFood(normalized);
          if (!food.name) return;
          map.set(foodKey(food), food);
        });
        return { ...prev, foods: Array.from(map.values()) };
      });

      setStatus('Import JSON termine (doublons fusionnes).');
    } catch (error) {
      console.error(error);
      setStatus('JSON invalide.');
    }
  };

  return (
    <Layout title="Base Aliments" description="Import, export et gestion des aliments">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Base aliments</h1>
            <p>Bibliotheque support. A utiliser pour nettoyer, enrichir et fiabiliser la saisie nutrition.</p>
            <div className={styles.metaRow}>
              <Link className={styles.compactActionLink} to="/metrics">Saisie poids</Link>
              <Link className={styles.compactActionLink} to="/nutrition">Journal nutrition</Link>
            </div>
            <CoreWorkflowNav active="foods" supportMode="full" />
          </section>

          <section className={styles.grid2}>
            <article className={styles.card}>
              <h2>Ajouter / Modifier</h2>
              <p className={styles.smallMuted}>
                Regle de saisie: les macros sont toujours renseignees pour 100g. Le mode unite convertit ensuite automatiquement via
                "poids 1 unite (g)".
              </p>
              <form className={styles.formGrid} onSubmit={onSubmitManual}>
                <input className={styles.input} placeholder="Nom" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                <input className={styles.input} placeholder="Marque" value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} />
                <input className={styles.input} type="number" placeholder="kcal (pour 100g)" value={form.kcal} onChange={(e) => setForm((p) => ({ ...p, kcal: e.target.value }))} />
                <input className={styles.input} type="number" placeholder="Proteines g (pour 100g)" value={form.protein} onChange={(e) => setForm((p) => ({ ...p, protein: e.target.value }))} />
                <input className={styles.input} type="number" placeholder="Glucides g (pour 100g)" value={form.carbs} onChange={(e) => setForm((p) => ({ ...p, carbs: e.target.value }))} />
                <input className={styles.input} type="number" placeholder="Lipides g (pour 100g)" value={form.fat} onChange={(e) => setForm((p) => ({ ...p, fat: e.target.value }))} />
                <select className={styles.select} value={form.servingMode} onChange={(e) => setForm((p) => ({ ...p, servingMode: e.target.value }))}>
                  <option value="grams">Par grammes</option>
                  <option value="unit">Par unite</option>
                </select>
                {form.servingMode === 'unit' ? (
                  <>
                    <input className={styles.input} placeholder="Nom unite (ex: oeuf)" value={form.unitLabel} onChange={(e) => setForm((p) => ({ ...p, unitLabel: e.target.value }))} />
                    <input className={styles.input} type="number" placeholder="Poids 1 unite (g)" value={form.unitGrams} onChange={(e) => setForm((p) => ({ ...p, unitGrams: e.target.value }))} />
                    <input className={styles.input} type="number" placeholder="Quantite par defaut (unites)" value={form.defaultAmount} onChange={(e) => setForm((p) => ({ ...p, defaultAmount: e.target.value }))} />
                  </>
                ) : (
                  <input className={styles.input} type="number" placeholder="Portion par defaut (g)" value={form.defaultAmount} onChange={(e) => setForm((p) => ({ ...p, defaultAmount: e.target.value, defaultGrams: e.target.value }))} />
                )}
                <button className={styles.button} type="submit">Enregistrer fiche</button>
              </form>
              {unitPreview && (
                <p className={styles.smallMuted} style={{ marginTop: '0.5rem' }}>
                  Apercu 1 {form.unitLabel || 'unite'} ({unitPreview.unitGrams.toFixed(0)}g): {unitPreview.kcal.toFixed(1)} kcal | P {unitPreview.protein.toFixed(1)} g | G {unitPreview.carbs.toFixed(1)} g | L {unitPreview.fat.toFixed(1)} g
                </p>
              )}
              <div className={styles.checkboxGrid} style={{ marginTop: '0.7rem' }}>
                {mealOptions.map((meal) => (
                  <label key={meal.value} className={styles.smallMuted}>
                    <input type="checkbox" checked={form.mealTags.includes(meal.value)} onChange={() => toggleMealTag(meal.value)} /> {meal.label}
                  </label>
                ))}
              </div>
              <p className={styles.smallMuted}>Ces tags sont utilises dans Nutrition pour suggerer/filtrer les aliments par repas.</p>
              {status && <p className={styles.smallMuted}>{status}</p>}
            </article>

            <article className={styles.card}>
              <h2>Import Web / Photo</h2>
              <div className={styles.formGrid}>
                <input className={styles.input} placeholder="Recherche OpenFoodFacts" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                <button className={styles.button} type="button" onClick={searchWeb}>Chercher</button>
              </div>
              <label className={styles.smallMuted} style={{ display: 'block', marginTop: '0.4rem' }}>
                <input type="checkbox" checked={webEnabled} onChange={(e) => setWebEnabled(e.target.checked)} /> Activer recherche web OpenFoodFacts
              </label>
              {searchStatus === 'loading' && <p className={styles.smallMuted}>Recherche en cours...</p>}
              {searchStatus === 'error' && <p className={styles.smallMuted}>Erreur reseau.</p>}
              {hasQuery && <p className={styles.smallMuted}>Resultats base locale ({localResults.length})</p>}
              <ul className={styles.list}>
                {localResults.map((item) => (
                  <li key={`local-${item.id || `${item.name}-${item.brand}`}`}>
                    <div>
                      <strong>{item.name}</strong>
                      <div className={styles.smallMuted}>{item.brand} | base locale</div>
                    </div>
                    <button className={styles.buttonGhost} type="button" onClick={() => prefillFormFromFood(item)}>Pre-remplir</button>
                  </li>
                ))}
              </ul>
              {hasQuery && localResults.length === 0 && <p className={styles.smallMuted}>Aucun match dans ta base locale.</p>}
              {hasQuery && <p className={styles.smallMuted}>Resultats web ({webResults.length})</p>}
              <ul className={styles.list}>
                {webResults.map((item) => (
                  <li key={item.id || `${item.name}-${item.brand}`}>
                    <div>
                      <strong>{item.name}</strong>
                      <div className={styles.smallMuted}>{item.brand} | {item.source}</div>
                    </div>
                    <button className={styles.button} type="button" onClick={() => upsertFood(item, true)}>Importer</button>
                  </li>
                ))}
              </ul>
              {hasQuery && webResults.length === 0 && <p className={styles.smallMuted}>Aucun resultat web pour cette requete.</p>}
              {searchDiagnostics.length > 0 && (
                <p className={styles.smallMuted}>
                  Diagnostic web: {searchDiagnostics.map((d) => `${d.endpoint}:${d.ok ? `OK(${d.count})` : d.error}`).join(' | ')}
                </p>
              )}

              <h3 style={{ marginTop: '1rem' }}>OCR photo</h3>
              <div className={styles.formGrid}>
                <input className={styles.input} value={ocrKey} onChange={(e) => setOcrKey(e.target.value)} placeholder="OCR key" />
                <input className={styles.input} type="file" accept="image/*" onChange={importPhoto} />
              </div>
            </article>
          </section>

          <section>
            <details className={`${styles.card} ${styles.detailsCard}`}>
              <summary className={styles.cardSummary}>Import / Export JSON</summary>
              <div className={styles.sectionHead}>
                <h2>Import / Export JSON</h2>
                <button className={styles.buttonGhost} type="button" onClick={exportJson}>Exporter</button>
              </div>
              <textarea className={styles.textarea} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="JSON aliments..." />
              <button className={styles.button} type="button" onClick={importJson}>Importer JSON</button>
            </details>
          </section>

          <section>
            <details className={`${styles.card} ${styles.detailsCard}`}>
              <summary className={styles.cardSummary}>Base actuelle ({uniqueFoods.length})</summary>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Marque</th>
                    <th>Kcal</th>
                    <th>P</th>
                    <th>G</th>
                    <th>L</th>
                    <th>Format</th>
                    <th>Reference</th>
                    <th>Repas</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueFoods.map((food) => (
                    <tr key={food.id}>
                      <td>{food.name}</td>
                      <td>{food.brand || '-'}</td>
                      <td>{food.kcal}</td>
                      <td>{food.protein}</td>
                      <td>{food.carbs}</td>
                      <td>{food.fat}</td>
                      <td>{food.servingMode === 'unit' ? `${food.defaultAmount || 1} ${food.unitLabel || 'unite'} (${food.unitGrams || 0}g/u)` : `${food.defaultAmount || 100}g`}</td>
                      <td>
                        {food.servingMode === 'unit'
                          ? `100g + 1 ${food.unitLabel || 'unite'} (${computeMacrosForAmount(food, 1).kcal.toFixed(0)} kcal)`
                          : '100g'}
                      </td>
                      <td>{Array.isArray(food.mealTags) && food.mealTags.length ? food.mealTags.join(', ') : '-'}</td>
                      <td>
                        <button className={styles.tinyButton} type="button" onClick={() => prefillFormFromFood(food)}>Edit</button>{' '}
                        <button className={styles.tinyButton} type="button" onClick={() => deleteFood(food)}>Suppr.</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        </div>
      </main>
    </Layout>
  );
}
