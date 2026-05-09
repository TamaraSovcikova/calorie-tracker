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
