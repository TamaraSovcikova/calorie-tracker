/**
 * Weekly digest - a once-a-week recap of the last completed week, shown on
 * the diary and dismissed per week. All derived from the diary; no storage
 * beyond a localStorage "last seen week" marker.
 */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { useProfile } from '@/db/repos/profile';
import { fromLocalDate, shiftDate, todayLocal, type LocalDate } from '@/lib/dates';
import { weekDates, weekStartFor } from '@/features/weekly-budget/weeklyBudget';
import type { Profile } from '@/db/types';

const DIGEST_SEEN_KEY = 'calorie-tracker:digest-seen-week';

export interface WeeklyDigest {
  weekStart: LocalDate;
  /** e.g. "12–18 May". */
  weekLabel: string;
  daysLogged: number;
  /** Mean kcal across the days that were logged (0 if none). */
  avgKcal: number;
  /** Days within ±10% of the daily goal. */
  daysOnTarget: number;
  dailyGoal: number;
  totalBurned: number;
  /** Net weight change over the week in the user's unit, or null. */
  weightChange: number | null;
  weightUnit: 'kg' | 'lb';
}

/** Compute the digest for the most recently completed week. */
export async function computeWeeklyDigest(
  profile: Profile | undefined,
): Promise<WeeklyDigest | null> {
  if (!profile) return null;
  const weekStartDay = profile.week_start_day ?? 1;
  const dailyGoal = profile.kcal_target ?? 0;

  // The week before the one containing today.
  const currentWeekStart = weekStartFor(todayLocal(), weekStartDay);
  const dates = weekDates(shiftDate(currentWeekStart, -1), weekStartDay);
  const uid = currentUserId();
  const first = dates[0];
  const last = dates[6];

  const entries = await db.diary_entries
    .where('[user_id+date]')
    .between([uid, first], [uid, last], true, true)
    .filter((e) => !e.deleted_at)
    .toArray();
  const kcalByDate = new Map<string, number>();
  for (const e of entries) {
    kcalByDate.set(e.date, (kcalByDate.get(e.date) ?? 0) + e.kcal);
  }
  const loggedKcals = [...kcalByDate.values()];
  const daysLogged = loggedKcals.length;
  const avgKcal =
    daysLogged > 0 ? loggedKcals.reduce((a, b) => a + b, 0) / daysLogged : 0;
  const daysOnTarget =
    dailyGoal > 0
      ? loggedKcals.filter((k) => Math.abs(k - dailyGoal) / dailyGoal <= 0.1)
          .length
      : 0;

  const exercise = await db.exercise_entries
    .where('[user_id+date]')
    .between([uid, first], [uid, last], true, true)
    .filter((e) => !e.deleted_at)
    .toArray();
  const totalBurned = exercise.reduce((a, e) => a + e.kcal_burned, 0);

  const weights = await db.weight_log
    .where('[user_id+date]')
    .between([uid, first], [uid, last], true, true)
    .sortBy('date');
  const imperial = profile.units === 'imperial';
  let weightChange: number | null = null;
  if (weights.length >= 2) {
    const deltaKg = weights[weights.length - 1].weight_kg - weights[0].weight_kg;
    weightChange = imperial ? deltaKg * 2.2046226 : deltaKg;
  }

  return {
    weekStart: first,
    weekLabel: `${format(fromLocalDate(first), 'd')}–${format(fromLocalDate(last), 'd MMM')}`,
    daysLogged,
    avgKcal,
    daysOnTarget,
    dailyGoal,
    totalBurned,
    weightChange,
    weightUnit: imperial ? 'lb' : 'kg',
  };
}

/**
 * The digest to show right now, or null when there's nothing worth showing
 * (no data) or this week's digest was already dismissed.
 */
export function useWeeklyDigest(): {
  digest: WeeklyDigest | null;
  dismiss: () => void;
} {
  const profile = useProfile();
  const [seenWeek, setSeenWeek] = useState<string | null>(() =>
    typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(DIGEST_SEEN_KEY),
  );
  const digest = useLiveQuery(() => computeWeeklyDigest(profile), [profile]);

  const show =
    !!digest && digest.daysLogged > 0 && digest.weekStart !== seenWeek;

  const dismiss = () => {
    if (!digest) return;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DIGEST_SEEN_KEY, digest.weekStart);
    }
    setSeenWeek(digest.weekStart);
  };

  return { digest: show ? digest : null, dismiss };
}
