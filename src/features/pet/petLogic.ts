/**
 * Pure pet logic - the time-aware feeding model and pose selection from
 * REVAMP_PLAN §2. No DB, no React: fully unit-testable.
 *
 * "Fullness" is the moment-to-moment meter (derived, never stored).
 * "Wellbeing" is the long-arc 0-100 score (see wellbeing.ts).
 */

export type FullnessState =
  | 'hungry'
  | 'peckish'
  | 'content'
  | 'full'
  | 'stuffed'
  | 'too_stuffed'
  | 'overeaten';

export type DogPose =
  | 'hungry'
  | 'peckish'
  | 'content'
  | 'full'
  | 'stuffed'
  | 'too_stuffed'
  | 'overeaten'
  | 'skeleton'
  | 'eating'
  | 'happy'
  | 'sad'
  | 'sleeping'
  | 'greeting'
  // Action / expression poses - shown as transient idle beats, never
  // logging states.
  | 'stretching'
  | 'bored'
  | 'curious'
  | 'love'
  | 'playful'
  | 'smile'
  | 'surprised';

export type WellbeingBand = 'thriving' | 'happy' | 'down' | 'sad';

/** Anchor points [hourOfDay, fraction of the daily goal expected by then]. */
const INTAKE_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [7, 0],
  [10, 0.25],
  [12.5, 0.3],
  [15, 0.6],
  [18, 0.7],
  [21, 1],
  [24, 1],
];

/**
 * Fraction (0-1) of the daily calorie goal a typical day has reached by
 * this clock time - piecewise-linear interpolation over INTAKE_CURVE.
 */
export function expectedIntakeFraction(now: Date): number {
  const h = now.getHours() + now.getMinutes() / 60;
  for (let i = 1; i < INTAKE_CURVE.length; i++) {
    const [h0, f0] = INTAKE_CURVE[i - 1];
    const [h1, f1] = INTAKE_CURVE[i];
    if (h <= h1) {
      if (h <= h0) return f0;
      return f0 + ((h - h0) / (h1 - h0)) * (f1 - f0);
    }
  }
  return 1;
}

/**
 * The dog's fullness given calories logged so far today. Hitting the goal
 * makes him full; over it, progressively less comfortable (stuffed ->
 * too_stuffed -> overeaten); otherwise it's how the logged total compares
 * with what's expected for the time of day.
 *
 * Over-goal bands (goalRatio = logged / goal):
 *   0.98 - 1.05  full        (on target, happy)
 *   1.05 - 1.12  stuffed     (slightly over, comfortably full)
 *   1.12 - 1.25  too_stuffed (over by a fair bit, not happy)
 *   >= 1.25      overeaten   (well over, stuffed and unwell)
 */
export function fullnessState(
  loggedKcal: number,
  goalKcal: number,
  now: Date,
): FullnessState {
  if (goalKcal <= 0) return 'content';
  const goalRatio = loggedKcal / goalKcal;
  if (goalRatio >= 1.25) return 'overeaten';
  if (goalRatio >= 1.12) return 'too_stuffed';
  if (goalRatio >= 1.05) return 'stuffed';
  if (goalRatio >= 0.98) return 'full';

  const expectedKcal = goalKcal * expectedIntakeFraction(now);
  if (expectedKcal <= 0) return loggedKcal > 0 ? 'content' : 'hungry';

  const satisfaction = loggedKcal / expectedKcal;
  if (satisfaction < 0.5) return 'hungry';
  if (satisfaction < 0.85) return 'peckish';
  return 'content';
}

export interface DogPoseInput {
  fullness: FullnessState;
  wellbeing: number;
  now: Date;
  /**
   * Whole days since the user last logged anything (0 = logged today).
   * 3 or more triggers the neglected "skeleton" pose. Undefined treated
   * as 0 (e.g. a brand-new user who has never logged - no guilt-trip).
   */
  daysSinceLastLog?: number;
  /**
   * Transient: an active event reaction (eating after a log, love after a
   * rename, etc.). Wins over everything except a dev-forced pose.
   */
  reaction?: DogPose;
  /** Transient: the user just logged food. */
  justAte?: boolean;
  /** Transient: the app was just opened (home-screen greeting). */
  greeting?: boolean;
}

