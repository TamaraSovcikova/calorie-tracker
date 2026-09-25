# Calorie Tracker - UI/UX Audit & Plan

A whole-app review from a usability point of view. **No code changes here** - this
is the plan. Each item has a severity and a recommendation. A prioritised
roadmap is at the end.

Severity key: **P0** broken/confusing flow · **P1** clear friction · **P2** nice
improvement · **P3** polish.

---

## 1. Information architecture & navigation

The app has 4 tabs: **Diary · Meals · Progress · Settings**, plus a full-screen
onboarding wizard, meal editor, and Fitbit callback.

| # | Severity | Observation | Recommendation |
|---|----------|-------------|----------------|
| 1.1 | **P1** | **"My Products" (custom foods) have no home.** You can create a custom food inside the add-food flow, but you can't browse, edit, or delete your foods anywhere. They only resurface as search hits. | Give custom foods a management surface. Best fit: rename the **Meals** tab to **Library** with two sub-tabs - *Foods* (your custom products) and *Meals* (templates). Keeps the tab count at 4. |
| 1.2 | **P2** | The **Meals tab duplicates** the Meals tab already inside the Add-food sheet, and tapping a meal there only *edits* it (see 4.1). As a standalone destination it's thin. | Folding it into a *Library* tab (1.1) makes the standalone tab earn its place. |
| 1.3 | **P2** | The **streak** lives on the Progress page - out of sight on the screen the user opens 95% of the time (Diary). Streaks are motivational only if seen. | Surface a compact streak indicator on the Diary header or under the calorie ring. |
| 1.4 | P3 | Diary is correctly the home screen (`/` → `/diary`). The diary-as-dashboard model is the right call for a tracker - no separate dashboard needed. | Keep as-is. |

---

## 2. Diary page

The core screen: day header, collapsible macro summary, 4 meal sections,
exercise section.

| # | Severity | Observation | Recommendation |
|---|----------|-------------|----------------|
| 2.1 | **P0** | **No way to jump dates.** Navigation is prev/next chevrons only. Going back a week = 7 taps, and there's no fast way back to today once you've wandered. | Make the date header tappable → opens a date picker. Show a **"Today"** button (or jump arrow) in the header whenever the viewed day ≠ today. |
| 2.2 | **P1** | **No quick-add calories.** To log "ate out, ~800 kcal" you must build a full custom food. | Add a "Quick add" option in the add sheet (or section menu): just kcal + optional macros, no food record. A very commonly-used escape hatch. |
| 2.3 | **P1** | **Logging a multi-item meal is slow.** Saving a food closes the whole sheet; adding 3 items to breakfast = open/search/quantity/close ×3. | After saving, keep the sheet open and return to the search panel ("Add another"). Close only on an explicit Done/X. |
| 2.4 | **P2** | Net calories (eaten − burned) is only shown when *eat-back* mode is on, and even then as small print. Users with Fitbit connected often want to see net at a glance. | Show a clear "Net: X kcal" or steps/burn line in the macro summary regardless of eat-back setting. |
| 2.5 | **P2** | On a fresh day the screen is 4 empty meal cards + an empty exercise card - a lot of "No entries yet" scroll. | Make empty sections more compact (single slim row with the Add button), expanding once they have entries. |
| 2.6 | **P2** | **Delete has no confirmation or undo.** The trash icon in the edit sheet deletes a diary entry instantly. | Add an undo toast ("Entry removed - Undo") - better than a confirm dialog for a frequent, low-stakes action. See §5. |
| 2.7 | P3 | Date subtitle shows the raw `2026-05-16` only when the day *is* today, and nothing on other days - backwards. | Show the full friendly date on every day, or drop the subtitle entirely. |
| 2.8 | P3 | No way to copy/clear a single meal section - only the whole day (good feature, but coarse). | Add per-section "copy to…" in a section overflow menu (lower priority). |

---

## 3. Add-food flow

Sheet with Search / Scan / Meals tabs → pick → quantity step → save.

