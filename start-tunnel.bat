@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Make sure start-server.bat is already running (port 3000).
echo Look for the https://....trycloudflare.com link below and send it to your friends.
echo.
cloudflared tunnel --url http://localhost:3000
echo.
echo If you see "cloudflared is not recognized", run:  winget install --id Cloudflare.cloudflared
echo then close and reopen this window.
pause
