import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Check, CookingPot, Pencil, RotateCcw } from 'lucide-react';
import { setBatchFinished } from '@/db/repos/meals';
import { fromLocalDate, todayLocal, toLocalDate, shiftDate } from '@/lib/dates';
import { formatKcal } from '@/lib/macros';
import type { Meal } from '@/db/types';
import type { MealWithTotals } from './useMealsWithTotals';
import { batchStatus, FINISHED_VISIBLE_DAYS, type BatchStatus } from './batchMath';

interface BatchesSectionProps {
  /** Batch rows only. */
  batches: MealWithTotals[];
  /** Portions logged per meal id. Undefined while loading. */
  logged: Map<string, { portions: number; lastAt: string }> | undefined;
  onLog: (meal: Meal) => void;
}

function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * What is cooked and in the fridge right now.
 *
 * Batches sit apart from recipes on purpose. A recipe is something to keep;
 * a batch is something to eat down and forget. Mixed into one list, a new
 * near-copy every shopping trip is what made the meals list unusable.
 * Finished batches stay visible for a week, then fold away.
 */
export function BatchesSection({ batches, logged, onLog }: BatchesSectionProps) {
  const navigate = useNavigate();
  const [showOlder, setShowOlder] = useState(false);

  const { active, recent, older } = useMemo(() => {
    const cutoff = shiftDate(todayLocal(), -FINISHED_VISIBLE_DAYS);
    const rows = batches
      .map((b) => ({ b, status: batchStatus(b.meal, logged?.get(b.meal.id)) }))
      .sort((x, y) =>
        (x.b.meal.batch_date ?? '') < (y.b.meal.batch_date ?? '') ? 1 : -1,
      );
    const finishedDay = (s: BatchStatus, m: Meal) =>
      s.finishedAt ? toLocalDate(new Date(s.finishedAt)) : (m.batch_date ?? '');
    return {
      active: rows.filter((r) => !r.status.finished),
      recent: rows.filter(
        (r) => r.status.finished && finishedDay(r.status, r.b.meal) >= cutoff,
      ),
      older: rows.filter(
        (r) => r.status.finished && finishedDay(r.status, r.b.meal) < cutoff,
      ),
    };
  }, [batches, logged]);

  if (batches.length === 0) return null;
  const finishedShown = showOlder ? [...recent, ...older] : recent;

  return (
    <section className="mb-4 rounded-2xl border border-border bg-card p-3">
      <h2 className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        <CookingPot className="h-3.5 w-3.5" />
        Cooked batches
      </h2>

      {active.length === 0 && (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          Nothing in the fridge. Tap the pot on a recipe to cook a batch.
        </p>
      )}

      <ul className="divide-y divide-border">
        {active.map(({ b, status }) => (
          <li key={b.meal.id} className="py-2.5">
            <div className="truncate px-1 text-sm font-semibold">{b.meal.name}</div>
            <div className="mt-1 flex items-center gap-1">
              <div className="min-w-0 flex-1 px-1 text-xs text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">
                  {trim(status.left)} of {trim(b.servings)}
                </span>{' '}
                portions left
                <span className="block truncate">
                  {formatKcal(b.totals.kcal)} kcal · {Math.round(b.totals.protein)} g
                  protein each
                </span>
              </div>
              <button
                type="button"
                onClick={() => onLog(b.meal)}
                className="h-8 shrink-0 rounded-[9px] px-3 text-[12.5px] font-bold"
                style={{
                  background: 'var(--color-log-ghost)',
                  color: 'var(--color-accent-deep)',
                }}
              >
                Log
              </button>
              <IconButton
                label={`Adjust ${b.meal.name}`}
                onClick={() => navigate(`/meals/${b.meal.id}/cook`)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label={`Mark ${b.meal.name} finished`}
                onClick={() => void setBatchFinished(b.meal.id, true)}
              >
                <Check className="h-4 w-4" />
              </IconButton>
            </div>
            <div
              className="mx-1 mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${trim(status.left)} of ${trim(b.servings)} portions left`}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.min(100, (status.left / b.servings) * 100)}%` }}
              />
            </div>
          </li>
        ))}

        {finishedShown.map(({ b, status }) => (
          <li key={b.meal.id} className="flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1 px-1 opacity-60">
              <div className="truncate text-sm font-medium">{b.meal.name}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                Finished
                {status.finishedAt &&
                  ` ${format(fromLocalDate(toLocalDate(new Date(status.finishedAt))), 'd MMM')}`}
                {status.left > 0 && ` · ${trim(status.left)} not logged`}
              </div>
            </div>
            {b.meal.finished_at && status.left > 0 && (
              <IconButton
                label={`Put ${b.meal.name} back in use`}
                onClick={() => void setBatchFinished(b.meal.id, false)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </IconButton>
            )}
            <button
              type="button"
              onClick={() => navigate(`/meals/${b.meal.id}/cook?again=1`)}
              className="h-8 shrink-0 rounded-[9px] border border-border px-3 text-[12.5px] font-semibold text-muted-foreground hover:bg-muted"
            >
              Cook again
            </button>
          </li>
        ))}
      </ul>

      {older.length > 0 && (
        <button
          type="button"
          onClick={() => setShowOlder((v) => !v)}
          className="mt-1 w-full rounded-lg px-1 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
        >
          {showOlder
            ? 'Hide older batches'
            : `Show ${older.length} older ${older.length === 1 ? 'batch' : 'batches'}`}
        </button>
      )}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="tap-target flex shrink-0 items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
