# Whole-App Design Review

Follows `UX_AUDIT.md`, which is now stale (most of its P0/P1 band shipped).
This pass reviews design rather than features: information architecture,
interaction states, emotional arc, visual originality, design-system
coherence, and accessibility. Reviewed from the code, whole app, 2026-08-12.

Scored 0-10 per dimension. Priority: **P1** blocks ship · **P2** same branch ·
**P3** follow-up.

**Overall: 6/10 → 9/10 once the tasks below land.**

| Pass | Dimension | Before | After |
|------|-----------|--------|-------|
| 1 | Information architecture | 5 | 9 |
| 2 | Interaction state coverage | 6 | 9 |
| 3 | User journey & emotional arc | 6 | 9 |
| 4 | AI slop risk | 8 | 8 (no change needed) |
| 5 | Design system alignment | 4 | 9 |
| 6 | Responsive & accessibility | 3 | 9 |
| 7 | Unresolved decisions | 6 raised | 3 resolved, 3 scheduled |

---

## What already exists and should be reused

The foundations are good. Nothing below proposes replacing them.

- **Stone & Amber token layer** (`src/index.css`): semantic tokens with full
  light/dark pairs. Hanken Grotesk as a real primary typeface, not `system-ui`.
- **`Sheet`** (`src/components/ui/Sheet.tsx`): portal, focus trap, Escape,
  background scroll lock, focus restore. Properly built; every new modal
  surface should use it.
- **`Button` / `Input`**: cva variants, consistent sizing, `.tap-target`.
- **Toast system with undo**, `ConfirmDialog`, offline banner, sync-error
  banner, `ErrorBoundary`.
- **`CoachTip`**: built, works, currently used in exactly one place.
- **`ui/Tabs`**: the segmented control that should have been used everywhere.

---

## 1. Information architecture - 5/10

| # | Sev | Finding |
|---|-----|---------|
| 1.1 | **P2** | `/pet` hosts `WeeklyBudgetCard`, the only screen explaining budget maths, carry-over, trim cap and the balance. It is not in `NAV_ITEMS`. Reachable only by tapping the dog's status caption or the diary balance pill. The newest and most complex feature has its explanation behind the least obvious door. |
| 1.2 | **P1** | `NAV_ITEMS` declares `label` for all four entries; `Layout.tsx:73` destructures `{ to, icon: Icon }` and drops it. The bottom bar is four unlabelled icons separated by a 4px dot. `BookOpen` (Today) and `Library` (Library) are both books. Fails Krug's trunk test. |
| 1.3 | P2 | Progress holds two cards; Pet holds a mascot, wellbeing state and the budget breakdown. Unrelated jobs sharing a route. |

**Ruling:** budget card moves to Progress, and Progress is rebuilt with a real
hierarchy: budget and balance, then weekly nutrition, then weight and goal.
One narrative from "this week" to "over months". Pet keeps the mascot and
stays off-nav, reachable from the diary caption.

---

## 2. Interaction state coverage - 6/10

Loading and error coverage is genuinely good: day-loading spinner, barcode
lookup step, typed errors on label and photo scan, `ErrorBoundary`, offline
and sync banners. Lists mostly have empty states.

| # | Sev | Finding |
|---|-----|---------|
| 2.1 | **P1** | `photoLog`, `recipeScan`, `mealPlanner` and `photoLabel` all require a sync token and none check for it before presenting UI. Sequence today: open Scan, tap scan-a-label, grant camera permission, frame, shoot, wait for upload, *then* learn the feature was never available. The live-capture overlay made this failure more expensive than the old file picker did. |
| 2.2 | P2 | First-run diary has no guidance: arc at 0, four section cards with a title and an Add button, an exercise card, nothing pointing anywhere. `CoachTip` exists and is used once (`FoodSearchPanel.tsx:171`). |

Empty `DiarySection` being title + Add button only is correct and deliberate
(`UX_AUDIT.md` §2.5). Not a finding.

**Ruling:** every AI entry point checks for a token first. With no token the
control stays visible but explains in place and offers a route to Settings.
One shared helper, four call sites. Discoverable and honest.

---

## 3. User journey & emotional arc - 6/10

The emotional layer is unusually strong for a tracker: mascot with wellbeing
state and daily greetings, rotating food facts, weekly digest, streaks.
Time-horizon coverage is real (arc and dog at 5 seconds, remembered
quantities and recents at 5 minutes, weight trend and digest long-term).

