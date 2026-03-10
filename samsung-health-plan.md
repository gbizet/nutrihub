# Plan integration Samsung Health

Document de travail pour cadrer l'integration Android sante a partir de l'etat reel du projet au 9 mars 2026.

## Update 10 mars 2026

Le document ci-dessous contient encore de l'historique. Etat reel valide sur code + telephone:

- l'AAR Samsung Health Data SDK est bien installe dans `android/app/libs`
- les permissions Samsung Data SDK sont demandees depuis l'app et detectees correctement
- point de packaging critique confirme: il faut garder `apply plugin: 'kotlin-parcelize'` et la dependance `com.google.code.gson:gson` dans `android/app/build.gradle`
- validation device faite via import reel: `importSnapshot success: weights=14, steps=31, sleep=32, vitals=27`
- le bridge Android Samsung direct fonctionne maintenant en plus de Health Connect, avec merge vers le store commun et affichage PC/Web via sync

Si ce document est relu plus tard, ne pas se fier aux anciennes sections qui disent que l'AAR est absent ou que les permissions Samsung ne sont pas encore branchees: ces points sont faits.

## Objectif

Importer sur Android les donnees sante utiles dans l'app, puis les exploiter partout via le store commun et la sync Google Drive.

Ordre de priorite retenu:

1. Health Connect Android
2. Samsung Health specifique seulement si Health Connect est insuffisant

## Etat actuel

L'integration Samsung Health n'est pas encore complete.

Ce qui existe deja:

- base Android Capacitor fonctionnelle
- sync Google Drive Android/web deja en place
- UI Integrations deja prete pour la sante
- schema commun sante deja defini
- merge des imports sante vers le store deja implemente
- tracabilite de source prevue dans les donnees importees

Ce qui manque encore:

- bridge Samsung Health complet
- permissions Samsung Data SDK
- lecture Samsung directe des metriques manquantes
- import incremental
- QA sur vrai materiel

## Double check du code au 9 mars 2026

Le code actuel n'est pas un stub global. Il y a deja un bridge Android Health Connect reel, un merge commun vers le store, et une exploitation PC/Web deja branchee.

La situation reelle est la suivante:

- `android/app/src/main/java/com/guibizet/nutrisporthub/HealthBridgePlugin.kt`
  - Health Connect est bien implemente pour les flux communs
  - un fallback Samsung direct existe deja en code, mais uniquement pour la composition corporelle
  - ce fallback Samsung n'est pas encore activable en pratique tant que l'AAR officiel n'est pas installe dans `android/app/libs`
  - il n'y a pas encore de vrai flux de demande de permissions Samsung Data SDK depuis l'app

- `src/lib/healthImport.js`
  - le merge vers `metrics`, `neatLogs` et `dailyLogs` est reel et fonctionnel
  - les metadonnees de source par ligne sont conservees, ce qui permet de faire coexister Health Connect et Samsung

- `src/lib/healthState.js`
  - le snapshot commun expose deja les donnees sante a toutes les pages Android/PC/Web

- pages deja branchees sur ce snapshot commun:
  - `src/pages/index.js`
  - `src/pages/metrics.js`
  - `src/pages/neat.js`
  - `src/pages/summary.js`
  - `src/pages/nutrition.js`
  - `src/pages/prompt-builder.js`

Conclusion:

- Health Connect -> store commun -> PC/Web est deja en place
- Samsung direct -> store commun est aujourd'hui partiel et limite a la body composition

## Metriques presentes, partielles et manquantes

### Presentes de bout en bout dans le code actuel

Metriques qui ont deja:

- une place dans le schema commun
- une lecture Android via Health Connect
- un merge vers le store commun
- une consommation cote UI/PC au moins partielle

Liste:

- poids
- body fat
- masse maigre / masse musculaire
- pas
- minutes actives
- sommeil (duree + start/end)
- frequence cardiaque moyenne
- frequence cardiaque au repos
- HRV
- tension
- saturation O2
- glycemie

Traduction dans le store:

- `metrics`: poids, body fat, muscle mass
- `neatLogs`: pas, active minutes, calories actives
- `dailyLogs`: sommeil, FC moyenne, FC repos, HRV, tension, O2, glycemie

### Presentes mais fragiles ou incompletes

- calories actives
  - lues cote Android
  - mergees dans `neatLogs`
  - mais un jour avec seulement des calories actives sans pas ni minutes actives est aujourd'hui filtre, donc ce flux n'est pas fiable a 100%

- calories totales
  - permission Health Connect demandee
  - valeur observee dans l'agregation Android
  - mais non stockee dans le state metier et non affichee

- visceral fat
  - champ prevu dans `metrics`
  - aucun provider ne le remplit aujourd'hui

- water percent
  - champ prevu dans `metrics`
  - aucun provider ne le remplit aujourd'hui

