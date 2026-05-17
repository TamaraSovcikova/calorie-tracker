/**
 * Pure pet logic — the time-aware feeding model and pose selection from
 * REVAMP_PLAN §2. No DB, no React: fully unit-testable.
 *
 * "Fullness" is the moment-to-moment meter (derived, never stored).
 * "Wellbeing" is the long-arc 0-100 score (see wellbeing.ts).
 */

export type FullnessState = 'hungry' | 'peckish' | 'content' | 'full' | 'stuffed';

export type DogPose =
  | 'hungry'
  | 'peckish'
  | 'content'
  | 'full'
  | 'stuffed'
  | 'eating'
  | 'happy'
  | 'sad'
  | 'sleeping'
  | 'greeting'
  // Action / expression poses — shown as transient idle beats, never
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
 * this clock time — piecewise-linear interpolation over INTAKE_CURVE.
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
 * makes him full; well over it, stuffed; otherwise it's how the logged
 * total compares with what's expected for the time of day.
 */
export function fullnessState(
  loggedKcal: number,
  goalKcal: number,
  now: Date,
): FullnessState {
  if (goalKcal <= 0) return 'content';
  const goalRatio = loggedKcal / goalKcal;
  if (goalRatio > 1.1) return 'stuffed';
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
  /** Transient: the user just logged food. */
  justAte?: boolean;
  /** Transient: the app was just opened (home-screen greeting). */
  greeting?: boolean;
}

/**
 * Which pose/animation the dog shows right now. Transients (eating,
 * greeting) win; then night-time sleep; then a sad override for very low
 * wellbeing; otherwise the fullness state, brightened to "happy" when the
 * dog is both content and thriving.
 */
export function dogPose(input: DogPoseInput): DogPose {
  const { fullness, wellbeing, now, justAte, greeting } = input;
  if (justAte) return 'eating';
  if (greeting) return 'greeting';

  const h = now.getHours();
  if (h >= 22 || h < 6) return 'sleeping';

  // Very low wellbeing reads as sad — unless he's well-fed right now, in
  // which case the fed pose wins (a stuffed dog still looks comfy).
  if (wellbeing < 25 && fullness !== 'full' && fullness !== 'stuffed') {
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
      return `${name} is hungry — time to log a meal.`;
    case 'peckish':
      return `${name} is getting peckish.`;
    case 'eating':
      return `${name} is tucking in!`;
    case 'happy':
      return `${name} is delighted — right on track.`;
    case 'content':
      return `${name} is content.`;
    case 'full':
      return `${name} is full and happy.`;
    case 'stuffed':
      return `${name} is comfortably stuffed.`;
    case 'sad':
      return `${name} could use some care — log something today.`;
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
