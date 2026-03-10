@echo off
setlocal
cd /d "%~dp0"

set "STATE_PORT=8787"
set "STATE_BUSY="
set "APP_PORT=3000"
set "APP_BUSY="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%STATE_PORT% .*LISTENING"') do (
  set "STATE_BUSY=1"
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%APP_PORT% .*LISTENING"') do (
  set "APP_BUSY=1"
)

if defined APP_BUSY (
  echo [start-server] Port %APP_PORT% deja occupe.
  echo [start-server] Risque: tu regardes encore un ancien serveur sur http://localhost:%APP_PORT%/test
  echo [start-server] Ferme l ancien process puis relance ce script.
  exit /b 1
)

if defined STATE_BUSY (
  echo [start-server] Port %STATE_PORT% deja occupe. Le state server semble deja tourne.
  echo [start-server] Demarrage du front seul via Vite.
  call npm run start:app -- %*
) else (
  echo [start-server] Demarrage front + state server.
  call npm run dev -- %*
)
