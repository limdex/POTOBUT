@echo off
title Update POTOBUT
color 0A
cls
echo ============================================================
echo              UPDATE KODINGAN ^& DEPENDENCY
echo ============================================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [x] Node.js tidak ditemukan - jalankan setup.bat dulu cok!
    echo.
    pause
    exit /b 1
)

echo [1/3] Mengambil kode terbaru (git pull)...
git pull origin master
if errorlevel 1 (
    echo [!] Peringatan: git pull gagal. Cek koneksi internet.
)
echo.

echo [2/3] Menginstall / memperbarui dependensi (npm install)...
call npm install
if errorlevel 1 (
    echo [x] npm install gagal.
    echo.
    pause
    exit /b 1
)
echo.

echo [3/3] Memeriksa integritas kode (npm run check)...
call npm run check
echo.

echo ============================================================
echo        UPDATE SELESAI! Jalankan start.bat untuk mulai.
echo ============================================================
echo.
pause
