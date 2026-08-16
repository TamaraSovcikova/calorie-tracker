/**
 * Calorie reservations - set aside calories for a day, funded by trimming
 * the days around it.
 *
 * The invariant everything rests on: **a reservation moves calories between
 * days and never creates them.** Its deltas sum to zero across its span.
 *
 * That is not tidiness, it is what makes the feature survive contact with
 * the calorie budget. The naive version ("eat 70 less on Monday") has the
 * budget read Monday's under-eating as a surplus and hand it straight back
 * on Tuesday, silently undoing the saving. Lowering Monday's *goal* instead
 * produces no surplus at all, so the budget sees nothing unusual and the
 * period budget is unchanged.
 *
 * The funding window is derived, never stored, and never moves:
 *
 *     windowStart = max(eventDate - spread, createdDate)
 *
 * Deriving it from the creation date rather than from "today" is what keeps
 * history still. Recomputing against today would shrink the window as days
 * passed, retroactively zeroing the deltas of days that had already been
 * eaten to - the same trap the diet pause avoids by storing dated windows.
 *
 * When the window cannot carry the whole request without pushing a day
 * below its floor, the reservation is funded to whatever the window CAN
 * carry and the shortfall is reported. It is never quietly funded in part
 * and presented as done, and the event day never gets more than was
 * actually saved, because that would break the invariant above.
 */

import { shiftDate, type LocalDate } from '@/lib/dates';
import type { Reservation } from '@/db/types';

/** Default floor when the user has set no explicit trim limit: never below
 *  70% of the day's goal, and never below this many kcal outright. */
const DEFAULT_FLOOR_KCAL = 1200;
const DEFAULT_FLOOR_FRACTION = 0.7;

/** Longest funding window offered, and the hard ceiling on a stored one. */
export const MAX_SPREAD_DAYS = 21;

/** Planning is capped so a runaway list cannot make every render walk it. */
const MAX_PLANNED = 200;

/** Sub-kcal noise; anything under this is treated as zero. */
const EPSILON = 0.001;

export type FundMode = 'before' | 'after' | 'split';

export const FUND_MODE_LABELS: Record<FundMode, string> = {
  before: 'Save up beforehand',
  after: 'Pay it back after',
  split: 'Split either side',
};

/**
 * The date a reservation was created, which is the earliest day it may fund
 * from - you cannot have saved on a day before you decided to.
 */
export function createdDateOf(r: Reservation): LocalDate {
  return r.created_date ?? r.created_at.slice(0, 10);
}

/**
 * The days that pay for a reservation, in order, never including the event
 * day itself. Empty when there is nowhere to fund from, which is a real
 * outcome and reported as such rather than hidden.
 */
export function fundingDates(r: Reservation): LocalDate[] {
  const spread = Math.max(1, Math.min(MAX_SPREAD_DAYS, Math.round(r.spread_days)));
  const created = createdDateOf(r);
  const out: LocalDate[] = [];

  const beforeSpread =
    r.fund_mode === 'before' ? spread : r.fund_mode === 'split' ? Math.ceil(spread / 2) : 0;
  const afterSpread =
    r.fund_mode === 'after' ? spread : r.fund_mode === 'split' ? Math.floor(spread / 2) : 0;

  for (let i = beforeSpread; i >= 1; i--) {
    const d = shiftDate(r.date, -i);
    // Never fund from before the reservation existed, and never from the
    // event day itself.
    if (d < created || d >= r.date) continue;
    out.push(d);
  }
  for (let i = 1; i <= afterSpread; i++) {
    out.push(shiftDate(r.date, i));
  }
  return out;
}

/**
 * The lowest a day's goal may be taken by reservations.
 *
 * An explicit `budget_max_daily_trim` is the user's own stated pace and is
 * honoured as-is. With nothing set, the default is the stricter of 70% of
 * the day's goal and a flat 1200 kcal.
 */
