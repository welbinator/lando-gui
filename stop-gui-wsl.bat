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
set "DRIVE_LETTER=%WSL_PATH:~0,1%"
call :LowerCase DRIVE_LETTER
set "WSL_PATH=/mnt/%DRIVE_LETTER%%WSL_PATH:~2%"

echo [*] Stopping Lando GUI via WSL...
echo.

REM Run the stop script in WSL
wsl.exe bash -c "cd '%WSL_PATH%' && bash stop-gui.sh"

pause
goto :eof

REM Function to convert to lowercase
:LowerCase
set "%~1=!%~1:A=a!"
set "%~1=!%~1:B=b!"
set "%~1=!%~1:C=c!"
set "%~1=!%~1:D=d!"
set "%~1=!%~1:E=e!"
set "%~1=!%~1:F=f!"
set "%~1=!%~1:G=g!"
set "%~1=!%~1:H=h!"
set "%~1=!%~1:I=i!"
set "%~1=!%~1:J=j!"
set "%~1=!%~1:K=k!"
set "%~1=!%~1:L=l!"
set "%~1=!%~1:M=m!"
set "%~1=!%~1:N=n!"
set "%~1=!%~1:O=o!"
set "%~1=!%~1:P=p!"
set "%~1=!%~1:Q=q!"
set "%~1=!%~1:R=r!"
set "%~1=!%~1:S=s!"
set "%~1=!%~1:T=t!"
set "%~1=!%~1:U=u!"
set "%~1=!%~1:V=v!"
set "%~1=!%~1:W=w!"
set "%~1=!%~1:X=x!"
set "%~1=!%~1:Y=y!"
set "%~1=!%~1:Z=z!"
goto :eof
