# Calorie Tracker — Production Audit & Action Plan

Full review of the app after the core build. Items are grouped by priority.
Tackle P1 → P2 → P3, then hardening/cleanup. Check items off as done.

---

## P1 — Critical: data loss / broken core features

- [ ] **Fitbit tokens never sync.** `src/db/sync/client.ts` `TABLES` omits
  `fitbit_tokens`, though the worker, D1 schema and `FitbitTokens` type all
  support it. "Connect once, works on every device" silently does nothing.
  → Add `fitbit_tokens` to the client `TABLES` array + `collectPush` /
  `applyPull`.

- [ ] **Editing a saved meal corrupts it on sync.** `replaceMealItems`
  hard-deletes old `meal_items` and creates new UUIDs; the sync layer only
  ever `bulkPut`s items and has no tombstone. Result: deleted items get
  re-pulled forever, and an edited meal accumulates every ingredient it ever
  had. → Give `meal_items` soft-delete, OR have the worker delete items not
  in the pushed set for a changed meal.

- [ ] **Weight-log sync crashes on a same-date conflict.** Dexie keys
  `weight_log` by uuid; D1 has `UNIQUE(user_id, date)`. Logging the same date
  on two devices offline → on sync the second INSERT violates the unique
  index and aborts the whole `db.batch()` with a 500. → Derive a
  deterministic id from `user_id+date` for weight rows, or make the upsert
  conflict-target `(user_id, date)`.

- [ ] **Cloud sync has never run against a real backend.** No D1 database
  exists, `wrangler.jsonc` still has `REPLACE_WITH_D1_DATABASE_ID`, wrangler
  was never logged in. Everything above is theoretical until Phase 15 is
  done and one full laptop↔phone sync is verified.

---

## P2 — Real bugs (visible misbehaviour)

- [ ] **Barcode scanner camera restarts on every render.** `AddFoodSheet`'s
  `handleBarcode` is a fresh closure each render and is in `BarcodeScanner`'s
  effect deps → camera stream torn down + re-acquired, causing flicker.
  → `useCallback` the handler, or hold it in a ref inside the scanner.

- [ ] **Sync cursor can skip rows if a page is truncated.** `pullSince` has
  no `LIMIT` and orders by `updated_at`; if D1 ever caps a result page the
  client advances its cursor past un-pulled rows = permanent miss. Unlikely
  at personal scale but should be a paged loop or at minimum a guard.

- [ ] **Worker `handleSync` is not transactional.** Pushes then pulls run in
  separate non-atomic loops; a mid-loop failure leaves a partial apply with
  no rollback.

- [ ] **Exercise edit sheet flashes blank.** `ExerciseSection` mounts two
  `ExerciseSheet`s; the edit one stays mounted and briefly shows an empty
  "Edit exercise" during the close transition. → Render one sheet keyed by
  mode.

---

## P3 — Confusing UX & forgotten features

- [ ] **No "copy to another day" for diary entries or whole days.** This was
  a confirmed feature in the original plan and is entirely missing — diary
  rows only support edit/delete. → Add a "copy to date" action (long-press
  or row menu) for a single entry and for a whole day.

- [ ] **Can't edit an ingredient's quantity in a saved meal.** `MealEditor`'s
  ingredient rows only support remove; to change an amount you must delete
  and re-add. → Make the ingredient row tappable to re-open the quantity
  step.

- [ ] **"Back" from the quantity step always returns to the Search tab.** If
  the food was picked from Scan or Meals, Back dumps the user on Search.
  → Remember and restore the originating tab.

- [ ] **Diary has no loading state.** While `useDiaryDay` is loading, the day
  renders as fully empty (zeros + "No entries yet") — indistinguishable from
  a real empty day; brief fake-empty flash on every date change. → Show a
  subtle skeleton/spinner while `entries === undefined`.

- [ ] **eat-back-burned default mismatch on the existing profile.** The
  profile created during early testing still has `eat_back_burned: true`
  (the old default); new profiles default `false`. Not a code bug — just
  toggle it once in Settings → Goals, or leave as preferred.

---

## P4 — Stale content (quick fixes)

- [ ] `AboutSection.tsx` — still says "Cloud sync — Coming in Phase 11" and
  "Fitbit — Coming in Phase 12"; both shipped. → Replace with live status or
  remove.
- [ ] `DataSection.tsx` — "your data never leaves the device until cloud
  sync (Phase 11)"; cloud sync exists now. → Reword.
- [ ] `ExerciseSheet.tsx` — "Fitbit auto-sync arrives in Phase 12 — until
  then enter the burn yourself"; auto-sync is live. → Reword.
