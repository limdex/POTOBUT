@echo off
REM PhotoBooth Dev Launcher
REM Clones repo, installs dependencies, runs dev server

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
set "NODE_ENV=development"

REM Set project directory
set "PROJECT_DIR=%APP_DIR%potobut"

REM Check if project exists, if not clone it
if not exist "%PROJECT_DIR%" (
    echo Cloning PhotoBooth repository...
    git clone https://github.com/limdex/POTOBUT.git "%PROJECT_DIR%"
    if %errorlevel% neq 0 (
        echo Error: Failed to clone repository.
        echo Please check your internet connection.
        pause
        exit /b 1
    )
)

REM Change to project directory
cd /d "%PROJECT_DIR%"

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    call "%NPM_CMD%" install
    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies.
        pause
        exit /b 1
    )
)

REM Start dev server
echo Starting PhotoBooth dev server...
echo.
echo Open browser to: http://localhost:5173
echo.
call "%NPM_CMD%" run dev

pause
