@echo off
setlocal enabledelayedexpansion
title Miyao Bot - Deploy Commands
color 0B

:: Set UTF-8 encoding
chcp 65001 >nul 2>&1

cls
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                                                              ║
echo ║       📤 MIYAO BOT - DEPLOY SLASH COMMANDS 📤               ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Create logs directory
if not exist "logs" mkdir logs
set "LOG_FILE=logs\deploy-%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%.log"
set "LOG_FILE=%LOG_FILE: =0%"

echo [%date% %time%] Command deployment initiated >> "%LOG_FILE%"

:: ============================================
:: Pre-flight Checks
:: ============================================
echo ╔══════════════════════════════════════════════════════════════╗
echo ║  🔍 PRE-FLIGHT CHECKS                                        ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Check .env
echo    [1/3] Checking configuration...
if not exist .env (
    echo    ❌ .env file not found!
    echo    💡 Run install.bat first
    echo.
    pause
    exit /b 1
)

:: Check if token is configured
findstr /C:"DISCORD_TOKEN=your_bot_token_here" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo    ❌ DISCORD_TOKEN not configured!
    echo    📝 Please edit .env file and add your bot token
    echo.
    pause
    exit /b 1
)
echo    ✅ Configuration OK

:: Check CLIENT_ID
findstr /C:"CLIENT_ID=auto" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo    ⚠️  CLIENT_ID not set yet!
    echo    🔧 Running auto-setup...
    echo.
    
    node auto-setup.js
    if %errorlevel% neq 0 (
        echo    ❌ Auto-setup failed!
        echo    💡 Please configure CLIENT_ID manually in .env
        echo.
        pause
        exit /b 1
    )
    echo    ✅ Auto-setup complete
)

findstr /C:"CLIENT_ID=your_bot_client_id_here" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo    ❌ CLIENT_ID not configured!
    echo    💡 Run start-bot.bat once to auto-configure
    echo    💡 Or set CLIENT_ID manually in .env
    echo.
    pause
    exit /b 1
)

:: Check GUILD_ID
findstr /C:"GUILD_ID=auto" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo    ⚠️  GUILD_ID not set (will deploy globally - slower)
    echo    💡 Run start-bot.bat once to auto-configure for faster deploy
    echo.
)

findstr /C:"GUILD_ID=your_server_id_here" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo    ⚠️  GUILD_ID not configured (will deploy globally - slower)
    echo.
)

:: Check node_modules
echo    [2/3] Checking dependencies...
if not exist node_modules (
    echo    ⚠️  Dependencies not installed!
    echo    📦 Installing now...
    echo.
    call npm install >> "%LOG_FILE%" 2>&1
    if %errorlevel% neq 0 (
        echo    ❌ Failed to install dependencies!
        pause
        exit /b 1
    )
)
echo    ✅ Dependencies OK

:: Check deploy-commands.js
echo    [3/3] Checking deploy script...
if not exist deploy-commands.js (
    echo    ❌ deploy-commands.js not found!
    pause
    exit /b 1
)
echo    ✅ Deploy script OK

echo.
echo    ✅ All checks passed!
echo.
timeout /t 1 /nobreak >nul

:: ============================================
:: Deploy Commands
:: ============================================
echo ╔══════════════════════════════════════════════════════════════╗
echo ║  📤 DEPLOYING COMMANDS                                       ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

echo [%date% %time%] Deploying commands >> "%LOG_FILE%"

echo    🚀 Registering slash commands with Discord...
echo    📋 Commands will be available in a few minutes
echo.

:: Count commands
set COUNT=0
for %%f in (Core\commands\*.js) do set /a COUNT+=1
echo    📊 Found %COUNT% command files to deploy
echo.

:: Deploy
node deploy-commands.js

if %errorlevel% neq 0 (
    echo.
    echo ╔══════════════════════════════════════════════════════════════╗
    echo ║  ❌ DEPLOYMENT FAILED                                        ║
    echo ╚══════════════════════════════════════════════════════════════╝
    echo.
    echo [%date% %time%] Deployment failed with code %errorlevel% >> "%LOG_FILE%"
    
    echo    💡 Common issues:
    echo       • Invalid DISCORD_TOKEN
    echo       • Invalid CLIENT_ID
    echo       • Network connection problems
    echo       • Bot doesn't have applications.commands permission
    echo.
    echo    📄 Check log: %LOG_FILE%
    echo.
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║  ✅ DEPLOYMENT SUCCESSFUL!                                   ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo [%date% %time%] Deployment successful >> "%LOG_FILE%"

echo    🎉 Slash commands deployed successfully!
echo.
echo    📋 Commands deployed: %COUNT%
echo    ⏳ Commands will appear in Discord within 1-5 minutes
echo    💡 Try typing / in Discord to see available commands
echo.
echo    📄 Deployment log: %LOG_FILE%
echo.
pause
