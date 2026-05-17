# Master Plan — Visual Revamp + Virtual Dog

A full redesign of the app plus a virtual-pet layer: a cartoon dog you feed by
logging your food. **This document is the plan — no code yet.**

The running example dog name is **Biscuit**; the user picks the real name.

---

## 1. The vision (locked decisions)

| Decision | Choice |
|---|---|
| Revamp scope | **Full redesign** — new visual system across every screen |
| Design mood | **Minimalist & sleek** — light-first, whites/greys, soft accent colours; the dog is the personality and the colour |
| Dog art style | **Cartoon illustrated** |
| Dog placement | **Both** — a small dog on the diary + a full Pet screen |
| Home screen | **Pet becomes home** — the app opens on the dog; diary is one tap away |
| Mechanics | **Light stakes** — encouraging, never punishing |
| Feeding model | **Time-aware** — the dog expects food around meal times |
| Over-goal | **Gently noted** — over-stuffed look + a tiny wellbeing dip, easy to recover |
| Animation | **As rich as possible at zero cost** — layered 2D puppet rigging + CSS |
| Customisation | **Name + appearance** (breed/colour chosen at start) |
| Notifications | **Not now** — the dog only updates in-app (revisit later) |
| Streak card | **Dog replaces it** — wellbeing becomes the consistency signal |

---

## 2. The dog — behaviour spec

The dog is driven by **two meters**:

### 2.1 Fullness — the moment-to-moment meter (resets daily)
How fed Biscuit is *right now*. Derived, never stored — computed from the day's
diary entries and the time of day.

**Time-aware expectation.** We define `expectedFraction(now)` — the share of
your daily calorie goal a typical day would have reached by this clock time:

| Time | Expected fraction of daily goal |
|---|---|
| before 07:00 | 0 (new day) |
| 07:00 → 10:00 | ramps 0 → 0.25 (breakfast) |
| 10:00 → 12:30 | 0.25 → 0.30 |
| 12:30 → 15:00 | 0.30 → 0.60 (lunch) |
| 15:00 → 18:00 | 0.60 → 0.70 |
| 18:00 → 21:00 | 0.70 → 1.00 (dinner) |
| after 21:00 | 1.00 |

`satisfaction = loggedKcal / (goal × expectedFraction(now))` — roughly 1.0 means
"on track for this time of day."

**Fullness states:**

| State | Condition | Dog |
|---|---|---|
| `hungry` | satisfaction < 0.5 | ears down, looking up, empty bowl |
| `peckish` | 0.5 – 0.85 | alert, glancing at the bowl |
| `content` | 0.85 – 1.10 | relaxed, satisfied |
| `full` | logged ≥ ~100% of goal | lying down, comfy |
| `stuffed` | logged > ~110% of goal | flopped on his bed, sluggish |
| `eating` | transient — just after you log food | head down at the bowl, then → happy |

These thresholds are a **starting point and fully tunable** once it's on a phone.

### 2.2 Wellbeing — the long-arc meter (persists, replaces the streak)
A 0–100 score that captures consistency over days. Starts at ~70.

On the first app-open of each new day, we roll forward every un-evaluated past
day and adjust:

- logged ≥ 1 food entry that day → **+6**
- also hit the calorie goal (±10%) → **+4** more
- logged nothing all day → **−10**
- went over goal (> 110%) → **−3** (the "gently noted" nudge)

Clamped 0–100. Bands set Biscuit's baseline disposition:

| Wellbeing | Disposition |
|---|---|
| 80–100 | thriving — extra sparkle, bouncier idle |
| 50–79 | happy — normal |
| 25–49 | a bit down — subdued, softer |
| 0–24 | sad — droopy, "needs care" |

Wellbeing is shown as a small heart/happiness meter on the Pet screen. It is the
new home of the streak idea — the existing `computeStreak` logic can feed into
it internally, but the *visible* thing is the dog, not a number.

### 2.3 What the dog shows = fullness pose, tinted by wellbeing
- **Pose / animation** is chosen by fullness + time of day (the moment-to-moment
  thing the user cares about).