| # | Severity | Observation | Recommendation |
|---|----------|-------------|----------------|
| 3.1 | **P1** | See 2.3 - the flow ends by closing the sheet. The single biggest friction in daily use. | "Add another" / keep-open behaviour. |
| 3.2 | **P2** | **Quantity is re-entered every time**, even for a food in Recents that you log daily. `defaultQuantity()` is generic. | Remember the last quantity+unit used per food and pre-fill it. |
| 3.3 | **P2** | Recents only appears with no query and is section-scoped. There's no global "favourites" or most-logged list. | Add a favourites/most-logged group, or a star toggle on `FoodResultRow`. |
| 3.4 | P3 | Three result group names - *My Products*, *Common foods*, *Packaged products* - are inconsistent in tone/casing. | Standardise: "Your foods", "Common foods", "Packaged products". |
| 3.5 | P3 | No empty-state guidance on the Scan tab before the camera initialises beyond a spinner. | Add a one-line "Point at a barcode" hint. |

---

## 4. Meals page & meal templates

| # | Severity | Observation | Recommendation |
|---|----------|-------------|----------------|
| 4.1 | **P1** | **Tapping a saved meal opens the editor, not a log action.** To actually *log* a meal you must go Diary → Add → Meals tab. The most likely intent (log it) is the hardest path. | Tapping a meal should offer **Log to diary** (with date/section/portion) as the primary action; editing as secondary. |
| 4.2 | **P1** | **Meal rows show only name + notes** - no calories or macros. The list isn't scannable; you can't tell a 300 kcal snack from a 900 kcal dinner. | Show per-meal kcal (and primary macro) on each row. |
| 4.3 | P3 | No duplicate-meal action; building a near-identical meal means re-adding every ingredient. | Add "Duplicate" in the meal editor. |

---

## 5. Feedback, confirmations & popups

The app is currently **almost silent** - actions succeed by the data quietly
updating. There's no toast/snackbar system at all.

| # | Severity | Observation | Recommendation |
|---|----------|-------------|----------------|
| 5.1 | **P1** | **No success feedback** for: food added, weight logged, day copied, meal saved, import done, data wiped. The user infers success from the UI changing. | Add a lightweight toast system. Show "Added to Breakfast", "Copied to Sat 18 May", "Weight logged". Small, auto-dismissing. |
| 5.2 | **P1** | **Destructive actions are uneven.** "Wipe local data" uses a native `confirm()`; deleting a diary entry, a weight row, or a meal has **no confirmation and no undo**. | Standardise: undo toast for frequent low-stakes deletes (diary entry, weight row); a styled confirm dialog for rare high-stakes ones (wipe data, import-overwrite, delete meal). Replace the native `confirm()`. |
| 5.3 | **P1** | **Import silently overwrites everything.** `handleImportFile` clears all tables then restores, with no warning that current data is replaced. | Confirm first: "Restoring a backup replaces all data currently on this device. Continue?" |
| 5.4 | **P2** | **No first-run education for hidden features.** Barcode scan, copy-day, custom units, cloud sync, Fitbit - all are discoverable only by poking around. | One-time, dismissible coach tips on first use of the diary and add-food sheet (not a heavy tour). The onboarding "done" step lists them in prose, which is easy to forget. |
| 5.5 | **P2** | **No "you're offline" / "back online" indication.** It's a PWA meant to work offline; a sync-error banner exists but plain offline state is silent. | Subtle offline indicator so the user trusts that local logging still works. |
| 5.6 | P3 | No end-of-day / goal-hit moment. Hitting the calorie or protein goal passes unmarked. | Optional: a small celebratory state when a goal is met (ties into streak milestones). |

---

## 6. Onboarding

5 steps: welcome → goals → profile → macros → done. Clean, ~1 minute, skippable.

| # | Severity | Observation | Recommendation |
|---|----------|-------------|----------------|
| 6.1 | **P1** | **No goal-direction step.** The profile step computes a TDEE and even says "subtract ~500 to lose, add ~300 to gain" - but makes the user do that maths. A cut/maintain/bulk choice was requested earlier and still isn't here. | Add a **Lose / Maintain / Gain** choice (with rate, e.g. 0.25/0.5 kg per week) that auto-adjusts the target off TDEE. Removes the only real "thinking" step. |
| 6.2 | **P2** | Goals step asks for a calorie *number* before the profile step can suggest one - mild ordering awkwardness, papered over with "we'll fine-tune next". | Re-order: profile/TDEE first, then goal direction, then a pre-filled target the user can tweak. |
| 6.3 | P3 | The macro auto-split (30/40/30) is good, but the user isn't told *why* those numbers or offered presets (high-protein, low-carb). | Offer 2–3 macro presets as chips. |

