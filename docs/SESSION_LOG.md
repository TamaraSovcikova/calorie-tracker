# Session Log

Handover log for calorie_tracker (Verve). Newest entry on top.

How to use:
- Start of session: read only the top entry, announce the chat number.
- End of session: prepend a new entry, bump `Session count`.

Session count: 6
Last updated: 2026-08-13

---

## Chat #4d - 2026-08-13 (recipe-scan ingredient matching rebuilt; deployed)

Triggered by a scanned stuffed-pepper recipe reading ~3,600 kcal against the
recipe's own 1,324, with an ingredient called "Pepp" at 464 kcal/100g. Three
independent causes, all now fixed and tested.

- **The scoring bug (root cause).** `localMatchScore` measured quality as
  `shared / foodNameWords.length` - coverage of the FOOD's name, not the
  query's. A food called `Pepp` scored **1.0** against "peppers" because its
  single word matched, while the curated `Peppers, sweet, red, raw` scored
  **0.25** and was rejected outright by the 0.6 floor. Terse junk names beat
  accurate descriptive ones structurally. That one line explains `Pepp`,
  `BEEF` and `BLACK BEANS` all three. Matching now lives in
  `src/features/food-search/ingredientMatch.ts`, measures coverage against the
  QUERY, and penalises extra food-name words mildly instead of disqualifying.
  Prefix matching additionally requires the shorter word to cover 70% of the
  longer, so `pepper`/`peppers` matches and `pepp`/`peppers` does not.
- **Dry vs cooked (~700 kcal of the error on one ingredient).** Dry black
  beans are 341 kcal/100g, cooked 132, and the scan applied dry macros to a
  cooked weight. Prep-state words are extracted from both sides and mismatches
  penalised. The worker prompt keeps state IN the ingredient name and prefers
  the cooked weight when a recipe gives both.
- **Counts flattened.** "4 large peppers" -> 400g. Worker prompt now carries
  realistic per-item weights and is told not to round to flat numbers.
- **Tiering (the feature Tamara actually asked for).** Candidates are ranked
  `frequent > recent > custom > curated > library > external`, weighted into
  the score, so a mince logged weekly beats a generic entry with the same
  name. Uses the existing decay-weighted `frequentFoods`.
  `lookupIngredientFood` is now a thin wrapper over `rankIngredientCandidates`,
  so the AI meal planner and the photo food log inherit all of it.
- **The review step.** The scan used to resolve everything and go straight to
  the meal editor, so a wrong match arrived looking like a real ingredient. It
  now stops at a review screen: each ingredient, what it resolved to, which
  tier that came from, and its kcal for the scanned amount. Anything not
  confidently matched is flagged. Tapping a row opens the candidates the
  matcher was choosing between.
- Resolving no longer creates a zero-macro custom food as a side effect of
  LOOKING - that littered the library with stubs from abandoned scans. Foods
  are created at commit time only.

### Gaps found reviewing the above, then fixed

- **The contrast guard from #4c had a hole.** It only checked text on PAGE
  backgrounds. Behind that sat white-on-amber at **2.83:1** - the label on
  every Add, Save and Log button. Chose option B: keep the amber, take a
  near-black label (6.24:1), which is what dark mode was already doing.
  Destructive went the other way, deepening the fill so it keeps the
  conventional white-on-red read (3.45 -> 5.44 light, 3.73 -> 4.90 dark).
  `--color-accent-deep` was a hair under at 4.48:1 and carries the active nav
  label: `#8C6A30` -> `#866430`, 4.87:1. **Filled surfaces are now in the
  enforced list; 22 pairs across both themes.**
- **Nested sheets.** `Sheet` binds Escape and the Tab trap to `window`, so
  with the new candidate picker open inside the recipe review BOTH fired and
  one Escape closed the picker AND the review under it. Sheets now keep a
  stack; only the topmost reacts.
- **Fresh installs were all warnings.** `isConfident` required a personal
  tier, so a user with no logging history could never have a confident match
  and a 12-ingredient recipe opened as 12 flags. With no history a strong
  CURATED match is accepted; `external` (USDA / shared pool) is still never
  confident.
- Photo log was the only AI path not calling `resetPlannerCaches()`, so
  logging a food then photo-logging in the same session used a stale library.

### The tests found a live bug - worth remembering

