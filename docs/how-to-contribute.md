---
id: how-to-contribute
title: How to Contribute
---

# How to Contribute

All contributions go via **GitHub Pull Request**.

- Install deps with `npm install`
- Run `npm test`
- Run `npm run build`
- If the change touches Android bridge/integration code, also run `npm run cap:sync` then `android/gradlew.bat assembleDebug`
- Submit your PR once local checks pass; GitHub Actions now re-runs Node tests, UI tests, Vite build and Android debug assemble

Open issues for bugs/requests.
