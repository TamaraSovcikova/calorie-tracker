# Calorie Tracker

Personal calorie & nutrition tracking PWA. Mobile-first, installable to phone home screen, offline-capable. Cloud sync between web + phone via Cloudflare Workers + D1.

## Stack

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS + shadcn-style UI primitives
- Dexie (IndexedDB) for local-first storage
- TanStack Query for async state
- Zustand for app state
- React Router for navigation
- vite-plugin-pwa (Workbox) for service worker + manifest
- Cloudflare Workers + D1 for cloud sync (single bearer token, no auth flow)

## Local development

```bash
# requires Node 22+ and pnpm 11+
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # tsc --noEmit (client + worker)
pnpm lint
pnpm build        # production build to dist/
pnpm preview      # serve dist/
```

For full offline behaviour test the production build:

```bash
pnpm build && pnpm preview --host
```

## Quick start / stop (Windows shortcuts)

Three double-clickable `.cmd` files in `scripts/` for day-to-day use:

| File | What it does |
|---|---|
| `scripts/dev-on.cmd` | Opens a Windows Terminal tab in WSL and starts `pnpm dev --host` on port 5173. Close the tab to stop. |
| `scripts/dev-off.cmd` | Kills any vite/esbuild/cloudflared processes in WSL. Use this when you've left a stray dev server running and want to free port 5173 for another project. |
| `scripts/dev-tunnel.cmd` | Opens a second tab running `cloudflared tunnel --url http://localhost:5173`. Prints an HTTPS `*.trycloudflare.com` URL you can open on your phone. **Use this for testing the barcode scanner** — phone cameras only work over HTTPS. |

Pin them to your taskbar (right-click → Pin to taskbar) for one-click switching between projects.

## Test on your phone over LAN (WSL2 quirk)

Vite's "Network" URL is the WSL2 virtual NIC, not your laptop's actual
LAN IP, so your phone can't reach it directly. Pick one of these:

**Easiest — Win11 22H2+: enable mirrored networking (one-time)**

Add `[wsl2]\nnetworkingMode=mirrored\n` to `%USERPROFILE%\.wslconfig`,
then `wsl --shutdown` in PowerShell. WSL ports become available on every
host network interface automatically. No script needed; the phone just
opens `http://<your-laptop-lan-ip>:5173`.

**Otherwise — netsh portproxy (works on all WSL2 setups)**

From an *elevated* PowerShell (Run as administrator):

```powershell
cd \\wsl.localhost\Ubuntu\home\snaccident\projects_\calorie-tracker
powershell -ExecutionPolicy Bypass -File .\scripts\wsl-lan-setup.ps1
```

The script prints a `Phone URL:` line. Open exactly that URL on your
phone (same Wi-Fi as the laptop), making sure to type the explicit
`http://` prefix — Chrome on Android sometimes auto-upgrades to HTTPS
which the dev server doesn't speak.

WSL2's IP changes after every WSL restart, so re-run the setup script
if the phone connection stops working. Clean up later with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wsl-lan-teardown.ps1
```

### Camera / barcode scanner on phone

Even with LAN access set up, **the barcode scanner won't work on your phone over plain HTTP** — browsers only expose `navigator.mediaDevices.getUserMedia` in secure contexts (HTTPS or localhost). For phone testing of the scanner, use the Cloudflare tunnel:

```cmd
scripts\dev-on.cmd       (start the dev server)
scripts\dev-tunnel.cmd   (open an HTTPS tunnel to it)
```

The tunnel window prints `https://<random>.trycloudflare.com`. Open that on your phone (works on any network, not just LAN) → camera permission prompt → scanner works. URL changes every time you start the tunnel; permanent HTTPS comes with the Cloudflare deploy (below).

## Food-database setup (Settings → Food sources)

The search is layered:

| Layer | Where | Needs setup? |
|---|---|---|
| My Products | local Dexie | nothing |
| Common foods (generic) | USDA FoodData Central | free API key |
| Packaged products | USDA Branded + Open Food Facts | nothing for OFF; key for USDA |
| Barcode scan | Open Food Facts | nothing |

Get the free USDA key (instant) at https://api.data.gov/signup/, then
paste it into Settings → Food sources → Test key. Searches will start
showing clean generic entries like "Bananas, raw" plus FNDDS portion
sizes like "1 medium banana, 118 g".

## Project structure

```
src/
  app/            # routes (diary, meals, products, progress, settings, onboarding)
  components/     # reusable UI primitives
  features/       # cross-cutting feature code
  db/
    repos/        # functional repos against Dexie
    sync/         # Dexie ↔ Cloudflare Worker sync engine + config
  lib/            # pure helpers (dates, units, tdee, off-api, macros)
worker/
  index.ts        # Cloudflare Worker entrypoint, /api/* routes
  sync.ts         # bidirectional sync handler
  schema.sql      # D1 (SQLite) schema
```

## Cloud sync setup (one-time, per Cloudflare account)

The PWA works fully offline-first without sync. To turn on sync between
your laptop and phone:

```bash
# 1. Authenticate wrangler (browser flow, one-time)
npx wrangler login

# 2. Create the D1 database
npx wrangler d1 create calorie-tracker
# → copy the printed database_id into wrangler.jsonc where it says
#   REPLACE_WITH_D1_DATABASE_ID, then save the file.

# 3. Apply the schema to the remote DB
npx wrangler d1 execute calorie-tracker --remote --file ./worker/schema.sql

# 4. Set the shared bearer token (any 32+ char random string)
#    This is what you'll paste in Settings → Cloud sync on every device.
openssl rand -base64 32 | tr -d '\n' | npx wrangler secret put SYNC_TOKEN
# (or run `npx wrangler secret put SYNC_TOKEN` and paste a token interactively)

# 5. Deploy
pnpm build && npx wrangler deploy
```

Wrangler prints the deployed URL (e.g.
`https://calorie-tracker.<your-subdomain>.workers.dev`). Open it on each
device, go to **Settings → Cloud sync**, paste the URL + the same token,
and tap **Connect**. From then on every change syncs automatically.

To re-deploy after pulling new commits:

```bash
pnpm build && npx wrangler deploy
```

D1 schema changes go through `npx wrangler d1 execute calorie-tracker
--remote --file ./worker/schema.sql` (the SQL is idempotent — uses
`CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`).

## Open Food Facts attribution

Product data is sourced from [Open Food Facts](https://world.openfoodfacts.org/),
licensed under [ODbL](https://opendatacommons.org/licenses/odbl/1-0/).
