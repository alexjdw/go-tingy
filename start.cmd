@echo off
rem Installs what the app needs (the first time, or when it changed) and starts it in your browser.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
  echo Node.js 20 or newer is needed. Get the LTS version from https://nodejs.org.
  pause
  exit /b 1
)

echo Checking dependencies (the first run can take a few minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo Installing failed. See the messages above.
  pause
  exit /b 1
)

echo Starting Go Flashcards...
call npm run web
pause
