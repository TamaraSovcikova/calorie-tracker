/**
 * AI recipe scanning — turn a screenshot of a recipe into a draft meal.
 *
 * The Worker's vision model extracts the recipe (name, servings,
 * ingredients, method); this module resolves the ingredients to real
 * foods so the result can open straight in the meal editor for a quick
 * review-and-save.
 */

import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import { createFood } from '@/db/repos/foods';
import type { MealItemInput } from '@/db/repos/meals';
import { lookupIngredientFood } from '@/features/meal-planner/mealPlanner';
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
    if (!data) return { recipe: null, error: 'No response — try again.' };
    return { recipe: data.recipe ?? null, error: data.error };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      recipe: null,
      error: aborted
        ? 'The scan took too long — try again.'
        : 'Could not reach the recipe scanner.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface ResolvedRecipe {
  name: string;
  servings: number;
  /** Method steps joined into the meal's notes (may be empty). */
  notes: string;
  items: MealItemInput[];
}

/**
 * Resolve a scanned recipe's ingredients to meal items. An ingredient with
 * no database match becomes a zero-macro custom food so nothing is dropped
 * — the user fixes those in the editor.
 */
export async function resolveScannedRecipe(
  recipe: ScannedRecipe,
): Promise<ResolvedRecipe> {
  const items: MealItemInput[] = [];
  for (const ing of recipe.ingredients) {
    let food = await lookupIngredientFood(ing.name);
    if (!food) {
      food = await createFood({
        source: 'custom',
        name: ing.name,
        kcal_100: 0,
        protein_100: 0,
        carbs_100: 0,
        fat_100: 0,
      });
    }
    items.push({ food_id: food.id, qty: ing.grams, unit: 'g' });
  }
  return {
    name: recipe.name,
    servings: recipe.servings,
    notes:
      recipe.steps.length > 0
        ? recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
        : '',
    items,
  };
}
