@echo off
echo ========================================
echo   Deploy Production v2.0 ^& v2.1
echo ========================================
echo.

REM Check if we're in the right directory
if not exist "master-setup" (
    echo ERROR: master-setup directory not found!
    echo Please run this script from the Miyao_Bot root directory.
    pause
    exit /b 1
)

if not exist "launcher-v2" (
    echo ERROR: launcher-v2 directory not found!
    echo Please run this script from the Miyao_Bot root directory.
    pause
    exit /b 1
)

echo [1/6] Backing up current versions...
if exist "master-setup\src\main.js.backup" del "master-setup\src\main.js.backup"
if exist "master-setup\src\renderer.js.backup" del "master-setup\src\renderer.js.backup"

if exist "master-setup\src\main.js" copy "master-setup\src\main.js" "master-setup\src\main.js.backup" > nul
if exist "master-setup\src\renderer.js" copy "master-setup\src\renderer.js" "master-setup\src\renderer.js.backup" > nul

echo    [OK] Backups created

echo.
echo [2/6] Deploying Master Setup v2.0.0 enhanced files...
copy "master-setup\src\main-enhanced.js" "master-setup\src\main.js" > nul
copy "master-setup\src\renderer-enhanced.js" "master-setup\src\renderer.js" > nul

echo    [OK] Enhanced files deployed

echo.
echo [3/6] Cleaning build directories...
if exist "master-setup\dist" (
    echo    Removing old master-setup dist...
    rmdir /s /q "master-setup\dist"
)

if exist "launcher-v2\dist" (
    echo    Removing old launcher-v2 dist...
    rmdir /s /q "launcher-v2\dist"
)

echo    [OK] Build directories cleaned

echo.
echo [4/6] Building Launcher v2.1.0...
cd launcher-v2
call npm run build
if errorlevel 1 (
    echo    [ERROR] Launcher build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo    [OK] Launcher v2.1.0 built successfully

echo.
echo [5/6] Building Master Setup v2.0.0...
cd master-setup
call build.bat
if errorlevel 1 (
    echo    [ERROR] Master Setup build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo    [OK] Master Setup v2.0.0 built successfully

echo.
echo [6/6] Verifying builds...

set MASTER_SETUP_OK=0
set LAUNCHER_OK=0

if exist "master-setup\dist\MiyaoBotSetup-2.0.0.exe" (
    echo    [OK] Master Setup v2.0.0 installer found
    set MASTER_SETUP_OK=1
) else (
    echo    [ERROR] Master Setup installer not found!
)

if exist "launcher-v2\dist" (
    echo    [OK] Launcher v2.1.0 dist folder found
    set LAUNCHER_OK=1
) else (
    echo    [ERROR] Launcher dist folder not found!
)

echo.
echo ========================================
echo   Deployment Summary
echo ========================================
echo.

if %MASTER_SETUP_OK%==1 if %LAUNCHER_OK%==1 (
    echo Status: SUCCESS
    echo.
    echo Master Setup v2.0.0:
    echo   Location: master-setup\dist\MiyaoBotSetup-2.0.0.exe
    for %%F in ("master-setup\dist\MiyaoBotSetup-2.0.0.exe") do echo   Size: %%~zF bytes
    echo.
    echo Launcher v2.1.0:
    echo   Location: launcher-v2\dist\
    echo   Files: 
    dir /b "launcher-v2\dist\*.exe" 2>nul
    echo.
    echo ========================================
    echo   New Features Summary
    echo ========================================
    echo.
    echo Master Setup v2.0.0:
    echo   - Automatic rollback on failure
    echo   - Installation validation
    echo   - Pre-flight checks
    echo   - Comprehensive logging
    echo   - Smart retry system
    echo   - Repair mode
    echo.
    echo Launcher v2.1.0:
    echo   - Process health monitoring
    echo   - Resource usage display
    echo   - Log management
    echo   - Update checker
    echo   - Backup/Restore
    echo   - Quick actions
    echo   - System tray integration
    echo.
    echo ========================================
    echo.
    echo To distribute:
    echo   1. Test the installer: master-setup\dist\MiyaoBotSetup-2.0.0.exe
    echo   2. Distribute to users
    echo   3. See PRODUCTION_UPGRADE_V2.md for full details
    echo.
) else (
    echo Status: FAILED
    echo.
    echo One or more builds failed. Please check the errors above.
    echo.
    echo To restore previous versions:
    echo   copy master-setup\src\main.js.backup master-setup\src\main.js
    echo   copy master-setup\src\renderer.js.backup master-setup\src\renderer.js
    echo.
)

echo ========================================
pause
