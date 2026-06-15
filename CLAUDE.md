# calorie-tracker

## What this project is

A personal calorie + nutrition tracking PWA built for Tamara and shared with her sister + 2-3 close friends (5 users total). Local-first via Dexie / IndexedDB, multi-device sync through a single Cloudflare Worker + D1, per-user isolation via private sync codes. Live at <https://calorie-tracker.tamara-sovcik.workers.dev>. Shared and in active use; production.

Built-in features: food logging (search / barcode / photo / quick / saved meals), multi-portion meal templates, virtual pet dog (wellbeing + fullness, ~20 cartoon poses), Fitbit-via-Google-Health activity import, weekly calorie budget with un-tracked-day handling, AI food facts on logging, AI meal planner, AI recipe-screenshot scan, AI photo logging from meal pictures, micronutrient tracking (fibre / sugar / sodium).

## Project docs (narrative depth)

This file is the operational orientation. The full narrative lives in the OneDrive docs folder (`~/workspace/Projects/calorie_tracker/docs/`):
- `PURPOSE.md` - what it is, who for, why it exists.
- `ARCHITECTURE.md` - system design, key decisions, the pet model, sync/isolation.
- `AI_FOOD_RESOLUTION.md` - the "AI never produces trusted numbers" rule + the matcher (deep dive).
- `EVOLUTION.md` - the dated story (genesis 2026-05-09 to now).
- `MISTAKES.md` - project-specific lessons.
- `INTERVIEW.md` - first-person talking points.

## Stack

