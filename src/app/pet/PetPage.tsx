import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Loader2, Utensils } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { DogPlayground } from '@/features/pet/DogPlayground';
import { DevPosePanel } from '@/features/pet/DevPosePanel';
import { RenamePetSheet } from '@/features/pet/RenamePetSheet';
import { useDogState } from '@/features/pet/useDogState';
import { useDailyGreeting } from '@/features/pet/useDailyGreeting';
import { wellbeingBand } from '@/features/pet/petLogic';
import { PET_SPECIES, PET_SPECIES_LABEL } from '@/features/pet/petSpecies';
import { updatePet } from '@/db/repos/pet';

export function PetPage() {
  const navigate = useNavigate();
  const greeting = useDailyGreeting();
  const dog = useDogState({ greeting });
  const [renameOpen, setRenameOpen] = useState(false);

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

  const band = wellbeingBand(dog.wellbeing);

  return (
    <>
      <PageHeader
        title={dog.petName}
        subtitle="Tap the name to rename"
        onBack={() => navigate('/diary')}
        onTitleClick={() => setRenameOpen(true)}
      />
      <div className="mx-auto max-w-md animate-fade-in space-y-4 px-4 py-4">
        {import.meta.env.DEV && <DevPosePanel />}
        {/* The dog's playground - grab and fling him, he roams on his own. */}
        <section className="flex flex-col items-center rounded-3xl border border-border bg-card px-4 pb-5 pt-2 shadow-sm">
          <DogPlayground
            pose={dog.pose}
            mood={dog.mood}
            species={dog.species}
            className="h-72 w-full"
          />
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            {dog.statusLine}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Tip: grab {dog.petName} and fling them around.
          </p>

          {/* Choose your companion. Switching keeps the name + wellbeing. */}
          <div className="mt-4 flex w-full flex-wrap justify-center gap-1.5">
            {PET_SPECIES.map((s) => {
              const active = s === dog.species;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => void updatePet({ breed: s })}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: active ? 'var(--color-accent-deep)' : 'transparent',
                    color: active ? '#fff' : 'var(--color-text-muted)',
                    borderColor: active ? 'var(--color-accent-deep)' : 'var(--color-border)',
                  }}
                >
                  {PET_SPECIES_LABEL[s]}
                </button>
              );
            })}
          </div>
        </section>

        <Button block size="lg" onClick={() => navigate('/diary')}>
          <Utensils className="h-4 w-4" />
          Log food
        </Button>

        {/* Wellbeing - the long-arc consistency meter. */}
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

        {/* The budget breakdown moved to Progress, which has a nav entry.
            This page had no way in except tapping the dog's caption. */}
        <Button variant="secondary" block onClick={() => navigate('/progress')}>
          <LineChart className="h-4 w-4" />
          See your calorie budget
        </Button>
      </div>

      <RenamePetSheet
        open={renameOpen}
        currentName={dog.petName}
        onClose={() => setRenameOpen(false)}
      />
    </>
  );
}
