/**
 * Diet pause - a dated window where the daily calorie goal is replaced by a
 * higher one (a maintenance week off a cut), after which the cut resumes.
 *
 * The whole feature rests on one idea: **the daily goal is a function of the
 * date, not a constant.** Editing `kcal_target` for a week and putting it back
 * would have re-graded every past day against whichever number happened to be
 * stored, so a finished maintenance week would later read as seven days of
 * massive overeating. Pauses are therefore kept as a list of windows, and the
 * goal for any date is resolved by looking up which window (if any) covers it.
 *
 * Everything that needs "the goal for day D" - the diary target, the weekly
 * budget's period budget and running balance, the pet's day grading - goes
 * through `goalResolver` / `dailyGoalFor` rather than reading `kcal_target`
 * directly.
 *
 * Stored on the profile as a JSON string (`diet_pauses`), matching how
 * `untracked_dates` and `custom_meal_categories` already round-trip through
 * sync with no field transform.
 */

import { differenceInCalendarDays } from 'date-fns';
import { fromLocalDate, shiftDate, type LocalDate } from '@/lib/dates';
import { tdee } from '@/lib/tdee';
import type { Profile } from '@/db/types';

export interface DietPause {
  id: string;
  /** First day at the pause goal (YYYY-MM-DD). */
  start: LocalDate;
  /** Last day at the pause goal. Undefined = open-ended, until resumed. */
  end?: LocalDate;
  /** The daily kcal goal while this window is active. */
  kcal: number;
  /** Optional user note, e.g. "diet break" or "holiday". */
  note?: string;
}

/** Ceiling on stored windows, so the list can't grow without bound. */
const MAX_PAUSES = 60;

/**
 * Parse the profile's stored JSON array of pause windows. Tolerant by
 * design: a malformed or half-written row is dropped rather than taking the
 * daily target down with it. Sorted by start date ascending.
 */
export function parseDietPauses(raw: string | undefined): DietPause[] {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: DietPause[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.start !== 'string' || !p.start) continue;
    if (typeof p.kcal !== 'number' || !Number.isFinite(p.kcal) || p.kcal <= 0) continue;
    const end = typeof p.end === 'string' && p.end ? p.end : undefined;
    // An end before the start would make the window match nothing; treat it
    // as a one-day pause rather than silently dropping the user's intent.
    out.push({
      id: typeof p.id === 'string' && p.id ? p.id : `${p.start}-${p.kcal}`,
      start: p.start,
      end: end && end < p.start ? p.start : end,
      kcal: p.kcal,
      note: typeof p.note === 'string' && p.note ? p.note : undefined,
    });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

export function serializeDietPauses(list: DietPause[]): string {
  return JSON.stringify(list.slice(-MAX_PAUSES));
}

/**
 * The pause window covering `date`, or null. When windows overlap (possible
 * only through sync from two devices), the one that started LATEST wins - the
 * most recent decision is the one the user last made.
 */
export function pauseOn(date: LocalDate, pauses: DietPause[]): DietPause | null {
  let best: DietPause | null = null;
  for (const p of pauses) {
    if (p.start > date) continue;
    if (p.end !== undefined && date > p.end) continue;
    if (!best || p.start > best.start) best = p;
  }
  return best;
}

/**
 * A goal lookup bound to one profile: parses the pause list once, then
 * answers "what is the daily goal on this date?" for as many dates as the
 * caller needs. The budget walks up to three years of dates, so re-parsing
 * per day is not an option.
 */
export function goalResolver(
  profile: Profile | undefined,
): (date: LocalDate) => number {
  if (!profile) return () => 0;
  const base = profile.kcal_target ?? 0;
  const pauses = parseDietPauses(profile.diet_pauses);
  if (pauses.length === 0) return () => base;
  return (date) => pauseOn(date, pauses)?.kcal ?? base;
}

/** The daily calorie goal on `date`, honouring any diet pause covering it. */
export function dailyGoalFor(
  date: LocalDate,
  profile: Profile | undefined,
): number {
  return goalResolver(profile)(date);
}

/** The daily goal for each of `dates`, resolving the pause list once. */
export function dailyGoalsFor(
  dates: LocalDate[],
  profile: Profile | undefined,
): number[] {
  const resolve = goalResolver(profile);
  return dates.map(resolve);
}

/** The pause covering `date` on this profile, or null. */
export function activePause(
  date: LocalDate,
  profile: Profile | undefined,
): DietPause | null {
  if (!profile) return null;
  return pauseOn(date, parseDietPauses(profile.diet_pauses));
}

/**
 * The next pause that starts after `date`, or null. Used to tell the user a
 * break is booked before it begins, so a planned window is never a surprise.
 */
export function upcomingPause(
  date: LocalDate,
  profile: Profile | undefined,
): DietPause | null {
  if (!profile) return null;
  const later = parseDietPauses(profile.diet_pauses).filter((p) => p.start > date);
  return later.length > 0 ? later[0] : null;
}

/**
 * Days remaining in a pause, counting `date` itself. Null for an open-ended
 * window - there is no number to show, and inventing one would be a lie.
 */
export function daysLeftInPause(pause: DietPause, date: LocalDate): number | null {
  if (pause.end === undefined) return null;
  return differenceInCalendarDays(fromLocalDate(pause.end), fromLocalDate(date)) + 1;
}

/** Length of a pause window in days; null when open-ended. */
export function pauseLength(pause: DietPause): number | null {
  if (pause.end === undefined) return null;
  return (
    differenceInCalendarDays(fromLocalDate(pause.end), fromLocalDate(pause.start)) + 1
  );
}

/**
 * Add a window to the list without leaving overlaps behind.
 *
 * Replaces any window with the same id, then clips every earlier window that
 * would still cover the new one's start - an open-ended pause simply ends the
 * day before the new one begins. A window clipped to nothing is dropped.
 * Ordering stays start-ascending.
 */
export function withPause(list: DietPause[], incoming: DietPause): DietPause[] {
  const others = list.filter((p) => p.id !== incoming.id);
  const clipped: DietPause[] = [];
  for (const p of others) {
    if (p.start >= incoming.start && (incoming.end === undefined || p.start <= incoming.end)) {
      // Fully inside the new window (or open-ended past its start): superseded.
      if (incoming.end === undefined || (p.end !== undefined && p.end <= incoming.end)) {
        continue;
      }
    }
    const overlapsStart =
      p.start < incoming.start && (p.end === undefined || p.end >= incoming.start);
    if (overlapsStart) {
      const newEnd = shiftDate(incoming.start, -1);
      if (newEnd < p.start) continue;
      clipped.push({ ...p, end: newEnd });
      continue;
    }
    clipped.push(p);
  }
  return [...clipped, incoming].sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  );
}

