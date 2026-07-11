@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Error: Node.js is not installed or is not available on PATH.
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo Error: npm is not installed or is not available on PATH.
  exit /b 1
)

echo Building the LogVue Windows installer...
call npm run package:win:installer
if errorlevel 1 (
  echo.
  echo Installer build failed.
  exit /b 1
)

echo.
echo Installer created in: %~dp0release
exit /b 0
