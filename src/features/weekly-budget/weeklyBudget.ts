/**
 * Calorie budget over a period (week or month).
 *
 * Two modes, chosen by the user:
 *
 * 'adjust' - the period's budget is `kcal_target × daysInPeriod` and a given
 *   day's target is recalculated as
 *
 *     adjusted = (period budget + carry-in − kcal eaten on earlier days) ÷ days left
 *
 *   so an overage on one day trims the rest of the period and a surplus rolls
 *   forward. `budget_max_daily_trim` caps how hard any one day can be trimmed.
 *
 * 'warn' - the target never moves off the daily goal. Days over it read as
 *   over, and the running balance below is shown on its own so the user can
 *   decide when (and how fast) to even it out.
 *
 * Carry-over is a DATE WINDOW, not a single previous period: when
 * `budget_carryover_start` is set, the balance accumulates day by day from
 * that date and nothing earlier is ever counted. Accumulating (rather than
 * reading only the previous period) is also what stops a trimmed period from
 * later reading as a surplus and refunding the very overage it just paid off.
 *
 * The week runs 7 days from a configurable start day; the month is the
 * calendar month.
 *
 * Every "daily goal" here is resolved PER DATE through `composedGoalsFor`,
 * not read once off `kcal_target`. A diet pause replaces the goal for the
 * days it covers, so a period that straddles the start of a maintenance
 * break is budgeted part at the cut goal and part at the maintenance one,
 * and a past break keeps being graded against the goal in force at the time.
 *
 * Reservations then move calories between days on top of that. Because their
 * deltas sum to zero, a reservation entirely inside the period leaves the
 * period budget untouched: the days that funded it gave up exactly what the
 * event day received, so there is no surplus for `adjust` mode to find and
 * hand back, which is what would otherwise undo the saving.
 */

import { addDays, differenceInCalendarDays, getDaysInMonth, startOfMonth } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import {
  fromLocalDate,
  shiftDate,
  toLocalDate,
  todayLocal,
  type LocalDate,
} from '@/lib/dates';
import { activePause, type DietPause } from '@/features/diet-pause/dietPause';
import { composedGoalsFor, loadSchedule } from '@/features/reservations/dailyGoal';
import { EMPTY_SCHEDULE, type ReservationSchedule } from '@/features/reservations/reservations';
import type { Profile } from '@/db/types';

export const WEEK_DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type BudgetPeriod = 'week' | 'month';
export type BudgetMode = 'off' | 'warn' | 'adjust';

/** Legacy soft floor: never drop a day below this fraction of the daily
 *  goal. Only used for profiles predating `budget_max_daily_trim`. */
const FLOOR_FRACTION = 0.7;

/** Hard ceiling on how far back a carry-over window is walked, so a start
 *  date left untouched for years can't turn every render into a huge scan.
 *  Older days are simply outside the window. */
const MAX_CARRYOVER_DAYS = 1096; // ~3 years

/**
 * Which mode the budget is in. Falls back to the pre-mode boolean so
 * profiles synced before the picker existed keep behaving as they did.
 */
export function resolveBudgetMode(profile: Profile | undefined): BudgetMode {
  if (!profile) return 'off';
  if (profile.budget_mode) return profile.budget_mode;
  return profile.weekly_budget_enabled ? 'adjust' : 'off';
}

/**
 * How far a day's target may be trimmed below the daily goal, in kcal.
 * Undefined = no limit. Honours the legacy 70% floor when the explicit
 * kcal cap has never been set on this profile.
 */
export function maxDailyTrimFor(
  profile: Profile,
  dailyGoal: number,
): number | undefined {
  const explicit = profile.budget_max_daily_trim;
  if (explicit !== undefined && explicit > 0) return explicit;
  if (explicit === undefined && profile.weekly_budget_floor) {
    return dailyGoal * (1 - FLOOR_FRACTION);
  }
  return undefined;
}

/**
 * How many kcal to take off today's target to work off a balance that is in
 * the red, at the user's chosen daily rate. Never more than is actually
 * owed - a 150/day rate against 40 kcal outstanding takes off 40, not 150,
 * so the paydown can't overshoot into a new surplus. Returns 0 when the
 * balance is level or banked, or when no rate is set.
 */
export function catchupTrim(
  catchup: number | undefined,
  balance: number,
): number {
  if (!catchup || catchup <= 0) return 0;
  if (balance >= 0) return 0;
  return Math.min(catchup, -balance);
}

