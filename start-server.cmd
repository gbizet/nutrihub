@echo off
setlocal
cd /d "%~dp0"

set "STATE_PORT=8787"
set "APP_PORT=3000"
set "FOUND_ANY="

echo [start-server] Verification des ports %APP_PORT% et %STATE_PORT%...

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%APP_PORT% .*LISTENING"') do (
  echo [start-server] Arret du process %%P sur le port %APP_PORT%...
  taskkill /PID %%P /F >nul 2>nul
  set "FOUND_ANY=1"
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%STATE_PORT% .*LISTENING"') do (
  echo [start-server] Arret du process %%P sur le port %STATE_PORT%...
  taskkill /PID %%P /F >nul 2>nul
  set "FOUND_ANY=1"
)

if defined FOUND_ANY (
  echo [start-server] Anciens process nettoyes. Pause courte avant relance...
  timeout /t 2 /nobreak >nul
)

echo [start-server] Demarrage front + state server en mode local-state.
call npm run dev -- %*
