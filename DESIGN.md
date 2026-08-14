# Design system — Stone & Amber

The system is real and enforced in code. This file exists because it wasn't
written down: three segmented controls, two header systems and a copy-pasted
type scale all grew from sessions reaching for whatever was nearest in the
file rather than the component that already existed.

**Read this before building UI.** If you are about to hand-write a font size,
a toggle row or a page title, the thing you want is already here.

---

## Character

Calm, warm, quiet. A stone canvas rather than white, amber rather than blue,
one accent doing all the work. The app is opened several times a day for a few
seconds at a time, so nothing should demand attention that hasn't earned it.

Classified **APP UI**, not a marketing surface. Utility language, calm surface
hierarchy, minimal chrome. No gradients, no decorative blobs, no hero
treatments, no icons in coloured circles as section decoration (they are fine
as empty-state illustrations, which is the only place they appear).

---

## Colour

All tokens live in `src/index.css`, defined twice: `:root` (light) and `.dark`.
Never hard-code a colour in a component. Two families exist for historical
reasons and both are current:

- **Semantic Tailwind tokens** (`--background`, `--foreground`, `--primary`,
  `--muted-foreground`, …) stored as space-separated HSL triples, consumed via
  Tailwind utilities: `bg-background`, `text-muted-foreground`.
- **Stone & Amber tokens** (`--color-bg`, `--color-text`, `--color-accent`, …)
  stored as hex, consumed via `style={{ color: 'var(--color-text)' }}`. Used by
  the components written after the palette landed.

Prefer the Tailwind utilities for new work. Reach for the `--color-*` set when
you need a value the semantic layer doesn't have (`--color-accent-deep`,
`--color-tab-track`).

### Text colours and the contrast floor

| Token | Role |
|---|---|
| `--color-text` / `--foreground` | Primary text |
| `--color-text-muted` / `--muted-foreground` | Secondary: hints, descriptions, subtitles |
| `--color-text-faint` | Tertiary: eyebrows, axis labels, unit suffixes |

**Every text-on-background pair must clear 4.5:1 (WCAG AA for body text), and
this is enforced.** `src/lib/contrast.test.ts` parses the real values out of
`index.css` and fails the build below the floor. It exists because the app
shipped with `--color-text-faint` at 1.91:1 carrying the macro labels, the
date eyebrow and the arc scale numbers, and nobody noticed — pale-on-cream
looks fine indoors on the device you designed it on.

**"Background" includes filled surfaces, not just the page.** The first
version of the guard only checked text on page backgrounds, and behind that
hole sat white-on-amber at 2.83:1 — the label on every Add, Save and Log
button in the app. Button fills, chips, banners and badges all count. When you
add a filled surface that carries text, add the pair to `TEXT_ON_BG`.

Consequence worth knowing: muted and faint sit closer together in lightness
than a designer would naturally choose, because both have to clear the same
floor against the same pale canvas. **Secondary/tertiary hierarchy leans on
weight and size, not lightness.** Don't "fix" this by lightening a token.

If you add a text token, add its pairs to `TEXT_ON_BG` in the test.

### Status colours

| Token | Means |
|---|---|
| `--destructive` | Destructive or broken: delete, sync failure |
| `--over` | Over your calorie target |
| `--primary` / `--color-accent` | On track, active, primary action |

The primary button carries a **near-black** label, not white, in both themes.
That is what lets the amber stay exactly as designed while clearing AA. The
destructive fill is deepened instead, so it keeps the conventional
white-on-red read that a destructive action wants.

**`--over` and `--destructive` are not interchangeable.** Going over your
target is information, not an error — Warn mode deliberately produces over-days
as something the user chose to see and paces themselves. The arc used to paint
"180 kcal over" in the same colour as "cloud sync failed".

Macro colours (`--kcal`, `--protein`, `--carbs`, `--fat`) are data encodings.
Never use them decoratively.

---

## Type

**Hanken Grotesk**, loaded from Google Fonts in `index.html`, set on `body` in
`index.css` and led with in `tailwind.config.ts`. Both places must agree —
they didn't for a while, so anything using the `font-sans` utility silently
rendered in system UI.

Named sizes in `tailwind.config.ts`. Use these instead of hand-writing values:

| Class | Size | Use |
|---|---|---|
| `text-display` | 42px / 300 | The number inside the calorie arc |
| `text-title` | 26px / 600 | Page titles |
| `text-eyebrow` | 11px / 600 / 0.18em | Uppercase line above a title, section labels |

Everything else uses Tailwind's defaults (`text-sm`, `text-xs`, …).

**Never set body text below 16px** — `text-sm` is the practical floor for
anything read as prose. Small sizes are for labels and numeric annotations.

---

## Spacing

Tailwind's scale is the space scale. There is deliberately no second one.
Prefer utilities (`gap-3`, `px-4`, `space-y-3`) over inline `style` values.
Inline styles are acceptable for one-off geometry (an arc, a chart, a
draggable sprite) but not for layout that a utility already expresses.

