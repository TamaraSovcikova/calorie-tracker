@echo off
REM Start the calorie-tracker dev server in a visible Windows Terminal window.
REM Double-click this file from File Explorer, or pin it to your taskbar.
REM Close the opened window (or press Ctrl+C in it) to stop the server.

REM First, kill any existing vite running in WSL so port 5173 is free
wsl -- bash -lc "pkill -KILL -f 'node.*vite' >/dev/null 2>&1; pkill -KILL -f esbuild >/dev/null 2>&1; sleep 1" >nul 2>&1

REM Then open a new Windows Terminal tab running pnpm dev --host
REM (falls back to a plain cmd window if `wt` isn't installed)
where wt >nul 2>&1
if %errorlevel%==0 (
  start "" wt -w 0 new-tab --title "calorie-tracker dev" -- wsl ~ -e bash -lc "export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm use 22 >/dev/null; cd ~/projects_/calorie-tracker; pnpm dev --host; echo; echo 'Dev server stopped. Close this tab when ready.'; read -p 'Press Enter to close: '"
) else (
  start "calorie-tracker dev" cmd /k wsl -e bash -lc "export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm use 22 >/dev/null; cd ~/projects_/calorie-tracker; pnpm dev --host"
)

echo Dev server starting in a new window. Phone URL: http://192.168.0.151:5173
timeout /t 2 >nul