| # | Sev | Finding |
|---|-----|---------|
| 3.1 | **P2** | `ArcGauge` paints the over state with `hsl(var(--destructive))` - the same token as "delete this entry" and "cloud sync failed". Eating 180 over, losing sync, and destroying data speak in one colour. This matters more since Warn mode shipped: its entire premise is that days read as over without the app trimming anything, deliberately, as information. The diary can currently show an amber "1,240 kcal over" pill directly above a red arc saying the same thing in error language. |
| 3.2 | P3 | No goal-hit moment. Hitting the calorie or primary-macro target passes unmarked. Raised as `UX_AUDIT.md` §5.6, never built. |
| 3.3 | P3 | No first-log acknowledgement. |

**Ruling:** add a dedicated over-budget token in the amber family already used
by the untracked banner and the balance pill. `ArcGauge` uses it. Destructive
goes back to meaning destructive.

---

## 4. AI slop risk - 8/10

Classified **APP UI**; App UI rules applied.

Passes all 7 hard-rejection criteria and all 11 blacklist patterns. No
gradients anywhere in the codebase. Real typeface, not `system-ui`. No
3-column feature grid, no decorative blobs, no centred-everything, no
coloured left-borders, no purple-on-white. The arc gauge is a genuine single
visual anchor.

One observation, not a finding: 15 surfaces share the identical
`rounded-2xl border border-border bg-card shadow-sm` shell, which brushes the
App-UI rule about stacked cards standing in for layout. Every one of them is a
real container (a meal section, a settings group, a chart), so they earn it.
No change needed.

---

## 5. Design system alignment - 4/10

The colour layer is properly built. Nothing above colour got the same
treatment, because none of it is written down.

| # | Sev | Finding |
|---|-----|---------|
| 5.1 | **P2** | Three segmented-control implementations: `ui/Tabs` (AddFoodSheet, IngredientPickerSheet), LibraryPage's `--color-tab-active` pill switcher, and a hand-rolled inline-style variant in ProfileSection / PreferencesSection / GoalsSection. The budget mode picker added a fourth instance of the third pattern. |
| 5.2 | **P2** | No type or space scale. `letterSpacing: '0.18em'` is hand-written at `LibraryPage.tsx:27` and `DiaryPage.tsx:191`; `fontSize: 26` at `LibraryPage.tsx:36` and `DiaryPage.tsx:200`. Identical values, two files, no shared source. |
| 5.3 | P2 | Two header systems: `PageHeader` on Progress and Settings, hand-rolled on Diary and Library. |
| 5.4 | **P2** | No `DESIGN.md`. This is the root cause of 5.1-5.3: nothing tells a new session that `ui/Tabs` already exists. |
| 5.5 | **P2** | `tailwind.config.ts` set `fontFamily.sans` to `system-ui, -apple-system, …` with Hanken Grotesk absent, so anything using Tailwind's `font-sans` utility silently fell back to system UI while the rest of the app rendered in the real typeface. **Fixed 2026-08-13** - the stack now leads with Hanken Grotesk. |

**Ruling:** add type and space scales to the token layer, fold the hand-rolled
headers into `PageHeader`, collapse the three segmented controls into one
component, then document all of it in `DESIGN.md`.

---

## 6. Responsive & accessibility - 3/10

The weakest dimension. These findings are arithmetic, not opinion.

### 6.1 Contrast - P1

| Token | Colour | On | Measured | Needs |
|---|---|---|---|---|
| `--color-text-faint` | `#B4B2AC` | `#F4F3EF` | **1.91:1** | 4.5:1 |
| `--color-text-muted` | `#989690` | `#F4F3EF` | **2.66:1** | 4.5:1 |
| `--muted-foreground` | `hsl(45 6% 47%)` | background | **3.79:1** | 4.5:1 |
| `--color-text-faint` (dark) | `#524E44` | `#161513` | **2.20:1** | 4.5:1 |
| `--color-text-muted` (dark) | `#7A7468` | `#161513` | **3.93:1** | 4.5:1 |

`--muted-foreground` is the most-used secondary text colour in the app: every
hint, settings description and section subtitle. `--color-text-faint` renders
the diary date eyebrow, the PROTEIN / CARBS / FAT labels, the `/2000g`
suffixes, the arc scale numbers and the inactive nav icons. At 1.91:1 that
group is close to invisible in daylight, which is exactly when the app gets
opened in a supermarket.

