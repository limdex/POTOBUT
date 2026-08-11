@echo off
title Start POTOBUT
color 0A
cls
echo ============================================================
echo                      MULAI POTOBUT
echo ============================================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [x] Node.js tidak ditemukan - jalankan setup.bat dulu!
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [!] node_modules belum ada, update dulu ^(git pull + npm install^)...
    git pull origin master
    call npm install
    if errorlevel 1 (
        echo [x] npm install gagal.
        echo.
        pause
        exit /b 1
    )
    echo [v] Dependensi siap
)

if not exist "C:\msys64\mingw64\bin\libgphoto2-6.dll" (
    echo [!] libgphoto2 tidak ditemukan - kamera DSLR tidak akan jalan.
    echo     Jalankan setup.bat untuk memperbaiki.
)

echo [1/4] Memeriksa kamera...
node scripts/check-camera.cjs
if errorlevel 1 (
    echo.
    echo [x] Kamera belum siap - aplikasi tidak bisa dijalankan.
    echo     Perbaiki masalah kamera di atas, lalu jalankan lagi start.bat.
    echo.
    pause
    exit /b 1
)
echo.

echo [2/4] Memeriksa printer...
node scripts/check-printer.cjs
echo.

echo [3/4] Memeriksa build aplikasi...
set "HEAD_HASH="
for /f "delims=" %%h in ('git rev-parse HEAD 2^>nul') do set "HEAD_HASH=%%h"
set "BUILD_HASH="
if exist "build\.build-hash" for /f "delims=" %%h in (build\.build-hash) do set "BUILD_HASH=%%h"

if defined HEAD_HASH (
    if not "%HEAD_HASH%"=="%BUILD_HASH%" (
        echo     [!] Kode berubah sejak build terakhir, membangun ulang...
        call npm run build
        if errorlevel 1 (
            echo     [x] Gagal membangun aplikasi.
            echo.
            pause
            exit /b 1
        )
        > "build\.build-hash" echo(%HEAD_HASH%
        echo     [v] Build berhasil
    ) else (
        echo     [v] Build sudah terbaru
    )
) else (
    if not exist "build" (
        echo     [!] Build belum ada, membangun ulang...
        call npm run build
        if errorlevel 1 (
            echo     [x] Gagal membangun aplikasi.
            echo.
            pause
            exit /b 1
        )
        > "build\.build-hash" echo(%HEAD_HASH%
        echo     [v] Build berhasil
    ) else (
        echo     [v] Build sudah ada
    )
)
echo.

if not exist "static\uploads" mkdir "static\uploads" 2>nul

echo [4/4] Menjalankan aplikasi (production preview)...
echo Aplikasi terbuka otomatis di http://localhost:4173
echo Tekan Ctrl+C di jendela ini untuk menghentikan aplikasi.
echo.
set "PORT=4173"
set "BODY_SIZE_LIMIT=5M"
start "" "http://localhost:4173"
call npm run preview

echo.
echo [x] Aplikasi berhenti. Tekan tombol untuk menutup.
echo.
pause
