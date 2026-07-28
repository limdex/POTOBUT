@echo off
title Update & Check POTOBUT
color 0A
cls
echo ============================================================
echo               UPDATE & CHECK KEBUTUHAN POTOBUT              
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/4] Mengambil pembaruan sistem dari Git (git pull)...
git pull origin master
if %errorlevel% neq 0 (
    echo [!] Peringatan: Gagal melakukan git pull. Pastikan koneksi internet aktif.
) else (
    echo [v] Berhasil mengambil kode terbaru!
)
echo.

echo [2/4] Memeriksa & menginstall dependensi pustaka (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo [!] Gagal menginstall dependensi pustaka.
    pause
    exit /b 1
)
echo [v] Pustaka / dependensi siap!
echo.

echo [3/4] Memeriksa perangkat (Kamera & Printer)...
echo ------------------------------------------------------------
node scripts/check-camera.cjs
echo ------------------------------------------------------------
node scripts/check-printer.cjs
echo.

echo [4/4] Memeriksa integritas sistem (TypeScript check)...
call npm run check
echo.

echo ============================================================
echo       UPDATE DAN PENGECEKAN SELESAI! APLIKASI SIAP.
echo ============================================================
echo.
pause
