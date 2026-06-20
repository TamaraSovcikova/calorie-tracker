import { useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { useMealResolved } from './useMealResolved';
import { itemToQuantity, multiplyTotals } from './mealMath';
import { computeMacros } from '@/features/food-search/foodMath';
import { formatKcal } from '@/lib/macros';

/** Trim a number to at most one decimal, dropping a trailing ".0". */
function fmtQty(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

interface LogMealStepProps {
  mealId: string;
  onBack: () => void;
  onSave: (multiplier: number) => void;
  initialMultiplier?: number;
  saveLabel?: string;
  /** When set, shows a Delete button (used when editing a logged entry). */
  onDelete?: () => void;
}

const QUICK_MULTS = [0.5, 1, 1.5, 2];

export function LogMealStep({
  mealId,
  onBack,
  onSave,
  initialMultiplier = 1,
  saveLabel = 'Add to diary',
  onDelete,
}: LogMealStepProps) {
  const resolved = useMealResolved(mealId);
  const [mult, setMult] = useState<number>(initialMultiplier);

  if (!resolved) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  const totals = multiplyTotals(resolved.totals, mult);
  const valid = mult > 0 && Number.isFinite(mult);

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h2 className="mt-1 truncate text-lg font-semibold">{resolved.meal.name}</h2>
        <p className="text-xs text-muted-foreground">
          {resolved.items.length} ingredients · {formatKcal(resolved.totals.kcal)} kcal
          per portion
          {resolved.servings > 1 && ` · batch makes ${Math.round(resolved.servings)}`}
        </p>
      </div>

      {resolved.meal.image_url && (
        <div className="overflow-hidden">
          <img
            src={resolved.meal.image_url}
            alt=""
            className="h-36 w-full object-cover"
          />
        </div>
      )}

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {QUICK_MULTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setMult(q)}
              className={`tap-target rounded-full border px-4 text-sm font-medium transition-colors ${
                mult === q
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-muted/40 hover:bg-muted'
              }`}
            >
              {q}×
            </button>
          ))}
        </div>

        <LabeledInput
          label="Custom portion multiplier"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={Number.isFinite(mult) ? mult : ''}
          onChange={(e) => setMult(parseFloat(e.target.value))}
          trailing="× portion"
        />

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            For this entry
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">
              {formatKcal(totals.kcal)}
            </span>
            <span className="text-sm text-muted-foreground">kcal</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground tabular-nums">
            <div>Protein {Math.round(totals.protein)} g</div>
            <div>Carbs {Math.round(totals.carbs)} g</div>
            <div>Fat {Math.round(totals.fat)} g</div>
          </div>
        </div>

        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
            Show ingredient breakdown
          </summary>
          <ul className="divide-y divide-border px-4 pb-3 text-sm">
            {resolved.items.map((it) => {
              const food = resolved.foodsById.get(it.food_id);
              // computeMacros on the stored item gives the WHOLE-batch
              // contribution; one portion = ÷ servings, this entry = × mult.
              const batch = food
                ? computeMacros(food, itemToQuantity(it))
                : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
              const factor = mult / resolved.servings;
              const showBatch = mult !== resolved.servings;
              return (
                <li key={it.id} className="py-2">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">
                      {food?.name ?? '(deleted)'}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {fmtQty(it.qty * factor)} {it.unit}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {formatKcal(batch.kcal * factor)} kcal ·{' '}
                    {Math.round(batch.protein * factor)} P /{' '}
                    {Math.round(batch.carbs * factor)} C /{' '}
                    {Math.round(batch.fat * factor)} F
                  </div>
                  {showBatch && (
                    <div className="text-[11px] text-muted-foreground/70 tabular-nums">
                      whole batch: {fmtQty(it.qty)} {it.unit} ·{' '}
                      {formatKcal(batch.kcal)} kcal
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      </div>

      <div className="mt-auto flex gap-2 border-t border-border bg-card p-4">
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={onDelete}
            className="shrink-0 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          block
          disabled={!valid}
          onClick={() => valid && onSave(mult)}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
