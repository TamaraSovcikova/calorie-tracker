import { useEffect, useRef, useState } from 'react';
import { Dog } from './Dog';
import type { DogPose } from './petLogic';
import type { PetSpecies } from './petSpecies';

const DOG = 74;
const STAGE_W = 236;
const STAGE_H = 236;

const GRAVITY = 0.55;
const FLOOR_BOUNCE = 0.42;
const WALL_BOUNCE = 0.5;
const GROUND_FRICTION = 0.84;
const AIR_FRICTION = 0.992;
const THROW_CAP = 28;
const WALK_SPEED = 1.2;

const RESTFUL = new Set<DogPose>([
  'full',
  'stuffed',
  'too_stuffed',
  'overeaten',
  'skeleton',
  'sleeping',
  'sad',
  'eating',
]);

const BEAT_POSES: DogPose[] = [
  'stretching',
  'bored',
  'curious',
  'love',
  'playful',
  'smile',
  'surprised',
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Props { pose: DogPose; species?: PetSpecies }

export function DraggableDogArc({ pose, species = 'dog' }: Props) {
  const dogRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: (STAGE_W - DOG) / 2, y: STAGE_H - DOG - 2 });
  const vel = useRef({ vx: 0, vy: 0 });
  const facing = useRef<1 | -1>(1);
  const rot = useRef(0);
  const onFloor = useRef(true);
  const dragging = useRef(false);
  const behavior = useRef<'idle' | 'walking'>('idle');
  const walkTarget = useRef(0);
  const stageRect = useRef<DOMRect | null>(null);
  const grab = useRef({ x: 0, y: 0 });
  const ptr = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const restfulRef = useRef(RESTFUL.has(pose));
  restfulRef.current = RESTFUL.has(pose);

  const [beat, setBeat] = useState<DogPose | null>(null);

  useEffect(() => {
    const dogEl = dogRef.current;
    if (!dogEl) return;

    pos.current = { x: (STAGE_W - DOG) / 2, y: STAGE_H - DOG - 2 };
    onFloor.current = true;

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = clamp((now - last) / 16.667, 0.4, 2.4);
      last = now;
      const p = pos.current;
      const v = vel.current;
      const floorY = STAGE_H - DOG;

      if (!dragging.current) {
        v.vy += GRAVITY * dt;

        const walking = behavior.current === 'walking' && onFloor.current;
        if (walking) {
          const dir = walkTarget.current >= p.x ? 1 : -1;
          facing.current = dir;
          if (Math.abs(walkTarget.current - p.x) <= WALK_SPEED * dt + 1.5) {
            p.x = walkTarget.current;
            v.vx = 0;
            behavior.current = 'idle';
          } else {
            v.vx = dir * WALK_SPEED;
          }
        }

        p.x += v.vx * dt;
        p.y += v.vy * dt;

        if (p.x <= 0) {
          p.x = 0;
          v.vx = Math.abs(v.vx) * WALL_BOUNCE;
          behavior.current = 'idle';
        } else if (p.x >= STAGE_W - DOG) {
          p.x = STAGE_W - DOG;
          v.vx = -Math.abs(v.vx) * WALL_BOUNCE;
          behavior.current = 'idle';
        }
        if (p.y < 0) {
          p.y = 0;
          v.vy = Math.abs(v.vy) * WALL_BOUNCE;
        }
        if (p.y >= floorY) {
          p.y = floorY;
          v.vy = v.vy > 1.6 ? -v.vy * FLOOR_BOUNCE : 0;
          if (behavior.current !== 'walking') v.vx *= GROUND_FRICTION ** dt;
          onFloor.current = Math.abs(v.vy) < 0.6;
        } else {
          onFloor.current = false;
          v.vx *= AIR_FRICTION ** dt;
        }

        if (onFloor.current) {
          rot.current += (0 - rot.current) * Math.min(1, 0.2 * dt);
          if (Math.abs(rot.current) < 0.4) rot.current = 0;
        } else {
          rot.current += v.vx * 0.7 * dt;
        }

        if (behavior.current !== 'walking' && Math.abs(v.vx) > 0.45) {
          facing.current = v.vx > 0 ? 1 : -1;
        }
      }

      dogEl.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) rotate(${rot.current.toFixed(1)}deg) scaleX(${facing.current})`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    let roamTimer: ReturnType<typeof setTimeout>;
    const roam = () => {
      roamTimer = setTimeout(
        () => {
          const free =
            onFloor.current &&
            !dragging.current &&
            !restfulRef.current &&
            behavior.current !== 'walking';
          if (free) {
            const roll = Math.random();
            if (roll < 0.35) {
              // pause
            } else if (roll < 0.75) {
              const dir = Math.random() < 0.5 ? -1 : 1;
              walkTarget.current = clamp(
                pos.current.x + dir * (40 + Math.random() * 110),
                0,
                STAGE_W - DOG,
              );
              behavior.current = 'walking';
            } else if (roll < 0.88) {
              facing.current = facing.current === 1 ? -1 : 1;
            } else {
              vel.current.vy = -(5 + Math.random() * 3);
              vel.current.vx = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.5);
            }
          }
          roam();
        },
        1800 + Math.random() * 3200,
      );
    };
    roam();

    let beatTimer: ReturnType<typeof setTimeout>;
    let beatClear: ReturnType<typeof setTimeout>;
    const idleBeat = () => {
      beatTimer = setTimeout(
        () => {
          if (onFloor.current && !dragging.current && !restfulRef.current) {
            setBeat(BEAT_POSES[Math.floor(Math.random() * BEAT_POSES.length)]);
            beatClear = setTimeout(() => setBeat(null), 2400);
          }
          idleBeat();
        },
        5000 + Math.random() * 6000,
      );
    };
    idleBeat();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(roamTimer);
      clearTimeout(beatTimer);
      clearTimeout(beatClear);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    stageRect.current = e.currentTarget.parentElement!.getBoundingClientRect();
    dragging.current = true;
    behavior.current = 'idle';
    grab.current = {
      x: e.clientX - stageRect.current.left - pos.current.x,
      y: e.clientY - stageRect.current.top - pos.current.y,
    };
    ptr.current = { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY };
    vel.current = { vx: 0, vy: 0 };
    rot.current = 0;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !stageRect.current) return;
    ptr.current.px = ptr.current.x;
    ptr.current.py = ptr.current.y;
    ptr.current.x = e.clientX;
    ptr.current.y = e.clientY;
    pos.current.x = clamp(e.clientX - stageRect.current.left - grab.current.x, 0, STAGE_W - DOG);
    pos.current.y = clamp(e.clientY - stageRect.current.top - grab.current.y, 0, STAGE_H - DOG);
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    vel.current = {
      vx: clamp(ptr.current.x - ptr.current.px, -THROW_CAP, THROW_CAP),
      vy: clamp(ptr.current.y - ptr.current.py, -THROW_CAP, THROW_CAP),
    };
  };

  return (
    <div
      ref={dogRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: DOG,
        height: DOG,
        willChange: 'transform',
        transform: `translate3d(${(STAGE_W - DOG) / 2}px,${STAGE_H - DOG - 2}px,0)`,
        touchAction: 'none',
        cursor: 'grab',
      }}
      className="active:cursor-grabbing"
    >
      <Dog pose={beat ?? pose} species={species} className="h-full w-full" />
    </div>
  );
}
