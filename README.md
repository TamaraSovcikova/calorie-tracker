# Calorie Tracker

Personal calorie & nutrition tracking PWA. Mobile-first, installable to phone home screen, offline-capable.

## Stack

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS + shadcn-style UI primitives
- Dexie (IndexedDB) for local-first storage
- TanStack Query for async state
- Zustand for app state
- React Router for navigation
- vite-plugin-pwa (Workbox) for service worker + manifest

Cloud sync, auth, Fitbit integration, and deploy come in later phases — see the build plan in `~/.claude/plans/`.

## Local development

```bash
# requires Node 22+ and pnpm 11+
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # tsc --noEmit
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
  db/             # Dexie schema + repo pattern + (later) Supabase client
  lib/            # pure helpers (dates, units, tdee, off-api)
  workers/        # service worker, sync worker
```

## Status

Phase 1 — scaffold. See plan for upcoming phases.
