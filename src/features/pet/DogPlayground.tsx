import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Dog } from './Dog';
import type { DogPose } from './petLogic';

/**
 * A Shimeji-flavoured playground for the Pet screen. Biscuit can be
 * grabbed and flung; he falls under gravity, bounces off the floor and
 * walls, tumbles when thrown, and — for active poses — hops around on his
 * own. Restful poses (full, stuffed, asleep, sad) just settle on the floor.
 *
 * Physics live entirely in refs and a requestAnimationFrame loop that
 * writes `transform` straight to the DOM — no per-frame React renders.
 */

const DOG = 120; // dog box, px
const GRAVITY = 0.85;
const FLOOR_BOUNCE = 0.42;
const WALL_BOUNCE = 0.5;
const GROUND_FRICTION = 0.84;
const AIR_FRICTION = 0.992;
const THROW_CAP = 34;

const RESTFUL = new Set<DogPose>(['full', 'stuffed', 'sleeping', 'sad', 'eating']);

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

interface DogPlaygroundProps {
  pose: DogPose;
  className?: string;
}

export function DogPlayground({ pose, className }: DogPlaygroundProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dogRef = useRef<HTMLDivElement>(null);

  // Physics + interaction state — refs, so frames don't trigger renders.
  const pos = useRef({ x: 80, y: 0 });
  const vel = useRef({ vx: 0, vy: 0 });
  const stage = useRef({ w: 320, h: 280 });
  const facing = useRef<1 | -1>(1);
  const rot = useRef(0);
  const onFloor = useRef(false);
  const dragging = useRef(false);
  const stageRect = useRef<DOMRect | null>(null);
  const grab = useRef({ x: 0, y: 0 });
  const ptr = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Keep the restful flag readable inside the long-lived loops.
  const restfulRef = useRef(RESTFUL.has(pose));
  restfulRef.current = RESTFUL.has(pose);

  useEffect(() => {
    const stageEl = stageRef.current;
    const dogEl = dogRef.current;
    if (!stageEl || !dogEl) return;

    const measure = () => {
      const r = stageEl.getBoundingClientRect();
      stage.current = { w: r.width, h: r.height };
      pos.current.x = clamp(pos.current.x, 0, r.width - DOG);
      pos.current.y = clamp(pos.current.y, 0, r.height - DOG);
    };
    measure();
    pos.current.x = stage.current.w / 2 - DOG / 2; // drop in from the top
    const ro = new ResizeObserver(measure);
    ro.observe(stageEl);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = clamp((now - last) / 16.667, 0.4, 2.4);
      last = now;
      const p = pos.current;
      const v = vel.current;
      const s = stage.current;
      const floorY = s.h - DOG;

      if (!dragging.current) {
        v.vy += GRAVITY * dt;
        p.x += v.vx * dt;
        p.y += v.vy * dt;

        if (p.x <= 0) {
          p.x = 0;
          v.vx = Math.abs(v.vx) * WALL_BOUNCE;
        } else if (p.x >= s.w - DOG) {
          p.x = s.w - DOG;
          v.vx = -Math.abs(v.vx) * WALL_BOUNCE;
        }
        if (p.y < 0) {
          p.y = 0;
          v.vy = Math.abs(v.vy) * WALL_BOUNCE;
        }
        if (p.y >= floorY) {
          p.y = floorY;
          v.vy = v.vy > 1.6 ? -v.vy * FLOOR_BOUNCE : 0;
          v.vx *= GROUND_FRICTION ** dt;
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
        if (Math.abs(v.vx) > 0.45) facing.current = v.vx > 0 ? 1 : -1;
      }

      dogEl.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) rotate(${rot.current.toFixed(1)}deg) scaleX(${facing.current})`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Self-roaming: when settled on the floor and not restful, hop about.
    let roamTimer: ReturnType<typeof setTimeout>;
    const roam = () => {
      roamTimer = setTimeout(
        () => {
          if (
            onFloor.current &&
            !dragging.current &&
            !restfulRef.current
          ) {
            vel.current.vy = -(10 + Math.random() * 4);
            vel.current.vx = (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 2);
          }
          roam();
        },
        2200 + Math.random() * 3000,
      );
    };
    roam();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(roamTimer);
      ro.disconnect();
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const stageEl = stageRef.current;
    if (!stageEl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stageEl.getBoundingClientRect();
    stageRect.current = rect;
    dragging.current = true;
    grab.current = {
      x: e.clientX - rect.left - pos.current.x,
      y: e.clientY - rect.top - pos.current.y,
    };
    ptr.current = { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY };
    vel.current = { vx: 0, vy: 0 };
    rot.current = 0;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const rect = stageRect.current;
    if (!rect) return;
    ptr.current.px = ptr.current.x;
    ptr.current.py = ptr.current.y;
    ptr.current.x = e.clientX;
    ptr.current.y = e.clientY;
    pos.current.x = clamp(
      e.clientX - rect.left - grab.current.x,
      0,
      stage.current.w - DOG,
    );
    pos.current.y = clamp(
      e.clientY - rect.top - grab.current.y,
      0,
      stage.current.h - DOG,
    );
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    // Fling: carry the pointer's last-frame velocity into the throw.
    vel.current = {
      vx: clamp(ptr.current.x - ptr.current.px, -THROW_CAP, THROW_CAP),
      vy: clamp(ptr.current.y - ptr.current.py, -THROW_CAP, THROW_CAP),
    };
  };

  return (
    <div
      ref={stageRef}
      className={cn('relative overflow-hidden', className)}
    >
      <div
        ref={dogRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ width: DOG, height: DOG, willChange: 'transform' }}
        className="absolute left-0 top-0 touch-none cursor-grab active:cursor-grabbing"
      >
        <Dog pose={pose} className="h-full w-full" />
      </div>
    </div>
  );
}
