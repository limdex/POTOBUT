@echo off
REM Build PhotoBooth Installer
REM This script builds the application and creates the installer

echo ========================================
echo PhotoBooth Installer Builder
echo ========================================
echo.

REM Check if PowerShell is available
where powershell >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: PowerShell not found!
    echo Please run this script on Windows.
    pause
    exit /b 1
)

REM Run the build script
echo Starting build process...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================
    echo Build completed successfully!
    echo ========================================
    echo.
    echo Installer location: %~dp0installer-output\PhotoBoothSetup.exe
) else (
    echo.
    echo ========================================
    echo Build failed!
    echo ========================================
)

pause
