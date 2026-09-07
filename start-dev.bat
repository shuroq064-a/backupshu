@echo off
REM ShuroqX Start - Double-click this or run from ANY folder
REM This file MUST be in the Shuroqx-Redesign project folder

setlocal EnableDelayedExpansion

REM Get the directory where this bat file is located
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Verify this is the project root (should have backend and frontend)
if not exist "%SCRIPT_DIR%\backend" (
    echo ERROR: This script must be in the Shuroqx-Redesign project folder
    echo Expected to find: %SCRIPT_DIR%\backend
    pause
    exit /b 1
)

if not exist "%SCRIPT_DIR%\frontend" (
    echo ERROR: This script must be in the Shuroqx-Redesign project folder
    echo Expected to find: %SCRIPT_DIR%\frontend
    pause
    exit /b 1
)

echo ================================================
echo ShuroqX Local Development Startup
echo ================================================
echo Project: %SCRIPT_DIR%
echo.

REM Change to project root
cd /d "%SCRIPT_DIR%"

REM Run the PowerShell script
echo Starting services...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\start-dev.ps1"

REM Keep window open if there's an error
if errorlevel 1 (
    echo.
    echo ERROR: Something went wrong. Check the errors above.
    pause
)

endlocal