/** Inclusive list of dates from `start` to `end`, empty when start > end.
 *  Truncated to the most recent MAX_CARRYOVER_DAYS. */
export function datesBetween(start: LocalDate, end: LocalDate): LocalDate[] {
  if (start > end) return [];
  const span = differenceInCalendarDays(fromLocalDate(end), fromLocalDate(start)) + 1;
  const n = Math.min(span, MAX_CARRYOVER_DAYS);
  const first = addDays(fromLocalDate(end), -(n - 1));
  return Array.from({ length: n }, (_, i) => toLocalDate(addDays(first, i)));
}

/** The local date the budget week containing `date` starts on. */
export function weekStartFor(date: LocalDate, weekStartDay: number): LocalDate {
  const d = fromLocalDate(date);
  const back = (d.getDay() - weekStartDay + 7) % 7;
  return toLocalDate(addDays(d, -back));
}

/** The 7 dates of the budget week containing `date`, in order. */
export function weekDates(date: LocalDate, weekStartDay: number): LocalDate[] {
  const start = fromLocalDate(weekStartFor(date, weekStartDay));
  return Array.from({ length: 7 }, (_, i) => toLocalDate(addDays(start, i)));
}

/** The dates of the calendar month containing `date`, in order. */
export function monthDates(date: LocalDate): LocalDate[] {
  const start = startOfMonth(fromLocalDate(date));
  const n = getDaysInMonth(start);
  return Array.from({ length: n }, (_, i) => toLocalDate(addDays(start, i)));
}

/** The ordered dates of the budget period (week or month) containing `date`. */
export function periodDatesFor(
  date: LocalDate,
  period: BudgetPeriod,
  weekStartDay: number,
): LocalDate[] {
  return period === 'month' ? monthDates(date) : weekDates(date, weekStartDay);
}

/** The dates of the period immediately before the one containing `date`. */
export function previousPeriodDatesFor(
  date: LocalDate,
  period: BudgetPeriod,
  weekStartDay: number,
): LocalDate[] {
  const dates = periodDatesFor(date, period, weekStartDay);
  const dayBeforeStart = toLocalDate(addDays(fromLocalDate(dates[0]), -1));
  return periodDatesFor(dayBeforeStart, period, weekStartDay);
}

/**
 * Carry-over balance from a finished period: budget minus what was actually
 * consumed across it. Positive = banked (the period came in under), negative
 * = overspent. Clamped to +/- `cap` kcal when `cap > 0`; no clamp otherwise.
 */
export function carryInClamped(
  prevBudget: number,
  prevConsumed: number,
  cap: number | undefined,
): number {
  return clampCarry(prevBudget - prevConsumed, cap);
}

/** Clamp a signed carry balance to +/- `cap` kcal; no clamp when cap <= 0. */
export function clampCarry(raw: number, cap: number | undefined): number {
  if (cap && cap > 0) return Math.max(-cap, Math.min(cap, raw));
  return raw;
}

