import { useState } from 'react';
import { AlertTriangle, Check, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { computeMacros } from '@/features/food-search/foodMath';
import { PERSONAL_TIERS, type MatchTier } from '@/features/food-search/ingredientMatch';
import { formatKcal } from '@/lib/macros';
import { cn } from '@/lib/cn';
import type { ResolvedRecipe, RecipeIngredientDraft } from './recipeScan';

interface RecipeReviewStepProps {
  recipe: ResolvedRecipe;
  onChange: (next: ResolvedRecipe) => void;
  onConfirm: () => void;
  saving: boolean;
}

const TIER_LABEL: Record<MatchTier, string> = {
  frequent: 'You use often',
  recent: 'You used recently',
  custom: 'Your food',
  library: 'In your library',
  curated: 'Built-in estimate',
  external: 'Generic estimate',
};

/** kcal for the scanned amount of a given candidate. */
function kcalFor(ing: RecipeIngredientDraft, index: number): number | null {
  const cand = ing.candidates[index];
  if (!cand) return null;
  return computeMacros(cand.food, { mode: 'g', qty: ing.grams }).kcal;
}

/**
 * The step that did not exist before: every ingredient, what it resolved to,
 * where that came from, and what it costs - shown BEFORE the meal is
 * created. The scan used to commit silently to whatever won the match, so a
 * wrong pick only surfaced once the meal read 900 kcal a portion.
 */
export function RecipeReviewStep({
  recipe,
  onChange,
  onConfirm,
  saving,
}: RecipeReviewStepProps) {
  const [picking, setPicking] = useState<number | null>(null);

  const setChosen = (ingIndex: number, chosen: number) => {
    const ingredients = recipe.ingredients.map((ing, i) =>
      i === ingIndex ? { ...ing, chosen, confident: true } : ing,
    );
    onChange({ ...recipe, ingredients });
    setPicking(null);
  };

  const unsure = recipe.ingredients.filter((i) => !i.confident).length;
  const total = recipe.ingredients.reduce((sum, ing) => {
    const k = ing.chosen >= 0 ? kcalFor(ing, ing.chosen) : 0;
    return sum + (k ?? 0);
  }, 0);
  const perPortion = recipe.servings > 0 ? total / recipe.servings : total;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="truncate text-base font-semibold">{recipe.name}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {recipe.ingredients.length} ingredients ·{' '}
          {formatKcal(perPortion)} kcal per portion · makes {recipe.servings}
        </p>
        {unsure > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {unsure} {unsure === 1 ? 'ingredient needs' : 'ingredients need'} a
            look - tap to choose which food to use.
          </p>
        )}
      </div>

      <ul className="flex-1 divide-y divide-border overflow-y-auto">
        {recipe.ingredients.map((ing, i) => {
          const cand = ing.chosen >= 0 ? ing.candidates[ing.chosen] : undefined;
          const kcal = ing.chosen >= 0 ? kcalFor(ing, ing.chosen) : null;
          const personal = cand ? PERSONAL_TIERS.has(cand.tier) : false;
          return (
            <li key={`${ing.name}-${i}`}>
              <button
                type="button"
                onClick={() => setPicking(i)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {ing.name}
                    </span>
                    {!ing.confident && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {cand ? cand.food.name : 'No match - will be added blank'}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                    <span>{ing.grams} g</span>
                    {kcal !== null && <span>{formatKcal(kcal)} kcal</span>}
                    {cand && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-px text-[10px] font-medium',
                          personal
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {TIER_LABEL[cand.tier]}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border bg-card p-4">
        <Button type="button" variant="primary" block disabled={saving} onClick={onConfirm}>
          {saving ? 'Creating…' : 'Create meal'}
        </Button>
      </div>

      {picking !== null && (
        <CandidatePicker
          ingredient={recipe.ingredients[picking]}
          onPick={(chosen) => setChosen(picking, chosen)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/** The choice the AI was making, shown rather than made silently. */
function CandidatePicker({
  ingredient,
  onPick,
  onClose,
}: {
  ingredient: RecipeIngredientDraft;
  onPick: (chosen: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open onClose={onClose} title={ingredient.name} fullScreenMobile={false}>
      <div className="p-4">
        <p className="text-xs text-muted-foreground">
          {ingredient.candidates.length > 0
            ? `Which food is this? Amounts use ${ingredient.grams} g.`
            : 'Nothing in your library matches this. It will be added as a blank food you can fill in.'}
        </p>
      </div>
      <ul className="divide-y divide-border">
        {ingredient.candidates.map((cand, i) => {
          const kcal = computeMacros(cand.food, {
            mode: 'g',
            qty: ingredient.grams,
          }).kcal;
          const active = i === ingredient.chosen;
          return (
            <li key={cand.food.id}>
              <button
                type="button"
                onClick={() => onPick(i)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {cand.food.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                    {formatKcal(kcal)} kcal · {Math.round(cand.food.kcal_100)}{' '}
                    kcal/100g · {TIER_LABEL[cand.tier]}
                  </span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => onPick(-1)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
          >
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                None of these - add blank
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Creates "{ingredient.name}" with no macros for you to fill in.
              </span>
            </span>
            {ingredient.chosen === -1 && (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            )}
          </button>
        </li>
      </ul>
    </Sheet>
  );
}
