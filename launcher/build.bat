@echo off
REM ========================================
REM Miyao Launcher Build Script v1.1.0
REM Build application to executable
REM ========================================

title Miyao Launcher Builder

echo.
echo ========================================
echo   MIYAO LAUNCHER BUILD SCRIPT
echo   Version 1.1.0 - Aurora
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [ERROR] node_modules not found!
    echo Please run 'npm install' first.
    echo.
    pause
    exit /b 1
)

REM Check if electron-builder is installed
call npx electron-builder --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] electron-builder is not installed!
    echo Installing electron-builder...
    call npm install electron-builder --save-dev
    if errorlevel 1 (
        echo [ERROR] Failed to install electron-builder!
        pause
        exit /b 1
    )
)

echo [INFO] Starting build process...
echo.

REM Clean previous builds
if exist "dist" (
    echo [INFO] Cleaning previous builds...
    rmdir /s /q "dist"
)

echo.
echo ========================================
echo   BUILD OPTIONS
echo ========================================
echo.
echo   1. Build for Windows (portable)
echo   2. Build for Windows (installer)
echo   3. Build for Windows (both)
echo   4. Build all platforms
echo   0. Cancel
echo.
set /p choice="Select option [1-4, 0 to cancel]: "

if "%choice%"=="0" (
    echo [INFO] Build cancelled.
    pause
    exit /b 0
)

if "%choice%"=="1" (
    echo.
    echo [INFO] Building Windows portable version...
    call npx electron-builder --win portable
    goto :check_result
)

if "%choice%"=="2" (
    echo.
    echo [INFO] Building Windows installer...
    call npx electron-builder --win nsis
    goto :check_result
)

if "%choice%"=="3" (
    echo.
    echo [INFO] Building Windows portable and installer...
    call npx electron-builder --win portable nsis
    goto :check_result
)

if "%choice%"=="4" (
    echo.
    echo [INFO] Building for all platforms...
    echo [WARNING] Building for non-Windows platforms may require additional tools!
    call npx electron-builder --win --mac --linux
    goto :check_result
)

echo [ERROR] Invalid option!
pause
exit /b 1

:check_result
echo.
if errorlevel 1 (
    echo ========================================
    echo   BUILD FAILED!
    echo ========================================
    echo.
    echo Check the error messages above for details.
) else (
    echo ========================================
    echo   BUILD SUCCESSFUL!
    echo ========================================
    echo.
    echo Output files are in the 'dist' folder.
    echo.
    
    REM List built files
    if exist "dist" (
        echo Built files:
        echo ------------
        dir /b "dist\*.exe" 2>nul
        dir /b "dist\*.dmg" 2>nul
        dir /b "dist\*.AppImage" 2>nul
        echo.
    )
)

echo.
pause
