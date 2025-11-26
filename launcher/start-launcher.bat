@echo off
title Miyao Launcher
cd /d "%~dp0"

echo ============================================
echo   Miyao Launcher - Starting...
echo ============================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    echo.
)

REM Start the launcher
echo [INFO] Starting Miyao Launcher...
call npm start

pause