4.5:1 against the stone canvas needs relative luminance at or below ~0.160,
landing muted around `#6F6D66`. A starting point, not a prescription: it needs
a real look, and it will make the app less airy. That tradeoff is genuine.

### 6.2 Accessible names - P1

Nav links render a bare lucide SVG with no text and no `aria-label`, so a
screen reader announces the href. Four unnamed links. Same root cause as 1.2:
rendering `label` fixes the visual and the accessible name together.

### 6.3 Touch targets - P2

`.tap-target` exists and is widely applied, but the "Jump to today" pill, the
balance pill, "View all" in the weight log and "Edit this meal's ingredients"
are all roughly 22-28px tall.

### 6.4 Above phone width - P3

Everything is `max-w-md` centred; a tablet or desktop gets a phone column on
empty canvas. Defensible for a personal PWA, but currently a decision by
default rather than by choice.

**Ruling:** retune the failing tokens in both themes until every one clears
4.5:1, checking by eye. Then add a vitest that computes the ratio for every
text-on-background token pair and fails the build below 4.5:1, so it cannot
regress.

### 6.1b Addendum - the guard had a hole (found later the same day)

The first version of the guard only checked text on PAGE backgrounds. Text on
FILLED surfaces was uncovered, and behind that sat:

| Pair | Where | Was | Now |
|---|---|---|---|
| `--primary-foreground` on `--primary` | every Add / Save / Log button | **2.83:1** | 6.24:1 |
| `--destructive-foreground` on `--destructive` (light) | delete, sync banner | **3.45:1** | 5.44:1 |
| same, dark | " | **3.73:1** | 4.90:1 |
| `--color-accent-deep` on `--color-bg` | active nav label | **4.48:1** | 4.87:1 |

Primary keeps its amber and takes a near-black label - the smaller change, and
what dark mode already did. Destructive deepens the fill instead, keeping the
conventional white-on-red read. All are now enforced: 22 pairs across the two
themes. **"Background" means any surface text sits on, not just the page.**

---

## 7. Unresolved design decisions

| Decision | Status |
|---|---|
| Where the budget breakdown lives | **Resolved** - Progress, with the page rebuilt |
| AI features with no sync code | **Resolved** - check first, explain in place |
| What "over target" looks like | **Resolved** - dedicated amber token |
| Swipe-to-copy affordance | **Scheduled** (T13) |
| Nutrition range toggle | **Scheduled** (T12, folds into the Progress rebuild) |
| Goal-hit moment | **Scheduled** (T14) |
| Onboarding goal direction (cut/maintain/bulk) | **Deferred** - real product scope, not design debt |
| Layout above phone width | **Deferred** - P3, note only |

---

## NOT in scope

Considered and deliberately excluded from this review:

- **Live visual audit.** Reviewed from code, so pure spacing and visual-rhythm
  problems are out of range. Run `/design-review` against the deployed site
  for that.
- **Card component extraction.** The 15 card shells are byte-identical; a
  shared component would fix a problem that does not currently exist.
- **Pet art and animation.** Covered by `ART_BRIEF.md`, a separate concern.
- **Copy and microcopy pass.** `UX_AUDIT.md` §9 still stands; not re-litigated.
- **Onboarding restructure.** Product scope, not design debt.

---

## Implementation tasks

Each derives from a finding above. P1 blocks ship, P2 same branch, P3 follow-up.

### P1 - done and deployed 2026-08-13 (commit `f132d99`)

- [x] **T1** - `components/Layout.tsx` - nav `label` now renders under each
      icon, and each `NavLink` carries `aria-label`; icons are `aria-hidden`
      so the name is not announced twice. Nav item is a `.tap-target`.
  - Surfaced by: 1.2 + 6.2 - `label` declared and dropped; screen readers got the href
- [x] **T2** - `src/index.css` - retuned in both themes:
      light `--color-text-muted` `#989690` → `#605D55` (2.66:1 → 5.92:1),
      `--color-text-faint` `#B4B2AC` → `#6F6C63` (1.91:1 → 4.73:1),
      `--muted-foreground` `45 6% 47%` → `45 8% 38%` (3.79:1 → 5.26:1);
      dark faint `#524E44` → `#8E8A7E` (2.20:1 → 5.29:1), muted `#7A7468` →
      `#A6A197`, `--muted-foreground` `40 7% 50%` → `40 8% 62%`.
  - **Still needs your eye.** The maths passes; whether it still feels like
    Stone & Amber is a judgement only you can make. Faint and muted now sit
    closer together, so tertiary/secondary hierarchy leans on weight and size.
