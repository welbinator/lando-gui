@echo off
REM Lando GUI Launcher for WSL (Windows Wrapper)
REM This runs the Linux start-gui.sh script from Windows

echo ========================================
echo   Lando GUI Launcher (WSL)
echo ========================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

REM Convert Windows path to WSL path
REM Remove trailing backslash
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Replace backslashes with forward slashes
set "WSL_PATH=%SCRIPT_DIR:\=/%"

REM Convert drive letter (C: becomes /mnt/c)
set "DRIVE_LETTER=%WSL_PATH:~0,1%"
call set "DRIVE_LETTER=%%DRIVE_LETTER:A=a%%"
call set "DRIVE_LETTER=%%DRIVE_LETTER:B=b%%"
call set "DRIVE_LETTER=%%DRIVE_LETTER:C=c%%"
call set "DRIVE_LETTER=%%DRIVE_LETTER:D=d%%"
call set "DRIVE_LETTER=%%DRIVE_LETTER:E=e%%"
call set "DRIVE_LETTER=%%DRIVE_LETTER:F=f%%"
set "WSL_PATH=/mnt/%DRIVE_LETTER%%WSL_PATH:~2%"

echo [*] Starting Lando GUI via WSL...
echo [*] Project path: %WSL_PATH%
echo.

REM Run the bash script in WSL
wsl.exe bash -c "cd '%WSL_PATH%' && bash start-gui.sh"
