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
  hasPersonalFoodHistory,
} from '@/features/meal-planner/mealPlanner';
import {
  pantryClass,
  type IngredientCandidate,
} from '@/features/food-search/ingredientMatch';
import {
  buildDrafts,
  lookupName,
  type RecipeIngredientDraft,
  type ResolvedRecipe,
  type ScannedIngredient,
} from './resolveDrafts';

export type { RecipeIngredientDraft, ResolvedRecipe, ScannedIngredient };
import { downscaleImage } from '@/features/photo-log/photoLog';

export interface ScannedRecipe {
  name: string;
  servings: number;
  ingredients: ScannedIngredient[];
  steps: string[];
}

export interface RecipeScanResult {
  recipe: ScannedRecipe | null;
  error?: string;
}

/** POST a recipe (image or text) to the Worker. Never throws. */
async function sendRecipe(
  body: Blob | string,
  contentType: string,
): Promise<RecipeScanResult> {
  const { token } = getSyncConfig();
  if (!token) {
    return {
      recipe: null,
      error: 'Connect a sync code in Settings to scan recipes.',
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`${syncBaseUrl()}/api/photo-recipe`, {
      method: 'POST',
      headers: {
        'content-type': contentType,
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

/** Send a recipe screenshot to the Worker. Never throws. */
export async function analyzeRecipePhoto(file: Blob): Promise<RecipeScanResult> {
  // Recipe text is small print like a label, not a plate of food.
  return sendRecipe(await downscaleImage(file, 1600), 'image/jpeg');
}

/**
 * Send pasted recipe text. A recipe that is already text (a chat message,
 * a web page) loses nothing to the camera this way.
 */
export async function analyzeRecipeText(text: string): Promise<RecipeScanResult> {
  const trimmed = text.trim();
  if (trimmed.length < 10) {
    return { recipe: null, error: 'Paste the ingredients list first.' };
  }
  return sendRecipe(trimmed, 'text/plain; charset=utf-8');
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
  // On a fresh install nothing can reach a personal tier, so requiring one
  // would flag every single ingredient.
  const ctx = { hasPersonalHistory: await hasPersonalFoodHistory() };
  // Look every ingredient up first (the only part that touches the
  // database), then let the pure builder decide what to do with them.
  const candidates = new Map<string, IngredientCandidate[]>();
  for (const ing of recipe.ingredients) {
    const key = lookupName(ing);
    if (pantryClass(ing.name) === 'water' || candidates.has(key)) continue;
    candidates.set(key, await rankIngredientCandidates(key));
  }
  const { ingredients, leftOut } = buildDrafts(
    recipe.ingredients,
    (name) => candidates.get(name) ?? [],
    ctx,
  );
  return {
    name: recipe.name,
    servings: recipe.servings,
    notes:
      recipe.steps.length > 0
        ? recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
        : '',
    ingredients,
    leftOut,
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
    // The user can point two rows at one food during review.
    const same = items.find((it) => it.food_id === foodId);
    if (same) same.qty += ing.grams;
    else items.push({ food_id: foodId, qty: ing.grams, unit: 'g' });
  }
  return items;
}
