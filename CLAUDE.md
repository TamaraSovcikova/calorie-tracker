# calorie-tracker

**Status:** Live, deployed, multi-user. Head `0ef5f7f`, Version `5c40a674`. 184 tests passing.

Personal calorie + nutrition tracking PWA (Tamara + sister + ~3 friends). Local-first via Dexie/IndexedDB, sync via Cloudflare Worker + D1, per-user isolation via private sync codes. Live at https://calorie-tracker.tamara-sovcik.workers.dev.

## Docs (read on demand)

Narrative at `~/workspace/Projects/calorie_tracker/docs/`:
- `ARCHITECTURE.md` - design decisions, AI layer, pet logic, sync model.
- `MISTAKES.md` - project gotchas (read before touching non-obvious code).
- `SESSION_LOG.md` - read top entry at start, append at end.
- `EVOLUTION.md` - dated feature story.
- `AI_FOOD_RESOLUTION.md` - deep dive on the AI matcher.
- `PURPOSE.md`, `INTERVIEW.md` - product context.

Cross-project conventions (commit rules, em-dash, co-author): `~/devhub/conventions.md`.

## Stack

TypeScript strict. Vite 5, React 18, Tailwind CSS, vite-plugin-pwa, Dexie + dexie-react-hooks, react-router, zustand, date-fns, lucide-react, ZXing, @tanstack/react-query. Cloudflare Workers + D1 + Workers AI. Open Food Facts (no key), USDA FoodData Central (bundled key).

## Layout

```
src/
  app/        <- per-route pages (diary/ pet/ settings/ library/ progress/ auth/)
  components/ <- shared UI (Button, Input, Sheet, MacroBar, Switch, etc.)
  db/         <- dexie.ts (v3 schema), types.ts, userId.ts, seed.ts, repos/, sync/
  features/   <- diary/ food-search/ meals/ meal-planner/ photo-log/ recipe-scan/
                 food-facts/ weekly-budget/ digest/ exercise/ pet/ fitbit/ settings/
  lib/        <- off-api, usda-api, fitbit-api, macros, tdee, units, dates, cn, portionSuggestions
  main.tsx    <- boot: resolveUserId -> pre-seed sync -> ensureSeed -> render
  App.tsx     <- routes + Layout + Toaster + FoodFactCard
worker/
  index.ts    <- /gh-api proxy, /api/* router (bearer + rate limit), SPA fallback
  sync.ts, foodFacts.ts, mealPlan.ts, photoFood.ts, photoRecipe.ts, vision.ts, rateLimit.ts
  schema.sql  <- canonical D1 schema
dist/         <- Vite build output
wrangler.jsonc, vite.config.ts, vitest.config.ts
```

## How to run

All npm/wrangler commands in WSL:
```bash
npm run typecheck   # tsc --noEmit + worker tsconfig
npm run lint
npm run test        # vitest run (184 tests, 12 files)
npm run build       # vite build -> dist/
npm run dev
npx wrangler deploy # always build first
```

**Use the /calorie-tracker-deploy skill for the full ship loop.**

D1 migrations - one ALTER at a time:
```bash
npx wrangler d1 execute calorie-tracker --remote --command "ALTER TABLE foods ADD COLUMN <col> <type>"
```
(bash -ic for-loop does not expand $c - see docs/MISTAKES.md)

## Operational notes for a fresh session

1. Read `docs/SESSION_LOG.md` top entry. Announce chat number.
2. Grep before Read. Use offset/limit on large files; don't bulk-read.
3. wrangler OAuth expires: `npx wrangler whoami` clears transient 7403; `npx wrangler login` for full re-auth. Account: `b850f64ada89773f5f065a2aa638251c`.
4. Commit: no AI co-author, no em-dashes. Use `git commit -F -` heredoc ($(cat <<EOF) breaks under bash -ic).
5. GitHub remote: `TamaraSovcikova/calorie-tracker`.

## Current state (2026-06-19)

All features live. See `docs/EVOLUTION.md` for full story. Open:
- Water tracking (not started).
- Micronutrient targets (not started).
- README staleness (stale single-bearer-token docs).
- Fitbit OAuth: move Google OAuth app to "In production" for long-lived tokens (Tamara action in Google Cloud Console).

## Tests

Vitest, colocated `*.test.ts`, 184 tests / 12 files. Pure helpers tested; Dexie/Worker verified live. `npm run test`.

## Credentials

See `~/devhub/credentials_reference.md`. All credentials are user-supplied at runtime or bundled public-DB keys. No keys in commits.
