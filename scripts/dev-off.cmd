@echo off
REM Stop the calorie-tracker dev server (and any other vite/esbuild
REM processes in WSL). Double-click this from File Explorer.

wsl -- bash -lc "pkill -KILL -f 'node.*vite' >/dev/null 2>&1; pkill -KILL -f esbuild >/dev/null 2>&1; pkill -KILL -f cloudflared >/dev/null 2>&1; sleep 1"

REM Verify nothing is listening on 5173
wsl -- bash -lc "ss -tln 2>/dev/null | grep -q ':5173 ' && echo 'WARNING: something still listening on 5173' || echo 'Dev server stopped. Port 5173 is free.'"

echo.
echo Done.
timeout /t 2 >nul
