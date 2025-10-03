@echo off
REM ========================================
REM Miyao Music Bot v1.2.0 - Windows Installer
REM ========================================

setlocal enabledelayedexpansion

echo.
echo ========================================
echo Miyao Music Bot v1.2.0
echo Windows Installation Script
echo ========================================
echo.

REM Check if running from correct directory
if not exist "index.js" (
    echo ERROR: Please run this script from the bot root directory!
    echo Current directory: %CD%
    pause
    exit /b 1
)

echo [1/6] Checking System Requirements...
echo ----------------------------------------

REM Check Node.js
echo Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [X] ERROR: Node.js not found!
    echo.
    echo Please install Node.js 18 or higher from:
    echo https://nodejs.org/
    echo.
    echo Download the "LTS" version for best compatibility.
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('node --version') do set NODE_VERSION=%%a
echo [+] Node.js %NODE_VERSION% detected

REM Check Java
echo Checking Java...
java -version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [X] ERROR: Java not found!
    echo.
    echo Please install Java 11 or higher from:
    echo https://adoptium.net/
    echo.
    echo Download the latest LTS version.
    pause
    exit /b 1
)

for /f "tokens=3" %%a in ('java -version 2^>^&1 ^| findstr /i "version"') do (
    set JAVA_VERSION=%%a
    goto :java_found
)
:java_found
echo [+] Java %JAVA_VERSION% detected

REM Check Lavalink.jar
echo Checking Lavalink.jar...
if not exist "Lavalink.jar" (
    echo.
    echo [!] WARNING: Lavalink.jar not found!
    echo Music playback requires Lavalink audio server.
    echo.
    echo Download from: https://github.com/lavalink-devs/Lavalink/releases
    echo Place Lavalink.jar in the bot root directory.
    echo.
    set /p CONTINUE="Continue installation without Lavalink? (y/N): "
    if /i not "!CONTINUE!"=="y" (
        echo Installation cancelled.
        pause
        exit /b 1
    )
) else (
    echo [+] Lavalink.jar found
)

echo.
echo [2/6] Installing Bot Dependencies...
echo ----------------------------------------
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [X] ERROR: Failed to install bot dependencies!
    echo.
    echo Common causes:
    echo - No internet connection
    echo - npm registry issues
    echo - Permission problems
    echo.
    echo Try running as Administrator or check your network.
    pause
    exit /b 1
)
echo [+] Bot dependencies installed successfully

echo.
echo [3/6] Installing Launcher Dependencies...
echo ----------------------------------------
if exist "launcher" (
    cd launcher
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [!] WARNING: Failed to install launcher dependencies!
        echo Launcher may not work properly.
        echo.
        set /p CONTINUE="Continue? (y/N): "
        if /i not "!CONTINUE!"=="y" (
            cd ..
            echo Installation cancelled.
            pause
            exit /b 1
        )
    ) else (
        echo [+] Launcher dependencies installed successfully
    )
    cd ..
) else (
    echo [!] WARNING: Launcher directory not found
    echo Desktop launcher will not be available.
)

echo.
echo [4/6] Setting Up Configuration Files...
echo ----------------------------------------

REM Setup .env
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [+] Created .env file from template
        echo.
        echo [!] IMPORTANT: You MUST edit .env file with your Discord token!
        echo.
    ) else (
        echo [!] WARNING: .env.example not found!
        echo You'll need to create .env manually.
    )
) else (
    echo [+] .env file already exists (not overwritten)
)

REM Setup config.json
if not exist "config\config.json" (
    if exist "config\config.example.json" (
        copy "config\config.example.json" "config\config.json" >nul
        echo [+] Created config.json from template
    ) else (
        echo [!] WARNING: config.example.json not found!
    )
) else (
    echo [+] config.json already exists (not overwritten)
)

echo.
echo [5/6] Creating Start Scripts...
echo ----------------------------------------

REM Create quick-start.bat
(
echo @echo off
echo echo Starting Miyao Music Bot...
echo cd /d "%%~dp0"
echo call npm start
echo pause
) > quick-start.bat
echo [+] Created quick-start.bat

REM Create start-with-lavalink.bat
(
echo @echo off
echo echo Starting Miyao Music Bot with Lavalink...
echo cd /d "%%~dp0"
echo start "Lavalink Server" cmd /k "java -jar Lavalink.jar"
echo timeout /t 5 /nobreak ^>nul
echo call npm start
echo pause
) > start-with-lavalink.bat
echo [+] Created start-with-lavalink.bat

echo.
echo [6/6] Running Setup Verification...
echo ----------------------------------------
node verify-bot-setup.js
if %errorlevel% neq 0 (
    echo.
    echo [!] WARNING: Setup verification found issues!
    echo Please review the errors above.
    echo.
)

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Next Steps:
echo ----------------------------------------
echo.
echo 1. Edit Configuration:
echo    - Open .env in a text editor
echo    - Add your Discord bot token
echo    - Add your bot's Client ID
echo    - (Optional) Add your Guild ID for testing
echo.
echo 2. Deploy Slash Commands:
echo    Run: npm run deploy
echo.
echo 3. Start the Bot:
echo    Option A - Use Desktop Launcher:
echo      cd launcher
echo      npm start
echo.
echo    Option B - Manual Start:
echo      Double-click: start-bot.bat
echo      OR: start-with-lavalink.bat
echo.
echo    Option C - Quick Start:
echo      Double-click: quick-start.bat
echo.
echo 4. Need Help?
echo    - Read: QUICKSTART.md
echo    - Read: README.md
echo    - Check: FAQ.md
echo.
echo ========================================
echo.

REM Open .env file for editing
set /p OPEN_ENV="Open .env file now for editing? (y/N): "
if /i "%OPEN_ENV%"=="y" (
    if exist ".env" (
        notepad .env
    )
)

echo.
echo Press any key to exit...
pause >nul
