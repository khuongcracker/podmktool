@echo off
REM ================================================
REM  Podmktool - chay dev server
REM  Double-click file nay de chay app.
REM ================================================
cd /d "%~dp0"

if not exist "node_modules" (
    echo [*] Chua co node_modules - dang cai dependencies...
    call npm install
    if errorlevel 1 (
        echo [!] npm install that bai. Kiem tra Node.js da cai chua.
        pause
        exit /b 1
    )
)

echo [*] Dang khoi dong Vite dev server...
echo [*] Sau khi chay, mo trinh duyet vao: http://localhost:5173
echo.
call npm run dev

pause
