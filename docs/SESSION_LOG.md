# Session Log

Handover log for calorie_tracker (Verve). Newest entry on top.

How to use:
- Start of session: read only the top entry, announce the chat number.
- End of session: prepend a new entry, bump `Session count`.

Session count: 2
Last updated: 2026-07-10

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
