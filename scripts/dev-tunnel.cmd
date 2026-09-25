@echo off
REM Open a Cloudflare quick tunnel that exposes the running dev server
REM over real HTTPS. Use this when you want to test camera/barcode scanner
REM on your phone - getUserMedia requires HTTPS and won't run over plain
REM LAN HTTP.
REM
REM Prerequisite: dev-on.cmd is already running (dev server on :5173).
REM
REM The tunnel prints a https://*.trycloudflare.com URL. Open that on your
REM phone (any network, doesn't need to be the same Wi-Fi). The URL changes
REM every time you start a tunnel.
REM
REM Close the opened window to stop the tunnel.

where wt >nul 2>&1
if %errorlevel%==0 (
  start "" wt -w 0 new-tab --title "calorie-tracker tunnel" -- wsl -e bash -lc "~/.local/bin/cloudflared tunnel --url http://localhost:5173; echo; read -p 'Tunnel stopped. Press Enter to close: '"
) else (
  start "calorie-tracker tunnel" cmd /k wsl -e bash -lc "~/.local/bin/cloudflared tunnel --url http://localhost:5173"
)

echo Tunnel starting in a new window. The HTTPS URL appears after ~5 seconds.
timeout /t 2 >nul
