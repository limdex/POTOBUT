@echo off
setlocal enabledelayedexpansion
title Setup POTOBUT
color 0A
cls
echo ============================================================
echo            SETUP KEBUTUHAN POTOBUT (PERTAMA KALI)
echo ============================================================
echo.

cd /d "%~dp0"

set "FAIL=0"

:: == 0. Admin check + auto-elevate ==
net session >nul 2>&1
if errorlevel 1 (
    echo [i] Setup butuh hak admin, membuka ulang sebagai admin...
    timeout /t 1 /nobreak >nul
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
echo [v] Hak admin terkonfirmasi
echo.

:: == 1. Node.js ==
echo [1/6] Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo     [!] Belum ada, menginstall via winget...
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo     [x] Gagal install Node.js
        set "FAIL=1"
    )
) else (
    for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
    echo     [v] Sudah terinstall: !NODE_VER!
)
set "PATH=%ProgramFiles%\nodejs;%LocalAppData%\Programs\nodejs;%PATH%"
echo.

:: == 2. Git ==
echo [2/6] Git...
where git >nul 2>&1
if errorlevel 1 (
    echo     [!] Belum ada, menginstall via winget...
    winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo     [x] Gagal install Git
        set "FAIL=1"
    )
) else (
    echo     [v] Sudah terinstall
)
set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
echo.

:: == 3. MSYS2 ==
echo [3/6] MSYS2 (runtime kamera)...
if exist "C:\msys64\usr\bin\bash.exe" (
    echo     [v] Sudah terinstall di C:\msys64
) else (
    echo     [!] Belum ada, menginstall via winget...
    winget install --id MSYS2.MSYS2 -e --silent --accept-package-agreements --accept-source-agreements
    if not exist "C:\msys64\usr\bin\bash.exe" (
        echo     [x] Gagal install MSYS2
        set "FAIL=1"
    )
)
echo.

:: == 4. libgphoto2 + runtime DLL ==
echo [4/6] libgphoto2 + runtime DLL...
if exist "C:\msys64\usr\bin\bash.exe" (
    set "MISSING=0"
    if not exist "C:\msys64\mingw64\bin\libgphoto2-6.dll" set "MISSING=1"
    if not exist "C:\msys64\mingw64\bin\libwinpthread-1.dll" set "MISSING=1"
    if not exist "C:\msys64\mingw64\bin\libintl-8.dll" set "MISSING=1"
    if not exist "C:\msys64\mingw64\bin\libgcc_s_seh-1.dll" set "MISSING=1"
    if not exist "C:\msys64\mingw64\bin\libstdc++-6.dll" set "MISSING=1"
    if "!MISSING!"=="1" (
        echo     [!] DLL belum lengkap, menginstall via pacman...
        set "MSYSTEM=MINGW64"
        "C:\msys64\usr\bin\bash.exe" --login -c "pacman -Sy --noconfirm --needed mingw-w64-x86_64-gphoto2 mingw-w64-x86_64-gcc-libs mingw-w64-x86_64-gettext mingw-w64-x86_64-libwinpthread-git"
        if not exist "C:\msys64\mingw64\bin\libgphoto2-6.dll" (
            echo     [x] Gagal install gphoto2 via pacman
            set "FAIL=1"
        ) else (
            echo     [v] libgphoto2 + runtime DLL siap
        )
    ) else (
        echo     [v] Sudah lengkap
    )
) else (
    echo     [x] MSYS2 tidak ditemukan, skip
    set "FAIL=1"
)
echo.

:: == 5. Junction D:\M\msys64 ==
echo [5/6] Junction D:\M\msys64...
if exist "D:\M\msys64" (
    echo     [v] Junction sudah ada
) else (
    echo     [!] Membuat junction...
    subst D: C:\msys64 2>nul
    if not exist "D:\M" mkdir "D:\M" 2>nul
    mklink /J "D:\M\msys64" "C:\msys64" 2>nul
    if exist "D:\M\msys64" (
        echo     [v] Junction berhasil dibuat
    ) else (
        echo     [x] Gagal membuat junction
        echo         Jalankan manual: subst D: C:\msys64 ^&^& mklink /J D:\M\msys64 C:\msys64
        set "FAIL=1"
    )
)
echo.

:: == 6. Kamera + driver USB (WinUSB) ==
echo [6/6] Kamera ^& driver USB (WinUSB)...
echo     [i] Pastikan kamera sudah ON dan terkoneksi USB
echo     [i] Kalau gagal otomatis, Zadig akan didownload & dibuka
node scripts/check-camera.cjs
echo.

:: == Summary ==
echo ============================================================
if "%FAIL%"=="1" (
    echo   SETUP BELUM SEMPURNA - periksa error di atas
) else (
    echo   SETUP SELESAI! Semua kebutuhan terinstall.
)
echo   Langkah berikutnya: jalankan update.bat lalu start.bat
echo ============================================================
echo.
pause
