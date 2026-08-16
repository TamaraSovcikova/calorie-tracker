# Calorie banking (reservations)

Status: **built and deployed**, all three steps, chat #4h. Written as a design
doc after the diet pause landed and made the daily goal a function of the
date; kept as the record of why it is shaped this way.

Unverified by eye: none of it has been used on a device yet.

What shipped, against the order at the bottom of this file:

1. `explainTarget` + `TargetBreakdownSheet` - tapping the "x of y" line on
   the diary arc opens the ledger.
2. `reservations.ts` (planning), `dailyGoal.ts` (composition), the
   `reservations` table through Dexie v6 and D1, `/reserve`,
   `ReservationDayNote`.
3. `ReserveItemPicker` (library search at a real portion), `logReserved.ts`
   (one-tap log on the day, and the report against the reservation).

Still open from "Open questions" below: the default spread is a flat 7 days,
not the days left in the period; the floor is a hard no with no confirm-to-
override; overlapping funding windows compound safely (tested) but there is
no warning when two events are close enough to squeeze each other.

## The ask

Set aside calories for a day or a specific thing you want to eat. Pick the
day and either the food (a slice of birthday cake) or a number, and the days
around it re-plan themselves to pay for it. The calculation has to be visible,
so a lower target on Wednesday is never a mystery.

## The one idea the whole feature rests on

**A reservation moves calories between days. It never creates or destroys
them.** The deltas sum to zero across the reservation's span.

This is not an aesthetic preference, it is what makes the feature compose
with the calorie budget instead of fighting it. Consider the naive version:
"eat 70 less on Monday to save for Saturday". In `adjust` mode the budget
sees Monday come in under goal, reads it as a surplus, and raises Tuesday by
the same 70. The saving is undone the next morning, silently.

Lower Monday's **goal** instead and the arithmetic works out: eating to the
new goal produces no surplus, the budget sees nothing unusual, and the
period budget is unchanged because the funding days lost exactly what the
event day gained.

The diet pause already turned the daily goal into a per-date lookup
(`goalResolver` in `src/features/diet-pause/dietPause.ts`). Reservations are
the second modifier on that same value, so most of the plumbing exists.

## How a day's target is assembled

In order. Each step feeds the next.

| Step | Effect | Where it comes from |
|---|---|---|
| 1. Base goal | `kcal_target` | Settings, Goals |
| 2. Diet pause | replaces the base | active pause window |
| 3. Reservations | signed delta, sums to zero | this feature |
| 4. Budget | `adjust` recalculation, or `warn` catch-up | weekly budget |
| 5. Eat-back | plus exercise calories | eat_back_burned |

Reservations sit before the budget because they are a plan, and the budget
is a reaction to what actually happened. Putting them the other way round
would let a bad Tuesday eat into money already earmarked for Saturday.

## The funding maths

For a reservation of `K` kcal on date `D` with funding window `W`:

- `delta(D) = +K`
- `delta(w) = -K / |W|` for every `w` in `W`

`W` is chosen by the funding mode:

- **before** (default): the `spread` days ending the day before `D`.
- **after**: the `spread` days starting the day after `D`.
- **split**: half the amount from each side, rounded so the totals still net
  to zero.

Three constraints, all of which must be visible when they bite:

1. **A floor.** No day's goal drops below `budget_max_daily_trim` when set,
   otherwise `max(1200, 0.7 x kcal_target)`. The floor is never breached
   quietly.
2. **Only future days can fund.** A day that has already happened cannot be
   re-planned, so the window starts at today at the earliest. This is why
   `after` and `split` exist: reserve 800 kcal for tomorrow and there is
   exactly one day in front of it, which cannot carry the load.
3. **Under-funding is stated.** If `W` cannot carry `K` without breaching
   the floor, the app says so and offers the three real options: widen the
   window, split it across both sides, or reserve less. It never funds 60%
   of the request and presents that as done.

The spread control should show its own cost while being dragged: "7 days
before, 69 kcal/day off" against "3 days, 160 kcal/day off". That trade is
the actual decision being made, so it belongs on screen rather than in a
help note.

## What you are reserving

Three routes to the number, in increasing order of how much the app knows:

1. **A number.** "500 kcal for Saturday."
2. **A food or a saved meal.** Search the library through the unified
   matcher (`matchesSearchQuery`), pick a portion through the existing
   portion picker, and the kcal and macros come out real. This is the "eat
   cake on my birthday" half of the request.
3. **A rough preset.** Restaurant meal, a few drinks, takeaway. Labelled as
   estimates, because they are.

Route 2 earns its complexity on the day itself: the diary can offer one tap
to log the reserved item into the right section, and afterwards report
against the reservation rather than against the day. "Reserved 480, logged
512, 32 over" is a more useful sentence than "you are 32 over your target".

## Storage

A real table, not JSON on the profile.

The diet pause went on the profile as a JSON string because pauses are rare,
singular, and have no identity worth syncing separately. Reservations are
none of those things: several can be live at once, they get edited from more
than one device, they carry a `food_id` reference, and cancelling one should
not rewrite a blob containing the others.

