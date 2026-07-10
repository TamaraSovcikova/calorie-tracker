# Session Log

Handover log for calorie_tracker (Verve). Newest entry on top.

How to use:
- Start of session: read only the top entry, announce the chat number.
- End of session: prepend a new entry, bump `Session count`.

Session count: 1
Last updated: 2026-07-10

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
- State: DEPLOYED to https://calorie-tracker.tamara-sovcik.workers.dev (Version 5c5d40ce). `npm run build` clean, worker typecheck clean, 184/184 tests pass. NOT committed: working tree has ~229 changes; `main` is 2 commits ahead of `origin` and unpushed. Prod reflects uncommitted source.
- Next: commit the working tree (nothing from recent sessions is committed), then push if desired. Then live device QA.
- Open:
  - Git: large uncommitted tree + 2 unpushed commits - user's call whether/how to commit.
  - Rotate the Gemini API key pasted in chat (transcript exposure); delete "API key 2" once pets confirmed. Key config: Vertex "Agent Platform (Vertex)" API on the key, billing on GCP project `obsidian-voice-501509`.
  - Not verified in-browser (dev server in WSL, session cwd on Windows OneDrive - preview bridge unreliable). Device-test: swipe-copy, meal-draft restore, `/quick-add` shortcut, pet switching, community foods.
  - Community foods search/contribute only active when a sync code is set in Settings AND the toggle is on.
- Skills/conventions: none new.
