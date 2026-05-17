/**
 * Pure wellbeing roll-forward — REVAMP_PLAN §2.2. Each elapsed day nudges
 * the 0-100 score: logging lifts it, hitting the goal lifts it more,
 * skipping a day dips it, going over dings it gently. The impure
 * "gather elapsed days from the diary" wiring lives elsewhere (Phase 6).
 */

export const WELLBEING_MIN = 0;
export const WELLBEING_MAX = 100;

/** What happened on one day, as far as the pet is concerned. */
export interface DayOutcome {
  /** At least one food or quick-add entry was logged that day. */
  logged: boolean;
  /** The day's calories landed within ±10% of the goal. */
  hitGoal: boolean;
  /** The day's calories exceeded the goal by more than 10%. */
  overGoal: boolean;
}

function clampWellbeing(score: number): number {
  return Math.max(WELLBEING_MIN, Math.min(WELLBEING_MAX, score));
}

/** Apply a single day's outcome to the wellbeing score. */
export function applyDayOutcome(score: number, day: DayOutcome): number {
  let next = score;
  if (day.logged) {
    next += 6;
    if (day.hitGoal) next += 4;
  } else {
    next -= 10;
  }
  if (day.overGoal) next -= 3;
  return clampWellbeing(next);
}

/** Fold a run of elapsed days into the wellbeing score. */
export function rollWellbeing(startScore: number, days: DayOutcome[]): number {
  return days.reduce(applyDayOutcome, clampWellbeing(startScore));
}
