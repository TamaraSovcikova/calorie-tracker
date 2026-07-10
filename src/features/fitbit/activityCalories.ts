/**
 * Google Health gives TOTAL calories burned (resting/BMR + all activity).
 * For the diary we want ACTIVITY calories - the "extra" burn above just
 * existing - so the number reflects movement, not metabolism.
 *
 *   activity = totalBurned - restingBurnSoFar
 *   restingBurnSoFar = dailyBMR * fractionOfDayElapsed
 *
 * For a past (complete) day the fraction is 1, so we subtract a full
 * day's BMR. For today it's prorated to the current time, so a mid-day
 * total isn't compared against a whole day of resting burn.
 */

import { differenceInYears } from 'date-fns';
import { bmr } from '@/lib/tdee';
import { fromLocalDate, todayLocal, type LocalDate } from '@/lib/dates';
import type { Profile } from '@/db/types';

/** Estimated full-day resting burn (Mifflin-St Jeor BMR) from profile
 *  stats, or null when the profile lacks sex / dob / weight / height. */
export function profileDailyBmr(profile: Profile | undefined): number | null {
  if (!profile) return null;
  const { sex, dob, weight_kg, height_cm } = profile;
  if (!sex || !dob || !weight_kg || !height_cm) return null;
  let age: number;
  try {
    age = differenceInYears(fromLocalDate(todayLocal()), fromLocalDate(dob));
  } catch {
    return null;
  }
  if (!(age > 0 && age < 130)) return null;
  return bmr({ sex, ageYears: age, weightKg: weight_kg, heightCm: height_cm });
}

/** Fraction of the given local date that has elapsed: 1 for past days,
 *  0 for future days, prorated for today. */
export function elapsedDayFraction(date: LocalDate): number {
  const today = todayLocal();
  if (date < today) return 1;
  if (date > today) return 0;
  const midnight = fromLocalDate(today).getTime();
  const frac = (Date.now() - midnight) / 86_400_000;
  return Math.max(0, Math.min(1, frac));
}

/**
 * Passive background-activity calories for the diary's "Health activity" row.
 * This is intentionally separate from the per-session exercise rows so the
 * two are never summed. The signals and their priority:
 *
 *  - `activeEnergyBurned` (> 0): Fitbit's own active-calorie figure. On
 *    workout days this IS populated and already represents all active energy
 *    for the day (confirmed via diagnostic: 773 kcal on a 5-session day).
 *    Using it as-is means the named exercise sessions shown alongside it are
 *    already included in this number - so we subtract the session sum to
 *    avoid the user seeing the same calories twice.
 *  - `totalBurned - restingSoFar` (BMR fallback): when active-energy-burned
 *    is 0 (non-workout days or devices that don't provide it). Requires a
 *    complete profile for the BMR estimate. Session calories are subtracted
 *    here too for the same reason.
 *
 * Returns null only when neither signal is available.
 */
export function activeCaloriesForDate(
  totalBurned: number,
  activeEnergyBurned: number,
  dailyBmr: number | null,
  date: LocalDate,
  /** Sum of all exercise-session kcal already shown as named rows. */
  sessionKcalTotal = 0,
): number | null {
  let base: number | null = null;
  if (activeEnergyBurned > 0) {
    base = activeEnergyBurned;
  } else if (dailyBmr !== null) {
    const restingSoFar = dailyBmr * elapsedDayFraction(date);
    base = Math.max(0, totalBurned - restingSoFar);
  }
  if (base === null) return null;
  // Subtract session calories already shown as named rows - the background
  // row should represent only the remaining non-session activity.
  return Math.round(Math.max(0, base - sessionKcalTotal));
}