/** Parse the profile's stored JSON array of "untracked" dates. */
export function parseUntrackedDates(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw) as unknown;
    return new Set(
      Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

/**
 * Resolve each week-day's effective consumption for the budget maths.
 *
 * A day is treated as "on-target" (counted as exactly THAT day's goal,
 * neither a saving nor an overage) when:
 *  - it is a *past* day with nothing logged at all - a day simply forgotten,
 *    which would otherwise look like a full day of banked calories; or
 *  - the user explicitly marked it "untracked" (e.g. a day they only
 *    half-logged and don't want skewing the week).
 * Counting it as the goal is mathematically the same as dropping the day
 * from the budget. Every other day uses its real logged value.
 *
 * `goals` is per-date, so an un-logged day inside a maintenance break is
 * neutralised at the maintenance goal, not the cut goal.
 */
export function effectiveDailyKcal(
  dates: LocalDate[],
  kcal: number[],
  logged: boolean[],
  today: LocalDate,
  goals: number[],
  untracked: Set<string>,
): { effective: number[]; missedCount: number } {
  let missedCount = 0;
  const effective = dates.map((d, i) => {
    const neutral = untracked.has(d) || (d < today && !logged[i]);
    if (neutral) {
      missedCount += 1;
      return goals[i];
    }
    return kcal[i];
  });
  return { effective, missedCount };
}

export interface WeeklyBudget {
  /** 'warn' (target fixed, balance shown) or 'adjust' (target recalculated). */
  mode: Exclude<BudgetMode, 'off'>;
  /** Whether the active period is a week or a calendar month. */
  periodLabel: BudgetPeriod;
  /** Index of `date` within its period (0 = the first day). */
  dayIndex: number;
  /** Days left in the period, including `date`. */
  daysRemaining: number;
  /** Base period budget = the sum of every day's own goal across the period.
   *  Not `goal x days`: a diet pause can raise part of the period only. */
  weeklyBudget: number;
  /** The goal in force on `date` itself - the maintenance figure while a
   *  diet pause covers it, otherwise `kcal_target`. */
  dailyGoal: number;
  /** The un-paused goal (`kcal_target`), for wording that contrasts the two. */
  baseGoal: number;
  /** The diet pause covering `date`, when there is one. */
  pause: DietPause | null;
  /** Signed kcal actually fed into this period's target. 0 in 'warn' mode
   *  and whenever carry-over has no start date. */
  carryIn: number;
  /**
   * The running balance through the day before `date`: positive = banked
   * (came in under), negative = owed. This is the "accumulated calories"
   * figure shown on its own so the user can pace clearing it themselves.
   */
  carryBalance: number;
  /** The date `carryBalance` accumulates from. */
  balanceFrom: LocalDate;
  /** True when a carry-over start date is configured. */
  carryoverOn: boolean;
  /** kcal the target was prevented from dropping by `budget_max_daily_trim`
   *  (0 when the cap did not bite). */
  trimHeldBack: number;
  /** 'warn' mode: kcal taken off today's target to work off the balance at
   *  the user's chosen rate (0 when off, or when nothing is owed). */
  catchupApplied: number;
  /** kcal eaten on the days before `date` this period. */
  consumedBeforeDay: number;
  /** kcal eaten on all days up to and including `date`. */
  weekConsumed: number;
  /** `date`'s recalculated kcal target. */
  adjustedTarget: number;
  /** True when the adjusted target differs from the plain daily goal. */
  isAdjusted: boolean;
  /** Past days this period with nothing logged (counted as on-target). */
  missedCount: number;
  weekStart: LocalDate;
  weekDates: LocalDate[];
}

/**
 * Sum each period-date's effective consumption: real logged kcal, except
 * un-logged past days and explicitly-untracked days count as exactly that
 * day's goal (neutral). Returns the per-day effective array, the per-day
 * goals, the total, and how many days were neutralised.
 */
async function fetchEffective(
  dates: LocalDate[],
  profile: Profile,
  schedule: ReservationSchedule,
): Promise<{
  effective: number[];
  goals: number[];
  total: number;
  budget: number;
  missedCount: number;
}> {
  const uid = currentUserId();
  const rows = await db.diary_entries
    .where('[user_id+date]')
    .between([uid, dates[0]], [uid, dates[dates.length - 1]], true, true)
    .filter((e) => !e.deleted_at)
    .toArray();
  const byDate = new Map<string, number>();
  const loggedDates = new Set<string>();
  for (const e of rows) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.kcal);
    loggedDates.add(e.date);
  }
  const kcal = dates.map((d) => byDate.get(d) ?? 0);
  const logged = dates.map((d) => loggedDates.has(d));
  const goals = composedGoalsFor(dates, profile, schedule);
  const { effective, missedCount } = effectiveDailyKcal(
    dates,
    kcal,
    logged,
    todayLocal(),
    goals,
    parseUntrackedDates(profile.untracked_dates),
  );
  return {
    effective,
    goals,
    total: effective.reduce((a, b) => a + b, 0),
    budget: goals.reduce((a, b) => a + b, 0),
    missedCount,
  };
}

/**
 * Signed running balance across `[start, end]` inclusive: the sum of each
 * day's own goal minus what was effectively consumed. Positive = banked,
 * negative = owed. Returns 0 for an empty or inverted range.
 *
 * Summing per-day goals is what keeps a maintenance break from reading as a
 * deficit blow-out: those days are measured against the maintenance figure
 * that was in force, so eating to it leaves the balance exactly level.
 */
export async function accumulatedBalance(
  start: LocalDate,
  end: LocalDate,
  profile: Profile,
  schedule: ReservationSchedule = EMPTY_SCHEDULE,
): Promise<number> {
  const dates = datesBetween(start, end);
  if (dates.length === 0) return 0;
  const { total, budget } = await fetchEffective(dates, profile, schedule);
  return budget - total;
}

