@echo off
setlocal
title StriveAI Launcher

rem === Config (edit if needed) ===
set "PORT=3000"
set "APP_URL=http://localhost:%PORT%"
set "AUTO_OPEN_BROWSER=1"

echo.
echo ===============================================
echo   StriveAI Local Launcher (Windows)
echo ===============================================
echo.

rem Always run from this file's folder
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%" || (
  echo [ERROR] Could not open project directory:
  echo         %PROJECT_DIR%
  pause
  exit /b 1
)

echo [1/4] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo         Please install Node.js from https://nodejs.org/
  echo         Then run this launcher again.
  pause
  exit /b 1
)

echo [2/4] Checking npm...
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found.
  echo         Reinstall Node.js, then run this launcher again.
  pause
  exit /b 1
)

echo [3/4] Checking dependencies...
if not exist "node_modules" (
  echo node_modules not found.
  echo Installing dependencies ^(npm install^)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    echo         Check your internet connection and try again.
    pause
    exit /b 1
  )
) else (
  echo Dependencies already installed.
)

set "PORT=%PORT%"
echo [4/4] Starting dev server on port %PORT%...

if "%AUTO_OPEN_BROWSER%"=="1" (
  echo Browser will open at %APP_URL% in a few seconds...
  powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process '%APP_URL%'" >nul 2>&1
)

echo.
echo Running: npm run dev
echo Press Ctrl+C to stop the server.
echo.
call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Dev server exited with code %EXIT_CODE%.
  pause
)

endlocal & exit /b %EXIT_CODE%