export function floorFor(baseGoal: number, maxDailyTrim: number | undefined): number {
  if (maxDailyTrim !== undefined && maxDailyTrim > 0) {
    return Math.max(0, baseGoal - maxDailyTrim);
  }
  return Math.min(baseGoal, Math.max(DEFAULT_FLOOR_KCAL, baseGoal * DEFAULT_FLOOR_FRACTION));
}

/** Why a reservation could not be funded in full. */
export type ShortfallReason = 'none' | 'no-days' | 'floor';

export interface ReservationPlan {
  id: string;
  /** What was asked for. */
  requested: number;
  /** What the window could actually carry, and so what the event day gets. */
  funded: number;
  /** requested - funded, always >= 0. */
  shortfall: number;
  reason: ShortfallReason;
  /** Days that contribute, in order. Excludes days that came out at zero. */
  days: LocalDate[];
  /** kcal taken off each contributing day (positive numbers). */
  perDay: Map<LocalDate, number>;
  /** The even per-day figure, for copy like "69 kcal off each day". Zero
   *  when nothing could be funded. */
  evenPerDay: number;
}

export interface ReservationSchedule {
  /** Signed goal adjustment for each affected date. Sums to zero. */
  deltaByDate: Map<LocalDate, number>;
  plans: ReservationPlan[];
  byId: Map<string, ReservationPlan>;
}

export const EMPTY_SCHEDULE: ReservationSchedule = {
  deltaByDate: new Map(),
  plans: [],
  byId: new Map(),
};

/**
 * Spread `target` kcal across `days` without taking any day past its
 * capacity: an even share first, then whatever a day could not absorb is
 * offered again to the days that still have room, until the target is met
 * or every day is full.
 */
function waterfill(
  days: LocalDate[],
  target: number,
  capacityOf: (d: LocalDate) => number,
): Map<LocalDate, number> {
  const alloc = new Map<LocalDate, number>();
  let remaining = target;
  let pool = days.filter((d) => capacityOf(d) > EPSILON);

  while (remaining > EPSILON && pool.length > 0) {
    const share = remaining / pool.length;
    const next: LocalDate[] = [];
    let placed = 0;
    for (const d of pool) {
      const room = capacityOf(d) - (alloc.get(d) ?? 0);
      const take = Math.min(share, room);
      if (take > 0) {
        alloc.set(d, (alloc.get(d) ?? 0) + take);
        placed += take;
      }
      if (room - take > EPSILON) next.push(d);
    }
    remaining -= placed;
    // No day could take anything: the window is full, stop rather than spin.
    if (placed <= EPSILON) break;
    pool = next;
  }
  return alloc;
}

/**
 * Work out what every reservation actually costs each day.
 *
 * Reservations are planned soonest-event-first, because the nearest event
 * has the least room to manoeuvre and should get first call on the days it
 * can still reach. Each one takes only the capacity left after the ones
 * before it, so two events close together compound safely instead of
 * jointly pushing a day through the floor.
 */
