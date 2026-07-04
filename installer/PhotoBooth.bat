@echo off
REM PhotoBooth Launcher
REM This script starts the PhotoBooth application

setlocal

REM Get the directory of this script
set "APP_DIR=%~dp0"

REM Set Node.js path
set "NODE_DIR=%APP_DIR%node"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPM_CMD=%NODE_DIR%\npm.cmd"

REM Check if Node.js exists
if not exist "%NODE_EXE%" (
    echo Error: Node.js not found in %NODE_DIR%
    echo Please reinstall PhotoBooth.
    pause
    exit /b 1
)

REM Set environment variables
set "PATH=%NODE_DIR%;%PATH%"
set "NODE_ENV=production"

REM Create user data directory if it doesn't exist
set "DATA_DIR=%LOCALAPPDATA%\PhotoBooth"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\photos" mkdir "%DATA_DIR%\photos"
if not exist "%DATA_DIR%\logs" mkdir "%DATA_DIR%\logs"

REM Change to app directory
cd /d "%APP_DIR%"

REM Start the server
echo Starting PhotoBooth...
echo.

REM Try to start with node directly
if exist "%APP_DIR%index.js" (
    start "" http://localhost:5173
    "%NODE_EXE%" index.js
) else (
    echo Error: Application not built properly.
    echo Please run build-installer.ps1 first.
    pause
    exit /b 1
)

endlocal
