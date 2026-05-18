import { useState } from 'react';
import { Dumbbell, Plus } from 'lucide-react';
import { totalBurned, useExerciseDay } from '@/db/repos/exercise';
import type { ExerciseEntry } from '@/db/types';
import type { LocalDate } from '@/lib/dates';
import { formatKcal } from '@/lib/macros';
import { ExerciseSheet } from './ExerciseSheet';

interface ExerciseSectionProps {
  date: LocalDate;
}

export function ExerciseSection({ date }: ExerciseSectionProps) {
  const entries = useExerciseDay(date);
  const [editingEntry, setEditingEntry] = useState<ExerciseEntry | undefined>(
    undefined,
  );
  const [adding, setAdding] = useState(false);

  const total = entries ? totalBurned(entries) : 0;

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-medium">
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
            Exercise
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {total > 0 ? `${formatKcal(total)} kcal burned` : 'No workouts logged'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="Add exercise"
          className="tap-target flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 active:scale-95"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add
        </button>
      </header>

      {entries && entries.length > 0 && (
        <ul className="divide-y divide-border px-2 pb-2">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setEditingEntry(e)}
                className="flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {e.name}
                    {e.source === 'fitbit' && (
                      <span className="ml-2 rounded-full bg-blue-500/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-300">
                        Health
                      </span>
                    )}
                  </div>
                  {e.duration_min !== undefined && (
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {e.duration_min} min
                    </div>
                  )}
                  {e.needs_profile && (
                    <div className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                      Add weight, height, age &amp; sex in Settings → Profile
                      to estimate calories burned.
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  {e.needs_profile ? (
                    <div className="text-sm text-muted-foreground">—</div>
                  ) : (
                    <>
                      <div className="text-sm font-semibold">
                        −{formatKcal(e.kcal_burned)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        kcal
                      </div>
                    </>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* One sheet, keyed so it remounts fresh between add and each edit
          (no stale form carried over). */}
      <ExerciseSheet
        key={editingEntry ? `edit-${editingEntry.id}` : 'add'}
        open={adding || editingEntry !== undefined}
        date={date}
        entry={editingEntry}
        onClose={() => {
          setAdding(false);
          setEditingEntry(undefined);
        }}
      />
    </section>
  );
}
