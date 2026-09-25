# Session Log

Handover log for calorie_tracker (Verve). Newest entry on top.

How to use:
- Start of session: read only the top entry, announce the chat number.
- End of session: prepend a new entry, bump `Session count`.

Session count: 10
Last updated: 2026-09-10

> **This file is the live log.** `Projects/calorie_tracker/docs/SESSION_LOG.md` in
> the OneDrive vault is a stale copy that stopped at Chat #2 (2026-06-19); the
> project CLAUDE.md used to point there. Fixed 2026-08-13. Append here.

---

## Chat #4h - 2026-09-10 (the daily goal became a function of the date: diet pause, target breakdown, calorie reservations; all deployed)

One structural change underneath four features. Everything in the app that
wanted "the calorie goal" used to read `profile.kcal_target`, a single
number. It is now resolved per date, and that is what made the rest
possible.

### Round 1 - diet pause (`60ba797`)

Prompt: pause the diet for a maintenance week, then resume the cut.

- **The obvious implementation is wrong.** Editing `kcal_target` for a week
  and putting it back would re-grade every past day against whichever number
  happens to be stored. A finished maintenance week would later read as seven
  days of massive overeating and swing the running balance by thousands.
- So a pause is a **dated window carrying its own goal**, kept as a JSON list
  on the profile (`diet_pauses`) so a finished break stays on the record.
  `goalResolver(profile)` answers "the goal on day D".
- `weeklyBudget` now sums per-day goals for the period budget and the
  balance. A week straddling the start of a break is budgeted part at the cut
  goal, part at maintenance. `effectiveDailyKcal` neutralises an un-logged
  past day at THAT day's goal.
- Macros follow: protein holds, the calorie difference goes on carbs and fat
  in proportion to the energy they already carry, so a low-fat split stays a
  low-fat split.
- Maintenance is prefilled from the profile's own TDEE and stays editable.
  Lengths are 3 days / 1 week / 2 weeks / open-ended.
- D1: `ALTER TABLE profiles ADD COLUMN diet_pauses TEXT`, applied to remote
  before deploying. `schema.sql` also picked up `budget_period`,
  `budget_carryover_enabled`, `budget_carryover_cap` and
  `custom_meal_categories`, which existed in `sync.ts` and in the live table
  but had never been written into the canonical file.

### Round 2 - "Why this number?" (`6cba636`)

Four things can move a day's target and each explained itself somewhere
different, or not at all. Tapping the "x of y" line on the arc now opens the
ledger: base goal, then every step that moved it, then the total, each row
saying what did it and tapping through to whatever set it.

- **Deltas are derived from ROUNDED running values**, not rounded
  individually. With a pause, a budget trim and eat-back all in play the
  naive version drifts and the column visibly stops adding up, which is worse
  than no breakdown. There is a test that walks the steps with fractional
  inputs and asserts the on-screen arithmetic reconciles.
- Steps that changed nothing are omitted rather than shown as `+0`; dropping
  them cannot break the chain because their running value equals the one
  before.

### Round 3 - calorie reservations (`49dd54d`, `d840437`)

Prompt: set calories aside for a birthday or a specific snack, and have the
days around it re-plan. Designed in full first (`docs/CALORIE_BANKING.md`),
then built in the order that doc sets out.

- **The invariant: a reservation MOVES calories and never creates them.** Its
  deltas sum to zero. That is what stops the budget undoing it. Lowering
  Monday's *intake* reads as a surplus in `adjust` mode and comes straight
  back on Tuesday; lowering Monday's *goal* produces no surplus at all.
  Tested across every fund mode and request size.
- **The funding window is derived, never stored:**
  `windowStart = max(eventDate - spread, createdDate)`. Deriving it from the
  creation date rather than from today is what keeps history still.
  Recomputing against today would shrink the window as days passed and
  retroactively zero the deltas of days already eaten to - the same trap the
  pause avoids.
- **The event day gets only what was actually funded.** If the window can
  carry 4,200 of a 6,000 request, the day gets 4,200 and the shortfall is
  stated with the three real options. Handing over the full ask is how this
  would blow the period budget while appearing to work.
- Allocation is water-filled: a day at its floor gives nothing and the others
  carry its share. Floor is an explicit `budget_max_daily_trim` when set,
  otherwise the stricter of 70% and a flat 1200 kcal.
