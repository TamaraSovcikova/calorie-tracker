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

/**
 * The BMR estimate is part of the key so that filling in / editing
 * profile stats invalidates the cache — otherwise a stale "needs profile"
 * row would survive until the 5-minute window elapsed.
 */
function cacheKey(date: LocalDate, dailyBmr: number | null): string {
  const bmrPart = dailyBmr === null ? 'nobmr' : String(Math.round(dailyBmr));
  return `${currentUserId()}:${date}:${bmrPart}`;
}

async function syncFitbitForDate(
  date: LocalDate,
  profile: Profile | undefined,
): Promise<void> {
  const summary = await getDailySummary(date);
  const dailyBmr = profileDailyBmr(profile);
  const activity = activeCaloriesForDate(
    summary.totalCaloriesBurned,
    summary.activeEnergyBurned,
    dailyBmr,
    date,
  );
  // null = no active-energy stream AND no BMR estimate, so we can't derive
  // activity calories. (With active-energy data we no longer need a profile.)
  const needsProfile = activity === null;

  const userId = currentUserId();
  const id = `fitbit:${userId}:${date}`;
  const now = new Date().toISOString();
  const existing = await db.exercise_entries.get(id);
  const stepsLabel = summary.steps
    ? ` · ${summary.steps.toLocaleString()} steps`
    : '';
  const row: ExerciseEntry = {
    id,
    user_id: userId,
    date,
    source: 'fitbit',
    name: needsProfile
      ? `Health${stepsLabel}`
      : `Health activity${stepsLabel}`,
    duration_min: undefined,
    kcal_burned: activity ?? 0,
    needs_profile: needsProfile || undefined,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await db.exercise_entries.put(row);

  // Logged workouts are separate sessions, not part of total-calories, so
  // each becomes its own clearly-named row (e.g. "Spinning"). Stable ids
  // keyed by index let repeat syncs merge; if a workout is later removed on
  // Fitbit, the now-extra higher-index rows are soft-deleted so the tombstone
  // syncs across devices.
  const prefix = `fitbit-ex:${userId}:${date}:`;
  const priorWorkoutRows = await db.exercise_entries
    .where('id')
    .startsWith(prefix)
    .toArray();
  await Promise.all(
    summary.workouts.map(async (w, i) => {
      const wid = `${prefix}${i}`;
      const prior = priorWorkoutRows.find((r) => r.id === wid);
      const wrow: ExerciseEntry = {
        id: wid,
        user_id: userId,
        date,
        source: 'fitbit',
        name: w.name,
        duration_min: undefined,
        kcal_burned: w.kcal,
        needs_profile: undefined,
        created_at: prior?.created_at ?? now,
        updated_at: now,
        deleted_at: undefined,
      };
      await db.exercise_entries.put(wrow);
    }),
  );
  // Soft-delete leftover rows from a previous sync that had more workouts.
  await Promise.all(
    priorWorkoutRows
      .filter((r) => {
        const idx = Number(r.id.slice(prefix.length));
        return Number.isFinite(idx) && idx >= summary.workouts.length && !r.deleted_at;
      })
      .map((r) => db.exercise_entries.update(r.id, { deleted_at: now, updated_at: now })),
  );
}

export function useFitbitDailySync(date: LocalDate): void {
  const tokens = useFitbitTokens();
  const profile = useProfile();
  const connected = !!tokens;

  useEffect(() => {
    if (!connected) return;
    const key = cacheKey(date, profileDailyBmr(profile));
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
