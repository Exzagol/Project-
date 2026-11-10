@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting server ... (close this window or press Ctrl+C to stop)
node server.js
echo.
echo If you see "node is not recognized", install Node.js LTS from https://nodejs.org first.
pause
