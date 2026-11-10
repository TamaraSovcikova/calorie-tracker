import type { LocalDate } from '@/lib/dates';

/**
 * What the user has said about one day, beyond what is logged on it.
 *
 * Three answers to "is what is logged here the truth?":
 *  - untracked: no. Leave the day out; count it as exactly on goal.
 *  - estimate:  no, and I ate about `over` kcal relative to that day's goal.
 *  - ok:        yes. It was a genuinely light day; stop asking.
 *
 * Stored in the profile's `untracked_dates` JSON, which used to be a plain
 * list of date strings. A plain string still means "untracked", so existing
 * data reads unchanged and nothing needs migrating; estimates and
 * confirmations are objects alongside.
 *
 * The estimate is kept relative to the goal rather than as a total so that
 * it survives the goal being re-planned (a diet pause, a reservation).
 */
export interface DayMark {
  /** Estimated kcal relative to the day's goal. 0 = "about on goal". */
  over?: number;
  /** Confirmed complete as logged. */
  ok?: boolean;
}

export type DayMarks = ReadonlyMap<string, DayMark>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDayMarks(raw: string | undefined): Map<string, DayMark> {
  const out = new Map<string, DayMark>();
  if (!raw) return out;
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!Array.isArray(arr)) return out;
  for (const x of arr) {
    if (typeof x === 'string') {
      if (DATE_RE.test(x)) out.set(x, {});
      continue;
    }
    if (!x || typeof x !== 'object') continue;
    const o = x as { date?: unknown; over?: unknown; ok?: unknown };
    if (typeof o.date !== 'string' || !DATE_RE.test(o.date)) continue;
    if (o.ok === true) out.set(o.date, { ok: true });
    else if (typeof o.over === 'number' && Number.isFinite(o.over))
      out.set(o.date, { over: Math.round(o.over) });
    else out.set(o.date, {});
  }
  return out;
}

export function serializeDayMarks(marks: DayMarks): string {
  const rows = [...marks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return JSON.stringify(
    rows.map(([date, m]) =>
      m.ok ? { date, ok: true } : m.over !== undefined ? { date, over: m.over } : date,
    ),
  );
}

/** A copy of `marks` with `date` set to `mark`, or cleared when null. */
export function withDayMark(
  marks: DayMarks,
  date: LocalDate,
  mark: DayMark | null,
): Map<string, DayMark> {
  const next = new Map(marks);
  if (mark) next.set(date, mark);
  else next.delete(date);
  return next;
}

/** Below this share of the goal, a finished day is worth asking about. */
export const UNDER_LOGGED_RATIO = 0.6;

export interface DayFacts {
  date: LocalDate;
  kcal: number;
  hasEntries: boolean;
  goal: number;
}

export type DayKind =
  | 'logged' // take the diary at its word
  | 'empty' // past, nothing logged
  | 'untracked' // marked: leave out
  | 'estimated' // marked: goal + over
  | 'pending'; // today or later, still open

export interface ResolvedDay {
  kind: DayKind;
  /** kcal the day counts as in budget maths. */
  effective: number;
  /** Whether the day belongs in a "daily average". */
  inAverage: boolean;
  /** Logged, finished, and suspiciously low; nobody has ruled on it yet. */
  suspect: boolean;
}

/**
 * The one place that decides what a day counts as. The weekly budget, the
 * progress averages and the digest all go through here, so a day cannot be
 * "left out" in one and a 1000 kcal deficit in another.
 */
export function resolveDay(
  day: DayFacts,
  mark: DayMark | undefined,
  today: LocalDate,
): ResolvedDay {
  const base = { suspect: false };
  if (mark && !mark.ok) {
    if (mark.over !== undefined) {
      return {
        ...base,
        kind: 'estimated',
        effective: Math.max(0, day.goal + mark.over),
        inAverage: true,
      };
    }
    return { ...base, kind: 'untracked', effective: day.goal, inAverage: false };
  }
  if (!day.hasEntries) {
    return day.date < today
      ? { ...base, kind: 'empty', effective: day.goal, inAverage: false }
      : { ...base, kind: 'pending', effective: day.kcal, inAverage: false };
  }
  return {
    kind: 'logged',
    effective: day.kcal,
    inAverage: true,
    suspect:
      !mark?.ok &&
      day.date < today &&
      day.goal > 0 &&
      day.kcal < day.goal * UNDER_LOGGED_RATIO,
  };
}

/** Mean of the days that count, or 0 when none do. */
export function averageEffective(days: ResolvedDay[]): number {
  const counted = days.filter((d) => d.inAverage);
  if (counted.length === 0) return 0;
  return counted.reduce((s, d) => s + d.effective, 0) / counted.length;
}

/**
 * The most recent finished day that looks under-logged and has not been
 * ruled on. `days` in any order. Skipped dates are ones dismissed on this
 * device without an answer.
 */
export function latestSuspectDay(
  days: DayFacts[],
  marks: DayMarks,
  today: LocalDate,
  skipped: ReadonlySet<string> = new Set(),
): DayFacts | null {
  let best: DayFacts | null = null;
  for (const d of days) {
    if (skipped.has(d.date)) continue;
    if (!resolveDay(d, marks.get(d.date), today).suspect) continue;
    if (!best || d.date > best.date) best = d;
  }
  return best;
}
