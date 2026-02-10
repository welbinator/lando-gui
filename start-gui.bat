@echo off
REM Lando GUI Launcher for Windows
REM This script checks for dependencies, installs if needed, and launches the GUI

echo ========================================
echo   Lando GUI Launcher
echo ========================================
echo.

REM Get the directory where this script is located
cd /d "%~dp0"

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [*] Node.js detected: 
node --version
echo.

REM Check if node_modules exists (first run check)
if not exist "node_modules\" (
    echo [*] First time setup - Installing dependencies...
    echo This may take a minute...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
    echo.
    echo [*] Dependencies installed successfully!
    echo.
)

REM Start the server in the background and open browser
echo [*] Starting Lando GUI server...
echo [*] Opening browser at http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

REM Open browser after a 2 second delay
start "" timeout /t 2 /nobreak >nul && start http://localhost:3000

REM Start the Node.js server (this will block until Ctrl+C)
npm start
