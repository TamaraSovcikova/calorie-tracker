import { useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { computeMacros } from '@/features/food-search/foodMath';
import {
  PERSONAL_TIERS,
  TIER_LABEL,
} from '@/features/food-search/ingredientMatch';
import { IngredientCandidateSheet } from '@/features/food-search/IngredientCandidateSheet';
import { rememberAlias } from '@/db/repos/ingredientAliases';
import { formatKcal } from '@/lib/macros';
import { cn } from '@/lib/cn';
import type { ResolvedRecipe, RecipeIngredientDraft } from './recipeScan';

interface RecipeReviewStepProps {
  recipe: ResolvedRecipe;
  onChange: (next: ResolvedRecipe) => void;
  onConfirm: () => void;
  saving: boolean;
}

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

  const patch = (ingIndex: number, next: Partial<RecipeIngredientDraft>) => {
    const ingredients = recipe.ingredients.map((ing, i) =>
      i === ingIndex ? { ...ing, ...next } : ing,
    );
    onChange({ ...recipe, ingredients });
  };

  const setChosen = (ingIndex: number, chosen: number) => {
    const ing = recipe.ingredients[ingIndex];
    // Once the user has picked, it is confirmed by definition.
    patch(ingIndex, { chosen, confident: true });
    // Remember it, so this ingredient resolves straight to their product next
    // time. This is the only thing that can connect "beef mince" to a
    // French-named supermarket product - no word list would contain it.
    const picked = chosen >= 0 ? ing.candidates[chosen] : undefined;
    if (picked) void rememberAlias(ing.name, picked.food.id);
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
        <IngredientCandidateSheet
          name={recipe.ingredients[picking].name}
          grams={recipe.ingredients[picking].grams}
          candidates={recipe.ingredients[picking].candidates}
          chosen={recipe.ingredients[picking].chosen}
          onPick={(chosen) => setChosen(picking, chosen)}
          onGramsChange={(grams) => patch(picking, { grams })}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