/**
 * End a pause early, at `lastDay`. A window whose start is after `lastDay`
 * never happened, so it is removed rather than left as a zero-length stub.
 */
export function endPauseAt(
  list: DietPause[],
  id: string,
  lastDay: LocalDate,
): DietPause[] {
  const out: DietPause[] = [];
  for (const p of list) {
    if (p.id !== id) {
      out.push(p);
      continue;
    }
    if (p.start > lastDay) continue; // cancelled before it began
    out.push({ ...p, end: lastDay });
  }
  return out;
}

/** Drop a window entirely (cancel a planned break). */
export function removePause(list: DietPause[], id: string): DietPause[] {
  return list.filter((p) => p.id !== id);
}

/**
 * Maintenance estimate from the profile's own numbers (Mifflin-St Jeor TDEE).
 * Null when any input is missing - a suggested number built on a guessed
 * weight would be worse than no suggestion.
 */
export function maintenanceEstimate(profile: Profile | undefined): number | null {
  if (!profile) return null;
  const { sex, dob, weight_kg, height_cm, activity_level } = profile;
  if (!sex || !dob || !weight_kg || !height_cm || !activity_level) return null;
  const ageYears = differenceInCalendarDays(new Date(), fromLocalDate(dob)) / 365.25;
  if (!Number.isFinite(ageYears) || ageYears <= 0) return null;
  return tdee({
    sex,
    ageYears: Math.floor(ageYears),
    weightKg: weight_kg,
    heightCm: height_cm,
    activity: activity_level,
  });
}

export interface MacroTargets {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Macro targets for a paused day. Protein is held exactly where it was - it
 * is the one macro a diet break is not meant to change - and the calorie
 * difference is added to carbs and fat in proportion to the energy they
 * already carry, so a low-fat split stays a low-fat split.
 *
 * Falls back to an even energy split when the profile has no carbs or fat
 * set at all. Never returns a negative gram target.
 */
export function pauseMacros(profile: Profile, pauseKcal: number): MacroTargets {
  const delta = pauseKcal - (profile.kcal_target ?? 0);
  const carbKcal = (profile.carbs_g ?? 0) * 4;
  const fatKcal = (profile.fat_g ?? 0) * 9;
  const rest = carbKcal + fatKcal;
  const carbShare = rest > 0 ? carbKcal / rest : 0.5;
  return {
    protein_g: profile.protein_g ?? 0,
    carbs_g: Math.max(0, Math.round((carbKcal + delta * carbShare) / 4)),
    fat_g: Math.max(0, Math.round((fatKcal + delta * (1 - carbShare)) / 9)),
  };
}

/**
 * The macro targets in force on `date`: the pause's redistribution when one
 * is active, otherwise the profile's own.
 */
export function macroTargetsFor(date: LocalDate, profile: Profile): MacroTargets {
  const pause = activePause(date, profile);
  if (!pause) {
    return {
      protein_g: profile.protein_g,
      carbs_g: profile.carbs_g,
      fat_g: profile.fat_g,
    };
  }
  return pauseMacros(profile, pause.kcal);
}
