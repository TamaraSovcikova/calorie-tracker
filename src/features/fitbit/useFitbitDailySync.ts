/**
 * Pulls Fitbit's daily activity summary for the diary's current date and
 * upserts a single "Fitbit · Activity" row in the exercise_entries table.
 *
 * Behaviour:
 *   - Runs once when the date or token changes.
 *   - Cached for 5 minutes per date (avoids hammering the API as the user
 *     navigates).
 *   - Stable id `fitbit:{user_id}:{date}` so repeat upserts always merge
 *     into the same row.
 *   - When Fitbit reports 0 activity calories we still write a 0-row so
 *     the diary's burned-cal calculation reflects reality on rest days.
 */

import { useEffect } from 'react';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { useFitbitTokens } from '@/db/repos/fitbitTokens';
import { getDailySummary } from '@/lib/fitbit-api';
import type { LocalDate } from '@/lib/dates';
import type { ExerciseEntry } from '@/db/types';

const CACHE_MS = 5 * 60 * 1000;
const lastFetched = new Map<string, number>(); // key: `${userId}:${date}`

function cacheKey(date: LocalDate): string {
  return `${currentUserId()}:${date}`;
}

async function syncFitbitForDate(date: LocalDate): Promise<void> {
  const summary = await getDailySummary(date);
  const userId = currentUserId();
  const id = `fitbit:${userId}:${date}`;
  const now = new Date().toISOString();
  const existing = await db.exercise_entries.get(id);
  const row: ExerciseEntry = {
    id,
    user_id: userId,
    date,
    source: 'fitbit',
    name: 'Fitbit activity',
    duration_min: undefined,
    kcal_burned: Math.round(summary.activityCalories),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await db.exercise_entries.put(row);
}

export function useFitbitDailySync(date: LocalDate): void {
  const tokens = useFitbitTokens();
  const connected = !!tokens;

  useEffect(() => {
    if (!connected) return;
    const key = cacheKey(date);
    const last = lastFetched.get(key);
    if (last && Date.now() - last < CACHE_MS) return;

    let cancelled = false;
    (async () => {
      try {
        await syncFitbitForDate(date);
        if (!cancelled) lastFetched.set(key, Date.now());
      } catch (err) {
        // Don't bubble — the diary still works without Fitbit. Console only.
        console.warn('Fitbit sync failed for', date, err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, connected]);
}