- [x] **T3** - `src/lib/contrast.ts` + `contrast.test.ts` - WCAG relative
      luminance and ratio, plus a guard that parses the real token values out
      of `index.css` and fails below 4.5:1 for 10 text-on-background pairs per
      theme. 30 tests.
  - Verified by regression: restoring `#B4B2AC` failed with
    `--color-text-faint (#B4B2AC) on --color-bg (#F4F3EF) = 1.91:1`.
- [x] **T4** - new `features/settings/aiAvailability.ts` (pure check) and
      `AiFeatureGate.tsx` (explainer + route to Settings). Photo log and recipe
      scan wrap in the gate; the label-scan buttons in `AddFoodSheet` and
      `ManualEntryForm`, and the planner's `handleGenerate`, check before
      opening a camera or firing a request.
  - Surfaced by: 2.1 - four AI features failed only after the user had done the work
- [x] **T4b** - `tailwind.config.ts` - `fontFamily.sans` now leads with
      Hanken Grotesk (finding 5.5). Pulled forward out of T7 because the
      typeface was silently not applying to any `font-sans` utility.

### P2 - done 2026-08-13

- [x] **T5** - `WeeklyBudgetCard` moved from `PetPage` to `ProgressPage`, and
      Progress rebuilt into three labelled horizons: Right now (budget and
      balance), Recent days (nutrition), Over time (weight and goal). The
      diary balance pill now routes to `/progress`; Pet gets a "See your
      calorie budget" link out.
- [x] **T6** - new `--over` token in both themes. `ArcGauge` and the diary
      balance pill both use it; `--destructive` is back to meaning destructive.
      Added to the contrast test - it carries an 11px "KCAL OVER" label, so it
      needs the body-text floor, and the first value picked (`32 68% 42%`)
      failed at 3.58:1 and was darkened to `32 68% 36%` (4.65:1).
- [x] **T7** - named type scale in `tailwind.config.ts`: `text-display`,
      `text-title`, `text-eyebrow`. Tailwind's own spacing scale is the space
      scale; deliberately no second one.
- [x] **T8** - `PageHeader` gained an `eyebrow` and a `display` variant.
      Library uses it. Diary keeps its date navigator, which is genuinely a
      different component, but now draws from the type scale rather than
      hand-written values - folding it into `PageHeader` would have bloated
      that component to serve one caller.
- [x] **T9** - new `ui/SegmentedControl` with `track` and `solid` variants and
      an `onDeselect` for optional fields. `ui/Tabs` deleted; all five call
      sites migrated (AddFoodSheet, IngredientPickerSheet, LibraryPage,
      PreferencesSection, GoalsSection, ProfileSection). Only `Tabs` had any
      ARIA before; all of them do now.
- [x] **T10** - `DESIGN.md` written.
- [x] **T11** - `.tap-target` on the Jump-to-today pill, balance pill,
      weight-log View all, Edit-this-meal link, and every nav item.
- [x] **T12** - **the original finding was wrong.** Inherited from the stale
      `UX_AUDIT.md` §7.1, which predated the nutrition summary getting its own
      7/14/30 toggle. The real asymmetry was span (nutrition stopped at 30 days
      while weight ran to a year) and a fifth near-duplicate pill control.
      Added 90D, and extracted `ui/RangePills` used by both charts.

### P3 - done 2026-08-13

- [x] **T13** - `SwipeToCopy` now shows a thin grip at the row's trailing edge
      that fades once the drag starts.
- [x] **T14** - a macro reaching its target turns its value, bar and label
      accent-coloured and adds a check. Deliberately not a celebration overlay:
      the dog already pulses happy on calorie fullness, and a tracker that
      congratulates loudly gets tiring by the third day.
- [x] **T15** - first-run `CoachTip` on the diary, shown only while today is
      genuinely empty.

### Deferred

- [ ] **T16** - intentional layout above phone width. Real product decision,
      not design debt; `max-w-md` stands until you want a desktop story.
- [ ] Onboarding goal direction (cut / maintain / gain), `UX_AUDIT.md` §6.1.

---

## Method

Reviewed from code across all routes and sheet flows. Contrast ratios computed
per WCAG 2.1 relative-luminance formula. Single-model review: Codex was not
available on this machine, so there is no cross-model consensus on any finding
here. Visual mockups were not generated (findings-only was chosen).
