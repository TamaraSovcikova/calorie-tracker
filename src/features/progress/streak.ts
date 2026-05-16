import { fromLocalDate, shiftDate, todayLocal, type LocalDate } from '@/lib/dates';
import { differenceInCalendarDays } from 'date-fns';

/**
 * "At least one food entry that day" streak rule.
 *
 * The streak is the number of consecutive logged days ending today (if today
 * has an entry) or yesterday (otherwise). Tomorrow doesn't count. Future
 * dates are ignored.
 */
export function computeStreak(loggedDates: LocalDate[]): number {
  if (loggedDates.length === 0) return 0;
  const set = new Set(loggedDates);
  const today = todayLocal();
  const yesterday = shiftDate(today, -1);

  // Streak ends today if today is logged, otherwise yesterday — but only if
  // yesterday is logged. Otherwise streak is 0.
  let cursor: LocalDate;
  if (set.has(today)) cursor = today;
  else if (set.has(yesterday)) cursor = yesterday;
  else return 0;

  let count = 0;
  while (set.has(cursor)) {
    count += 1;
    cursor = shiftDate(cursor, -1);
    // Safety net — bail if we somehow walk impossibly far back.
    const daysBack = Math.abs(
      differenceInCalendarDays(fromLocalDate(today), fromLocalDate(cursor)),
    );
    if (daysBack > 5000) break;
  }
  return count;
}

export interface StreakStats {
  /** Consecutive logged days ending today/yesterday. */
  current: number;
  /** Longest consecutive run ever. */
  longest: number;
  /** Total distinct days with at least one entry. */
  totalDays: number;
}

/** Current streak plus longest-ever run and total days logged. */
export function computeStreakStats(loggedDates: LocalDate[]): StreakStats {
  const today = todayLocal();
  const unique = [...new Set(loggedDates)].filter((d) => d <= today).sort();
  let longest = 0;
  let run = 0;
  let prev: LocalDate | null = null;
  for (const d of unique) {
    run = prev !== null && shiftDate(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  return {
    current: computeStreak(loggedDates),
    longest,
    totalDays: unique.length,
  };
}