- **Wellbeing** modulates it — a low-wellbeing "content" dog still looks a little
  subdued; a thriving one gets sparkle and a livelier idle.
- At night / when nothing's happening → `sleeping`.
- On the home screen at app-open → a one-off `greeting` ("Good morning!").

---

## 3. The art — production approach

This is the hardest part and the main risk: **keeping one consistent cartoon dog
across ~10 poses with no artist and no budget.** The plan:

### 3.1 Pose set (~10 illustrations per dog variant)
1. **Hungry** — sitting, ears down, pleading, empty bowl
2. **Peckish** — perked up, eyeing the bowl
3. **Eating** — head in the bowl (transient; 3–4 mini-frames)
4. **Happy** — tail wag, bouncy (transient, after eating)
5. **Content** — sitting calm and satisfied
6. **Full** — lying down comfortably
7. **Stuffed** — flopped belly-up on his bed
8. **Sad** — droopy (low wellbeing)
9. **Sleeping** — curled up (night / idle)
10. **Greeting** — excited, used on the home screen

### 3.2 Technique — layered 2D puppet rigging (free, genuinely lively)
Rather than hand-animating frames, we generate each pose as **separate layers**
(body+head, tail, ears, eyelids, plus props like bowl/bed) and animate the
layers with **CSS keyframes**:

- idle **breathing** (whole-body squash/stretch), **tail wag**, **ear flop**,
  **blink** — all cheap CSS transforms
- state changes = cross-fade between poses + a little squash-and-stretch
- transient actions (eating) = a short 3–4 frame sequence cycled with CSS `steps()`

A well-rigged 2D puppet reads as "richly animated" without frame-by-frame work.
No new dependencies needed — plain CSS, with a thin JS layer for state
transitions. (Lottie was considered; free Lottie packs can't give us one
*consistent* dog across all states, so we own the look with generated art.)

### 3.3 Consistency workflow
1. Generate a **reference sheet** for one dog (front/side, colours, proportions) and lock it.
2. Generate each pose from that locked reference; regenerate until consistent.
3. Slice into layers; assemble the rig in-app.
4. Repeat per breed variant.

### 3.4 Customisation scope — a deliberate scope lever
"Name + appearance" multiplies the art: poses × breeds × colours. To keep it
sane:
- **Launch with ~3 breeds**, one coat each (e.g. round puppy, floppy-eared
  hound, little terrier) → ~30 illustrations total.
- Add coat-colour options **later** (tint layer or extra generations).
This is the single biggest scope dial — flagged here so we choose consciously.

---

## 4. The redesign — visual system

### 4.1 Design tokens (new)
- **Palette:** light-first. White / off-white surfaces, layered greys, generous
  whitespace. One soft accent (a calm green or amber for "fed/on-track") and a
  soft coral for warnings — muted, never loud. The dog supplies the saturated
  colour.
- **Typography:** one clean modern sans; clear size/weight scale.
- **Shape & depth:** rounded corners, soft diffuse shadows, thin hairline borders.
- **Motion:** gentle, springy, consistent easing — shared with the dog's animation feel.
- **Dark mode:** keep it (the theme system already exists) — a dark variant of the new tokens.

### 4.2 Component restyle
Every primitive re-skinned to the new tokens: cards, buttons, inputs, sheets,
the bottom nav, charts, the macro ring, toasts, dialogs. The structure of each
screen stays (the UX bands A–D already sorted the flows) — this is a *visual*
pass, not a re-architecture.

### 4.3 Navigation change
"Pet becomes home" → the app's landing route is the Pet screen.
- Bottom nav (5 items): **Pet · Diary · Library · Progress · Settings**
- `/` → `/pet`
- The Progress page loses the streak card (replaced by the dog).

---

## 5. New screens & surfaces

### 5.1 Pet screen (home)
The landing screen. Contains:
- The big animated dog, centre stage
- His name + a wellbeing (happiness) meter
- A one-line status: *"Biscuit is content — you're on track for lunch"*
- A primary **Feed / Log food** button → jumps into the diary's add flow
- Today's quick glance: calories, goal progress
- Access to **customise** (rename, change appearance)
- A greeting moment on first open of the day

