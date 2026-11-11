/**
 * Pure wellbeing roll-forward - REVAMP_PLAN §2.2. Each elapsed day nudges
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

/**
 * What a resolved day means to the pet, or null when the day should not
 * move the score at all.
 *
 * A day the user marked untracked is null: they told the app about it, so
 * it is neither a skipped day (-10) nor a logged one. An estimated day
 * counts as logged, judged on the estimate. An empty past day is still a
 * skipped day; that dip is the pet's whole job.
 */
export function outcomeForDay(
  day: { kind: string; effective: number },
  goalKcal: number,
): DayOutcome | null {
  if (day.kind === 'untracked') return null;
  const logged = day.kind === 'logged' || day.kind === 'estimated';
  const kcal = logged ? day.effective : 0;
  return {
    logged,
    hitGoal: logged && goalKcal > 0 && Math.abs(kcal - goalKcal) / goalKcal <= 0.1,
    overGoal: goalKcal > 0 && kcal / goalKcal > 1.1,
  };
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