Page bodies are `mx-auto max-w-md` with `px-4 py-4`. The app is phone-first;
there is currently no intentional layout above phone width, which is a
deliberate deferral rather than an oversight.

---

## Components — reach for these

Building a new one when these exist is how the system fragmented.

| Need | Use | Not |
|---|---|---|
| Modal / bottom sheet | `ui/Sheet` | A hand-rolled fixed overlay |
| Button | `ui/Button` (cva variants) | A styled `<button>` |
| Text input | `ui/Input`, `ui/LabeledInput` | A bare `<input>` |
| Row of exclusive choices | `ui/SegmentedControl` | Three divs and inline styles |
| Time-range picker on a chart | `ui/RangePills` | Hand-rolled pill row |
| Page title bar | `PageHeader` (`bar` or `display`) | Inline `fontSize: 26` |
| Confirm a destructive action | `ui/ConfirmDialog` | `window.confirm` |
| Transient feedback | `ui/toast` (supports undo) | A custom banner |
| One-time hint | `ui/CoachTip` | Permanent explanatory copy |
| Gate an AI feature | `AiFeatureGate` / `aiUnavailableReason` | Letting it fail after the upload |
| Get an image from the user | `CaptureOverlay` | `<input type="file">`, with or without `capture` |
| Offer the camera's capabilities | `CaptureChooser` | A new tab per capability |

### Capture

**Every image comes in through `CaptureOverlay`.** Live camera, shutter,
Gallery always beside it, a framing guide sized for what is being shot.

There used to be four mechanisms: this overlay, `<input capture>` (hands off
to the OS camera app), a bare `<input>` (gallery only), and a pair of the two.
So "take a photo" behaved differently depending on the screen, the meal photo
had no gallery at all on some Android builds, and the recipe scan could not
use the camera. Never reach for a file input again: `<input capture>` silently
falls back to the gallery picker on some Android builds, which is the
"I can only upload, never shoot" bug.

**Every capability is listed in one place.** `CaptureChooser` names the four
(barcode, nutrition label, meal photo, recipe) with a line each on when to use
them. It is the Capture tab in the add-food sheet and the ingredient picker,
where `omit` drops the ones that make no sense for that context. Recipe is
labelled with its different destination, since it saves a meal rather than
logging now.

Adding a fifth capability means one entry in `CaptureChooser` - not a new tab,
not a new button hidden inside another flow.

`SegmentedControl` has two variants: `track` (recessed track, raised active
segment — for switching between views) and `solid` (bordered row, accent-filled
active segment — for picking a setting value). `onDeselect` makes the selection
clearable for genuinely optional fields.

### Cards

The card shell is `rounded-2xl border border-border bg-card shadow-sm`. About
15 surfaces use it and they are byte-identical, which is fine — there is no
extracted `Card` component and none is needed.

**A card must be a real container** (a meal section, a settings group, a
chart). Cards as decoration, or a card grid standing in for layout, is the one
App-UI pattern to avoid.

---

## Accessibility — non-negotiable

- **4.5:1** on all text. Enforced by `contrast.test.ts`.
- **44px minimum touch target.** The `.tap-target` utility in `index.css`
  applies it. Every interactive control gets it, including small text links
  and pills — pad them out rather than shrinking the target.
- **Every control has an accessible name.** An icon-only button needs
  `aria-label`; a decorative icon inside a labelled control needs
  `aria-hidden="true"` so it isn't announced twice.
- **Exclusive choice groups** use `role="tablist"` + `role="tab"` +
  `aria-selected`. `SegmentedControl` and `RangePills` do this for you.
- **Gestures need a visible affordance.** Swipe-to-copy on diary rows has an
  edge grip because a gesture with no hint is a feature only its author knows
  about.

---

## States — every surface owes five

Loading, empty, error, success, partial. Coverage is good; keep it that way.

- **Empty states name the next action.** "No saved meals yet" plus a way to
  make one, not a dead end.
- **Check preconditions before the user spends effort**, not after. The AI
  features check for a sync code before opening a camera, because they used to
  check after the upload.
- **Destructive actions**: undo toast for frequent low-stakes ones (deleting a
  diary entry), `ConfirmDialog` for rare high-stakes ones (wiping data).

---

## Writing

Utility language. Orientation, status, action. Not mood or aspiration.

- Say what happened: "Copied to today", not "Success!"
- Name the fix in the error: "Connect a sync code in Settings to scan labels."
- No congratulation beyond a quiet acknowledgement. A tracker that celebrates
  loudly gets tiring by the third day — a macro hitting its target turns the
  bar accent-coloured and adds a check, and that is the whole celebration.
- Hyphens, not em dashes.

---

## Related

- `DESIGN_REVIEW.md` — the whole-app review this system was hardened by,
  including the findings and their scores.
- `ART_BRIEF.md` — the pet illustration brief, a separate concern.
- `src/index.css` — the tokens themselves, the source of truth.
