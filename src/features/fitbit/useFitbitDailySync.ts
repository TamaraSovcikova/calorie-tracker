/**
 * Pulls Fitbit's daily activity from Google Health for the diary's current
 * date and upserts a single "Fitbit activity" row in exercise_entries.
 *
 * The stored kcal is ACTIVITY calories — Google's total daily burn minus
 * the estimated resting burn (BMR) — so the number reflects movement, not
 * metabolism. See features/fitbit/activityCalories.
 *
 * Behaviour:
 *   - Runs when the date, tokens, or profile change.
 *   - 5-minute per-date cache to avoid hammering the API while navigating.
 *   - Stable id `fitbit:{user_id}:{date}` so repeat upserts merge.
 *   - Writes a row even at 0 kcal so the diary reflects rest days.
 */

import { useEffect } from 'react';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { useFitbitTokens } from '@/db/repos/fitbitTokens';
import { useProfile } from '@/db/repos/profile';
import { getDailySummary } from '@/lib/fitbit-api';
import {
  activeCaloriesForDate,
  profileDailyBmr,
} from './activityCalories';
import type { LocalDate } from '@/lib/dates';
import type { ExerciseEntry, Profile } from '@/db/types';

const CACHE_MS = 5 * 60 * 1000;
const lastFetched = new Map<string, number>();

function cacheKey(date: LocalDate): string {
  return `${currentUserId()}:${date}`;
}

async function syncFitbitForDate(
  date: LocalDate,
  profile: Profile | undefined,
): Promise<void> {
  const summary = await getDailySummary(date);
  const dailyBmr = profileDailyBmr(profile);
  const activity = activeCaloriesForDate(
    summary.totalCaloriesBurned,
    dailyBmr,
    date,
  );

  const userId = currentUserId();
  const id = `fitbit:${userId}:${date}`;
  const now = new Date().toISOString();
  const existing = await db.exercise_entries.get(id);
  const name = summary.steps
    ? `Fitbit activity · ${summary.steps.toLocaleString()} steps`
    : 'Fitbit activity';
  const row: ExerciseEntry = {
    id,
    user_id: userId,
    date,
    source: 'fitbit',
    name,
    duration_min: undefined,
    kcal_burned: activity,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await db.exercise_entries.put(row);
}

export function useFitbitDailySync(date: LocalDate): void {
  const tokens = useFitbitTokens();
  const profile = useProfile();
  const connected = !!tokens;

  useEffect(() => {
    if (!connected) return;
    const key = cacheKey(date);
    const last = lastFetched.get(key);
    if (last && Date.now() - last < CACHE_MS) return;

    let cancelled = false;
    (async () => {
      try {
        await syncFitbitForDate(date, profile);
        if (!cancelled) lastFetched.set(key, Date.now());
      } catch (err) {
        // Diary works fine without Fitbit — console-warn only.
        console.warn('Fitbit sync failed for', date, err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // profile is intentionally in deps so a later profile edit (which
    // changes the BMR estimate) re-runs the activity calculation.
  }, [date, connected, profile]);
}
