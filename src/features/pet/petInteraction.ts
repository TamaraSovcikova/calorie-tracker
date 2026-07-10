/**
 * Interaction-aware pet reactions for the playground. Turns a coarse mood
 * (derived from today's fullness + the wellbeing score) plus a physical event
 * (a fling, a pat, repeated rough handling) into the pose the pet flashes -
 * so the animal reads as *aware* of how it's being treated rather than
 * cycling through random idle beats.
 */
import type { DogPose, FullnessState } from './petLogic';

export type PetMood = 'happy' | 'content' | 'needy' | 'distressed';

/** Fullness states where the pet actively wants food. */
const NEEDY_FULLNESS: ReadonlySet<FullnessState> = new Set<FullnessState>([
  'hungry',
  'peckish',
]);

/**
 * Coarse disposition from today's fullness, the wellbeing score and the
 * current data pose. A skeleton / sad pose or very low wellbeing always reads
 * as distressed; an unfed pet is needy; a well-fed, high-wellbeing pet is
 * happy; everyone else sits at content.
 */
export function petMood(
  fullness: FullnessState,
  wellbeing: number,
  pose: DogPose,
): PetMood {
  if (pose === 'skeleton' || pose === 'sad' || wellbeing < 25) return 'distressed';
  if (NEEDY_FULLNESS.has(fullness)) return 'needy';
  if (wellbeing >= 60 && (fullness === 'content' || fullness === 'full')) {
    return 'happy';
  }
  return 'content';
}

/** A physical thing the user did to the pet in the playground. */
export type PetEvent = 'toss' | 'bully' | 'pat' | 'impact';

/**
 * The pose to flash for a physical interaction, coloured by the pet's mood.
 * A good-natured pet plays when flung; a hungry or low one just hates it.
 * Repeated rough handling (bullying) upsets even a happy pet.
 */
export function reactionFor(event: PetEvent, mood: PetMood): DogPose {
  switch (event) {
    case 'bully':
      return 'sad';
    case 'toss':
      return mood === 'happy' || mood === 'content' ? 'playful' : 'sad';
    case 'pat':
      return mood === 'distressed' ? 'happy' : 'love';
    case 'impact':
      return 'surprised';
  }
}

/** Idle-beat pools, so what the pet does unprompted matches how it feels. */
const IDLE_BEATS: Record<PetMood, readonly DogPose[]> = {
  happy: ['playful', 'smile', 'stretching', 'curious', 'love'],
  content: ['curious', 'stretching', 'smile', 'bored'],
  needy: ['bored', 'curious', 'bored', 'sad'],
  distressed: ['sad', 'bored', 'sad'],
};

/** Pick a mood-appropriate idle beat. */
export function idleBeatFor(mood: PetMood): DogPose {
  const pool = IDLE_BEATS[mood];
  return pool[Math.floor(Math.random() * pool.length)];
}
