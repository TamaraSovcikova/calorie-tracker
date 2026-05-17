import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Dog } from './Dog';
import type { DogPose } from './petLogic';

/** Poses where the dog rests in place — no roaming. */
const RESTFUL = new Set<DogPose>(['full', 'stuffed', 'sleeping', 'sad', 'eating']);

type Action = 'idle' | 'hop' | 'perk' | 'wiggle' | 'stretch';

const ACTION_CLASS: Record<Action, string> = {
  idle: '',
  hop: 'animate-hop',
  perk: 'animate-perk',
  wiggle: 'animate-wiggle',
  stretch: 'animate-stretch',
};

interface DogStageProps {
  pose: DogPose;
  className?: string;
}

/**
 * The dog's "stage" — whole-sprite choreography. For active poses the dog
 * keeps busy on a randomised loop: hopping to new spots, turning to look
 * around, wiggling, stretching, and the odd happy beat — so the same
 * logging state never looks the same for long. Restful poses (full,
 * stuffed, asleep, sad) settle in place and just breathe.
 */
export function DogStage({ pose, className }: DogStageProps) {
  const [x, setX] = useState(50); // horizontal centre, % of stage
  const [facing, setFacing] = useState<1 | -1>(1);
  const [action, setAction] = useState<Action>('idle');
  const [beatPose, setBeatPose] = useState<DogPose | null>(null);
  const xRef = useRef(50);
  const restful = RESTFUL.has(pose);

  useEffect(() => {
    // A pose change cancels anything in flight.
    setAction('idle');
    setBeatPose(null);
    if (restful) return;

    const canBeat = pose === 'content' || pose === 'peckish';
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fn: () => void) => {
      timers.push(setTimeout(fn, ms));
    };

    const run = () => {
      const choices: Array<[string, number]> = [
        ['hop', 28],
        ['perk', 15],
        ['turn', 14],
        ['wiggle', 15],
        ['stretch', 13],
        ['beat', canBeat ? 17 : 0],
      ];
      let r = Math.random() * choices.reduce((s, [, w]) => s + w, 0);
      let pick = 'perk';
      for (const [name, w] of choices) {
        r -= w;
        if (r < 0) {
          pick = name;
          break;
        }
      }

      switch (pick) {
        case 'hop': {
          const target = 28 + Math.random() * 44;
          setFacing(target >= xRef.current ? 1 : -1);
          xRef.current = target;
          setX(target);
          setAction('hop');
          after(700, () => setAction('idle'));
          break;
        }
        case 'perk':
          setAction('perk');
          after(740, () => setAction('idle'));
          break;
        case 'turn':
          setFacing((f) => (f === 1 ? -1 : 1));
          setAction('perk'); // a little bounce as he turns around
          after(740, () => setAction('idle'));
          break;
        case 'wiggle':
          setAction('wiggle');
          after(640, () => setAction('idle'));
          break;
        case 'stretch':
          setAction('stretch');
          after(970, () => setAction('idle'));
          break;
        case 'beat': // a brief delighted moment, then back to the base pose
          setBeatPose('happy');
          setAction('perk');
          after(760, () => setAction('idle'));
          after(2300, () => setBeatPose(null));
          break;
      }

      after(2100 + Math.random() * 3000, run);
    };

    after(800 + Math.random() * 1400, run);
    return () => timers.forEach(clearTimeout);
  }, [restful, pose]);

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div
        className="absolute bottom-0 transition-[left] duration-700 ease-[cubic-bezier(0.34,0,0.32,1)]"
        style={{ left: `${x}%` }}
      >
        {/* centre the dog on its x point */}
        <div className="-translate-x-1/2">
          {/* one-shot action animation */}
          <div className={cn('origin-bottom', ACTION_CLASS[action])}>
            {/* facing flip */}
            <div
              className="transition-transform duration-200"
              style={{ transform: `scaleX(${facing})` }}
            >
              <Dog pose={beatPose ?? pose} className="h-36 w-36" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