```
reservations
  id           TEXT PRIMARY KEY
  user_id      TEXT NOT NULL
  date         TEXT NOT NULL   -- the day being funded
  kcal         REAL NOT NULL
  label        TEXT NOT NULL
  food_id      TEXT            -- when reserved from the library
  meal_id      TEXT
  qty          REAL
  unit         TEXT
  fund_mode    TEXT NOT NULL   -- 'before' | 'after' | 'split'
  spread_days  INTEGER NOT NULL
  created_at   TEXT NOT NULL
  updated_at   TEXT NOT NULL
  deleted_at   TEXT
```

Cost: one Dexie version bump (v6), one `CREATE TABLE` in `worker/schema.sql`,
one entry in `TABLES` and `COLUMNS` in `worker/sync.ts`. The same shape as
every other synced table, so no new sync machinery.

Index `[user_id+date]` to match how every other table is queried.

## Where it lives

The bottom nav holds four items and is full. A fifth narrows every tab and
the icon set already failed a trunk test once (see the comment in
`Layout.tsx`). So: **a `/reserve` route, not a fifth tab**, with the entry
points doing the discovery work.

- A pill on the diary beside the running-balance pill, present only while a
  reservation is live: "Cake, Sat - saving 69/day". That strip is already
  where the eye goes for calorie-balance information.
- "Reserve calories" in the diary overflow menu.
- A card in Settings under Tracking, next to Goals and Diet pause.

If the pill proves too quiet after a week of use, promoting it to a fifth
tab is a small change. Starting with the tab is the harder thing to undo.

## Making the calculation visible

This is the part the request actually turns on, and it is worth building
first, before any reservation exists.

**A "Why this number?" sheet**, opened by tapping the target on the diary:

```
Base goal                     1,700
Diet pause (maintenance)       +500   ->  2,200
Saving for Birthday cake        -69   ->  2,131
Weekly budget (240 over)        -80   ->  2,051
Exercise eaten back            +180   ->  2,231
                              ======
Today's target                 2,231
```

Every row taps through to whatever set it. Rows that are not in play are
absent rather than shown as zero.

It pays for itself immediately: the diet pause and the budget adjustment
both already move the target today, and neither is explained anywhere except
the Pet page and a small pill. Shipping the sheet on its own would be an
improvement with no new data model behind it.

Alongside it, on the diary itself:

- A one-line reason under the target on any funding day: "-69 kcal, saving
  for Birthday cake (Sat 12 Sep)". Visible without opening anything.
- On the event day: "Birthday cake: 480 kcal reserved, saved over the last 7
  days", with the one-tap log when the reservation came from the library.

## Deliberate non-features

**No automatic repayment when the event overruns.** Reserve 480, eat 900,
and the 420 flows into the ordinary budget balance like any other overage.
The app does not invent a payback plan, because `budget_warn_catchup` and
`budget_max_daily_trim` already exist and already carry a rate the user
chose. Reservations plan forward; the budget answers for the past. One job
each.

**No recurrence.** Birthdays repeat, but a recurrence model is a large
feature wearing a small hat. A "repeat yearly" flag can be added later
without changing anything designed here.

**Cancelling does not rewrite history.** Drop a reservation and future
funding days go back to their normal goal. Funding days already past keep
the lowered goal they had, which means the calories saved on them are now
simply banked in the running balance. That is the honest outcome and it
needs one line of UI copy, not special-case maths.

## Known sharp edge

The budget's running balance is `sum(goals) - sum(consumed)` over a date
window starting at `budget_carryover_start`. Reservation deltas net to zero
only when the whole span sits inside that window. A funding day earlier than
the carry-over start would contribute its `-K/|W|` to nothing, and the event
day's `+K` would read as a windfall.

Fix by clamping: a funding window never reaches earlier than
`budget_carryover_start`. A funding day outside the balance window is
meaningless anyway, and clamping is cheaper than netting the deltas out
afterwards.

## Suggested order of work

1. **The "Why this number?" sheet.** No new data. Explains the pause and the
   budget, which already move the target and currently do so quietly.
2. **Reservations, core.** Table, sync, per-day deltas, funding maths with
   the floor and the under-funding message, the diary reason line, the pill,
   the `/reserve` page. Numbers and presets only.
3. **Reserve a food.** Library search, portion picker, macros, the one-tap
   log on the day and the report against the reservation afterwards.

Each step is shippable on its own.

## Open questions

- Default spread: 7 days, or the days remaining in the current budget
  period? The second keeps a reservation inside one period, which sidesteps
  the carry-over edge entirely, but behaves oddly for an event early in a
  week.
- Should a reservation be allowed to push a day below the floor if the user
  explicitly confirms it? Currently designed as a hard no.
- Multiple reservations funding from overlapping windows: the deltas add,
  and the floor applies to the total. Needs a test, and probably a warning
  when two events are close enough to compound.