- Samsung body composition fallback
  - logique de lecture presente dans le plugin Android
  - mais non exploitable tant que l'AAR n'est pas installe
  - et il manque encore un vrai chemin de permissions Samsung cote app

### Manquantes cote Samsung direct

Si Health Connect ne remonte pas ces flux, le code actuel ne sait pas encore les recuperer directement depuis Samsung:

- pas
- sommeil
- frequence cardiaque moyenne
- frequence cardiaque au repos
- HRV
- minutes actives / activites
- calories actives
- tension
- saturation O2
- glycemie

En pratique, aujourd'hui:

- Health Connect couvre beaucoup de flux si Samsung sync correctement
- Samsung direct ne couvre que body composition en fallback theorique

## Source de verite dans le code

### Deja present

- `src/lib/healthSchema.js`
  - providers: `health-connect`, `samsung-health`, `manual`
  - streams supportes: poids, composition, pas, calories actives, minutes actives, sommeil, coeur, FC repos, tension, HRV
  - streams supportes aussi: oxygene, glycemie

- `src/lib/healthImport.js`
  - merge `bodyMetrics` vers `metrics`
  - merge `activity` vers `neatLogs`
  - merge `sleep` et `vitals` vers `dailyLogs`
  - mise a jour de `healthSync`

- `src/lib/dashboardStore.js`
  - etat `healthSync` deja branche dans le store

- `src/pages/integrations.js`
  - bloc UI "Health Connect / Samsung"
  - boutons "Permissions sante" et "Importer sante"
  - affichage resume et streams cibles

### Partiellement branche

- `src/lib/platformHealth.js`
  - plus un stub complet
  - appels Capacitor reels deja presents
  - le statut Samsung direct remonte bien, mais il n'active encore qu'un fallback body composition

- `android/app/src/main/java/com/guibizet/nutrisporthub/MainActivity.java`
  - plugin HealthBridge bien enregistre

- `android/app/src/main/AndroidManifest.xml`
  - Health Connect est deja configure pour le MVP actuel
  - le sujet restant n'est plus le manifest de base mais le fallback Samsung SDK

### Pas encore branche au niveau besoin produit

- AAR Samsung Health Data SDK absent de `android/app/libs`
- permissions Samsung Data SDK non demandees depuis l'app
- lecture Samsung directe absente pour steps / sleep / HR / HRV / activite / autres vitaux
- import incremental non implemente
- priorisation explicite Health Connect puis fallback Samsung non completee dans le plugin

## Decision technique

Ne pas commencer par un SDK Samsung specifique.

Le bon plan est:

1. brancher Health Connect
2. verifier si Samsung Health alimente correctement les flux utiles via Health Connect
3. n'ajouter un fallback Samsung specifique que si un manque reel est constate

## Perimetre reel du chantier Samsung

Le MVP Health Connect existe deja.

Le chantier a ouvrir maintenant est donc:

1. activer le Samsung Data SDK dans le build Android
2. rendre le fallback Samsung reellement autorisable
3. combler les flux que Health Connect ne remonte pas ou remonte mal

## Priorites metriques pour le fallback Samsung

Priorite 1:

- body composition complete
- poids Samsung si plus riche ou plus fiable que HC sur certaines journees
- pas
- sommeil
- FC repos
- FC moyenne

Priorite 2:

- HRV
- minutes actives
- calories actives

Priorite 3:

- tension
- saturation O2
- glycemie
- visceral fat / water si le SDK Samsung expose des champs exploitables

## Perimetre MVP historique

Flux historiques a verifier ou completer:

- poids
- body fat / composition si disponible
- pas
- sommeil
- frequence cardiaque
- FC repos

Flux a passer en deuxieme temps:

- tension
- HRV
- calories actives
- minutes actives

Pourquoi:

- ce sont les flux les plus utiles pour tes pages `metrics`, `neat`, `nutrition`, `summary`
- la disponibilite tension/HRV est plus variable selon appareil et source

## Regles produit

- Android importe, le reste du parc consomme via le store commun
- une donnee sante importee doit garder sa source
- les champs sante peuvent ecraser les champs sante manuels du meme jour
- les notes et donnees metier manuelles ne doivent pas etre ecrasees
- premier import limite a une fenetre explicite
- imports suivants incrementaux depuis le dernier checkpoint

## Plan de travail mis a jour

### Lot 1 - Activer le Samsung Data SDK reel

Objectif: rendre le fallback Samsung executable et diagnostiquable.

Taches:

- extraire l'AAR du zip Samsung
- installer l'AAR dans `android/app/libs`
- verifier que le build Android charge bien le SDK
- ajouter un vrai chemin de permissions Samsung Data SDK
- enrichir l'ecran Integrations pour distinguer:
  - AAR absent
  - Samsung Health absent
  - developer mode requis
  - permission Samsung refusee
  - data vide cote Samsung

