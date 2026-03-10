# TODO produit / UX / sync

Backlog transversal note le 9 mars 2026, a partir des retours d'usage reel Android + PC.

Ce fichier couvre les chantiers hors bridge Samsung Health strict.

## P0 - Sync et etat UI

- L'autosync ne doit pas provoquer de refresh visible qui reset les choix UI.
- Le probleme est a traiter sur Android et PC.
- Etat a conserver au minimum:
  - page courante
  - date active
  - filtres
  - onglets
  - type de graphe
  - selections ouvertes dans les tableaux
  - contexte Prompt AI en cours
- La sync doit rehydrater les donnees sans casser la session utilisateur locale.
- `Logs sync debug` ne doit pas monopoliser l'ecran.
- UX cible:
  - statut sync compact dans un span/bandeau haut
  - panneau debug detaille en bas, replie par defaut, ouvert seulement en cas de besoin

## P1 - Training UX / produit

- La page `Training` melange aujourd'hui saisie de seance et analyse.
- Challenger une separation en deux surfaces:
  - `Saisie seance`
  - `Analyse / progression / muscles`
- Ajouter un vrai choix de materiel par exercice ou par station.
- Rendre le mapping exercice -> groupes musculaires visible et editable.
- Le mapping muscles ne doit pas rester une boite noire.
- Piste a etudier:
  - vue anatomique / squelette a cote
  - score par groupe musculaire
  - correction manuelle rapide du mapping
- Les artefacts d'import training ne doivent pas transformer une seance unique multi-sets en `sessions: 18`.
- Revoir le modele:
  - ajouter `workout_id`
  - structurer `workout -> exercises[] -> sets[]`
  - clarifier la difference entre `workout`, `exercise`, `set` et `session` dans l'import et l'export

## P1 - Nettoyage des blocs a faible valeur

- `Wearable CSV` n'apporte pas de valeur claire dans l'ecran Sync.
- `Barcode quick add` n'apporte pas de valeur claire dans l'ecran Sync.
- Decision a prendre:
  - supprimer
  - ou cacher derriere un mode debug / avance
- Sur l'accueil, `nombre de repas` ne compte pas les repas mais le type d'aliment: balot.
- La bibliotheque aliments dans `Nutrition` est a challenger.
- Verifier si elle aide vraiment le flux principal ou si elle alourdit juste la page.

## P1 - Prompt AI

- `Export AI` / `Prompt AI` n'expose pas clairement les placeholders connus.
- Ajouter:
  - liste des placeholders disponibles
  - description courte de chaque placeholder
  - insertion rapide dans le template
  - apercu du rendu final
- Verifier que les templates prennent bien en compte:
  - nutrition
  - training
  - sante
  - contexte multi-device mono-user

## P1 - Revue Sync / Sante

- Garder les blocs `Sync` et `Sante` visibles en haut des ecrans Android et PC.
- Clarifier la lecture produit:
  - statut sync
  - statut import sante
  - dernier push
  - dernier pull
  - dernier import Health Connect
  - erreurs recentes

## P1 - Export / qualite des donnees

- Dans l'export, `body_fat_percent: 0` et `muscle_mass_kg: 0` ne doivent pas servir de valeur vide.
- Quand la mesure est absente, utiliser `null`. `0` doit vouloir dire mesure reelle.
- `steps: 2804` constant tous les jours est un signal de source absente ou sync casse.
- Ajouter une metadonnee de provenance sur les champs critiques:
  - `source: samsung-health | manual | estimated`
- Les jours vides avec `kcal: 0` / `protein: 0` biaisent les stats et les analyses.
- Preferer:
  - `nutrition: null`
  - ou `nutrition_logged: false`
- Ajouter des metadonnees d'export utiles:
  - `export_version`
  - `generated_at`
  - `timezone`
  - `date_range`
- Objectif:
  - reproductibilite
  - ingestion pipeline
  - versionning

## Definition of done attendue

- Une sync auto ne reset plus la navigation ni les choix utilisateur en cours.
- Le debug sync reste accessible, mais discret par defaut.
- `Training` a une separation claire entre capture et analyse.
- Le materiel et le mapping musculaire sont visibles et editables.
- Les blocs sans usage reel sont supprimes ou relegues hors du parcours principal.
- `Prompt AI` expose ses placeholders sans devoir lire le code.
