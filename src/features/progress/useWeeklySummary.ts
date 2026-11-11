import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { shiftDate, todayLocal, type LocalDate } from '@/lib/dates';
import {
  averageEffective,
  parseDayMarks,
  resolveDay,
  type DayKind,
} from '@/features/day-status/dayStatus';
import {
  composedGoalResolver,
  loadSchedule,
} from '@/features/reservations/dailyGoal';
import type { Profile } from '@/db/types';

export interface DailySummary {
  date: LocalDate;
  /** kcal as logged. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  hasEntries: boolean;
  /** That day's own goal (diet pause and reservations applied). */
  goal: number;
  kind: DayKind;
  /** kcal the day counts as: logged, or goal + estimate. */
  counted: number;
  /** Whether it is part of the averages. */
  inAverage: boolean;
  /** Looks under-logged and has not been answered yet. */
  suspect: boolean;
}

export interface WeeklySummary {
  days: DailySummary[];
  avgKcal: number;
  avgProtein: number;
  daysHitTarget: number; // count of days within ±10% of that day's goal
  /** Days in the averages. */
  daysCounted: number;
  /** Past days left out: nothing logged, or marked untracked. */
  daysLeftOut: number;
  /** Days left out because they look under-logged and are unanswered. */
  daysUnanswered: number;
}

/**
 * Per-day intake over the last `rangeDays`, and averages over the days that
 * were really tracked.
 *
 * The average used to take every day with any entry at face value, so a day
 * with one logged snack counted as a 300 kcal day and the "average" read far
 * below what was eaten. Days marked untracked are now left out and days with
 * an estimate count as the estimate (see `resolveDay`). Each day is also
 * judged against its own goal rather than today's `kcal_target`.
 */
export function useWeeklySummary(
  profile: Profile,
  rangeDays = 7,
): WeeklySummary | undefined {
  return useLiveQuery(async () => {
    const today = todayLocal();
    const startDate = shiftDate(today, -(rangeDays - 1));
    const userId = currentUserId();
    const rows = await db.diary_entries
      .where('[user_id+date]')
      .between([userId, startDate], [userId, today], true, true)
      .filter((e) => !e.deleted_at)
      .toArray();
    const goalOn = composedGoalResolver(profile, await loadSchedule(profile));
    const marks = parseDayMarks(profile.untracked_dates);

    const raw = new Map<
      LocalDate,
      Pick<DailySummary, 'date' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'hasEntries'>
    >();
    for (let i = 0; i < rangeDays; i++) {
      const d = shiftDate(today, -(rangeDays - 1) + i);
      raw.set(d, { date: d, kcal: 0, protein: 0, carbs: 0, fat: 0, hasEntries: false });
    }
    for (const r of rows) {
      const day = raw.get(r.date);
      if (!day) continue;
      day.kcal += r.kcal;
      day.protein += r.protein;
      day.carbs += r.carbs;
      day.fat += r.fat;
      day.hasEntries = true;
    }

    const resolved = [...raw.values()].map((d) => {
      const goal = goalOn(d.date);
      return { d, goal, r: resolveDay({ ...d, goal }, marks.get(d.date), today) };
    });
    const days: DailySummary[] = resolved.map(({ d, goal, r }) => ({
      ...d,
      goal,
      kind: r.kind,
      counted: r.effective,
      inAverage: r.inAverage,
      suspect: r.suspect,
    }));

    // Protein is only known for days logged for real.
    const logged = days.filter((d) => d.kind === 'logged');
    const avgProtein =
      logged.length > 0
        ? logged.reduce((s, d) => s + d.protein, 0) / logged.length
        : 0;
    const counted = days.filter((d) => d.inAverage);

    return {
      days,
      avgKcal: averageEffective(resolved.map((x) => x.r)),
      avgProtein,
      daysHitTarget: counted.filter(
        (d) => d.goal > 0 && Math.abs(d.counted - d.goal) / d.goal <= 0.1,
      ).length,
      daysCounted: counted.length,
      daysLeftOut: days.filter((d) => d.kind === 'empty' || d.kind === 'untracked')
        .length,
      daysUnanswered: days.filter((d) => d.suspect).length,
    };
  }, [profile, rangeDays]);
}