### 5.2 Dog on the diary
A compact dog at the top of the diary that mirrors the current fullness pose and
is **tappable → Pet screen**. When you log food, he plays the eat → happy
animation right there — immediate, satisfying feedback.

### 5.3 Onboarding
Add a **"Meet your dog"** step — name him and pick breed/colour. Slots into the
existing wizard (welcome → meet-your-dog → profile → goals → macros → done).

---

## 6. Data model

A new **`pet`** table (one row per user) — clean, separate, syncable:

| Field | Purpose |
|---|---|
| `user_id` | PK |
| `name` | dog's name |
| `breed` | chosen breed variant |
| `coat` | coat colour |
| `wellbeing` | 0–100 score |
| `wellbeing_evaluated_date` | last day rolled into wellbeing |
| `created_at` / `updated_at` | standard |

- **Fullness is never stored** — always derived from diary + clock.
- **Sync:** add `pet` to `worker/schema.sql` (a new `CREATE TABLE` — runs cleanly
  on the live D1 with one `wrangler d1 execute`), to the worker's `COLUMNS`/sync
  table list, to the Dexie schema (version bump), and to the sync client's table
  list. New-table additions are low-risk; no destructive migration.
- **Wellbeing roll-forward** runs once per day at startup, like the existing seed
  step.

---

## 7. Logic modules (pure, unit-testable)

Mirrors the existing `lib`/feature-helper pattern so it's covered by Vitest:
- `expectedIntakeFraction(now)` → 0..1
- `fullnessState(loggedKcal, goalKcal, now)` → fullness state
- `dogPose(fullness, wellbeing, timeOfDay, justAte)` → pose id
- `rollWellbeing(pet, dailyOutcomes[])` → new wellbeing + date
- `wellbeingBand(score)` → disposition

---

## 8. Phased roadmap

Each phase is independently shippable — the app keeps working throughout.

**Phase 1 — Design system foundation**
New tokens, palette, typography, motion. Restyle the UI primitives. App looks new, behaves the same.

**Phase 2 — Screen restyle**
Apply the new system to every screen (diary, library, progress, settings, sheets, onboarding).

**Phase 3 — Pet data + logic (no art)**
`pet` table, sync wiring, Dexie bump, the pure logic modules + their tests. Dog rendered as a placeholder.

**Phase 4 — Dog art production**
Reference sheet → poses → layers, for the launch breeds. The iterative art phase.

**Phase 5 — Dog comes alive**
The rig + CSS animation system, the Pet (home) screen, the diary dog peek, navigation change to Pet-as-home.

**Phase 6 — Mechanics + polish**
Wellbeing roll-forward, state transitions, the greeting moment, onboarding "meet your dog" step, eat/happy feedback on logging, remove the old streak card.

**Phase 7 — QA + deploy**
Cross-device test, typecheck/lint/test/build, schema push to D1, `pnpm deploy`.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Art consistency** across poses/breeds | Lock a reference sheet first; regenerate poses against it; bound breeds to 3 at launch |
| Scope (full redesign + a pet feature is large) | Strict phasing; each phase ships on its own |
| Animation feeling cheap | Layered rigging + squash-and-stretch + good easing; budget iteration time in Phase 5 |
| "Pet as home" adds a tap before logging | A prominent Feed button on the Pet screen jumps straight into logging |
| Tuning the feeding curve | Thresholds are constants in one module — easy to adjust on-device |

---

## 10. Decisions still open (we can settle these as we go)

- **Coat-colour options** at launch, or breeds-only first? (recommend breeds-only, colours later)
- Exact **meal-time anchors** — fixed (as in §2.1) vs. later learning from your habits
- Should wellbeing have named **stages/levels** (e.g. "puppy → companion") or just the meter?
- Does the dog ever react to **exercise or weight progress**, or stay purely food-focused? (recommend food-only for now)
- A **light sound** on feeding (a happy bark)? (recommend no, at least at first)
- Revisit **notifications** ("Biscuit's getting hungry") once the rest ships