- [ ] `.env.example` + `src/vite-env.d.ts` — still declare `VITE_SUPABASE_URL`
  / `VITE_SUPABASE_ANON_KEY`; the app dropped Supabase for Cloudflare. → Remove.
- [ ] `~/.claude/plans/*.md` — stale planning notes referencing Supabase
  (not app code; ignore or delete).

---

## P5 — Production hardening

- [ ] **No React error boundary.** Any thrown render error = white screen,
  no recovery. → Add a top-level `ErrorBoundary` around `<Routes>` with a
  "reload" fallback.

- [ ] **ESLint is fully broken — 68 errors, all config noise.**
  `eslint.config.js` has a hand-rolled `globals` list missing most browser
  globals (`crypto`, `URLSearchParams`, `Response`, `AbortSignal`, …) and no
  worker-types globals (`D1Database`, `Fetcher`). `pnpm lint` fails entirely
  on false positives. → Use the `globals` package (`globals.browser` +
  `globals.serviceworker`/worker types), scope the worker dir separately.
  No real lint coverage exists until this is fixed.

- [ ] **No automated tests.** Pure logic that would benefit from unit tests:
  `tdee.ts`, `macros.ts`, `foodMath.ts`, `mealMath.ts`,
  `activityCalories.ts`, `streak.ts`, the sync `collectPush`/`applyPull`.
  → Add Vitest + a focused unit-test suite for the math/sync helpers.

- [ ] **Service worker only runtime-caches Open Food Facts.** USDA
  (`api.nal.usda.gov`) and the `/gh-api` proxy aren't cached. Curated foods
  are local so offline search of staples works, but USDA results don't.
  → Add USDA to the Workbox runtimeCaching (StaleWhileRevalidate).

- [ ] **`Sheet` has no focus trap / focus restore.** Keyboard + screen-reader
  users can tab into the page behind an open sheet. → Add a minimal focus
  trap + restore focus to the trigger on close.

- [ ] **Sync errors are near-silent.** A bad token just sets an internal
  `status: 'error'`; `install.ts` swallows it. → Surface a visible "sync
  failed — check token" banner.

- [ ] **Run a Lighthouse PWA audit** once deployed; target ≥90 PWA +
  Performance. Generate proper maskable icons if it flags any.

---

## P6 — Cleanup / dead code

- [ ] Delete the feature-flag scaffolding — `features/feature-flags/`
  (`featureFlags.ts`, `useFeature.ts`, `PremiumLock.tsx`) is unused; a Pro
  tier makes no sense for a personal local-first app.
- [ ] Remove unused exports: `offIdFromBarcode`, `newLocalFoodId` (×2),
  `usdaIdFromFdcId`, and the dormant `fetchUsdaFoodPortions` /
  `enrichUsdaFoodWithPortions` in `usda-api.ts` (USDA detail endpoints 404).
- [ ] `CreateFoodInput.source` only allows `'off' | 'custom'` but `Food.source`
  has `'usda' | 'curated'` too — tidy the type or document why.
- [ ] Unbounded cache growth — `useFoodSearch` `bulkPut`s every OFF/USDA hit
  forever; no eviction. → Periodic prune of `source='off'|'usda'` rows not
  referenced by any diary entry and older than ~60 days.
- [ ] `recentFoodsInSection` uses `'0000-00-00'`/`'9999-99-99'` sentinel
  bounds — works (string compare) but add a comment so it's not mistaken
  for a bug.
- [ ] Rename the lingering `fitbit_user_id` field — data now flows via
  Google Health, not the Fitbit API (cosmetic).

---

## Phase 15 — Cloudflare deploy (the big outstanding milestone)

Still not done; unlocks permanent HTTPS, real cloud sync, and phone-side
Fitbit OAuth. Needs Tamara to run `wrangler login`, then:
`wrangler d1 create` → paste the id into `wrangler.jsonc` →
`wrangler d1 execute … --file worker/schema.sql` →
`wrangler secret put SYNC_TOKEN` → `pnpm build && wrangler deploy`.
The P1 sync bugs should be fixed *before* relying on sync in anger.

---

## Suggested order of attack

1. **P4 stale text + P6 dead code** — fast, low-risk, clears noise.
2. **P5 eslint fix** — restores real lint coverage to catch regressions.
3. **P2 barcode + exercise-sheet bugs** — quick, visible.
4. **P1 sync bugs** (fitbit_tokens, meal_items, weight_log) — before deploy.
5. **Phase 15 deploy** — then verify one real laptop↔phone sync.
6. **P3 UX** (copy-to-day, ingredient edit, tab restore, loading state).
7. **P5 error boundary, tests, SW caching, focus trap.**
