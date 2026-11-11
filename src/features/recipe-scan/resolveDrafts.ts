import {
  isConfident,
  pantryClass,
  type ConfidenceContext,
  type IngredientCandidate,
} from '@/features/food-search/ingredientMatch';
import { mergeDuplicateIngredients } from './mergeIngredients';
import { gramsFor, unitKind, writtenLabel } from './units';
import { lookThreshold, needsLook, recipeKcal } from './reviewRisk';

/**
 * The scan pipeline after the model and before the screen, with no database
 * in it: amounts to grams, water dropped, duplicates merged, and the
 * decision about which rows deserve a warning. Kept pure so a whole real
 * recipe can be run through it in a test (see resolveDrafts.test.ts).
 */

export interface ScannedIngredient {
  name: string;
  /** The model's own gram estimate. A fallback only, see units.ts. */
  grams: number;
  /** Amount and unit as written in the recipe, when it gave them. */
  amount?: number;
  unit?: string;
}

/** One scanned ingredient, with what it could resolve to. */
export interface RecipeIngredientDraft {
  /** Name as the scanner read it off the recipe. */
  name: string;
  grams: number;
  /** The amount as the recipe wrote it ("2 tbsp"), when it gave one. */
  written?: string;
  /** Plausible foods, best first. Empty when nothing matched at all. */
  candidates: IngredientCandidate[];
  /** Index into `candidates`, or -1 for "create a blank food named this". */
  chosen: number;
  /**
   * False when this row is worth a look before the meal is created: the
   * match is uncertain AND enough calories ride on it to matter (see
   * reviewRisk.ts). Salt, herbs and other trace ingredients are always
   * true. Silently committing to a doubtful winner is how a 464 kcal/100g
   * mystery food ended up in a stuffed pepper recipe; flagging everything
   * doubtful is how twelve of sixteen rows ended up with a warning.
   */
  confident: boolean;
}

export interface ResolvedRecipe {
  name: string;
  servings: number;
  /** Method steps joined into the meal's notes (may be empty). */
  notes: string;
  ingredients: RecipeIngredientDraft[];
  /** Lines deliberately not turned into ingredients (water). */
  leftOut: string[];
}

/**
 * For salt, herbs and spices, put the built-in entry first when there is
 * one. The numbers are tiny either way, and the alternative is a shop
 * product whose label data is often wrong (a salt at 540 kcal/100g).
 */
function preferBuiltIn(
  candidates: IngredientCandidate[],
  negligible: boolean,
): IngredientCandidate[] {
  if (!negligible) return candidates;
  const at = candidates.findIndex((c) => c.tier === 'curated' && c.nameScore >= 0.9);
  if (at <= 0) return candidates;
  return [candidates[at], ...candidates.slice(0, at), ...candidates.slice(at + 1)];
}

/**
 * The name to look an ingredient up under. Usually the name itself, but the
 * amount can say something the name does not: "2 tins cannellini beans" and
 * "beans, drained" both mean the tinned food, and tinned beans are a third
 * of the calories of dried ones.
 */
export function lookupName(ing: ScannedIngredient): string {
  const fromTin = unitKind(ing.unit) === 'tin' || /\bdrained\b/i.test(ing.name);
  return fromTin && !/\b(tinned|canned|tin|can)\b/i.test(ing.name)
    ? `${ing.name} tinned`
    : ing.name;
}

/** Turn scanned ingredients into review rows. `candidatesFor` supplies the
 *  ranked foods for a `lookupName`; everything else is decided here. */
export function buildDrafts(
  scanned: ScannedIngredient[],
  candidatesFor: (name: string) => IngredientCandidate[],
  ctx: ConfidenceContext,
): { ingredients: RecipeIngredientDraft[]; leftOut: string[] } {
  const leftOut: string[] = [];
  const rows: (RecipeIngredientDraft & {
    foodId?: string;
    sure: boolean;
    negligible: boolean;
  })[] = [];
  for (const ing of scanned) {
    const pantry = pantryClass(ing.name);
    // Water carries no calories and matched "Porridge, cooked with water".
    if (pantry === 'water') {
      leftOut.push(ing.name);
      continue;
    }
    const candidates = preferBuiltIn(candidatesFor(lookupName(ing)), pantry === 'negligible');
    rows.push({
      name: ing.name,
      grams: gramsFor(ing).grams,
      written: writtenLabel(ing) ?? undefined,
      candidates,
      chosen: candidates.length > 0 ? 0 : -1,
      confident: true, // settled below, once the recipe total is known
      sure: isConfident(candidates, ctx),
      negligible: pantry === 'negligible',
      foodId: candidates[0]?.food.id,
    });
  }
  const merged = mergeDuplicateIngredients(rows);
  const threshold = lookThreshold(recipeKcal(merged));
  const ingredients = merged.map(
    ({ foodId: _foodId, sure, negligible, ...draft }): RecipeIngredientDraft => ({
      ...draft,
      confident: !needsLook(
        { candidates: draft.candidates, grams: draft.grams, confident: sure, negligible },
        threshold,
      ),
    }),
  );
  return { ingredients, leftOut };
}
