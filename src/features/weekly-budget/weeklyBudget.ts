/**
 * Calorie budget over a period (week or month).
 *
 * When enabled, the period's budget is `kcal_target × daysInPeriod` and a
 * given day's target is recalculated as:
 *
 *   adjusted = (period budget + carry-in − kcal eaten on earlier days) ÷ days left
 *
 * so an overage on one day trims the rest of the period, and a surplus rolls
 * forward. With carry-over on, a period's net surplus/deficit also rolls into
 * the next period (so an overage on the very last day is not forgotten). The
 * week runs 7 days from a configurable start day; the month is the calendar
 * month.
 */

import { addDays, getDaysInMonth, startOfMonth } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import {
  fromLocalDate,
  toLocalDate,
  todayLocal,
  type LocalDate,
} from '@/lib/dates';
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

/** Never drop a day below this fraction of the daily goal when the soft
 *  floor is enabled. */
const FLOOR_FRACTION = 0.7;

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
  const raw = prevBudget - prevConsumed;
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
 * A day is treated as "on-target" (counted as exactly the daily goal,
 * neither a saving nor an overage) when:
 *  - it is a *past* day with nothing logged at all - a day simply forgotten,
 *    which would otherwise look like a full day of banked calories; or
 *  - the user explicitly marked it "untracked" (e.g. a day they only
 *    half-logged and don't want skewing the week).
 * Counting it as the goal is mathematically the same as dropping the day
 * from the budget. Every other day uses its real logged value.
 */
export function effectiveDailyKcal(
  dates: LocalDate[],
  kcal: number[],
  logged: boolean[],
  today: LocalDate,
  dailyGoal: number,
  untracked: Set<string>,
): { effective: number[]; missedCount: number } {
  let missedCount = 0;
  const effective = dates.map((d, i) => {
    const neutral = untracked.has(d) || (d < today && !logged[i]);
    if (neutral) {
      missedCount += 1;
      return dailyGoal;
    }
    return kcal[i];
  });
  return { effective, missedCount };
}

export interface WeeklyBudget {
  /** Whether the active period is a week or a calendar month. */
  periodLabel: BudgetPeriod;
  /** Index of `date` within its period (0 = the first day). */
  dayIndex: number;
  /** Days left in the period, including `date`. */
  daysRemaining: number;
  /** Base period budget = daily goal x days in the period. */
  weeklyBudget: number;
  dailyGoal: number;
  /** Signed kcal carried in from the previous period (0 when carry-over off). */
  carryIn: number;
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
 * un-logged past days and explicitly-untracked days count as exactly the
 * daily goal (neutral). Returns the per-day effective array, the total, and
 * how many days were neutralised. Shared by the current + previous period.
 */
async function fetchEffective(
  dates: LocalDate[],
  profile: Profile,
  dailyGoal: number,
): Promise<{ effective: number[]; total: number; missedCount: number }> {
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
  const { effective, missedCount } = effectiveDailyKcal(
    dates,
    kcal,
    logged,
    todayLocal(),
    dailyGoal,
    parseUntrackedDates(profile.untracked_dates),
  );
  return {
    effective,
    total: effective.reduce((a, b) => a + b, 0),
    missedCount,
  };
}

/**
 * Budget computation for the diary day `date`. Returns null when the
 * feature is disabled (so callers fall back to the daily goal). Async and
 * hook-free so it can also be used outside React (e.g. the pet's wellbeing
 * roll-forward). Honours the week/month period and optional carry-over.
 */
export async function computeWeeklyBudget(
  date: LocalDate,
  profile: Profile | undefined,
): Promise<WeeklyBudget | null> {
  if (!profile?.weekly_budget_enabled) return null;
  const weekStartDay = profile.week_start_day ?? 1;
  const dailyGoal = profile.kcal_target ?? 0;
  const floor = !!profile.weekly_budget_floor;
  const period: BudgetPeriod = profile.budget_period ?? 'week';
  const dates = periodDatesFor(date, period, weekStartDay);

  const { effective, missedCount } = await fetchEffective(
    dates,
    profile,
    dailyGoal,
  );

  // Carry-over: roll the previous period's net surplus/deficit into this one.
  let carryIn = 0;
  if (profile.budget_carryover_enabled) {
    const prevDates = previousPeriodDatesFor(date, period, weekStartDay);
    const prev = await fetchEffective(prevDates, profile, dailyGoal);
    carryIn = carryInClamped(
      dailyGoal * prevDates.length,
      prev.total,
      profile.budget_carryover_cap,
    );
  }

  const dayIndex = Math.max(0, dates.indexOf(date));
  const daysRemaining = dates.length - dayIndex;
  const weeklyBudget = dailyGoal * dates.length;
  const consumedBeforeDay = effective
    .slice(0, dayIndex)
    .reduce((a, b) => a + b, 0);
  const weekConsumed = effective
    .slice(0, dayIndex + 1)
    .reduce((a, b) => a + b, 0);

  let adjustedTarget =
    (weeklyBudget + carryIn - consumedBeforeDay) / daysRemaining;
  if (floor) {
    adjustedTarget = Math.max(adjustedTarget, dailyGoal * FLOOR_FRACTION);
  }
  adjustedTarget = Math.max(0, adjustedTarget);

  return {
    periodLabel: period,
    dayIndex,
    daysRemaining,
    weeklyBudget,
    dailyGoal,
    carryIn,
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