Definition of done:

- le build Android detecte le SDK Samsung
- le statut Samsung n'est plus "non bundle"
- l'app sait dire si le blocage est technique, permission, ou absence de donnees

### Lot 2 - Etendre le fallback Samsung aux metriques manquantes

Objectif: remplir les trous la ou Health Connect ne suffit pas.

Taches:

- garder Health Connect comme source primaire
- completer `HealthBridgePlugin` avec un fallback Samsung pour:
  - pas
  - sommeil
  - FC moyenne / FC repos
  - HRV
  - activite utile
- ne basculer sur Samsung que quand le flux Health Connect est vide ou incomplet
- conserver `provider`, `sourceRecordId`, `sourcePackage`, `capturedAt`
- verifier que le merge vers `healthImport.js` reste unique et commun

Definition of done:

- une journee partiellement vide en Health Connect peut etre completee par Samsung
- les donnees restent visibles aussi sur PC/Web apres sync Drive
- la source de chaque flux reste lisible

### Lot 3 - Import incremental et UX de diagnostic

Objectif: fiabiliser l'usage quotidien.

Taches:

- memoriser un checkpoint d'import
- premier import sur 30 jours max
- imports suivants depuis `lastImportAt`
- deduplication par date + type + source
- enrichir l'ecran Integrations avec:
  - Health Connect installe ou non
  - permissions accordees / manquantes
  - provider detecte
  - nombre de lignes importees par flux
  - plage de dates importee
  - dernier import et dernier echec

Definition of done:

- imports repetes sans doublons visibles
- etat de diagnostic lisible depuis l'app Android

### Lot 4 - Flux avances et champs optionnels

Objectif: couvrir les flux avances si dispo sur l'appareil.

Taches:

- completer body composition si le SDK Samsung expose plus que HC
- ajouter tension si le flux Samsung est utile
- ajouter HRV si le flux Samsung est plus riche ou plus fiable
- etudier visceral fat et water percent si disponibles
- completer le mapping vers `metrics` et `dailyLogs`
- verifier l'affichage dans les pages existantes

Definition of done:

- les flux avances apparaissent sans casser les pages existantes
- le resume d'import indique clairement ce qui a ete importe ou non

### Lot 5 - Evaluation finale Health Connect vs Samsung

Objectif: decider s'il faut un fallback Samsung direct.

Taches:

- tester sur appareil Samsung + Samsung Health + Health Connect
- lister les donnees attendues vs donnees effectivement visibles
- identifier les flux manquants via Health Connect
- decider si un bridge Samsung specifique est justifie

Decision gate:

- si Health Connect couvre le besoin reel, on s'arrete la
- si un manque important persiste, on ouvre un lot Samsung specifique

## Cas de test a prevoir

- Samsung phone seul
- Samsung phone + Galaxy Watch
- Samsung Health installe mais non relie a Health Connect
- permissions partielles seulement
- donnees presentes dans Samsung Health mais absentes dans Health Connect
- import initial
- reimport incremental
- conflit entre saisie manuelle et import sante

## Risques / points d'attention

- disponibilite variable des flux selon appareil, montre, region et version Samsung
- tension et HRV potentiellement non homogenes
- besoin de messages d'erreur tres clairs dans l'UI Android
- ne pas coupler la logique sante a la logique Google Drive
- ne pas dupliquer des donnees Samsung si Health Connect les fournit deja
- ne pas casser la version PC/Web: elle doit rester 100% consommatrice du store commun
- ne pas supposer que l'installation de l'AAR suffit: le sujet permissions Samsung reste un vrai lot

## Lien avec le debug Google Drive

Le debug Google Drive doit rester separe.

La bonne articulation est:

- import sante Android vers store local
- mise a jour `healthSync`
- sync Google Drive ensuite, comme simple transport du state

Il ne faut pas melanger:

- probleme d'acces aux donnees sante
- probleme OAuth Drive
- probleme de versioning du state sync

## Prochaine action recommandee

Commencer par le Lot 1.

Premier ticket concret:

- extraire l'AAR Samsung du zip
- l'installer dans `android/app/libs`
- rebuild Android
- rendre visible dans l'app si le SDK Samsung est bien bundle et si une permission Samsung peut etre demandee

## References officielles

- Android Health Connect:
  - https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started

- Samsung et Health Connect:
  - https://developer.samsung.com/health/blog/en/accessing-samsung-health-data-through-health-connect
  - https://developer.samsung.com/health/health-connect-faq.html

- Samsung Health Data SDK:
  - https://developer.samsung.com/health/data/overview.html

- Ancien Samsung Health SDK Android deprecie:
  - https://developer.samsung.com/health/android/overview.html
