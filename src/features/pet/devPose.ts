/**
 * Dev-only pose override for testing the dog's states without having to
 * manufacture the real data (eat 2600 kcal, skip logging for 3 days, wait
 * until night, etc.).
 *
 * The override is honoured by `useDogState` ONLY when `import.meta.env.DEV`
 * is true, so it has no effect in a production build. The console helpers
 * are installed lazily from `main.tsx`, also dev-gated.
 */

import { create } from 'zustand';
import type { DogPose } from './petLogic';

/** Every pose, in a sensible order for cycling / a dev picker. */
export const ALL_POSES: readonly DogPose[] = [
  // Fullness ladder
  'hungry',
  'peckish',
  'content',
  'full',
  'stuffed',
  'too_stuffed',
  'overeaten',
  // Neglect + mood
  'skeleton',
  'sad',
  'happy',
  // Transients / expressions
  'eating',
  'greeting',
  'sleeping',
  'stretching',
  'bored',
  'curious',
  'love',
  'playful',
  'smile',
  'surprised',
];

interface DevPoseStore {
  /** A forced pose, or null to use the dog's live, data-derived state. */
  forced: DogPose | null;
  setForced: (pose: DogPose | null) => void;
}

export const useDevPoseStore = create<DevPoseStore>((set) => ({
  forced: null,
  setForced: (forced) => set({ forced }),
}));

interface DogDevApi {
  /** All pose names you can force. */
  poses: readonly DogPose[];
  /** Force a specific pose (e.g. `__dog.set('skeleton')`). */
  set: (pose: DogPose) => void;
  /** Clear the override - back to the dog's live state. */
  clear: () => void;
  /** Step to the next pose in the list. */
  cycle: () => void;
  /** Print usage. */
  help: () => void;
}

declare global {
  interface Window {
    __dog?: DogDevApi;
  }
}

/**
 * Install the `window.__dog` console helpers. Call from `main.tsx` inside
 * an `import.meta.env.DEV` guard so it never ships to production.
 */
export function installDogDevConsole(): void {
  const apply = (pose: DogPose | null) =>
    useDevPoseStore.getState().setForced(pose);

  const api: DogDevApi = {
    poses: ALL_POSES,
    set(pose) {
      if (!ALL_POSES.includes(pose)) {
        console.warn(`[dog] unknown pose "${pose}". Options:`, ALL_POSES);
        return;
      }
      apply(pose);
      console.log(`[dog] forced pose -> ${pose}`);
    },
    clear() {
      apply(null);
      console.log('[dog] cleared - back to live state');
    },
    cycle() {
      const cur = useDevPoseStore.getState().forced;
      const i = cur ? ALL_POSES.indexOf(cur) : -1;
      const next = ALL_POSES[(i + 1) % ALL_POSES.length]!;
      apply(next);
      console.log(`[dog] cycle -> ${next}`);
    },
    help() {
      console.log(
        [
          'Dog dev console (localhost only):',
          "  __dog.set('skeleton')  force a pose",
          '  __dog.clear()          back to the live, data-derived state',
          '  __dog.cycle()          step to the next pose',
          '  __dog.poses            list every pose name',
        ].join('\n'),
      );
    },
  };

  window.__dog = api;
  console.log(
    '%c[dog] dev pose console ready',
    'color:#0a7;font-weight:bold',
    '- run __dog.help()',
  );
}
