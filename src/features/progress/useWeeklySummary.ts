import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { shiftDate, todayLocal, type LocalDate } from '@/lib/dates';

export interface DailySummary {
  date: LocalDate;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  hasEntries: boolean;
}

export interface WeeklySummary {
  days: DailySummary[];
  avgKcal: number;
  avgProtein: number;
  daysHitTarget: number; // count of days within ±10% of kcal target
}

export function useWeeklySummary(
  kcalTarget: number,
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

    const byDate = new Map<LocalDate, DailySummary>();
    for (let i = 0; i < rangeDays; i++) {
      const d = shiftDate(today, -(rangeDays - 1) + i);
      byDate.set(d, {
        date: d,
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        hasEntries: false,
      });
    }
    for (const r of rows) {
      const day = byDate.get(r.date);
      if (!day) continue;
      day.kcal += r.kcal;
      day.protein += r.protein;
      day.carbs += r.carbs;
      day.fat += r.fat;
      day.hasEntries = true;
    }
    const days = [...byDate.values()];
    const logged = days.filter((d) => d.hasEntries);
    const avgKcal =
      logged.length > 0
        ? logged.reduce((s, d) => s + d.kcal, 0) / logged.length
        : 0;
    const avgProtein =
      logged.length > 0
        ? logged.reduce((s, d) => s + d.protein, 0) / logged.length
        : 0;
    const daysHitTarget =
      kcalTarget > 0
        ? logged.filter(
            (d) => Math.abs(d.kcal - kcalTarget) / kcalTarget <= 0.1,
          ).length
        : 0;

    return { days, avgKcal, avgProtein, daysHitTarget };
  }, [kcalTarget, rangeDays]);
}
