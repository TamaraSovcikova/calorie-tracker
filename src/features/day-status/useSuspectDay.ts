import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { updateProfile } from '@/db/repos/profile';
import { shiftDate, todayLocal, type LocalDate } from '@/lib/dates';
import {
  composedGoalResolver,
  loadSchedule,
} from '@/features/reservations/dailyGoal';
import type { Profile } from '@/db/types';
import {
  latestSuspectDay,
  parseDayMarks,
  serializeDayMarks,
  withDayMark,
  type DayFacts,
  type DayMark,
} from './dayStatus';

/** How far back an unanswered low day is still worth asking about. */
const LOOKBACK_DAYS = 14;
const SKIPPED_KEY = 'calorie-tracker:day-check-skipped';

function readSkipped(): Set<string> {
  try {
    const raw = localStorage.getItem(SKIPPED_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Write a mark for one day onto the profile (null clears it). */
export function setDayMark(
  profile: Profile,
  date: LocalDate,
  mark: DayMark | null,
): Promise<void> {
  const marks = withDayMark(parseDayMarks(profile.untracked_dates), date, mark);
  return updateProfile({ untracked_dates: serializeDayMarks(marks) });
}

/**
 * The most recent finished day that looks under-logged and that the user
 * has not yet ruled on, or null. "Not now" is remembered per device only:
 * it is not an answer, so it should not sync as one.
 */
export function useSuspectDay(profile: Profile | undefined): {
  day: DayFacts | null;
  skip: () => void;
} {
  const [skipped, setSkipped] = useState(readSkipped);
  const day = useLiveQuery(async () => {
    if (!profile) return null;
    const today = todayLocal();
    const start = shiftDate(today, -LOOKBACK_DAYS);
    const uid = currentUserId();
    const rows = await db.diary_entries
      .where('[user_id+date]')
      .between([uid, start], [uid, today], true, false)
      .filter((e) => !e.deleted_at)
      .toArray();
    const kcal = new Map<string, number>();
    for (const e of rows) kcal.set(e.date, (kcal.get(e.date) ?? 0) + e.kcal);
    const goalOn = composedGoalResolver(profile, await loadSchedule(profile));
    const days: DayFacts[] = [...kcal.entries()].map(([date, k]) => ({
      date,
      kcal: k,
      hasEntries: true,
      goal: goalOn(date),
    }));
    return latestSuspectDay(
      days,
      parseDayMarks(profile.untracked_dates),
      today,
      skipped,
    );
  }, [profile, skipped]);

  const skip = () => {
    if (!day) return;
    const next = new Set(skipped).add(day.date);
    try {
      // Keep the list short: only dates still inside the lookback matter.
      const floor = shiftDate(todayLocal(), -LOOKBACK_DAYS);
      localStorage.setItem(
        SKIPPED_KEY,
        JSON.stringify([...next].filter((d) => d >= floor)),
      );
    } catch {
      // Private mode: the skip lasts for this visit only.
    }
    setSkipped(next);
  };

  return { day: day ?? null, skip };
}
