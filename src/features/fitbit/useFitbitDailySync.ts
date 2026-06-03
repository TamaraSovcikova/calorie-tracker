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
  const sessionKcalTotal = summary.workouts.reduce((s, w) => s + w.kcal, 0);
  const activity = activeCaloriesForDate(
    summary.totalCaloriesBurned,
    summary.activeEnergyBurned,
    dailyBmr,
    date,
    sessionKcalTotal,
  );
  // null = no active-energy stream AND no BMR estimate, so we can't derive
  // activity calories. (With active-energy data we no longer need a profile.)
  const needsProfile = activity === null;

  const userId = currentUserId();
  const id = `fitbit:${userId}:${date}`;
  const now = new Date().toISOString();
  const existing = await db.exercise_entries.get(id);
  // The daily summary row carries the day's total steps (shown in the
  // Exercise header, not as its own row) and any background-activity kcal
  // not attributed to a logged session. Its name is preserved if the user
  // renamed it.
  const row: ExerciseEntry = {
    id,
    user_id: userId,
    date,
    source: 'fitbit',
    name: existing?.name_locked
      ? existing.name
      : needsProfile
        ? 'Daily activity'
        : 'Background activity',
    duration_min: undefined,
    kcal_burned: activity ?? 0,
    steps: summary.steps,
    name_locked: existing?.name_locked,
    needs_profile: needsProfile || undefined,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    deleted_at: undefined,
  };
  await db.exercise_entries.put(row);

  // Logged workouts are separate sessions, not part of total-calories, so
  // each becomes its own clearly-named row (e.g. "Spinning") with a detail
  // line (time range + steps). Stable ids keyed by index let repeat syncs
  // merge; if a workout is later removed on Fitbit, the now-extra
  // higher-index rows are soft-deleted so the tombstone syncs across
  // devices. A user-renamed row keeps its name across re-syncs.
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
        name: prior?.name_locked ? prior.name : w.name,
        duration_min: w.durationMin || undefined,
        detail: w.detail || undefined,
        kcal_burned: w.kcal,
        name_locked: prior?.name_locked,
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

    let cancelled = false;
    (async () => {
      // One-time heal: if the date has Fitbit workout rows written before the
      // detail/steps fields existed (a session row missing detail), re-sync
      // regardless of the time cache so the richer fields populate.
      let stale = false;
      try {
        const exRows = await db.exercise_entries
          .where('id')
          .startsWith(`fitbit-ex:${currentUserId()}:${date}:`)
          .toArray();
        stale = exRows.some((r) => !r.deleted_at && r.detail == null);
      } catch {
        stale = false;
      }

      const last = lastFetched.get(key);
      if (!stale && last && Date.now() - last < CACHE_MS) return;

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