export function planReservations(
  reservations: Reservation[],
  baseGoalFor: (date: LocalDate) => number,
  maxDailyTrim: number | undefined,
): ReservationSchedule {
  const active = reservations
    .filter((r) => !r.deleted_at && r.kcal > 0)
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : 1,
    )
    .slice(0, MAX_PLANNED);

  const deltaByDate = new Map<LocalDate, number>();
  const used = new Map<LocalDate, number>();
  const plans: ReservationPlan[] = [];

  const addDelta = (d: LocalDate, v: number) =>
    deltaByDate.set(d, (deltaByDate.get(d) ?? 0) + v);

  for (const r of active) {
    const days = fundingDates(r);
    const capacityOf = (d: LocalDate) => {
      const base = baseGoalFor(d);
      return Math.max(0, base - floorFor(base, maxDailyTrim) - (used.get(d) ?? 0));
    };

    const alloc = days.length > 0 ? waterfill(days, r.kcal, capacityOf) : new Map();
    let funded = 0;
    const perDay = new Map<LocalDate, number>();
    const contributing: LocalDate[] = [];
    for (const d of days) {
      const take = alloc.get(d) ?? 0;
      if (take <= EPSILON) continue;
      perDay.set(d, take);
      contributing.push(d);
      funded += take;
      used.set(d, (used.get(d) ?? 0) + take);
      addDelta(d, -take);
    }
    // The event day gets exactly what was saved, never the full request -
    // handing over calories that were never funded would break the
    // zero-sum invariant and quietly blow the period budget.
    if (funded > EPSILON) addDelta(r.date, funded);

    const shortfall = Math.max(0, r.kcal - funded);
    plans.push({
      id: r.id,
      requested: r.kcal,
      funded,
      shortfall,
      reason:
        shortfall <= EPSILON ? 'none' : days.length === 0 ? 'no-days' : 'floor',
      days: contributing,
      perDay,
      evenPerDay: contributing.length > 0 ? funded / contributing.length : 0,
    });
  }

  return {
    deltaByDate,
    plans,
    byId: new Map(plans.map((p) => [p.id, p])),
  };
}

/**
 * What a given day owes to reservations, split into the funding it is doing
 * and the event it is hosting. Both can be present at once when one event
 * funds another.
 */
/** A plan paired with the row it came from, so callers have the label. */
export interface PlannedReservation {
  plan: ReservationPlan;
  reservation: Reservation;
}

export interface DayReservationEffect {
  /** kcal taken off this day to fund events elsewhere (positive). */
  saving: number;
  /** kcal handed to this day by its own reservation (positive). */
  event: number;
  /** Net delta on the day's goal. */
  net: number;
  /** Reservations this day is saving towards. */
  fundingFor: PlannedReservation[];
  /** The reservation landing on this day, if any. */
  hosting: PlannedReservation | null;
}

export function dayEffect(
  date: LocalDate,
  reservations: Reservation[],
  schedule: ReservationSchedule,
): DayReservationEffect {
  const byId = new Map(reservations.map((r) => [r.id, r]));
  let saving = 0;
  const fundingFor: PlannedReservation[] = [];
  for (const plan of schedule.plans) {
    const take = plan.perDay.get(date);
    const reservation = byId.get(plan.id);
    if (!reservation) continue;
    if (take !== undefined && take > EPSILON) {
      saving += take;
      fundingFor.push({ plan, reservation });
    }
  }
  const hosted = reservations.find((r) => r.date === date && !r.deleted_at);
  const hostedPlan = hosted ? schedule.byId.get(hosted.id) : undefined;
  const hosting =
    hosted && hostedPlan ? { plan: hostedPlan, reservation: hosted } : null;
  const event = hosting?.plan.funded ?? 0;
  return { saving, event, net: event - saving, fundingFor, hosting };
}

/**
 * Preview a reservation that has not been created yet, so the sheet can show
 * the per-day cost and any shortfall before anything is saved.
 */
export function previewReservation(
  draft: Pick<Reservation, 'date' | 'kcal' | 'fund_mode' | 'spread_days'>,
  createdDate: LocalDate,
  existing: Reservation[],
  baseGoalFor: (date: LocalDate) => number,
  maxDailyTrim: number | undefined,
): ReservationPlan {
  const provisional: Reservation = {
    ...(draft as Reservation),
    id: '__preview__',
    created_date: createdDate,
    // Sorts last among same-date reservations, so a preview takes only the
    // capacity genuinely left over rather than displacing a saved one.
    created_at: '9999-12-31T00:00:00.000Z',
  };
  const schedule = planReservations(
    [...existing, provisional],
    baseGoalFor,
    maxDailyTrim,
  );
  return (
    schedule.byId.get('__preview__') ?? {
      id: '__preview__',
      requested: draft.kcal,
      funded: 0,
      shortfall: draft.kcal,
      reason: 'no-days',
      days: [],
      perDay: new Map(),
      evenPerDay: 0,
    }
  );
}
