import { useNavigate } from 'react-router-dom';
import { Loader2, Utensils } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { DogPlayground } from '@/features/pet/DogPlayground';
import { useDogState } from '@/features/pet/useDogState';
import { useDailyGreeting } from '@/features/pet/useDailyGreeting';
import { wellbeingBand } from '@/features/pet/petLogic';
import { formatKcal } from '@/lib/macros';

export function PetPage() {
  const navigate = useNavigate();
  const greeting = useDailyGreeting();
  const dog = useDogState({ greeting });

  if (!dog.ready) {
    return (
      <>
        <PageHeader title="Pet" onBack={() => navigate('/diary')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </>
    );
  }

  const goalPct =
    dog.goalKcal > 0 ? Math.min(100, (dog.loggedKcal / dog.goalKcal) * 100) : 0;
  const remaining = Math.max(0, Math.round(dog.goalKcal - dog.loggedKcal));
  const band = wellbeingBand(dog.wellbeing);

  return (
    <>
      <PageHeader
        title={dog.petName}
        subtitle="Your companion"
        onBack={() => navigate('/diary')}
      />
      <div className="mx-auto max-w-md animate-fade-in space-y-4 px-4 py-4">
        {/* The dog's playground — grab and fling him, he roams on his own. */}
        <section className="flex flex-col items-center rounded-3xl border border-border bg-card px-4 pb-5 pt-2 shadow-sm">
          <DogPlayground pose={dog.pose} className="h-72 w-full" />
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            {dog.statusLine}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Tip: grab {dog.petName} and fling him around.
          </p>
        </section>

        <Button block size="lg" onClick={() => navigate('/diary')}>
          <Utensils className="h-4 w-4" />
          Log food
        </Button>

        {/* Wellbeing — the long-arc consistency meter. */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Wellbeing</span>
            <span className="text-xs capitalize text-muted-foreground">{band}</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${dog.wellbeing}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Logging every day keeps {dog.petName} thriving.
          </p>
        </section>

        {/* Today's calories at a glance. */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Today
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-semibold tabular-nums">
              {formatKcal(dog.loggedKcal)}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {formatKcal(dog.goalKcal)} kcal
              </span>
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatKcal(remaining)} left
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-kcal transition-all duration-500"
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </section>
      </div>
    </>
  );
}