- **Language:** TypeScript (strict). Frontend + worker both TS.
- **Frontend:** Vite 5, React 18, Tailwind CSS, vite-plugin-pwa (Workbox, `registerType: 'prompt'`), Dexie (IndexedDB) + `dexie-react-hooks`, react-router, zustand (toasts + small stores), date-fns, lucide-react, ZXing browser (barcode), @tanstack/react-query.
- **Backend:** Cloudflare Workers (single worker serves SPA from `./dist` + `/api/*` + `/gh-api/*` proxy), Cloudflare D1 (SQLite), Cloudflare Workers AI (Mistral Small 3.1 vision; Llama 3.1 8B + 8B-fast for text).
- **External data sources:** Open Food Facts (no key; rate-limited), USDA FoodData Central (bundled free key), Google Health API (via `/gh-api/` proxy with the user's OAuth token).
- **Hosting:** Cloudflare. Same Worker hosts the static SPA via the assets binding AND the sync + AI endpoints.
- **Tests:** Vitest. 107 tests across 9 files. No e2e (small private app).

## Layout

```
calorie-tracker/
  src/
    app/                          <- per-route pages
      diary/  pet/  settings/  library/  progress/  auth/
    components/                   <- shared UI (Button, Input, Sheet, MacroBar, Switch, etc.)
    db/
      dexie.ts                    <- Dexie schema (v3: profiles, foods, meals, meal_items, diary_entries, exercise_entries, weight_log, fitbit_tokens, pet)
      types.ts                    <- shared row types (snake_case to mirror D1)
      userId.ts                   <- currentUserId + deriveUserId (SHA-256)
      seed.ts                     <- bundled curated foods + profile defaults
      repos/                      <- profile, foods, meals, diary, exercise, weight, pet, fitbitTokens
      sync/                       <- config, client (engine), install (hooks), userMigration
    features/
      diary/                      <- MacroSummary, DiarySection, DogHero
      food-search/                <- AddFoodSheet, FoodSearchPanel, FoodResultRow, QuantityStep, BarcodeScanner, EditEntrySheet
      meals/                      <- MealEditor, MealsLibrary, LogMealStep, LogMealSheet, MealPicker, IngredientPickerSheet, useMealResolved, useMealsWithTotals, mealMath
      meal-planner/               <- MealPlannerPage, mealPlanner (request + lookupIngredientFood + resolveAndFitMeal + savePlanAsMeal)
      photo-log/                  <- PhotoFoodStep, photoLog (analyze + resolve)
      recipe-scan/                <- RecipeScanSheet, recipeScan (analyze + resolveScannedRecipe)
      food-facts/                 <- FoodFactCard, foodFacts, factSettings, foodFactStore
      weekly-budget/              <- weeklyBudget (computeWeeklyBudget + useWeeklyBudget), WeeklyBudgetCard
      digest/                     <- WeeklyDigestCard, weeklyDigest
      exercise/                   <- ExerciseSection, ExerciseSheet, activities (MET dataset)
      pet/                        <- DogPlayground, petLogic, useDogState, useDailyGreeting, wellbeing, wellbeingRollForward, RenamePetSheet
      fitbit/                     <- useFitbitDailySync, activityCalories
      settings/                   <- GoalsSection, ProfileSection, FitbitSection, PreferencesSection, SyncSection, DataSection, AboutSection
    lib/                          <- off-api, usda-api, fitbit-api, macros, tdee, units, dates, cn
    main.tsx                      <- boot: resolveUserId -> optional pre-seed sync -> ensureSeed -> render
    App.tsx                       <- routes + Layout + Toaster + FoodFactCard
  worker/
    index.ts                      <- fetch handler: /gh-api proxy, /api/* router (with bearer + rate limit), SPA fallback
    sync.ts                       <- handleSync (atomic batch upsert + scoped pull per table)
    foodFacts.ts                  <- /api/food-fact (Llama 3.1 8B + D1 cache)
    mealPlan.ts                   <- /api/meal-plan (Llama 3.1 8B-fast in JSON mode)
    photoFood.ts                  <- /api/photo-food (vision)
    photoRecipe.ts                <- /api/photo-recipe (vision; structured recipe)
    vision.ts                     <- shared Mistral vision helper (toBase64, extractJson, runVisionJson)
    rateLimit.ts                  <- D1-backed fixed-window limiter
    schema.sql                    <- canonical D1 schema + migration ALTER notes
  dist/                           <- Vite build output (served by the worker)
  wrangler.jsonc                  <- assets binding + D1 binding + AI binding + observability
  vite.config.ts                  <- alias `@/` -> ./src, PWA plugin, __APP_VERSION__ define
  vitest.config.ts                <- mirrors `@/` alias (Vitest doesn't inherit from vite.config)
  AUDIT_2.md, AUDIT_3.md          <- prior whole-app reviews
```

Files come and go but that's the rough shape. No monorepo / workspaces.

## How to run

Repo lives in WSL (`~/projects_/calorie-tracker`). Symlinked into OneDrive for editing. **All npm / wrangler commands run inside WSL**:

```bash
wsl -d Ubuntu -- bash -ic 'cd ~/projects_/calorie-tracker && npm <cmd>'
```

Commands used regularly:

```bash
npm run typecheck      # tsc --noEmit + tsc -p worker/tsconfig.json
npm run lint           # eslint .
npm run test           # vitest run
npm run build          # vite build -> dist/
npm run dev            # vite dev server (only used early; live is the source of truth)
npx wrangler deploy    # uploads dist/ + worker code to Cloudflare
```

**D1 migrations** run one ALTER at a time. A bash for-loop under `bash -ic` does NOT expand `$c` correctly; run each command literal:

```bash
npx wrangler d1 execute calorie-tracker --remote --command "ALTER TABLE foods ADD COLUMN <col> <type>"
```

Or apply the whole schema (additive, idempotent for new tables):

```bash
npx wrangler d1 execute calorie-tracker --remote --file ./worker/schema.sql
```

The schema file's `CREATE TABLE IF NOT EXISTS` no-ops on existing tables and creates anything new (`food_facts`, `rate_limits`). ALTER statements are NOT in schema.sql (they're documented as comments); add columns one at a time.

## Current state

**Live, deployed, in use.** Tamara, sister, and 2-3 friends each have their own sync code = isolated account. Worker version IDs change frequently; head is whatever the latest `wrangler deploy` produced.

What works: every feature listed under "What this project is" is live and shipped.

What's stubbed / known limitations:
- **AI photo logging + recipe scanning** verified end-to-end via curl with food photos. Success path with arbitrary real-world recipe screenshots untested against many examples.
- **Manual-entry foods now capture micronutrients** (optional fibre / sugar / sodium fields in `ManualEntryForm`, added 2026-06-07). A nutrition-label photo scan (`/api/photo-label`) can prefill them. Older hand-entered foods may still read 0g until edited.
- **`fitbit_tokens` OAuth tokens at rest are plaintext** in D1. Acceptable for private Cloudflare account; flagged in audit.
- **No e2e tests.** Worker logic verified live + ~140 unit tests for pure helpers (mealMath, weeklyBudget, foodMath, macros, tdee, units, petLogic, wellbeing, activityCalories, mealCategory).
- **Pet wellbeing's "missed day" still penalises logging discipline.** The budget neutralises missed days; wellbeing does not (intentional - logging is the consistency meter).
- Some leftover UX-audit items deferred: water tracking, micronutrient targets (not just totals).

