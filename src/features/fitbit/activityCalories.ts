/**
 * Google Health gives TOTAL calories burned (resting/BMR + all activity).
 * For the diary we want ACTIVITY calories — the "extra" burn above just
 * existing — so the number reflects movement, not metabolism.
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
 * Activity calories for a date. If BMR can't be estimated (incomplete
 * profile) we can't separate resting from activity — fall back to the
 * raw total so the user still sees a number, and surface a hint in the UI.
 */
export function activeCaloriesForDate(
  totalBurned: number,
  dailyBmr: number | null,
  date: LocalDate,
): number {
  if (dailyBmr === null) return Math.round(totalBurned);
  const restingSoFar = dailyBmr * elapsedDayFraction(date);
  return Math.round(Math.max(0, totalBurned - restingSoFar));
}
