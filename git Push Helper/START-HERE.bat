@echo off
title Git Push Tool Launcher
color 0A
echo.
echo ========================================
echo    Git Push Tool Launcher
echo ========================================
echo.

REM Change to parent directory where node_modules and node.exe are
cd /d "%~dp0\.."

REM Check if server is already running on port 3001
netstat -ano | findstr ":3001" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Server already running on port 3001
    echo.
    goto OPEN_BROWSER
)

echo [1/2] Starting helper server...
start "Git Helper Server - Port 3001" /MIN cmd /k "cd /d "%~dp0" && node git-helper-server.js"

echo [2/2] Waiting for server to start...
timeout /t 2 /nobreak > nul

REM Verify server started
netstat -ano | findstr ":3001" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Server may not have started properly
    echo If the tool doesn't work, close all command windows and try again
    echo.
)

:OPEN_BROWSER
echo.
echo Opening browser...
start "" "%~dp0git-push-tool.html"

echo.
echo ========================================
echo  Tool is ready!
echo ========================================
echo.
echo The server is running in a minimized window.
echo Close that window when you're done using the tool.
echo.
pause