Extracting `resolveTier` / `rankLibraryCandidates` as pure functions (the
tiering was an inline closure inside a Dexie call, so it had zero coverage)
and writing 18 cases immediately failed one: a shared-pool `BEEF MINCE` beat
the curated `Beef mince, cooked` **by 0.01**, because the curated entry's
descriptive name paid a 0.06 extra-word penalty while the tier gap only gave
back 0.05. `curated` 0.15 -> 0.25, `library` 0.10 -> 0.08. `custom` stays
above `curated` deliberately: the user's own label scan should beat a built-in.
The suite now contains reproductions of both original bugs.

### Also

- Photo log can now CORRECT a match, not just include/exclude it - it writes
  straight to the diary and was the path with the least oversight. Blank-food
  is deliberately NOT offered there (no later editor to fill it in; it would
  log zero calories silently).
- Amounts are editable in the candidate sheet, so a wrong quantity is fixed
  where it is visible rather than on a later screen.
- Picker shared between recipe review and photo log; `TIER_LABEL` moved next
  to the tiers it describes.

- **State:** deployed, Version `45d6c651`. Commits `0c741fe` (matching +
  review), `cf36452` (contrast, sheets, confidence), `7c9344c` (tests, photo
  correction, amounts). **287 tests**, up from 237 at the start of the chat.
  Typecheck + build clean, lint back to the 2 pre-existing issues. **No schema
  change in this chat.**
- **Next - all device work, none of it verified by eye:** re-scan the same
  stuffed-pepper recipe and read the review screen; it now shows what was
  chosen per row and what it was choosing between, which is the only way to
  tell whether the tiering behaves against a real library rather than test
  fixtures. Also unverified on hardware: the near-black primary button (the
  most visible change of the day), four labels in the nav bar on a narrow
  phone, the rebuilt Progress page, and the live camera from #4.

## Chat #4c - 2026-08-13 (whole-app design review + the entire task list; deployed)

Ran `/plan-design-review` scoped to the whole app, from the code. Output is
`DESIGN_REVIEW.md` (scores, findings, method) and `DESIGN.md` (the system,
which had never been written down). Then built every task in it.

- **Scores:** overall 6/10 -> 9/10. Info arch 5->9, states 6->9, journey 6->9,
  AI-slop 8->8 (no change needed - passes all 7 hard rejections and all 11
  blacklist patterns, no gradients anywhere, real typeface), design system
  4->9, responsive/a11y 3->9.
- **The big finding was arithmetic, not taste.** Five token/theme pairs failed
  WCAG AA for body text, worst `--color-text-faint` at **1.91:1** (floor 4.5:1)
  - and that token carried the macro labels, the date eyebrow, the arc scale
  numbers and the inactive nav icons. `--muted-foreground`, the most-used
  secondary colour in the app, was 3.79:1. Retuned all of them in both themes.
- **`src/lib/contrast.ts` + `contrast.test.ts` is the durable part.** WCAG
  relative luminance and ratio, plus a guard that parses the REAL token values
  out of `index.css` (not a copy) and fails the build below 4.5:1 for 12
  text-on-background pairs per theme. Verified by regression before trusting
  it. It caught a live mistake the same session: the first `--over` value I
  picked failed at 3.58:1 and had to be darkened.
- **Nav had no names.** `NAV_ITEMS` declared `label` for all four entries and
  `Layout` destructured `{ to, icon }`, dropping it. Four unlabelled icons (a
  book for Today beside a book for Library) and no `aria-label`, so a screen
  reader announced the href. One line, fixed both the visual and the
  accessible name.
- **AI features failed after the effort, not before it.** Label scan, photo
  log, recipe scan and the planner all need a sync code and none checked. A
  new user could open the camera, grant permission, frame a label, shoot, wait
  for the upload, then be told it was never available. New
  `aiAvailability.ts` + `AiFeatureGate.tsx`; entry points stay visible (still
  discoverable) but explain in place. NOTE: the live-capture overlay shipped
  in #4 made this failure much more expensive than the old file picker did.
- **IA:** `WeeklyBudgetCard` lived on `/pet`, which has no nav entry - the only
  explanation of carry-over, trim cap and balance was behind a tap on the dog's
  caption. Moved to Progress, which is rebuilt into three labelled horizons
  (Right now / Recent days / Over time). Diary balance pill repoints there.
- **`--over` token.** Going over your target rendered in `--destructive`, same
  as delete and sync failure - directly contradicting Warn mode, whose premise
  is that over-days are expected information. Now its own token, shared by the
  arc and the balance pill.
