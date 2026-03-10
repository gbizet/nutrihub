# Nutri Sport Hub

App perso de suivi `poids + nutrition + training`, sortie de Docusaurus vers une SPA React/Vite.

## Stack actuelle

- React 18
- Vite
- React Router
- stockage local + serveur d'etat local optionnel (`scripts/state-server.mjs`)
- sync Google Drive via enveloppe JSON + Google Identity Services

## Demarrage local

```sh
npm install
npm run dev
```

L'app tourne sur:

- app: `http://localhost:3000/`
- state server local: `http://localhost:8787`

Important:

- n'utilise plus `http://localhost:3000/test/`
- l'ancienne URL `/test/` correspondait au shell Docusaurus
- la SPA Vite tourne maintenant a la racine `/`

## Scripts

```sh
npm run dev
npm run build
npm run android:sync
npm run android:open
npm run apk:debug
npm run android:ui:dump
npm run health:debug
npm run preview
npm run test
npm run test:node
npm run test:ui
```

`npm run test` enchaine maintenant:

- tests Node purs (`node --test`)
- tests UI `vitest` / Testing Library

## Android / APK

La base Android est maintenant initialisee via Capacitor dans `android/`.

Pre requis locaux pour sortir un APK debug installable:

- Android Studio
- Android SDK / platform tools
- JDK 21+ (Java 8 et Java 17 ne suffisent pas pour cette toolchain Android/Capacitor)

Flux conseille:

```sh
npm run android:sync
npm run android:open
```

Puis build depuis Android Studio ou:

```sh
npm run apk:debug
```

APK debug genere ici:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Sync Google Drive

La sync Drive est disponible depuis la page `Integrations`.

Fichiers cle:

- `src/lib/googleDriveSync.js`
- `src/pages/integrations.js`

Variables attendues:

```sh
VITE_GOOGLE_DRIVE_CLIENT_ID=
VITE_GOOGLE_DRIVE_FILE_NAME=nutri-sport-hub-sync.json
VITE_GOOGLE_DRIVE_VISIBLE_FOLDER_NAME=Nutri Sport Hub
```

Modes de sync:

1. `appDataFolder`: stockage cache, non visible dans Google Drive
2. `Mon Drive/<folder>`: fichier visible dans un dossier Drive dedie
3. mode visible + miroir optionnel vers `appDataFolder`

Strategie actuelle:

1. OAuth navigateur via Google Identity Services
2. lecture/ecriture d'un fichier JSON unique de sync
3. comparaison des enveloppes via `updated_at`
4. pull/push manuel si conflit

## Sante Android

Strategie produit:

- core commun web + desktop + Android
- import sante Android optionnel
- affichage commun des donnees importees via `metrics`, `neatLogs`, `dailyLogs`

Priorite technique:

1. Health Connect Android
2. Samsung Health specifique seulement si Health Connect est insuffisant

Debug utile:

- les traces sante persistentes sont stockees dans `healthSync.debugEntries`
- sur PC local: `npm run health:debug`

## Contexte de reprise

Fichiers a relire avant de reprendre un chantier Android / sante:

- `past.md`: memoire courte de la conversation precedente
- `samsung-health-plan.md`: etat du chantier Samsung Health, metriques cibles, deja-fait et reste a faire
- `android/app/src/main/java/com/guibizet/nutrisporthub/HealthBridgePlugin.kt`: bridge natif Android Health Connect + fallback Samsung
- `src/pages/integrations.js`: diagnostic sante/Drive et logs visibles dans l'app
- `src/lib/healthImport.js`: merge commun Android -> store -> PC/Web

## Debug autonome Android

Le projet est maintenant debuggable de facon quasi autonome sur telephone Android branche:

1. builder et resynchroniser:

```sh
npm run android:sync
npm run apk:debug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

2. rouvrir l'app:

```sh
adb shell monkey -p com.guibizet.nutrisporthub 1
```

3. capturer l'etat UI sans toucher le telephone:

```sh
npm run android:ui:dump
```

4. lire les logs natifs sante:

```sh
adb logcat -s HealthBridgePlugin
```

5. lire les logs metier persistents:

```sh
npm run health:debug
```

6. piloter la WebView a distance si `uiautomator` ne donne pas assez de details:

```sh
adb shell ps | findstr nutrisporthub
adb shell cat /proc/net/unix | findstr webview_devtools_remote
adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json/list
```

Points utiles:

- `uiautomator dump` permet d'inspecter les ecrans Samsung Health, popups de permissions et la WebView de l'app
- le port DevTools WebView permet de lire `document.body.innerText`, naviguer vers `/integrations` et cliquer les boutons a distance
- l'ecran `Integrations` expose aussi `Logs sync debug` pour le debug visible sans PC
- les donnees sante importees restent communes a Android et PC/Web via `metrics`, `neatLogs`, `dailyLogs` puis la sync Drive

## Etat Samsung direct

Ce qui est deja en place dans le code:

- Health Connect branche en source principale
- Samsung Health Data SDK AAR bundle dans `android/app/libs`
- build Android Samsung valide seulement si `android/app/build.gradle` garde `apply plugin: 'kotlin-parcelize'`
- build Android Samsung valide seulement si `com.google.code.gson:gson` reste dans les dependances
- permissions Samsung Data SDK demandables depuis l'app
- fallback Samsung direct code pour composition, activite, sommeil et plusieurs vitaux
- diagnostic Samsung visible dans `Integrations` + logcat `HealthBridgePlugin`

Ce qui doit etre revalide a chaque reprise:

- `Developer Mode for Data Read` actif dans Samsung Health
- permissions Samsung effectivement accordees
- ne pas enlever `kotlin-parcelize` ou `gson`, sinon `readDataAsync` Samsung recasse au runtime

Validation reelle sur telephone Samsung le 10 mars 2026:

- `importSnapshot success: weights=14, steps=31, sleep=32, vitals=27`
- fallback Samsung direct verifie pour body composition, activite, sommeil et vitaux
- pilotage a distance valide via `uiautomator` + DevTools WebView + `adb logcat`

## Notes

- l'ancien shell Docusaurus n'est plus utilise pour lancer ou builder l'app
- les dependances Docusaurus peuvent etre retirees dans une passe de cleanup separee
- GitHub Actions valide maintenant `npm test`, `npm run build` et `android/gradlew assembleDebug` sur PR