/** Days of no logging at all before the dog shows the skeleton pose. */
export const SKELETON_DAYS = 3;

/** Fullness states that count as "fed" - they suppress the sad pose. */
const FED_STATES: ReadonlySet<FullnessState> = new Set<FullnessState>([
  'full',
  'stuffed',
  'too_stuffed',
  'overeaten',
]);

/**
 * Which pose/animation the dog shows right now. An active event reaction
 * (eating after a log, etc.) wins outright, then a fresh-log shorthand.
 * Then prolonged neglect is a hard override - the skeleton shows day or
 * night until the user logs again. Otherwise: greeting transient,
 * night-time sleep, a sad override for very low wellbeing, then the
 * fullness state, brightened to "happy" when content and thriving.
 */
export function dogPose(input: DogPoseInput): DogPose {
  const { fullness, wellbeing, now, reaction, justAte, greeting } = input;
  const daysSinceLastLog = input.daysSinceLastLog ?? 0;

  // A live event reaction is the top transient.
  if (reaction) return reaction;

  // A fresh log always wins (and, by definition, resets the neglect count).
  if (justAte) return 'eating';

  // Prolonged neglect is a hard override: ignores sleep, greeting and sad
  // until the user logs something.
  if (daysSinceLastLog >= SKELETON_DAYS) return 'skeleton';

  if (greeting) return 'greeting';

  // The dog sleeps in the small hours (11pm - 4am).
  const h = now.getHours();
  if (h >= 23 || h < 4) return 'sleeping';

  // Very low wellbeing reads as sad - unless he's fed right now, in which
  // case the fullness pose wins (it already conveys today's state, whether
  // comfy or over-full).
  if (wellbeing < 25 && !FED_STATES.has(fullness)) {
    return 'sad';
  }
  if (fullness === 'content' && wellbeing >= 80) return 'happy';
  return fullness;
}

/** Wellbeing score (0-100) → the dog's baseline disposition. */
export function wellbeingBand(score: number): WellbeingBand {
  if (score >= 80) return 'thriving';
  if (score >= 50) return 'happy';
  if (score >= 25) return 'down';
  return 'sad';
}

/** A friendly one-line status for the current pose. */
export function dogStatusLine(pose: DogPose, name: string): string {
  switch (pose) {
    case 'hungry':
      return `${name} is hungry - time to log a meal.`;
    case 'peckish':
      return `${name} is getting peckish.`;
    case 'eating':
      return `${name} is tucking in!`;
    case 'happy':
      return `${name} is delighted - right on track.`;
    case 'content':
      return `${name} is content.`;
    case 'full':
      return `${name} is full and happy.`;
    case 'stuffed':
      return `${name} is comfortably stuffed.`;
    case 'too_stuffed':
      return `${name} is too stuffed - that was a bit much.`;
    case 'overeaten':
      return `${name} overdid it and feels stuffed and queasy.`;
    case 'skeleton':
      return `${name} feels forgotten - log something to bring them back.`;
    case 'sad':
      return `${name} could use some care - log something today.`;
    case 'sleeping':
      return `${name} is fast asleep.`;
    case 'greeting':
      return `${name} is happy to see you!`;
    case 'stretching':
      return `${name} is having a good stretch.`;
    case 'bored':
      return `${name} is a little bored.`;
    case 'curious':
      return `${name} is curious about something.`;
    case 'love':
      return `${name} loves you!`;
    case 'playful':
      return `${name} wants to play!`;
    case 'smile':
      return `${name} is all smiles.`;
    case 'surprised':
      return `${name} looks surprised!`;
  }
}
