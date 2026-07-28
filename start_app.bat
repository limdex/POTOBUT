@echo off
title Jalankan POTOBUT (Production Preview)
color 0B
cls
echo ============================================================
echo                 MEMBANGUN & MENJALANKAN POTOBUT             
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/2] Membangun aplikasi (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [X] Gagal membangun aplikasi! Silakan jalankan 'update^&check.bat' terlebih dahulu.
    pause
    exit /b 1
)
echo.
echo [v] Aplikasi berhasil dibangun!
echo.

echo [2/2] Membuka browser dan menjalankan server preview...
echo Aplikasi akan terbuka otomatis di http://localhost:4173
echo Tekan Ctrl+C di jendela ini jika ingin menghentikan aplikasi.
echo.

set "PORT=4173"
start "" "http://localhost:4173"
call npm run preview

pause
