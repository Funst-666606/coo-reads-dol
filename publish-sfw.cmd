@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "DRY="
if /i "%~1"=="--dry-run" set "DRY=--dry-run"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 22+ first.
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git not found. Install Git for Windows first.
  pause
  exit /b 1
)

if not defined NPM_TOKEN (
  echo.
  echo Option A: paste an npm Automation token below and press Enter.
  echo Option B: leave it empty and press Enter to use "npm login".
  set /p NPM_TOKEN=
)

if not defined NPM_TOKEN (
  echo.
  echo No token. Checking npm login...
  call npm whoami >nul 2>nul
  if errorlevel 1 (
    echo Not logged in. Starting "npm login"...
    call npm login
    if errorlevel 1 (
      echo [ERROR] npm login failed. Fix the login and run this script again.
      pause
      exit /b 1
    )
  )
)

echo.
echo Publishing SFW build: cortico-world-dol-sfw
echo Source branch: sfw
if defined DRY echo Mode: dry-run ^(nothing will be uploaded^)
echo.
choice /C YN /M "Continue"
if errorlevel 2 (
  echo Cancelled.
  pause
  exit /b 0
)

echo.
node scripts\publish-npm.mjs --variant sfw %DRY%
set "CODE=%ERRORLEVEL%"
echo.
if not "%CODE%"=="0" (
  echo [FAILED] Publish did not finish. Exit code: %CODE%
) else (
  echo [DONE] SFW publish flow finished.
)
pause
exit /b %CODE%
