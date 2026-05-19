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
import { fromLocalDate, toLocalDate, type LocalDate } from '@/lib/dates';
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
  weekStart: LocalDate;
  weekDates: LocalDate[];
}

/**
 * Live weekly-budget computation for the diary day `date`. Returns null
 * when the feature is disabled (so callers fall back to the daily goal).
 */
export function useWeeklyBudget(
  date: LocalDate,
  profile: Profile | undefined,
): WeeklyBudget | null {
  const enabled = !!profile?.weekly_budget_enabled;
  const weekStartDay = profile?.week_start_day ?? 1;
  const dailyGoal = profile?.kcal_target ?? 0;
  const floor = !!profile?.weekly_budget_floor;

  const dates = enabled ? weekDates(date, weekStartDay) : [];
  const first = dates[0];
  const last = dates[6];

  const perDay = useLiveQuery(async () => {
    if (!enabled || !first || !last) return null;
    const uid = currentUserId();
    const rows = await db.diary_entries
      .where('[user_id+date]')
      .between([uid, first], [uid, last], true, true)
      .filter((e) => !e.deleted_at)
      .toArray();
    const byDate = new Map<string, number>();
    for (const e of rows) {
      byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.kcal);
    }
    return dates.map((d) => byDate.get(d) ?? 0);
  }, [enabled, first, last]);

  if (!enabled || !perDay) return null;

  const dayIndex = Math.max(0, dates.indexOf(date));
  const daysRemaining = 7 - dayIndex;
  const weeklyBudget = dailyGoal * 7;
  const consumedBeforeDay = perDay
    .slice(0, dayIndex)
    .reduce((a, b) => a + b, 0);
  const weekConsumed = perDay
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
    weekStart: dates[0],
    weekDates: dates,
  };
}
