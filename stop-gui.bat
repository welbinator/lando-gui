@echo off
REM Stop Lando GUI Server (Windows)

echo ========================================
echo   Stop Lando GUI Server
echo ========================================
echo.

REM Check if port 3000 is in use
netstat -ano | findstr ":3000 " >nul 2>&1
if errorlevel 1 (
    echo [*] Lando GUI is not running on port 3000
    echo.
    pause
    exit /b 0
)

REM Find the process using port 3000
echo [*] Finding process on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 "') do (
    set PID=%%a
    goto :found
)

:found
if "%PID%"=="" (
    echo [*] Could not find process ID
    echo.
    pause
    exit /b 1
)

echo [*] Found process ID: %PID%
echo [*] Stopping server...

REM Kill the process
taskkill /F /PID %PID% >nul 2>&1

if errorlevel 1 (
    echo [X] Failed to stop server
    echo     You may need to run as Administrator
    echo.
    pause
    exit /b 1
) else (
    echo [*] Lando GUI server stopped successfully!
    echo.
    pause
    exit /b 0
)
