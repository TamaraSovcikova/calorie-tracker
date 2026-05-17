import { cn } from '@/lib/cn';
import type { DogPose } from './petLogic';
import contentUrl from '@/assets/pet/dog-content.webp';
import eatingUrl from '@/assets/pet/dog-eating.webp';
import fullUrl from '@/assets/pet/dog-full.webp';
import greetingUrl from '@/assets/pet/dog-greeting.webp';
import happyUrl from '@/assets/pet/dog-happy.webp';
import hungryUrl from '@/assets/pet/dog-hungry.webp';
import peckishUrl from '@/assets/pet/dog-peckish.webp';
import sadUrl from '@/assets/pet/dog-sad.webp';
import sleepingUrl from '@/assets/pet/dog-sleeping.webp';
import stuffedUrl from '@/assets/pet/dog-stuffed.webp';

const POSE_SRC: Record<DogPose, string> = {
  hungry: hungryUrl,
  peckish: peckishUrl,
  content: contentUrl,
  full: fullUrl,
  stuffed: stuffedUrl,
  eating: eatingUrl,
  happy: happyUrl,
  sad: sadUrl,
  sleeping: sleepingUrl,
  greeting: greetingUrl,
};

/** Poses with extra pep get the livelier bob instead of calm breathing. */
const BOB_POSES = new Set<DogPose>(['happy', 'greeting', 'eating']);

interface DogProps {
  pose: DogPose;
  /** Tailwind size classes for the frame (e.g. "h-48 w-48"). */
  className?: string;
}

/**
 * The dog. A single transparent pose image with an idle CSS animation
 * (gentle breathing, or a bob for the lively poses) and a pop on every
 * pose change — keyed by pose so React remounts and replays it.
 */
export function Dog({ pose, className }: DogProps) {
  return (
    <div
      className={cn(
        'flex origin-bottom items-end justify-center',
        BOB_POSES.has(pose) ? 'animate-bob' : 'animate-breathe',
        className,
      )}
    >
      <img
        key={pose}
        src={POSE_SRC[pose]}
        alt=""
        draggable={false}
        className="h-full w-full animate-pop-in select-none object-contain"
      />
    </div>
  );
}
