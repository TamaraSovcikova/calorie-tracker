import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Dog } from './Dog';
import { useDogState } from './useDogState';

/**
 * Compact dog at the top of the diary — mirrors the current state and
 * taps through to the full Pet screen.
 */
export function DogPeek() {
  const navigate = useNavigate();
  const dog = useDogState();
  if (!dog.ready) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/pet')}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-2.5 pr-3 text-left shadow-sm transition-colors hover:bg-muted/40 active:scale-[0.99]"
    >
      <Dog pose={dog.pose} className="h-14 w-14 shrink-0" />
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">
        {dog.statusLine}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
