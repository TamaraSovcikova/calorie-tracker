import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, X } from 'lucide-react';
import { useFoodFactStore } from './foodFactStore';

const AUTO_DISMISS_MS = 14000;

/**
 * The food-fact card - a single, dismissible nutrition tip shown after
 * logging a food. Portalled to the body and anchored just above the toast
 * stack so the two never collide.
 */
export function FoodFactCard() {
  const fact = useFoodFactStore((s) => s.fact);
  const dismiss = useFoodFactStore((s) => s.dismiss);

  useEffect(() => {
    if (!fact) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [fact, dismiss]);

  if (!fact) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-[170] flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-md animate-fade-in gap-3 rounded-2xl border border-primary/40 bg-card p-4 shadow-xl">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Lightbulb className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-primary">
            {fact.food}
          </div>
          <p className="mt-0.5 text-sm text-foreground">{fact.text}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="tap-target h-fit shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
