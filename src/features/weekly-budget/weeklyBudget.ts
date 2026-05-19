/**
 * Weekly calorie budget.
 *
 * When enabled, the week's budget is `kcal_target × 7` and a given day's
 * target is recalculated as:
 *
 *   adjusted = (weekly budget − kcal eaten on earlier days) ÷ days left
 *
 * so an overage on one day trims the rest of the week, and a surplus rolls
 * forward. The week runs for 7 days from a configurable start day.
 */

import { addDays } from 'date-fns';
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
 *  - it is a *past* day with nothing logged at all — a day simply forgotten,
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
  /** Index of `date` within its week (0 = the start day). */
  dayIndex: number;
  /** Days left in the week, including `date`. */
  daysRemaining: number;
  weeklyBudget: number;
  dailyGoal: number;
  /** kcal eaten on the days before `date` this week. */
  consumedBeforeDay: number;
  /** kcal eaten on all days up to and including `date`. */
  weekConsumed: number;
  /** `date`'s recalculated kcal target. */
  adjustedTarget: number;
  /** True when the adjusted target differs from the plain daily goal. */
  isAdjusted: boolean;
  /** Past days this week with nothing logged (counted as on-target). */
  missedCount: number;
  weekStart: LocalDate;
  weekDates: LocalDate[];
}

/**
 * Weekly-budget computation for the diary day `date`. Returns null when
 * the feature is disabled (so callers fall back to the daily goal). Async
 * and hook-free so it can also be used outside React (e.g. the pet's
 * wellbeing roll-forward).
 */
export async function computeWeeklyBudget(
  date: LocalDate,
  profile: Profile | undefined,
): Promise<WeeklyBudget | null> {
  if (!profile?.weekly_budget_enabled) return null;
  const weekStartDay = profile.week_start_day ?? 1;
  const dailyGoal = profile.kcal_target ?? 0;
  const floor = !!profile.weekly_budget_floor;
  const dates = weekDates(date, weekStartDay);

  const uid = currentUserId();
  const rows = await db.diary_entries
    .where('[user_id+date]')
    .between([uid, dates[0]], [uid, dates[6]], true, true)
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

  // Un-logged past days + explicitly-untracked days count as on-target so
  // they don't skew the budget.
  const { effective, missedCount } = effectiveDailyKcal(
    dates,
    kcal,
    logged,
    todayLocal(),
    dailyGoal,
    parseUntrackedDates(profile.untracked_dates),
  );

  const dayIndex = Math.max(0, dates.indexOf(date));
  const daysRemaining = 7 - dayIndex;
  const weeklyBudget = dailyGoal * 7;
  const consumedBeforeDay = effective
    .slice(0, dayIndex)
    .reduce((a, b) => a + b, 0);
  const weekConsumed = effective
    .slice(0, dayIndex + 1)
    .reduce((a, b) => a + b, 0);

  let adjustedTarget = (weeklyBudget - consumedBeforeDay) / daysRemaining;
  if (floor) {
    adjustedTarget = Math.max(adjustedTarget, dailyGoal * FLOOR_FRACTION);
  }
  adjustedTarget = Math.max(0, adjustedTarget);

  return {
    dayIndex,
    daysRemaining,
    weeklyBudget,
    dailyGoal,
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
