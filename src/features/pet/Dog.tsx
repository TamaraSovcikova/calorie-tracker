import { cn } from '@/lib/cn';
import type { DogPose } from './petLogic';
import type { PetSpecies } from './petSpecies';

/**
 * Every species' pose images, bundled at build time and keyed by filename
 * ("cat-happy", "shepherd-sleeping", …). Using import.meta.glob keeps this
 * from being 80 hand-written import lines; adding a new species is just
 * dropping its {species}-{pose}.webp files into src/assets/pet/.
 */
const FILES = import.meta.glob('../../assets/pet/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const POSE_SETS: Record<string, Partial<Record<DogPose, string>>> = {};
for (const [path, url] of Object.entries(FILES)) {
  const m = /\/([a-z]+)-([a-z_]+)\.webp$/.exec(path);
  if (!m) continue;
  const [, species, pose] = m;
  (POSE_SETS[species] ??= {})[pose as DogPose] = url;
}

/** Pose image URL for a species, falling back to the dog if a pose or whole
 *  species set is missing. */
export function getDogSrc(pose: DogPose, species: PetSpecies = 'dog'): string {
  const dog = POSE_SETS.dog ?? {};
  return POSE_SETS[species]?.[pose] ?? dog[pose] ?? dog.content ?? '';
}

/** Poses with extra pep get the livelier bob instead of calm breathing. */
const BOB_POSES = new Set<DogPose>(['happy', 'greeting', 'eating', 'playful']);

interface DogProps {
  pose: DogPose;
  /** Which animal to render. Defaults to the original dog. */
  species?: PetSpecies;
  /** Tailwind size classes for the frame (e.g. "h-48 w-48"). */
  className?: string;
}

/**
 * The pet. A single transparent pose image with an idle CSS animation
 * (gentle breathing, or a bob for the lively poses) and a pop on every
 * pose (or species) change - keyed so React remounts and replays it.
 */
export function Dog({ pose, species = 'dog', className }: DogProps) {
  return (
    <div
      className={cn(
        'flex origin-bottom items-end justify-center',
        BOB_POSES.has(pose) ? 'animate-bob' : 'animate-breathe',
        className,
      )}
    >
      <img
        key={`${species}-${pose}`}
        src={getDogSrc(pose, species)}
        alt=""
        draggable={false}
        className="h-full w-full animate-pop-in select-none object-contain"
      />
    </div>
  );
}
