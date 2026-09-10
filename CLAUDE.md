# calorie-tracker

**Status:** Live, deployed, multi-user. Head `675b2a0`, worker version
`fa5ae0e4`. 420 tests passing. (Updated 2026-09-10, chat #4h. This line goes
stale fast: `docs/SESSION_LOG.md` top entry is the authority.)

Personal calorie + nutrition tracking PWA (Tamara + sister + ~3 friends). Local-first via Dexie/IndexedDB, sync via Cloudflare Worker + D1, per-user isolation via private sync codes. Live at https://calorie-tracker.tamara-sovcik.workers.dev.

## Docs (read on demand)

**In this repo** (the live ones, read these):
- `docs/SESSION_LOG.md` - read the top entry at start, prepend at end. THE log.
- `DESIGN.md` - the design system, and the rules that are enforced in tests.
- `DESIGN_REVIEW.md` - the whole-app design review, its scores and findings.
- `docs/CALORIE_BANKING.md` - why reservations are shaped the way they are.
  Read before touching reservations or the per-date daily goal.

Narrative at `~/workspace/Projects/calorie_tracker/docs/`:
- `ARCHITECTURE.md` - design decisions, AI layer, pet logic, sync model.
- `MISTAKES.md` - project gotchas (read before touching non-obvious code).
- `EVOLUTION.md` - dated feature story.
- `AI_FOOD_RESOLUTION.md` - deep dive on the AI matcher.
- `PURPOSE.md`, `INTERVIEW.md` - product context.

That vault folder also holds a `SESSION_LOG.md`, which is STALE - it stopped at
Chat #2 (2026-06-19). The live log is `docs/SESSION_LOG.md` in this repo.

Cross-project conventions (commit rules, em-dash, co-author): `~/devhub/conventions.md`.

## Stack

TypeScript strict. Vite 5, React 18, Tailwind CSS, vite-plugin-pwa, Dexie + dexie-react-hooks, react-router, zustand, date-fns, lucide-react, ZXing, @tanstack/react-query. Cloudflare Workers + D1 + Workers AI. Open Food Facts (no key), USDA FoodData Central (bundled key).

## Layout

```
src/
  app/        <- per-route pages (diary/ pet/ settings/ library/ progress/ auth/)
  components/ <- shared UI (Button, Input, Sheet, MacroBar, Switch, etc.)
  db/         <- dexie.ts (v6 schema), types.ts, userId.ts, seed.ts, repos/, sync/
  features/   <- diary/ food-search/ meals/ meal-planner/ photo-log/ recipe-scan/
                 food-facts/ weekly-budget/ diet-pause/ reservations/ digest/
                 exercise/ pet/ fitbit/ settings/ onboarding/ library/ progress/
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

All npm/wrangler commands in WSL, via `bash -lic` (login AND interactive, so
nvm is on the PATH). With plain `-lc` the Windows node under `/Program Files`
wins and `tsc` resolves to a UNC path that does not exist.
```bash
npm run typecheck   # tsc --noEmit + worker tsconfig
npm run lint
npm run test        # vitest run (420 tests, 19 files)
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
4. Commit: no AI co-author, no em-dashes. Write the message to a FILE and use
   `git commit -F <file>`. A heredoc inside a single-quoted `bash -lc '...'`
   is silently truncated by the first apostrophe in the body.
5. GitHub remote: `TamaraSovcikova/calorie-tracker`.
6. Push only when asked.

## Current state (2026-09-10)

All features live. See `docs/EVOLUTION.md` for the full story, and the top of
`docs/SESSION_LOG.md` for what is actually current.

The daily calorie goal is **a function of the date**, not `kcal_target`.
Anything asking "the goal on day D" goes through `composedGoalResolver` in
`src/features/reservations/dailyGoal.ts`, which layers a diet pause over the
base target and then reservation deltas over that. Reading `kcal_target`
directly for a specific day is a bug.

Open:
- Water tracking (not started).
- Micronutrient targets (not started).
- README staleness (stale single-bearer-token docs).
- Fitbit OAuth: move Google OAuth app to "In production" for long-lived tokens (Tamara action in Google Cloud Console).
- Everything from chat #4h is unverified on a device.

## Tests

Vitest, colocated `*.test.ts`, 420 tests / 19 files. Pure helpers tested;
Dexie/Worker verified live. `npm run test`.

## Credentials

See `~/devhub/credentials_reference.md`. All credentials are user-supplied at runtime or bundled public-DB keys. No keys in commits.
