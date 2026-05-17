import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Dog } from './Dog';
import type { DogPose } from './petLogic';

/** Poses where the dog rests in place — no roaming. */
const RESTFUL = new Set<DogPose>(['full', 'stuffed', 'sleeping', 'sad', 'eating']);

type Action = 'idle' | 'hop' | 'perk';

interface DogStageProps {
  pose: DogPose;
  className?: string;
}

/**
 * The dog's "stage" — whole-sprite choreography. For active poses the dog
 * roams: it hops to new spots, turns to look around, and does excited
 * little double-bounces, always in the logging-driven pose. Restful poses
 * (full, stuffed, asleep, sad) stay put and just breathe.
 */
export function DogStage({ pose, className }: DogStageProps) {
  const [x, setX] = useState(50); // horizontal centre, % of stage
  const [facing, setFacing] = useState<1 | -1>(1);
  const [action, setAction] = useState<Action>('idle');
  const xRef = useRef(50);
  const restful = RESTFUL.has(pose);

  useEffect(() => {
    if (restful) {
      setAction('idle');
      return;
    }
    let next: ReturnType<typeof setTimeout>;
    let reset: ReturnType<typeof setTimeout>;

    const schedule = () => {
      next = setTimeout(
        () => {
          const roll = Math.random();
          if (roll < 0.55) {
            // hop to a fresh spot, turning to face the way it travels
            const target = 28 + Math.random() * 44;
            setFacing(target >= xRef.current ? 1 : -1);
            xRef.current = target;
            setX(target);
            setAction('hop');
            reset = setTimeout(() => setAction('idle'), 680);
          } else if (roll < 0.82) {
            // excited bounce in place
            setAction('perk');
            reset = setTimeout(() => setAction('idle'), 720);
          } else {
            // just turn to look around
            setFacing((f) => (f === 1 ? -1 : 1));
          }
          schedule();
        },
        2400 + Math.random() * 3200,
      );
    };
    schedule();

    return () => {
      clearTimeout(next);
      clearTimeout(reset);
    };
  }, [restful]);

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div
        className="absolute bottom-0 transition-[left] duration-700 ease-[cubic-bezier(0.34,0,0.32,1)]"
        style={{ left: `${x}%` }}
      >
        {/* centre the dog on its x point */}
        <div className="-translate-x-1/2">
          {/* one-shot hop / perk */}
          <div
            className={
              action === 'hop'
                ? 'animate-hop'
                : action === 'perk'
                  ? 'animate-perk'
                  : ''
            }
          >
            {/* facing flip */}
            <div
              className="transition-transform duration-200"
              style={{ transform: `scaleX(${facing})` }}
            >
              <Dog pose={pose} className="h-36 w-36" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
