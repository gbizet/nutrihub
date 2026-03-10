@echo off
setlocal
cd /d "%~dp0"

set "APP_PORT=3000"
set "APP_BUSY="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%APP_PORT% .*LISTENING"') do (
  set "APP_BUSY=1"
)

if defined APP_BUSY (
  echo [start-app-only] Port %APP_PORT% deja occupe.
  echo [start-app-only] Ferme l ancien process ou lance Vite manuellement sur un autre port.
  exit /b 1
)

echo [start-app-only] Demarrage du front seul via Vite.
call npm run start:app -- %*