---

## 7. Progress page

StreakCard, 7-day summary, weight log + chart.

| # | Severity | Observation | Recommendation |
|---|----------|-------------|----------------|
| 7.1 | **P1** | **Nutrition trends are locked to 7 days**, while the weight chart has 1M/3M/6M/1Y/ALL. Asymmetric and limiting. | Give the nutrition summary the same range toggle, or add a 30-day view. |
| 7.2 | **P1** | **No goal weight.** The weight chart has no target line and no change summary ("−2.1 kg in 30 days", "on track for goal by ~Aug"). This is one of the most-valued features of any weight tool. | Add a goal-weight field (Settings/onboarding) → target line on the chart + a plain-language progress/projection line. |
| 7.3 | **P2** | The 7-day stats show avg kcal + avg protein only - no avg carbs/fat, no adherence trend. | Expand stats; let the primary macro at least drive which macro is shown, or show all three. |
| 7.4 | **P2** | Streak card shows current streak only. | Add best/longest streak and total days logged - cheap motivation. |
| 7.5 | P3 | No insights ("you average 250 kcal over on weekends"). | A single rotating insight line would add a lot of perceived intelligence. Later. |

---

## 8. Features users of a tracker expect but don't see

Beyond the items already listed, things that would make a returning user feel
the app is "complete":

- **Goal direction (cut/maintain/bulk)** wired to TDEE - §6.1.
- **Goal weight + projection** - §7.2.
- **Quick-add calories** - §2.2.
- **Multi-add in the food sheet** - §2.3.
- **Log a meal in one tap from the Meals list** - §4.1.
- **Water tracking** - a simple cup tally on the diary. Optional but expected by many.
- **Remembered portions / favourites** - §3.2 / §3.3.
- **Toasts & undo** - §5.
- **Date picker + Today jump** - §2.1.
- **Log reminders** (PWA push notification "you haven't logged dinner") - higher
  effort, genuinely valuable for habit-building. Candidate for a later phase.
- **Net-calorie clarity** with Fitbit connected - §2.4.

Deliberately *not* recommended (scope/complexity vs. a personal app): AI photo
calorie estimation, social/sharing, premium tiers.

---

## 9. Microcopy & small clarity wins (all P3)

- Macro summary headline "Daily target" stays at the base goal even when eat-back
  adds calories and the ring fills against the higher number. Add a tiny
  "+exercise" qualifier so the two numbers don't look contradictory.
- "My Products" → "Your foods" (consistent casing/voice).
- Diary section "No entries yet" could prompt the action: "Nothing here - tap Add".
- Done step of onboarding: turn the prose feature list into 3 labelled icons.

---

## 10. Prioritised roadmap

Suggested order of execution. Each band is independently shippable.

**Band A - core flow friction (P0–P1)**
1. Date picker on the diary header + "Today" jump (2.1)
2. Keep add-food sheet open / "Add another" (2.3, 3.1)
3. Quick-add calories (2.2)
4. Toast system + undo for deletes (5.1, 5.2)
5. Confirm before destructive import / styled confirm dialog (5.2, 5.3)

**Band B - meals & library (P1)**
6. "Library" tab = Foods + Meals; custom-food management (1.1, 1.2)
7. Log-a-meal in one tap from the Meals list (4.1)
8. Show kcal/macros on meal rows (4.2)

**Band C - goals & progress (P1)**
9. Goal-direction step in onboarding + Settings (6.1)
10. Goal weight + target line + projection on the weight chart (7.2)
11. Range toggle on the nutrition summary (7.1)
12. Streak on the diary; best-streak on Progress (1.3, 7.4)

**Band D - polish (P2–P3)**
13. Remembered portions / favourites (3.2, 3.3)
14. Net-calorie display with Fitbit (2.4)
15. Compact empty meal sections (2.5)
16. First-run coach tips (5.4), offline indicator (5.5)
17. Microcopy pass (§9), onboarding re-order (6.2), macro presets (6.3)

**Later / larger**
- Water tracking, log reminders (push), insights line.
