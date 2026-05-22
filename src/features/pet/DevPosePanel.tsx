import { cn } from '@/lib/cn';
import { ALL_POSES, useDevPoseStore } from './devPose';

/**
 * Dev-only on-screen pose picker for the Pet page. Handy for testing on a
 * phone (over the LAN tunnel) where the JS console isn't reachable. Renders
 * nothing unless `import.meta.env.DEV`, and even when imported into a prod
 * build it self-guards to null - the override is ignored there anyway.
 */
export function DevPosePanel() {
  const forced = useDevPoseStore((s) => s.forced);
  const setForced = useDevPoseStore((s) => s.setForced);

  if (!import.meta.env.DEV) return null;

  return (
    <section className="rounded-2xl border border-dashed border-amber-400 bg-amber-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Dev: force pose
        </span>
        <button
          type="button"
          onClick={() => setForced(null)}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            forced
              ? 'bg-amber-600 text-white'
              : 'bg-amber-200/60 text-amber-700',
          )}
        >
          {forced ? 'Back to live' : 'Live'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_POSES.map((pose) => (
          <button
            key={pose}
            type="button"
            onClick={() => setForced(pose)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs',
              forced === pose
                ? 'bg-amber-600 text-white'
                : 'bg-white text-amber-800 ring-1 ring-amber-300',
            )}
          >
            {pose}
          </button>
        ))}
      </div>
    </section>
  );
}
