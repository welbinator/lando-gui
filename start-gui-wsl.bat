@echo off
REM Lando GUI Launcher for WSL (Windows Wrapper)
REM This runs the Linux start-gui.sh script from Windows

echo ========================================
echo   Lando GUI Launcher (WSL)
echo ========================================
echo.

REM Check if WSL is installed
wsl.exe --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: WSL is not installed or not available!
    echo Please install WSL from the Microsoft Store or enable it in Windows Features.
    echo.
    pause
    exit /b 1
)

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Convert Windows path to WSL path
set "WSL_PATH=%SCRIPT_DIR:\=/%"

REM Extract drive letter and convert to lowercase
set "DRIVE=%WSL_PATH:~0,1%"
if /i "%DRIVE%"=="C" set "DRIVE=c"
if /i "%DRIVE%"=="D" set "DRIVE=d"
if /i "%DRIVE%"=="E" set "DRIVE=e"
if /i "%DRIVE%"=="F" set "DRIVE=f"
if /i "%DRIVE%"=="G" set "DRIVE=g"

REM Build WSL path
set "WSL_PATH=/mnt/%DRIVE%%WSL_PATH:~2%"

echo [*] Project path (Windows): %SCRIPT_DIR%
echo [*] Project path (WSL):     %WSL_PATH%
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
echo [*] Starting Lando GUI via WSL...
echo.

REM Run the bash script in WSL
wsl.exe bash "%WSL_PATH%/start-gui.sh"

REM If we get here, something went wrong
if errorlevel 1 (
    echo.
    echo ERROR: Failed to start Lando GUI
    echo.
    pause
    exit /b 1
)
