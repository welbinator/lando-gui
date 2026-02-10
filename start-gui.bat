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

REM Check if port 3000 is already in use
echo [*] Checking if port 3000 is available...
netstat -ano | findstr ":3000 " >nul 2>&1
if not errorlevel 1 (
    echo.
    echo WARNING: Port 3000 is already in use!
    echo.
    echo This could mean:
    echo  1. Lando GUI is already running
    echo  2. Another application is using port 3000
    echo.
    echo [*] Attempting to open existing server...
    timeout /t 2 /nobreak >nul
    start http://localhost:3000
    echo.
    echo If the page doesn't load, another app is using port 3000.
    echo You'll need to stop it first or edit server.js to use a different port.
    echo.
    pause
    exit /b 0
)

echo [*] Port 3000 is available
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
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

REM Start the Node.js server (this will block until Ctrl+C)
npm start

REM If npm start exits with error
if errorlevel 1 (
    echo.
    echo ERROR: Server failed to start
    pause
)
