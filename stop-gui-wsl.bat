@echo off
REM Stop Lando GUI Server (WSL from Windows)

echo ========================================
echo   Stop Lando GUI Server (WSL)
echo ========================================
echo.

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

echo [*] Stopping Lando GUI via WSL...
echo.

REM Run the stop script in WSL
wsl.exe bash "%WSL_PATH%/stop-gui.sh"

echo.
pause
