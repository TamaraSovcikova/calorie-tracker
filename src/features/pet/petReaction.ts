/**
 * Transient pet "reactions" - short animation beats fired by app events
 * (eating after a log, love after a rename, a surprised beat after
 * overeating, etc.). `useDogState` shows an active reaction as the top
 * transient, above the data-derived pose.
 *
 * A reaction can be delayed (to play *after* an in-flight beat like eating)
 * and held for a duration. Calls supersede each other: the latest pulse
 * cancels any pending/active one. We never eagerly clear the visible pose
 * when scheduling a delayed pulse, so e.g. the eating beat keeps showing
 * during the delay and then hands off cleanly to the next reaction.
 */

import { create } from 'zustand';
import type { DogPose } from './petLogic';

interface PetReactionStore {
  reaction: DogPose | null;
}

export const usePetReaction = create<PetReactionStore>(() => ({
  reaction: null,
}));

let startTimer: ReturnType<typeof setTimeout> | undefined;
let holdTimer: ReturnType<typeof setTimeout> | undefined;

/** Default beat lengths (ms). */
const DEFAULT_HOLD = 3000;

/**
 * Fire a reaction beat.
 * @param pose    which pose to show
 * @param holdMs  how long to hold it once it starts
 * @param delayMs wait this long before it starts (lets a prior beat finish)
 */
export function pulseReaction(
  pose: DogPose,
  holdMs = DEFAULT_HOLD,
  delayMs = 0,
): void {
  clearTimeout(startTimer);
  clearTimeout(holdTimer);

  const start = () => {
    usePetReaction.setState({ reaction: pose });
    holdTimer = setTimeout(
      () => usePetReaction.setState({ reaction: null }),
      holdMs,
    );
  };

  if (delayMs > 0) {
    startTimer = setTimeout(start, delayMs);
  } else {
    start();
  }
}

/** Cancel any active or pending reaction immediately. */
export function clearReaction(): void {
  clearTimeout(startTimer);
  clearTimeout(holdTimer);
  usePetReaction.setState({ reaction: null });
}
