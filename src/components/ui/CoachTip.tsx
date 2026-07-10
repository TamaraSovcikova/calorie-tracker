import { useState, type ReactNode } from 'react';
import { Lightbulb, X } from 'lucide-react';

interface CoachTipProps {
  /** Stable id - once dismissed under this id the tip never shows again. */
  id: string;
  children: ReactNode;
}

const keyFor = (id: string) => `calorie-tracker:tip:${id}`;

function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(keyFor(id)) === '1';
  } catch {
    return false;
  }
}

/** A one-time, dismissible hint. Stays gone once the user closes it. */
export function CoachTip({ id, children }: CoachTipProps) {
  const [dismissed, setDismissed] = useState(() => isDismissed(id));
  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(keyFor(id), '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-muted-foreground">{children}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="tap-target -m-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
