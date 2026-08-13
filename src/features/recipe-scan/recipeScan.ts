/**
 * AI recipe scanning - turn a screenshot of a recipe into a draft meal.
 *
 * The Worker's vision model extracts the recipe (name, servings,
 * ingredients, method); this module resolves the ingredients to real
 * foods so the result can open straight in the meal editor for a quick
 * review-and-save.
 */

import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import { createFood } from '@/db/repos/foods';
import type { MealItemInput } from '@/db/repos/meals';
import {
  rankIngredientCandidates,
  resetPlannerCaches,
} from '@/features/meal-planner/mealPlanner';
import {
  isConfident,
  type IngredientCandidate,
} from '@/features/food-search/ingredientMatch';
import { downscaleImage } from '@/features/photo-log/photoLog';

export interface ScannedRecipe {
  name: string;
  servings: number;
  ingredients: { name: string; grams: number }[];
  steps: string[];
}

export interface RecipeScanResult {
  recipe: ScannedRecipe | null;
  error?: string;
}

/** Send a recipe screenshot to the Worker. Never throws. */
export async function analyzeRecipePhoto(file: Blob): Promise<RecipeScanResult> {
  const { token } = getSyncConfig();
  if (!token) {
    return {
      recipe: null,
      error: 'Connect a sync code in Settings to scan recipes.',
    };
  }
  const body = await downscaleImage(file, 1280);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${syncBaseUrl()}/api/photo-recipe`, {
      method: 'POST',
      headers: {
        'content-type': 'image/jpeg',
        authorization: `Bearer ${token}`,
      },
      body,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as RecipeScanResult | null;
    if (!data) return { recipe: null, error: 'No response - try again.' };
    return { recipe: data.recipe ?? null, error: data.error };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      recipe: null,
      error: aborted
        ? 'The scan took too long - try again.'
        : 'Could not reach the recipe scanner.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** One scanned ingredient, with what it could resolve to. */
export interface RecipeIngredientDraft {
  /** Name as the scanner read it off the recipe. */
  name: string;
  grams: number;
  /** Plausible foods, best first. Empty when nothing matched at all. */
  candidates: IngredientCandidate[];
  /** Index into `candidates`, or -1 for "create a blank food named this". */
  chosen: number;
  /**
   * True when the top candidate is one of the user's own foods, matches
   * well, and has no close rival. Everything else is worth a look before
   * the meal is created - silently committing to the winner is how a
   * 464 kcal/100g mystery food ended up in a stuffed pepper recipe.
   */
  confident: boolean;
}

export interface ResolvedRecipe {
  name: string;
  servings: number;
  /** Method steps joined into the meal's notes (may be empty). */
  notes: string;
  ingredients: RecipeIngredientDraft[];
}

/**
 * Resolve a scanned recipe's ingredients to ranked candidates.
 *
 * Deliberately creates nothing: the old version wrote a zero-macro custom
 * food for every miss as a side effect of *looking*, which littered the
 * library with stubs from scans the user then abandoned. Foods are created
 * at commit time instead.
 */
export async function resolveScannedRecipe(
  recipe: ScannedRecipe,
): Promise<ResolvedRecipe> {
  resetPlannerCaches(); // resolve against the current food library
  const ingredients: RecipeIngredientDraft[] = [];
  for (const ing of recipe.ingredients) {
    const candidates = await rankIngredientCandidates(ing.name);
    ingredients.push({
      name: ing.name,
      grams: ing.grams,
      candidates,
      chosen: candidates.length > 0 ? 0 : -1,
      confident: isConfident(candidates),
    });
  }
  return {
    name: recipe.name,
    servings: recipe.servings,
    notes:
      recipe.steps.length > 0
        ? recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
        : '',
    ingredients,
  };
}

/** Ingredients the user should look at before the meal is created. */
export function needsReview(recipe: ResolvedRecipe): RecipeIngredientDraft[] {
  return recipe.ingredients.filter((i) => !i.confident);
}

/**
 * Turn the reviewed drafts into meal items, creating a blank food only for
 * ingredients that ended up with no match at all.
 */
export async function commitResolvedRecipe(
  recipe: ResolvedRecipe,
): Promise<MealItemInput[]> {
  const items: MealItemInput[] = [];
  for (const ing of recipe.ingredients) {
    const picked = ing.chosen >= 0 ? ing.candidates[ing.chosen] : undefined;
    let foodId = picked?.food.id;
    if (!foodId) {
      const created = await createFood({
        source: 'custom',
        name: ing.name,
        kcal_100: 0,
        protein_100: 0,
        carbs_100: 0,
        fat_100: 0,
      });
      foodId = created.id;
    }
    items.push({ food_id: foodId, qty: ing.grams, unit: 'g' });
  }
  return items;
}