- **Consolidation:** three segmented controls (only one had ARIA) -> one
  `ui/SegmentedControl` with `track`/`solid` variants and `onDeselect`;
  `ui/Tabs` deleted, six call sites migrated. Chart range pickers were a
  fourth near-duplicate -> `ui/RangePills`. Type scale (`text-display`,
  `text-title`, `text-eyebrow`) replaces `fontSize: 26` / `0.18em`
  hand-written in two files. `PageHeader` gained `eyebrow` + `display`
  variant.
- **Bug found in passing:** `tailwind.config.ts` had `fontFamily.sans` starting
  at `system-ui` with Hanken Grotesk absent, so any `font-sans` utility
  silently fell back to system UI. Fixed.
- **Two corrections worth remembering.** (1) The T12 finding ("nutrition locked
  to 7 days") was inherited from `UX_AUDIT.md` §7.1 and was WRONG - the summary
  already had a 7/14/30 toggle. I took a stale doc's claim without checking.
  Real gap was span, so 90D added. (2) `UX_AUDIT.md` as a whole is stale; most
  of its P0/P1 band shipped long ago. Don't trust it without re-checking.
- **Also:** tap targets on every nav item + 4 controls that missed 44px
  (three of which I had added in #4), first-run `CoachTip` on an empty diary,
  visible grip on swipe-to-copy rows, macros mark themselves on hitting target.
- **Deferred deliberately:** desktop/tablet layout (`max-w-md` stands) and the
  onboarding cut/maintain/gain step. Product decisions, not design debt.
- **State:** deployed, Version `4571e1ad`, commits `f132d99` (P1) and
  `88100ae` (P2/P3). 237 tests (was 184 this morning), typecheck + build clean,
  lint back to the 2 pre-existing issues. **No schema change in this chat.**
- **Tooling gap on this machine:** `bun` and `jq` are both missing, so
  `gstack-review-log`, `gstack-learnings-log` and the tasks JSONL artifact all
  fail. Review entry written directly to
  `~/.gstack/projects/calorie-tracker/main-reviews.jsonl` instead. Also
  `SendUserFile` cannot take a `\\wsl.localhost\...` UNC path.
- **Next:** everything left is device work. The contrast retune needs a real
  look in daylight (it will read less airy - that is the tradeoff, and a
  darker canvas is the lever if you hate it); four labels in the nav bar may
  be cramped on the Pixel; Progress has never been seen with its new
  three-section structure; the live camera from #4 is still untested on
  hardware.

## Chat #4b - 2026-08-13 (warn-mode paydown rate; deployed)

- Did: `budget_warn_catchup` (kcal/day). In `'warn'` mode the target never moved, so there was no way to actually clear a balance short of eating under by eye. Set a rate and that much comes off the daily target while the balance is in the red. New pure `catchupTrim(rate, balance)` takes the LESSER of the rate and what is owed, so it cannot overshoot into a fresh surplus (150/day against 40 outstanding takes 40), and returns 0 as soon as the balance is level or banked. Field shows only under `mode === 'warn'`; `WeeklyBudgetCard` explains the lowered target when it applies. `WeeklyBudget.catchupApplied` carries it for display.
- D1: `ALTER TABLE profiles ADD COLUMN budget_warn_catchup REAL` applied to the remote DB BEFORE deploy, then the full 33-column `SELECT` from `worker/sync.ts` COLUMNS smoke-tested green against live (2 rows).
- State: deployed. 203/203 tests, typecheck + build + eslint clean.

## Chat #4 - 2026-08-13 (six-feature batch: jump-to-today, live label capture, curated foods, weight view-all, budget mode rework, meal-editor jump; deployed)

- Did (written up before deploying; shipped later the same session as commit `cf003b2`, Version `b8c720c7`, after the D1 migration below):
  - **Jump to today.** `DiaryPage` header: a "Jump to today" pill appears under the date whenever the day is not today. Removed the now-redundant "Go to today" overflow-menu item. The date title and the pill are siblings in a flex-col (nested buttons would be invalid).
  - **Live nutrition-label capture.** New `src/features/food-search/LabelCaptureOverlay.tsx`: getUserMedia video preview + canvas-grab shutter, with a Gallery button beside it. Replaces the bare `<input type=file>` at BOTH call sites - the Scan tab's "No barcode? Scan a nutrition label instead" (`AddFoodSheet`) and the new-product form (`ManualEntryForm`, which is where a failed barcode lands). Reason for owning the stream rather than `<input capture>`: the OS hand-off silently falls back to the gallery picker on some Android builds. Portalled to `document.body` and `z-[120]` because both call sites sit inside a `Sheet`, whose `animate-slide-up` transform becomes the containing block for `position: fixed`. Escape is handled in the capture phase so it closes the camera, not the sheet. `analyzeLabel` now downscales to 1600px (was the photo-log default 1024) - label fine print was losing digits.
  - **Curated foods +83.** `curatedFoods.ts` gained 35 vegetables, 23 fruits, 25 breads (UK/EU-first: swede, celeriac, tenderstem, sourdough, granary, soda bread, crispbread, sandwich thins, chapati...). `CURATED_VERSION` 2 -> 3, so installed apps re-seed on next load.
  - **Weight log "View all".** `WeightLogSection` shows 5 by default with a `View all (n)` / `Show less` toggle; expanded list is `max-h-80 overflow-y-auto` so a long history scrolls inside the card.
  - **Budget rework** (the big one). Three-way mode replaces the on/off switch: `budget_mode: 'off' | 'warn' | 'adjust'`.
    - `'warn'` = the daily target NEVER moves. Days over the goal read as over (the ArcGauge already had a "KCAL OVER" state), and the running balance is shown on its own - a pill under the diary arc and a line on the `WeeklyBudgetCard` - so evening it out is the user's call.
    - Carry-over is now a DATE WINDOW (`budget_carryover_start`), not "the previous period". This also fixes a real defect: the old one-period-back read meant a period that had been trimmed to pay off a deficit later read as a fresh surplus and REFUNDED the very overage it just paid. Accumulating day by day from a fixed start date settles instead of oscillating. Walk is capped at `MAX_CARRYOVER_DAYS` (1096) so a start date left untouched for years can't turn every render into a huge scan.
    - `budget_max_daily_trim` (absolute kcal) replaces the 70% `weekly_budget_floor`. The floor is still honoured as a fallback when the new field was never set; an explicit `0` retires it for that profile.
    - `ensureProfile` now runs `legacyBudgetPatch` once: old boolean -> mode, old carry-over boolean -> a start date 14 days back (deliberately not further - the old switch reached back exactly one period, so anything longer would pull in history never opted into).
  - **Meal-entry -> meal editor.** `LogMealStep` gained `onEditRecipe` (renders "Edit this meal's ingredients" under the meal name) and `notice`. `EditEntrySheet`'s meal branch wires it to `/meals/:id/edit`, and shows a notice when the stored entry kcal no longer matches the recipe (hitting Save recomputes).
- State (at time of writing, superseded): built and tested but not yet committed. Shipped later the same session. `npm run typecheck`, `npm run build`, `npx eslint src worker` all clean (the 2 remaining lint hits - `portionSuggestions.ts` control regex, `Dog.tsx` fast-refresh - are pre-existing). 198/198 tests pass (was 184; +14 for `clampCarry`, `resolveBudgetMode`, `maxDailyTrimFor`, `datesBetween`).
- Next: **the D1 migration MUST run before `wrangler deploy`.** `worker/sync.ts` builds `INSERT INTO profiles (...)` straight from its COLUMNS list, so deploying the worker against an unmigrated D1 breaks profile sync for every user with "no such column". Three additive ALTERs, one at a time, documented at the bottom of the profiles block in `worker/schema.sql`: `budget_mode TEXT`, `budget_carryover_start TEXT`, `budget_max_daily_trim REAL`.
- Then device-test on the Pixel: live camera capture (the whole point of the change - confirm the shutter works and Gallery still offers the library), the balance pill under the arc in warn mode, and the re-seeded curated foods showing up in search.
- Open: everything from Chat #3 still stands (pantry planner build, PWA reinstall for the icon/shortcuts, pet reaction thresholds, rotate the Gemini key).

## Chat #3 - 2026-07-10 (pantry planner design + eng review; food-search fixes; deployed)

- Did:
  - Food-search batch (committed `387aada`, deployed Version f310569b):
    - Frequent foods now rank by a recency-weighted score, not raw lifetime count. `frequentFoods` in `src/db/repos/diary.ts`: each log contributes `0.5^(ageDays / FREQUENCY_HALF_LIFE_DAYS)` (half-life 14 days), summed per food, filtered by `FREQUENCY_MIN_SCORE` (1.5, ~two recent logs). Use that has stopped decays out; single recent logs fall to recents. Two tunable constants at the top of the function.
    - Scan tab offers "No barcode? Scan a nutrition label instead": `BarcodeScanner` gained an optional `onScanLabel` prop; `AddFoodSheet` owns the hidden file input + `handleLabelFile` (reuses `analyzeLabel`), then routes into the new-product form via a new `ManualEntryForm` `initialLabel` prop. Only shown in the Add-food Scan tab, not `IngredientPickerSheet`.
    - Any barcode lookup now adds the product to recents even if never logged. New additive Dexie table `food_recents` (schema v4, `&id, user_id, food_id, at`; `FoodRecent` type). `recordFoodSeen(foodId)` called in `AddFoodSheet.handleBarcode` (cached + OFF branches). `recentFoods` rewritten to merge logged foods (diary `created_at`) + scanned foods (`food_recents.at`) by latest timestamp. Reactive via useLiveQuery.
  - Pantry planner feature: ran `/office-hours` then `/plan-eng-review` (design only, NO code). Output: `pantry-planner-design.md` in the OneDrive project folder (`C:\Users\tamar\OneDrive\Documents\Workspace\Projects\calorie_tracker\`, NOT the WSL repo). Chosen approach B (canonical ingredient layer), phased. Key locked decision from the eng review: consumption is hybrid derived + cached (D2), NOT a mutable ledger, because decrement must cover all six diary write paths (create/update/soft-delete/restore/copyEntryToDate/copyDayEntries) and the copy paths bypass `createDiaryEntry`. Full locked schema + edge cases + tests in the doc's "Engineering Review" section.
- State: DEPLOYED to https://calorie-tracker.tamara-sovcik.workers.dev (Version f310569b). `main` at `387aada`, pushed, clean tree, 0 unpushed. `pnpm run build` clean, worker typecheck clean, 184/184 tests pass.
- Next:
  - Device-test the food-search batch on the Pixel: frequent-list decay (needs real history, give it a day or two; tune `FREQUENCY_HALF_LIFE_DAYS` / `FREQUENCY_MIN_SCORE` if it feels off), label-scan-in-Scan flow, scan-adds-to-recent.
  - Pantry planner is design-approved and ready to build. Phase 1 = `canonical_ingredients` (seed from USDA FDC foundation foods) + `pantry_items` + manual `/pantry` screen. Then Phase 3 (decrement, hybrid derived+cached) -> Phase 2 (receipt `analyzeReceipt`) -> Phase 4 (hybrid suggestions). New pure `pantryMath.ts` with the tests speced in the design doc.
  - Still outstanding from earlier: reinstall the PWA on the Pixel to pick up the new full-bleed app icon + the long-press Quick add / Scan shortcuts (stale WebAPK); feel-test + tune pet reaction thresholds on `/pet` (from Chat #2).
- Open:
  - Pet reaction thresholds unverified in-browser (from Chat #2).
  - (carry from Chat #1) Rotate the Gemini API key pasted in chat.
- Skills/conventions: pantry design doc lives in the OneDrive folder per that folder's CLAUDE.md ("spec docs and product artefacts go here"), not the WSL repo. From a Windows-cwd session, drive the WSL toolchain via `wsl.exe -d Ubuntu bash -s <<'EOF' ... EOF` (stdin heredoc dodges Git Bash MSYS arg-mangling) with `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.

---

## Chat #2 - 2026-07-10 (barcode photo import, app-icon fix, pet awareness; deployed)

- Did:
  - Barcode: photo/gallery import added to `BarcodeScanner.tsx` (decodes a still image via the same ZXing reader/hints, then the existing `lookupBarcode` pipeline). Lives in the shared component, so the Add-food Scan tab and `IngredientPickerSheet` both get it.
  - App icon: fixed the white-corner / floating-badge bug (icon looked like a square forced into a circle). Cause: `favicon.svg` art was a rounded badge scaled 1.5x past the canvas, and the generator padded on a light field. Now `public/favicon.svg` is full-bleed dark (rx=0, arc scale 1.1 inside the safe zone) and `pwa-assets.config.ts` is a custom preset filling padding with `#211D17` (apple padding 0, maskable 0.1). Regenerated all PNGs; verified the rendered Apple/maskable/any icons.
  - Pets: new `src/features/pet/petInteraction.ts` (`petMood`, `reactionFor`, `idleBeatFor`). `mood` (happy/content/needy/distressed) derived in `useDogState` and threaded into `DogPlayground` + `DraggableDogArc`. Fling -> `playful` (happy/content) or `sad`/cry (needy/distressed); 3 quick throws = bully -> `sad`; gentle tap -> `love`/`happy`; hard wall/floor crash -> `surprised` (throttled, suppressed on drop-in); idle beats now mood-weighted, not uniform random. Also fixed `DogHero` ignoring the chosen species.
  - Widget (quick-add shortcuts): NO code change. Shortcuts confirmed live in the deployed manifest; they weren't showing on the Pixel 9a because the installed WebAPK is stale (installed before shortcuts existed). Fix is device-side: uninstall + reinstall the PWA.
- State: DEPLOYED to https://calorie-tracker.tamara-sovcik.workers.dev (Version a4edbf68). COMMITTED + PUSHED on `main`: 81a2fd1 (barcode), b94f42f (icon), 6086bfa (pets), plus this log. `pnpm run build` clean, worker typecheck clean, 184/184 tests pass.
- Next:
  - Device QA on the Pixel: reinstall the PWA (gets the new full-bleed icon AND the long-press Quick add / Scan shortcuts); test barcode photo-import (Add food -> Scan -> Import a barcode photo).
  - Feel-test pet reactions on `/pet` and tune thresholds (bully = 3 throws, fling speed >= 7, impact > 13 (playground) / 11 (arc), reaction hold durations). Untested live - no reliable preview from the Windows-cwd session, dev server is in WSL.
- Open:
  - Pet reaction thresholds/tuning unverified in-browser; adjust after device test.
  - (carry from Chat #1) Rotate the Gemini API key pasted in chat; delete "API key 2" once pets confirmed.
- Skills/conventions: from a Windows-cwd session you can drive the WSL toolchain via `wsl.exe -d Ubuntu bash -s <<'EOF' ... EOF` (stdin heredoc avoids Git Bash MSYS arg-mangling that eats `$HOME`); prefix `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.

---

## Chat #1 - 2026-07-10 (feature batch + 3 new pets, deployed)

- Did: shipped a large batch and deployed.
  - Icon: `public/favicon.svg` full-bleed (arcs scaled 1.5x, no circle-in-padding); PWA PNGs regenerated.
  - Food search: "Saved & scanned" gated on `recentIdSet` (only user-logged foods); label scan now accepts gallery upload (dropped `capture` in `ManualEntryForm.tsx`).
  - #8 Quick-add: new `/quick-add` route (`src/app/quick-add/QuickAddPage.tsx`) + manifest `shortcuts` (long-press icon), meal section defaulted by time of day (`src/lib/mealTime.ts`); `AddFoodSheet` gained `onSectionChange` + `initialTab`.
  - #2 Meal drafts: `src/features/meals/mealDraft.ts` (localStorage), autosave/restore/discard wired in `MealEditor.tsx`.
  - #6 Swipe-copy: swipe a past-day diary row left to copy it to today (`DiarySection.tsx` SwipeToCopy + `copyEntryToDate` in `repos/diary.ts`).
  - #4 Community foods: worker `worker/sharedFoods.ts` (self-bootstrapping `shared_foods` D1 table) + routes in `worker/index.ts`; client `src/lib/shared-foods-api.ts`; contribute on custom-food create (`repos/foods.ts`); shared results merged into search `common` group (`useFoodSearch.ts`, new `shared` FoodSource); opt-in toggle in `PreferencesSection.tsx` (`getContributeShared`).
  - #5 Pets: 3 new species (cat, German Shepherd, parrot), 20 poses each, generated via Vertex AI Express `gemini-2.5-flash-image`, background-removed to webp. Pipeline: `scripts/generate-pets.mjs` + `scripts/process-pets.mjs` (needs `sharp`, added). `Dog.tsx` now loads any species via `import.meta.glob`; `src/features/pet/petSpecies.ts`; species threaded through `useDogState`/`DraggableDogArc`/`DogPlayground`; picker on `/pet` writes `pet.breed`.
- State: DEPLOYED to https://calorie-tracker.tamara-sovcik.workers.dev (Version 5c5d40ce). COMMITTED + PUSHED: `main` at `3169a9d`, clean tree, 0 unpushed. `npm run build` clean, worker typecheck clean, 184/184 tests pass.
- Next: live device QA (see Open); then next feature.
- Open:
  - Rotate the Gemini API key pasted in chat (transcript exposure); delete "API key 2" once pets confirmed. Key config: Vertex "Agent Platform (Vertex)" API on the key, billing on GCP project `obsidian-voice-501509`.
  - Not verified in-browser (dev server in WSL, session cwd on Windows OneDrive - preview bridge unreliable). Device-test: swipe-copy, meal-draft restore, `/quick-add` shortcut, pet switching, community foods.
  - Community foods search/contribute only active when a sync code is set in Settings AND the toggle is on.
- Skills/conventions: none new.
