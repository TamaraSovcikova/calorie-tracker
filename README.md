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

To test PWA on your phone over local network:

```bash
pnpm dev --host   # then open http://<your-lan-ip>:5173 on your phone
```

For full offline behaviour test the production build:

```bash
pnpm build && pnpm preview --host
```

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