Last updated: 2026-06-07 by claude-code. Head `0ef5f7f`, Version `5c40a674`. Full narrative in `docs/EVOLUTION.md`; per-feature current state under "## Current state" below.

## Project-specific decisions

(Most of these are universal-ish patterns extracted to `_dev_hub/conventions.md` + `recurring_decisions.md`; the items below are this project's flavour.)

- **Sync model: a private sync code IS the account.** `userId = sha256(code).slice(0, 32)`. Same derivation on worker and client (Web Crypto `subtle.digest`). Min token length 12. No allowlist; any code spawns its own isolated space. Worker scopes every query by the derived user_id (meal_items via parent meal subquery). Client app syncs to its own origin (no user-typed URL).
- **One worker, four kinds of routes:** static SPA via assets binding (with `not_found_handling: "single-page-application"`); `/gh-api/*` proxy to `health.googleapis.com` (no CORS otherwise); `/api/sync` for the sync engine; `/api/food-fact` + `/api/meal-plan` + `/api/photo-food` + `/api/photo-recipe` for AI. Every `/api/*` route requires the bearer token (≥12 chars).
- **AI runs entirely on Workers AI (free tier).** Cloudflare's binding `env.AI`, no key. Models:
  - `@cf/mistralai/mistral-small-3.1-24b-instruct` for vision (photo logging + recipe scan). Apache-2.0, no EU restriction. Image as base64 data URL via `messages: [{role:'user', content:[{type:'text', text:prompt}, {type:'image_url', image_url:{url:'data:image/jpeg;base64,...'}}]}]`. Used in `worker/vision.ts`.
  - `@cf/meta/llama-3.1-8b-instruct` for food facts (~10s).
  - `@cf/meta/llama-3.1-8b-instruct-fast` for the meal planner (~10-20s; 70B was tried and abandoned at ~100s).
  - **Llama 3.2 Vision (`@cf/meta/llama-3.2-11b-vision-instruct`) is the obvious choice on paper but it's excluded for EU users via Meta's licence.** Confirmed broken in EU during this session; switched to Mistral.
- **AI macros are never trusted.** The planner / photo-log / recipe-scan all instruct the model to return ingredient names + grams ONLY. Real macros come from the food database via `lookupIngredientFood(name)` → curated → user library → recents-weighted fuzzy match → USDA fallback. This pattern saved the project from "0 kcal chicken breast" and is non-negotiable.
- **Ingredient fuzzy match (`lookupIngredientFood` in `mealPlanner.ts`):** recall-weighted word overlap. Score each library food by how many of *the food's* significant words appear in the query (recall), not how many of the query's words appear in the food (precision). Bias toward recall handles verbose AI names like "Lidl Rowan Hill Bakery 6 High Protein Tortilla Wraps" vs a stored "High Protein Tortilla Wraps". Lenient word matching (prefix, ≥4 chars: "wrap"/"wraps"). Recently-logged foods get a score bonus. Single-word queries: only match recents leniently or exact, otherwise fall to USDA.
- **D1 schema is additive; new columns are nullable.** Every schema bump = a `<X> REAL` / `<X> INTEGER` / `<X> TEXT` column with no NOT NULL, no DEFAULT. Pre-feature rows read `NULL` → handled with `?? 0` / `?? false` in the client. Worker's `normaliseInbound` coerces 0/1 → boolean for the `favorite`, `fitbit_connected`, `eat_back_burned`, `onboarded`, `weekly_budget_enabled`, `weekly_budget_floor`, `needs_profile` columns.
- **Worker rate limiting:** D1-backed fixed-window counter in `rate_limits` table. Keyed `<endpoint>:<userId>:<window-start-epoch>`. Per-endpoint caps: 30/min for food-fact, 6/min for meal-plan, 12/min for photo-food + photo-recipe. Fails OPEN (any D1 error → allow). ~2% probabilistic sweep of expired buckets per request.
- **Image uploads to AI endpoints downscale client-side first.** `createImageBitmap` → canvas resize to 1024px max dim → JPEG @ 0.82. Falls back to original blob on error. Workers AI request stays well under the 6 MB byte cap and the call returns faster.
- **Recipe scan + photo logging never auto-save.** Both open a review surface (MealEditor pre-filled for scan; PhotoFoodStep confirmation list for photo log) and the user explicitly saves.
- **MealEditor `notes` is a `<textarea>`**, not a `LabeledInput`. Recipe-scan imports the method into notes joined as `1. ... 2. ...` - needs multi-line.
- **No co-author / "Generated with Claude" footers on commits.** Hard rule (universal preference; reinforced here in case it's read in isolation).
- **No em-dashes in any text the project writes** (UI copy, prompts, comments, doc). Use hyphens. Universal rule.
- **`untracked_dates` JSON column on `profile`** rather than a new synced table for the per-day untracked marker. Simpler; profile syncs already.
- **The weekly budget neutralises an un-logged day** by treating consumption == daily goal (mathematically same as removing the day from the budget). Optional explicit "Mark untracked" toggle in the diary `⋮` menu for partial-log days.
- **Curated common foods** are bundled in `db/curatedFoods.ts` and seeded into the user's foods table on startup (version-marker gated in localStorage). Each has a stable id `curated:<slug>`.
- **Weights are kg in storage; UI converts at display time** via `profile.units` ('metric' / 'imperial'). Same for serving sizes.
- **`pruneStaleSearchCache`** runs at boot to drop cached OFF / USDA foods older than 60 days that aren't referenced by any diary entry or saved meal. Custom + curated never pruned.
- **The pet feature is intentionally not optional.** It IS the user's daily-check-in motivator; removing it would gut the app.
- **Meal list ordering + search live in pure helpers in `mealMath.ts`.** `compareMealsForList` (favourites first, then newest-updated) and `matchesMealQuery` (tokenised AND over a name+notes+ingredients haystack) are unit-tested and shared by `MealsLibrary` + `MealPicker`. `useMealsWithTotals` builds the per-meal `haystack` and applies the sort, so both surfaces stay consistent. Add new meal-list filters/sorts here, not inline in the components.
- **Two pet axes: fullness (moment-to-moment) and wellbeing (long-arc 0-100).** Fullness is derived from today's kcal vs goal in `fullnessState`; over-goal bands are full (+0-5%), stuffed (+5-12%), too_stuffed (+12-25%), overeaten (+25%+). Skeleton is a separate neglect axis (3+ days no logging, `SKELETON_DAYS` in `petLogic.ts`) and is a hard override - it beats sleep, greeting and the low-wellbeing sad pose. Pose priority in `dogPose`: reaction > justAte > skeleton > greeting > sleep (11pm-4am) > sad (wellbeing < 25, unless a fed state) > happy (content + thriving) > fullness.
- **Pet reactions go through the `petReaction` store, not component state.** `pulseReaction(pose, holdMs, delayMs)` is fired from data-mutation sites (`createDiaryEntry`/`copyDayEntries` -> eating; `RenamePetSheet` -> love) and from `useDogState` fullness-transition detection (happy on reaching goal, surprised on overeating, both delayed past the eating beat). `useDogState` reads the store and feeds it to `dogPose` as the top transient. Only today-dated logs pulse eating (past back-fills don't). Keep the eating-beat duration (`EAT_BEAT_MS`, 2800) in step between `diary.ts` and `useDogState.ts` - they intentionally duplicate the constant to avoid an import cycle (diary repo <-> pet feature).
- **Dog art pipeline: drop a master PNG in `src/assets/pet/raw/`, run `python3 scripts/process-pet-art.py`** (rembg background-removal + autocrop + 640px webp). Don't hand-place webps. Then add the import + `POSE_SRC` entry in `Dog.tsx`, the union member in `petLogic.ts`'s `DogPose`, a status line in `dogStatusLine`, and (if it should rest rather than roam) add it to `RESTFUL` in `DogPlayground.tsx` and `ALL_POSES` in `devPose.ts`.
- **Dev-only pet pose override.** `window.__dog` console helpers + an on-screen `DevPosePanel` (Pet page) force any pose for testing. Gated everywhere by `import.meta.env.DEV` (override honoured only in dev in `useDogState`; console installed via a dev-gated dynamic import in `main.tsx`; panel self-guards). Confirmed absent from prod bundles by grepping `dist/`.

## Project-specific gotchas

- **Don't make DiaryEntry's `fiber` / `sugar` / `sodium` required.** They're optional (`?` in TS, nullable in D1). Pre-feature synced rows lack them; `sumTotals` and similar reducers use `?? 0`. **DayTotals / ResolvedMacros, on the other hand, ARE required** - TS catches every literal site so no math path can silently NaN.
- **ZXing's barcode `decodeFromVideoDevice` callback fires every frame.** Without a one-shot `fired` guard it can run 20+ times per scan, drains the OFF rate-limit bucket (15/min) in one go, makes follow-up scans fail through to manual entry. The `controls?.stop()` line no-ops when controls is still null because `await reader.decodeFromVideoDevice(...)` hasn't resolved yet. Pattern: `let fired = false; ... if (cancelled || fired) return; ... fired = true; controls?.stop(); onCode(code);`.
- **Open Food Facts product names often omit the brand** (in a separate `brand` field). "Heinz Light Mayonnaise" → stored name "Light Mayonnaise". The ingredient matcher MUST be tolerant of the query having extra brand words the stored name lacks (handled in `localMatchScore` via recall-weighted scoring).
- **The Cloudflare `wrangler deploy` is blocked by the Claude Code auto-mode classifier** even when the user approved it via `AskUserQuestion`. Workaround: ask for explicit in-chat confirmation, OR have the user paste the command themselves. (Once typed in chat, it runs.)
- **`bash -ic 'for c in ...; do <cmd> "$c"; done'`** under `wsl -d Ubuntu -- bash -ic` does NOT expand `$c` reliably (the inner double-quotes confuse the outer single-quoted bash -ic). Run each ALTER as a separate explicit command, OR use `&&` chains, OR drop into a heredoc.
- **`createImageBitmap` may not exist or may throw** in some browsers / contexts. `downscaleImage` in `src/features/photo-log/photoLog.ts` wraps it in try/catch and returns the original blob on failure.
- **The worker's `Env` interface lists `DB`, `ASSETS`, `AI`.** Don't try to read `process.env.X` in worker code - there's no Node env. Add to `Env` + wrangler.jsonc bindings instead.
- **Worker AI ratelimit binding (`[[unsafe.bindings]]`) is finicky.** This project uses a D1-backed limiter (`rate_limits` table) instead. Faster to ship, no wrangler-config dance, and trivially fails-open.
- **`prompt=select_account` on Google OAuth doesn't solve the multi-account problem on phones** where only the wrong account is signed into the browser. Added a `login_hint` field in Settings → Health sync (saved in localStorage, passed as `login_hint=<email>`). User also has to add the Fitbit-linked Google account as a **Test User** in Google Cloud Console (OAuth consent screen) if the OAuth app is in Testing mode.
- **OFF API `User-Agent` header gets silently dropped** by browsers (forbidden header name). Doesn't break the lookup (anonymous works) but the header is non-functional regardless of what's set.
- **wrangler-deploy uploads whatever's in `dist/`.** Always `npm run build` before deploy after any client change, or you ship stale assets even though the worker bumps.
- **Dexie EntityTable union types break a generic `put`** when iterating `[db.tableA, db.tableB] as const` and calling `table.put(row)` - TS demands the intersection type. Unroll the loop into per-table blocks (see `userMigration.ts`).
- **Don't bump Dexie version for additive fields** - only for new tables or new indexes. Current schema is v3 (added `pet` table). Adding `favorite`, `image_url`, `fiber_100`, etc. to existing tables didn't need a version bump.
- **The OnboardingWizard's `Draft` interface needs every profile field referenced**, including newer ones like `petName`. TS will catch missing ones.
- **`useFoodSearch`'s emptyState useLiveQuery doesn't depend on the query**; it's separate from the query-time `local`/`usda`/`off` arrays. When introducing a new "Recently used" group during a query, both pieces of data are needed (emptyState gives the recent id set; query results provide the matching foods).
- **The bundled USDA key (`cP45kucaUCY1TsM8twp7BndJVnVWBbTeoOGy0Xbp`) is in the client bundle by design.** It's a known public free-tier key. Per audit, accepted trade-off. The user can override via their own key in Settings.

## Credentials this project needs

Reference only (see `_dev_hub/credentials_reference.md` for the full table). All this project's credentials are either user-supplied at runtime via the Settings UI or bundled public-DB keys.

- **`VITE_USDA_API_KEY`** - bundled free-tier USDA FoodData Central key. Located in `vite.config.ts` env handling + hardcoded fallback in `src/lib/usda-api.ts` as `BUNDLED_USDA_KEY`. Public DB; accepted in bundle.
- **`VITE_OFF_APP_NAME` / `VITE_OFF_APP_VERSION`** - Open Food Facts User-Agent string. Public.
- **`VITE_FITBIT_CLIENT_ID` / `VITE_GOOGLE_CLIENT_SECRET`** - optional bundled fallbacks for the Google OAuth app used by Health sync. In practice the user enters their own in Settings → Health sync (stored in localStorage per device).
- **Google OAuth tokens** - stored synced in `fitbit_tokens` D1 table, plaintext at rest. Per-user via the sync model.
- **Sync codes** - user-generated per device (or user-typed if they have one). Stored in localStorage `calorie-tracker:sync:token`. Each code IS one account.
- **Cloudflare Workers AI / D1** - native bindings (`env.AI`, `env.DB`). No keys.
- **`SYNC_TOKEN` secret** - removed in Band A. Don't re-introduce.

No keys in commits, no `.env` files committed.

## Where the tests live + how they work

Vitest. Tests colocate with source as `*.test.ts`. Current set (100 tests, 9 files):

- `src/lib/units.test.ts` - kg ↔ lb, cm ↔ in, etc.
- `src/lib/tdee.test.ts` - Mifflin-St Jeor + activity multipliers.
- `src/lib/macros.test.ts` - formatKcal, pct, macroValue, macroTarget, effectiveKcalTarget.
- `src/features/food-search/foodMath.test.ts` - computeMacros across quantity modes.
- `src/features/meals/mealMath.test.ts` - computeMealTotals, multiplyTotals, getServings, perServingTotals, formatServings.
- `src/features/pet/wellbeing.test.ts` - rollWellbeing scoring.
- `src/features/pet/petLogic.test.ts` - fullnessState + dogPose decisions.
- `src/features/fitbit/activityCalories.test.ts` - Fitbit total → activity-only kcal subtraction.
- `src/features/weekly-budget/weeklyBudget.test.ts` - weekDates, weekStartFor, effectiveDailyKcal (with untracked).

Run: `npm run test`. No coverage threshold. No e2e (Playwright deliberately not added; private app, small surface).

Pattern: most tested code is pure (`mealMath`, `weeklyBudget`, etc.). Hooks and Dexie / Cloudflare-AI interactions are not unit-tested - verified by use and by curl-testing endpoints live.

## Current state

Production; live and in daily multi-user use. Head `0ef5f7f`, deployed Version `5c40a674`. Nothing actively in progress as of 2026-06-07. The dated story of every shipped feature is in `docs/EVOLUTION.md`; do not re-narrate it here.

Shipped this session (2026-05-30 -> 06-07): monthly budget mode + opt-in carry-over; diary meal/food thumbnails + filter-chip scrollbar fix; Fitbit exercise overhaul (per-session detail lines, friendly names from `exercise.exerciseType`, rename-sticks via `name_locked`, steps as a header stat, no double-count); multi-category meals + custom categories; meal-picker category filters; manual food creation (Foods library "New food"); nutrition-label scanner (`/api/photo-label`); named quick-adds.

Open follow-ups (actionable):
- Food-facts toggle is device-local (localStorage) vs other prefs which sync - intentional but inconsistent.
- Real-world phone testing of the label scanner across varied label layouts (tables / inline / paragraph) would harden it.
- Meal photo could also show in `LogMealSheet` / `MealPicker` (currently editor + library only).
- Fitbit OAuth uses ~7-day testing-mode tokens (weekly reconnect). Moving the Google OAuth app to "In production" would issue long-lived refresh tokens.
- README is partly stale (still documents the retired single `SYNC_TOKEN` bearer model). See `docs/ARCHITECTURE.md` open questions.

## Operational notes for a fresh session

- All commands run in WSL: `wsl -d Ubuntu -- bash -ic 'cd ~/projects_/calorie-tracker && <cmd>'`. Verify with `npm run typecheck && npm run lint && npm run test && npm run build` (165 tests as of 06-07).
- Ship loop: D1 `ALTER` first (one column at a time, on remote) -> commit -> `git push origin main` -> `npx wrangler deploy`. GitHub remote is `TamaraSovcikova/calorie-tracker`.
- `wrangler` OAuth expires periodically: a transient `7403` is fixed by `npx wrangler whoami`; a full "not authorized" / hidden-account error needs `npx wrangler login` (interactive). Account id `b850f64ada89773f5f065a2aa638251c`.
- Commit messages: no AI co-author, no em-dashes. Heredoc via `git commit -F -` (the `$(cat <<EOF)` form breaks under `bash -ic`).

## Open questions for Tamara

- Reconcile the stale README with the per-user-sync-code reality, or leave it as a historical snapshot?
