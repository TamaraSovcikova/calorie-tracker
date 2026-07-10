import { useNavigate } from 'react-router-dom';
import { Maximize2 } from 'lucide-react';
import { DogPlayground } from './DogPlayground';
import { useDogState } from './useDogState';
import { useDailyGreeting } from './useDailyGreeting';

/**
 * The dog hero band at the top of the Today screen - a compact playground
 * (still draggable) with the current status line. The expand button opens
 * the full-screen Pet playground.
 */
export function DogHero() {
  const navigate = useNavigate();
  const greeting = useDailyGreeting();
  const dog = useDogState({ greeting });
  if (!dog.ready) return null;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card pb-3 shadow-sm">
      <button
        type="button"
        onClick={() => navigate('/pet')}
        aria-label="Open the playground"
        className="tap-target absolute right-1.5 top-1.5 z-10 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      <DogPlayground
        pose={dog.pose}
        mood={dog.mood}
        species={dog.species}
        className="h-44 w-full"
      />
      <p className="px-4 text-center text-sm text-muted-foreground">
        {dog.statusLine}
      </p>
    </section>
  );
}