/**
 * Budget computation for the diary day `date`. Returns null when the
 * feature is off (so callers fall back to the daily goal). Async and
 * hook-free so it can also be used outside React (e.g. the pet's wellbeing
 * roll-forward). Honours the mode, the week/month period, and the
 * carry-over window.
 */
export async function computeWeeklyBudget(
  date: LocalDate,
  profile: Profile | undefined,
): Promise<WeeklyBudget | null> {
  const mode = resolveBudgetMode(profile);
  if (!profile || mode === 'off') return null;
  const weekStartDay = profile.week_start_day ?? 1;
  const baseGoal = profile.kcal_target ?? 0;
  const period: BudgetPeriod = profile.budget_period ?? 'week';
  const dates = periodDatesFor(date, period, weekStartDay);
  const carryStart = profile.budget_carryover_start;
  const carryoverOn = !!carryStart;

  // Reservations move calories between days, so they are part of what each
  // day's goal IS before the budget reacts to anything.
  const schedule = await loadSchedule(profile);
  const { effective, goals, budget, missedCount } = await fetchEffective(
    dates,
    profile,
    schedule,
  );

  const dayIndex = Math.max(0, dates.indexOf(date));
  const daysRemaining = dates.length - dayIndex;
  // The period's budget is the sum of each day's own goal, so a break that
  // starts mid-week raises only the days it actually covers.
  const weeklyBudget = budget;
  const dailyGoal = goals[dayIndex] ?? baseGoal;
  const pause = activePause(date, profile);
  const consumedBeforeDay = effective
    .slice(0, dayIndex)
    .reduce((a, b) => a + b, 0);
  const weekConsumed = effective
    .slice(0, dayIndex + 1)
    .reduce((a, b) => a + b, 0);

  // Carry-in: everything banked or owed between the user's chosen start date
  // and the day this period opened. Accumulated day by day, so a period that
  // already paid a deficit down cannot read as a fresh surplus next time.
  let carryIn = 0;
  if (carryoverOn && mode === 'adjust') {
    const raw = await accumulatedBalance(
      carryStart,
      shiftDate(dates[0], -1),
      profile,
      schedule,
    );
    carryIn = clampCarry(raw, profile.budget_carryover_cap);
  }

  // The figure shown to the user: where they stand right now, from the
  // carry-over start date when set, otherwise just this period.
  const balanceFrom =
    carryoverOn && carryStart < dates[0] ? carryStart : dates[0];
  const carryBalance = await accumulatedBalance(
    balanceFrom,
    shiftDate(date, -1),
    profile,
    schedule,
  );

  let adjustedTarget = dailyGoal;
  let trimHeldBack = 0;
  // 'warn' mode leaves the target alone unless the user asked for a paydown
  // rate. Even then it is their number, applied only while something is owed.
  const catchupApplied =
    mode === 'warn' ? catchupTrim(profile.budget_warn_catchup, carryBalance) : 0;
  if (catchupApplied > 0) {
    adjustedTarget = Math.max(0, dailyGoal - catchupApplied);
  }
  if (mode === 'adjust') {
    adjustedTarget = (weeklyBudget + carryIn - consumedBeforeDay) / daysRemaining;
    const maxTrim = maxDailyTrimFor(profile, dailyGoal);
    if (maxTrim !== undefined) {
      const capped = Math.max(adjustedTarget, dailyGoal - maxTrim);
      trimHeldBack = capped - adjustedTarget;
      adjustedTarget = capped;
    }
    adjustedTarget = Math.max(0, adjustedTarget);
  }

  return {
    mode,
    periodLabel: period,
    dayIndex,
    daysRemaining,
    weeklyBudget,
    dailyGoal,
    baseGoal,
    pause,
    carryIn,
    carryBalance,
    balanceFrom,
    carryoverOn,
    trimHeldBack,
    catchupApplied,
    consumedBeforeDay,
    weekConsumed,
    adjustedTarget,
    isAdjusted: Math.abs(adjustedTarget - dailyGoal) >= 1,
    missedCount,
    weekStart: dates[0],
    weekDates: dates,
  };
}

/**
 * Live weekly-budget computation for the diary day `date`. Returns null
 * when the feature is disabled.
 */
export function useWeeklyBudget(
  date: LocalDate,
  profile: Profile | undefined,
): WeeklyBudget | null {
  return (
    useLiveQuery(() => computeWeeklyBudget(date, profile), [date, profile]) ??
    null
  );
}
