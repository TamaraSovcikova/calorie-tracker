/**
 * Pure formatting helpers for Fitbit / Google Health exercise sessions.
 * No network or storage; fully unit-testable.
 */

/** Map known Google Health exercise-type enum values to friendly labels.
 *  Anything not listed is title-cased; the generic OTHER/UNKNOWN buckets
 *  become "Workout" (Fitbit sends OTHER for manually-started sessions). */
const EXERCISE_TYPE_LABELS: Record<string, string> = {
  WALKING: 'Walking',
  RUNNING: 'Running',
  RUNNING_TREADMILL: 'Treadmill run',
  BIKING: 'Cycling',
  BIKING_STATIONARY: 'Stationary bike',
  SWIMMING: 'Swimming',
  SWIMMING_POOL: 'Pool swim',
  SWIMMING_OPEN_WATER: 'Open-water swim',
  STRENGTH_TRAINING: 'Strength',
  WEIGHTLIFTING: 'Weights',
  HIGH_INTENSITY_INTERVAL_TRAINING: 'HIIT',
  HIIT: 'HIIT',
  YOGA: 'Yoga',
  PILATES: 'Pilates',
  ELLIPTICAL: 'Elliptical',
  ROWING: 'Rowing',
  ROWING_MACHINE: 'Rowing machine',
  HIKING: 'Hiking',
  DANCING: 'Dancing',
  AEROBICS: 'Aerobics',
  STAIR_CLIMBING: 'Stair climbing',
  SPINNING: 'Spinning',
  CIRCUIT_TRAINING: 'Circuit training',
  BOOTCAMP: 'Bootcamp',
  CALISTHENICS: 'Calisthenics',
};

/** A friendly label for an exercise-type enum value. OTHER/UNKNOWN/blank
 *  collapse to "Workout"; known types map; the rest are title-cased. */
export function humaniseExerciseType(raw: string | undefined): string {
  if (!raw) return 'Workout';
  const key = raw.trim().toUpperCase();
  if (!key || key === 'OTHER' || key === 'UNKNOWN' || key === 'WORKOUT') {
    return 'Workout';
  }
  if (EXERCISE_TYPE_LABELS[key]) return EXERCISE_TYPE_LABELS[key];
  // Fallback: "STAIR_CLIMBING" -> "Stair climbing".
  const words = key.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Parse a Google duration string like "3600s" to seconds. */
export function parseUtcOffsetSeconds(offset: string | undefined): number {
  if (!offset) return 0;
  const m = /^(-?\d+(?:\.\d+)?)s$/.exec(offset.trim());
  return m ? Math.round(parseFloat(m[1])) : 0;
}

/** Wall-clock time of an instant at a fixed UTC offset, e.g. "8:12pm". */
export function formatLocalTime(iso: string, offsetSec: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const shifted = new Date(t + offsetSec * 1000);
  let h = shifted.getUTCHours();
  const m = shifted.getUTCMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

/** "8:12-8:29pm" (drops the first am/pm when it matches the second). */
export function formatTimeRange(
  startIso: string,
  endIso: string,
  offsetSec: number,
): string {
  const start = formatLocalTime(startIso, offsetSec);
  const end = formatLocalTime(endIso, offsetSec);
  if (!start || !end) return start || end;
  // Collapse "8:12pm-8:29pm" to "8:12-8:29pm".
  const sAm = start.slice(-2);
  const eAm = end.slice(-2);
  const startTrim = sAm === eAm ? start.slice(0, -2) : start;
  return `${startTrim}-${end}`;
}

/** Whole minutes between two instants (>= 0). */
export function durationMinutes(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 60000);
}

export interface SessionDetailParts {
  startIso?: string;
  endIso?: string;
  offsetSec?: number;
  steps?: number;
  distanceMeters?: number;
}

/**
 * Build the row subtitle, e.g. "8:12-8:29pm · 1,425 steps · 0.8 km".
 * Omits any part that is missing.
 */
export function buildSessionDetail(parts: SessionDetailParts): string {
  const bits: string[] = [];
  if (parts.startIso && parts.endIso) {
    const range = formatTimeRange(parts.startIso, parts.endIso, parts.offsetSec ?? 0);
    if (range) bits.push(range);
  }
  if (parts.steps && parts.steps > 0) {
    bits.push(`${parts.steps.toLocaleString()} steps`);
  }
  if (parts.distanceMeters && parts.distanceMeters >= 100) {
    const km = parts.distanceMeters / 1000;
    bits.push(`${km.toFixed(km >= 10 ? 0 : 1)} km`);
  }
  return bits.join(' · ');
}