- Two reservations close together compound safely: planned soonest-event
  first, each taking only the capacity left by the ones before it.
- A **table**, not JSON on the profile, unlike pauses: several live at once,
  edited from two devices, carries a `food_id`, and cancelling one should not
  rewrite a blob holding the others. Dexie v6, D1 table + two indexes, both
  sync column lists.
- Step 3 closes the loop: pick the real food or saved meal from the library
  at a real portion (reusing `FoodSearchPanel` / `QuantityStep` /
  `LogMealStep`), then one tap to log it on the day and a report against the
  RESERVATION rather than the day ("reserved 480, logged 512, 32 more than
  reserved"). Offered only when the reservation names a real row - a bare
  number cannot know which of the day's calories were the cake.
- `useMealResolved` grew a hook-free `resolveMeal` for the logging path.

### State

- `main`, tree clean, **pushed**. Last code commit `d840437`; the commits
  after it are docs only, so the code tip is stable at that SHA.
- Deployed five times, ending at worker version `82748921`, live 200. That
  last deploy carried no code change; `fa5ae0e4` at `d840437` was the last one
  that did, so the two are the same bundle.
- 420 tests pass (up from 336), `tsc --noEmit` clean, `npm run build` clean.
  `npm run lint` still reports the same 26 pre-existing errors in
  `scripts/*.mjs` and `portionSuggestions.ts`. None in changed files.
- D1 migrations applied to remote before their deploys: the `diet_pauses`
  column, and the `reservations` table with its two indexes. The live
  reservations column list was checked against the worker's `COLUMNS`, in
  order.

### Next

1. **Device-test on the Pixel. None of this session has been seen by eye.**
   The sequence that exercises the most: reserve a real food from the library
   for a day next week, check the reason line on the days before it, then on
   the day use the one-tap log and read the comparison line.
2. Also unseen: the pause banner and Settings card, the breakdown sheet on a
   plain day (it should say "Nothing moved it"), the shortfall path (ask for
   6,000 kcal), and whether the new help icon on the arc collides with the
   dog when it is dragged into the centre.
3. Sync of the `reservations` table is unverified end to end - it needs a
   sync code, so only the schema was checked.

### Open

- Carried from #4g and still unexplained: `beef mince` UNFLAGGED at `library`
  tier while `grated cheddar` at the same tier WAS flagged.
- Blank 0 kcal stubs (e.g. "Garlic") left by the pre-fix scanner, need
  deleting by hand.
- From `docs/CALORIE_BANKING.md`, deliberately unresolved: default spread is a
  flat 7 days rather than the days left in the period; the funding floor is a
  hard no with no confirm-to-override; overlapping windows compound safely but
  with no warning when two events squeeze each other.
- The budget's carry-over window and reservations: a funding day earlier than
  `budget_carryover_start` would contribute its share to nothing while the
  event day's credit still counts. The doc proposes clamping the window;
  **not implemented**.
- Still unverified from earlier chats: re-scan the stuffed-pepper recipe,
  scan a nutrition label above 640px, the capture chooser and torch, the
  near-black primary button, the rebuilt Progress page.
- Not built, offered and not taken: persisted planner preferences in Settings.
- Deferred: desktop/tablet layout, an onboarding cut/maintain/gain step,
  syncing the alias store.

### Skills/conventions

- Commit messages go in a FILE, never a heredoc inside a single-quoted
  `wsl.exe bash -lc '...'`. An apostrophe in the body ("day's") terminates the
  outer quote and silently truncates the message. Cost one `--amend`.
- npm/wrangler in WSL need `bash -lic` (login + interactive) so nvm is on the
  PATH. With `-lc` the Windows node on `/Program Files` wins and `tsc`
  resolves to a UNC path that does not exist.
- The WSL login banner's "System information as of ..." line is generated at
  login and goes stale on a long-running instance. It said Aug 16 on a machine
  where both clocks read Sep 10, and this entry was misdated from it before
  being corrected. Use `date`, never the banner.

### How this session worked

The rhythm that produced the above, worth repeating:

1. **Design in a doc before building**, for anything with a shape worth
   arguing about. `docs/CALORIE_BANKING.md` was written first and then built in
   the order it set out; every non-obvious decision in the code traces to a
   paragraph there. The doc is kept as the record of WHY, not as a plan to
   tick off.
2. **Find the version that is wrong before writing the one that is right.**
   Both features here had an obvious implementation that quietly corrupts
   history (edit `kcal_target` and put it back; recompute a funding window
   from today). Naming that failure first is what produced the dated-window
   design in both cases.
3. **Pure maths in its own module, tested; React on top.** `dietPause.ts`,
   `reservations.ts`, `targetBreakdown.ts` are all hook-free and carry the
   tests. Components stayed thin enough not to need any.
4. **When a test fails, check the test's premise before the code's.** Three
   failures this session were all bad fixtures, not bugs: macros that did not
   sum to the target, a floor that was not actually reached.
5. Ship loop each time: typecheck, test, build, lint (confirm the 26
   pre-existing errors are unchanged, none in changed files), **D1 migration
   applied to remote FIRST**, then deploy, then curl for 200, then commit.
6. Commit and deploy freely; **push only when asked**.

---

## Chat #4g - 2026-08-14 (meal planner rebuilt on personal history; search unified, typo-tolerant, habit-ranked; deployed)

Two themes, both the same underlying complaint: the app held signals about
what Tamara eats and then ignored them.

### Round 1 - the meal planner (`5ef56a9`, `5bf93e6`)

Prompt: why does she still default to ChatGPT for meal planning?

- **The finding.** `MealPlannerPage` never imported `useProfile`. Every
  request threw away every signal the app had about her, so the output could
  not be better than a generic chatbot's. Fixed: the worker prompt now
  carries frequent foods, saved meals to avoid repeating, and recent meals.
- Daily targets are sent as **background context, not constraints**. Her
  ruling: per-meal protein and kcal must stay settable because the point is
  often "a 200 kcal meal", not a share of the day. Preset chips fill the
  fields, the fields stay editable.
- Refine branch: one recipe in, three variations out.
- Ingredients resolve against her own foods first via
  `rankIngredientCandidates`, with `IngredientCandidateSheet` showing which
  food each line matched and letting it be changed. `ResolvedIngredient` now
  carries `candidates` + `chosen`.

### Round 2 - the search bars (`ef6ede6`, `6733f9f`, `88ba3f8`)

Trigger: "poudre de cacao" returned nothing, for an ingredient she had
definitely entered.

- **First cause.** `searchLocalFoods` required every raw token to appear:
  `tokens.every(t => hay.includes(t))`. The stored name was "Cacao en
  poudre", so the word "de" alone hid the food completely. Now matches
  verbatim OR on normalised significant words.
- **Then the same bug three more times.** The app had FOUR independent
  free-text filters and only one got the fix. `matchesSearchQuery` in
  `ingredientMatch.ts` is now the single implementation, used by
  `searchLocalFoods`, `FoodsLibrary`, `MealsLibrary` and `MealPicker`.
  `FoodsLibrary` had been the weakest of the four (whole-query substring).
- **Ranking happened after truncation.** `searchLocalFoods` took the first
  `limit * 3` rows Dexie walked past, sorted THOSE by source and date, cut to
  20, and only then let `useFoodSearch` score relevance. With a few thousand
  cached rows an exact name match could be discarded before it was ever
  scored. Now scans up to 400 and ranks before slicing.
- **Meals are searchable from the main food search.** She reported repeatedly
  expecting her meals to show up there. New "Your meals" group above foods,
  wired to the existing `handlePickMeal`. Passed only where it makes sense:
  the ingredient picker inside meal building still searches foods alone.
- **Typo tolerance as a retry, not a widening.** Strict pass first; only if it
  returns nothing, match again allowing a Damerau edit (transpositions cost 1,
  which is the typo phones actually produce). Budget by length: none below 5
  characters, 1 up to 7, 2 above. Short words get zero because at 4 letters one
  edit reaches a different food ("oats"/"eats"). A search with real answers is
  never diluted by near-misses.
- Writing the tests found a gap: the fuzzy pass compared against the
  TRANSLATED word, so "yoghrut" was 1 edit from what she typed and 2 from
  `yogurt`, which is how the dictionary stores it. It now compares against the
  literal words too.
- **Ranking by habit.** New `foodFrequencyScores()` exposes the decayed log
  count as a map (it existed, but only the top-20 id list was reachable).
  `scoreFoodMatch` now adds a log-compressed frequency bonus, a large bonus
  when the query has a hand-set ingredient alias, and scores typo-corrected
  hits at a third weight.
- The AI ingredient matcher deliberately does NOT use the fuzzy path.
  Loosening the word test is what produced the "Pepp" ingredient in #4d.

### State

- HEAD `88ba3f8` on `main`, tree clean. **Ahead of `origin/main` by 2**
  (`6733f9f`, `88ba3f8`) - not pushed, since only commit + deploy were asked.
- Deployed. Worker version `02fbdc6f`, live returns 200.
- 336 tests pass, `tsc --noEmit` clean, `npm run build` clean, all verified
  this session. `npm run lint` reports 26 errors, all pre-existing: node
  globals in `scripts/*.mjs` and one `no-control-regex` in
  `portionSuggestions.ts`. None in changed files.
- No D1 schema change this session, so no migration was needed.

### Next

1. Device-test on the Pixel. Nothing below has been seen by eye: meals
   appearing in the food search, typo tolerance, whether habit ranking
   actually reorders results usefully, and the planner's candidate sheet.
2. The meals group runs a live query over all meals per keystroke. Fine at
   ~50 meals, worth watching if it grows.
3. Still unverified from earlier chats: re-scan the stuffed-pepper recipe,
   scan a nutrition label (first time ever above 640px), the capture chooser
   and torch, the near-black primary button, the rebuilt Progress page.

### Open

- Unexplained since #4e: `beef mince` was UNFLAGGED at `library` tier while
  `grated cheddar` at the same tier WAS flagged. `isConfident` says neither
  should pass.
- Blank 0 kcal stubs (e.g. "Garlic") left in her library by the pre-fix
  scanner. Need deleting by hand.
- Not built, offered and not taken: persisted planner preferences in Settings
  (diet, dislikes, equipment).
- Deferred: desktop/tablet layout, an onboarding cut/maintain/gain step,
  syncing the alias store (currently local-only, matching `food_recents`).

### Skills/conventions

None added.

---

## Chat #4f - 2026-08-13 (capture surfaces unified, then their quality fixed; deployed)

Three rounds, all triggered by Tamara: the capture entry points were scattered
and confusing, then a check of how well they actually work, then the pages
themselves still carrying their old furniture.

### Round 1 - one capture system (`a398922`)

Seven surfaces were getting images in through FOUR mechanisms: this overlay,
`<input capture>` (hands off to the OS camera app), a bare `<input>` (gallery
only), and a pair of the two. Consequences: "take a photo" behaved differently
per screen, the meal photo had **no gallery at all** on some Android builds,
and the recipe scan **could not use the camera** - screenshots only.

- `LabelCaptureOverlay` -> `CaptureOverlay` with configurable title, hint,
  framing guide. Every surface uses it. Barcode keeps ZXing (needs continuous
  decoding) but wears the same chrome.
- New `CaptureChooser`: one door naming all four capabilities with a line each
  on when to use them. Label scan had been buried behind a text link INSIDE
  the barcode scanner; recipe scan lived on a different page.
- Add food: 5 tabs -> 4 (Search, Capture, Meals, Quick). Ingredient picker:
  Search + Capture, **gaining the label scan it never had**.
- Recipe is listed with the rest but labelled "saves a reusable meal instead
  of logging now" - it is the one whose destination differs (her call).
- PWA icon shortcuts still work: `normaliseTab` maps `?tab=scan` / `?tab=photo`
  onto Capture with that flow preselected, so the barcode shortcut is still
  zero extra taps.

### Round 2 - capture quality (`12b67a7`, `d809000`)

- **The headline bug.** `getUserMedia` was called with only `facingMode`, so
  browsers returned their default - typically **640x480** - and the canvas was
  sized from `video.videoWidth`. Which means the 1600px label ceiling added in
  Chat #4 **had never done anything**: `downscaleImage` computes
  `min(1, 1600/640) = 1` and returns untouched. Raised the ceiling, never
  checked the source was below it. A gallery pick was therefore giving BETTER
  OCR than the camera built to be the primary path. Now asks 2560x1440 ideal.
- Confirm-before-send. The shutter fired straight into the upload, so a blurry
  shot cost a 60s round trip before you found out. Retake / Use photo, drawn
  `object-contain` so the whole frame is checkable. Gallery skips it.
- Single encode. Was 0.95 at capture then decode-resize-re-encode at 0.82 by
  the caller - two rounds of artefacts on the small print the AI reads. The
  overlay now takes `maxDim` and scales during the draw: one encode at 0.88.
  Labels/recipes 1600, meal photo 1024, meal card image 640.
- `downscaleImage` returns the ORIGINAL blob when no resize is needed; it used
  to redraw and recompress regardless.
- Continuous autofocus + tap-to-focus where the camera reports support; torch
  on both the overlay and the barcode scanner (reachable because ZXing
  attaches its stream to our element).
- **Deliberately NOT changed:** barcode resolution (640x480 is ample for a
  close-up EAN-13 and higher slows continuous decoding - not the same bug) and
  the meal card image at 640 (a thumbnail that syncs as a data URL).

### Round 3 - tidying the pages behind the chooser (`c497d04`)

Unifying the entry left each page carrying furniture from when it was its
own island. The barcode page had THREE stacked fallback blocks with no
hierarchy under the viewfinder: a full-width import button with a two-line
explainer, a floating "No barcode? Scan a nutrition label instead" link, and
an always-open manual form. Now one row of three equal actions under a single
"Won't scan?" line (From a photo / Type it in / Use the label), matching the
Gallery-and-shutter row in CaptureOverlay. Manual entry sits behind its own
action. Camera-denied and import-failure copy that said "below" was corrected.
Meal photo and recipe both showed a second explanation and wanted a second tap
after the chooser had already explained them; meal photo now opens the camera
on arrival, and both keep only what the chooser does not say.

- **State:** deployed, Version `8a6fb0e3`, HEAD `c497d04`, clean tree, 0
  unpushed. 309 tests, typecheck + build + eslint clean (2 pre-existing lint
  issues remain: `portionSuggestions.ts` control regex, `Dog.tsx` fast-refresh).
  No schema change; Dexie is at v5 (`ingredient_aliases`, local-only).
- **Next:** all device work on the Pixel, none of it verified by eye.
  1. Re-scan the stuffed-pepper recipe - the single most informative test. The
     review screen shows the chosen food, tier and kcal per row, and the picker
     shows the alternatives.
  2. Scan a nutrition label. This is the first time it has ever run above
     640px, so it should be visibly more accurate.
  3. Capture tab, chooser rows, confirm-shot step, torch.
  4. Still unverified from earlier today: near-black primary button, four nav
     labels on a narrow phone, rebuilt Progress page.
- **Open:**
  - Unexplained from the #4e scan: `beef mince` UNFLAGGED at `library` tier
    while `grated cheddar` at the same tier WAS flagged. `isConfident` says
    neither should pass. Check this first.
  - Blank 0 kcal stubs (e.g. "Garlic") still sit in her library from the
    pre-#4d scanner. Scoring no longer picks them; they want deleting by hand.
  - Alias store is local-only by choice (matches `food_recents`). Syncing it is
    a clean follow-up if aliases should survive a device change or local wipe.
  - Deferred design items: desktop/tablet layout, onboarding cut/maintain/gain.
- **Skills/conventions:** none installed. Note `bun` and `jq` are BOTH missing
  on this machine, so `gstack-review-log`, `gstack-learnings-log` and the tasks
  JSONL all fail; review entries go straight into
  `~/.gstack/projects/calorie-tracker/main-reviews.jsonl`. `SendUserFile`
  cannot take a `\\wsl.localhost\...` UNC path.

## Chat #4e - 2026-08-13 (second device test of the recipe scan; matching reworked again; deployed)

Tamara re-scanned the same stuffed-pepper recipe on the Pixel. Much closer -
284 kcal/portion against the recipe's 331, and 680g for four large peppers
proved the count-weights prompt fix from #4d worked. But two staples came back
as "no match" and 5 of 7 ingredients were flagged.

- **Size and unit words were the cause, and it was the same class of bug as
  #4d.** They counted as significant query words, so a two-word query with one
  match scored 0.5 coverage, and any extra word in the food name pushed it
  under `MIN_NAME_SCORE` and rejected it OUTRIGHT. Measured: `large pepper` vs
  the curated `Bell pepper` = **0**, while a bare `pepper` = **0.94**. `large
  onion` and `garlic clove` scored exactly 0.50 and only survived because
  their curated names happen to be single words with no extra to penalise.
  Qualifiers (size, count, measure, knife work) are now stripped from the
  query before scoring. All four now score 0.94-1.0.
- **Deliberately NOT stripped:** whole, half, fresh, ripe, minced, ground,
  dried, smoked. "Whole milk" is a different food from skimmed; there is a
  test asserting `whole milk` still scores 0 against `Milk, skimmed`.
- **A processed form is a different food.** `tomato puree` was resolving to a
  fresh tomato: 18 kcal/100g against puree's ~80, so 30g read as 5 kcal
  instead of ~24. `formPenalty` covers puree, paste, powder, flour, butter,
  milk, oil, sauce, juice and friends - 0.45 when the form was asked for and
  the raw ingredient came back, 0.2 for the reverse. Curated gained tomato
  puree, passata, pasta sauce, coconut milk, plain/almond flour, cornflour,
  stock cube, tahini, oils and condiments. `CURATED_VERSION` 3 -> 4.
- **Blank stubs now lose.** A 0 kcal "Garlic" (litter from an abandoned scan
  under the pre-#4d code) outranked the real curated Garlic at 149 kcal/100g,
  because the custom-tier bonus (0.3) exactly cancelled the old +0.05 for
  having macros. Missing macros is a 0.5 PENALTY now, not a missed bonus.
  **Old stubs are still in her library and want deleting by hand.**
- **French and Dutch names.** Her actual minces are Brussels products labelled
  in French; "beef mince" and "hache de boeuf" share no characters, so scoring
  can never connect them. Names are de-accented and run through a bundled
  FR/NL food-word map before comparison. `Hache de boeuf 5% MG` and
  `Rundergehakt 5%` both score 1.0. **Gotcha worth remembering: `œ` does NOT
  decompose under NFD**, so `bœuf` was tokenising to "b" and "uf" and losing
  the word - ligatures are expanded by hand before normalising.
- **Learned aliases** (`src/db/repos/ingredientAliases.ts`, Dexie v5,
  `ingredient_aliases`). Picking a food in the review remembers that phrase ->
  that food, and later scans resolve to it at a new `alias` tier above
  everything. This is the only mechanism that can connect a supermarket brand
  to a generic ingredient name. Deterministic id `ia:{user}:{phrase}` so two
  devices produce one row. **Local-only, matching the `food_recents`
  precedent - NOT synced, so no D1 change. Syncing it is a clean follow-up if
  she wants aliases to survive a device change or a local wipe.**
- **Exact built-in matches stop nagging** (her call). An exact name match to a
  curated food is confident; partial matches and anything external still ask.
  Five flags on that recipe should become one or two.

- **State:** deployed, Version `80607dfe`, commit `5731990`. **309 tests**, up
  from 287. Typecheck + build clean, lint at the 2 pre-existing issues. No
  schema change on D1 (Dexie v5 is local only).
- **Open, unexplained:** on that scan `beef mince` was UNFLAGGED at `library`
  tier while `grated cheddar` at the same tier WAS flagged. `isConfident`
  says neither should pass. Either a faint icon was misread in the screenshot
  or there is a bug - the next scan settles it. Check this first.
- **Next:** re-scan the same recipe. The review screen now shows the chosen
  food, its tier and its kcal per row, and the picker shows what it was
  choosing between - that is the only way to tell whether the tiering behaves
  against a real library rather than test fixtures. Also still unverified on
  hardware from #4/#4c: the near-black primary button, four labels in the nav
  bar, the rebuilt Progress page, the live label camera.

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
  Prefix matching also requires the shorter word to cover 70% of the
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
  - Rotate the Gemini API key pasted in chat (transcript exposure); delete "API key 2" once pets confirmed. Key config: Vertex "Agent Platform (Vertex)" API on the key, billing on GCP project `<redacted>`.
  - Not verified in-browser (dev server in WSL, session cwd on Windows OneDrive - preview bridge unreliable). Device-test: swipe-copy, meal-draft restore, `/quick-add` shortcut, pet switching, community foods.
  - Community foods search/contribute only active when a sync code is set in Settings AND the toggle is on.
- Skills/conventions: none new.
