/**
 * Client side of the AI meal planner: request a plan from the Worker, and
 * save a chosen suggestion into the meal library as a real multi-portion
 * meal.
 *
 * Macro policy (see the feature plan): the AI's per-ingredient estimates
 * are trusted, BUT when an ingredient exactly matches a food already in
 * the library (curated common foods, or the user's own products) that
 * verified food is reused instead — accurate where it cheaply can be.
 * Everything stays editable in the meal editor afterwards.
 */

import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import { createFood } from '@/db/repos/foods';
import { createMeal, type MealItemInput } from '@/db/repos/meals';
import type { DayTotals } from '@/db/repos/diary';

export interface PlannedIngredient {
  name: string;
  /** Amount for the WHOLE batch, in grams. */
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface PlannedMeal {
  name: string;
  description: string;
  /** How many portions the batch makes. */
  servings: number;
  ingredients: PlannedIngredient[];
  steps: string[];
}

export interface ShoppingItem {
  name: string;
  amount: string;
}

export interface MealPlanResult {
  meals: PlannedMeal[];
  shoppingList: ShoppingItem[];
  error?: string;
}

export interface MealPlanRequest {
  ingredients: string[];
  days: number;
  mealsPerDay?: number;
  kcalMax?: number;
  proteinMin?: number;
  notes?: string;
}

/** Sum a planned meal's whole-batch macros. */
export function planTotals(meal: PlannedMeal): DayTotals {
  return meal.ingredients.reduce<DayTotals>(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fat: acc.fat + i.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** A planned meal's macros for one portion. */
export function planPerServing(meal: PlannedMeal): DayTotals {
  const whole = planTotals(meal);
  const s = meal.servings > 0 ? meal.servings : 1;
  return {
    kcal: whole.kcal / s,
    protein: whole.protein / s,
    carbs: whole.carbs / s,
    fat: whole.fat / s,
  };
}

/** Ask the Worker for a meal plan. Never throws — errors come back in
 *  `result.error`. */
export async function requestMealPlan(
  input: MealPlanRequest,
): Promise<MealPlanResult> {
  const { token } = getSyncConfig();
  if (!token) {
    return {
      meals: [],
      shoppingList: [],
      error: 'Connect a sync code in Settings to use the AI planner.',
    };
  }
  try {
    const res = await fetch(`${syncBaseUrl()}/api/meal-plan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as MealPlanResult | null;
    if (!data) {
      return { meals: [], shoppingList: [], error: 'Planner returned nothing — try again.' };
    }
    return {
      meals: Array.isArray(data.meals) ? data.meals : [],
      shoppingList: Array.isArray(data.shoppingList) ? data.shoppingList : [],
      error: data.error,
    };
  } catch {
    return {
      meals: [],
      shoppingList: [],
      error: 'Could not reach the planner. Check your connection.',
    };
  }
}

/** Round to one decimal, never negative. */
function r1(n: number): number {
  return Math.max(0, Math.round(n * 10) / 10);
}

/**
 * Resolve a planned ingredient to a food id: reuse an existing library
 * food on an exact name match, otherwise create a custom food from the
 * AI's macro estimate (converted to per-100g).
 */
async function resolveIngredientFood(ing: PlannedIngredient): Promise<string> {
  const userId = currentUserId();
  const target = ing.name.trim().toLowerCase();

  const candidates = await db.foods
    .where('user_id')
    .equals(userId)
    .filter((f) => !f.deleted_at && f.name.trim().toLowerCase() === target)
    .toArray();
  if (candidates.length > 0) {
    // Prefer a curated/verified food, then the user's own products.
    const ranked = [...candidates].sort((a, b) => {
      const rank = (s: string) => (s === 'curated' ? 0 : s === 'custom' ? 1 : 2);
      return rank(a.source) - rank(b.source);
    });
    return ranked[0].id;
  }

  // No match — bank the AI estimate as a custom food (per-100g).
  const grams = ing.grams > 0 ? ing.grams : 100;
  const factor = 100 / grams;
  const food = await createFood({
    source: 'custom',
    name: ing.name.trim(),
    kcal_100: r1(ing.kcal * factor),
    protein_100: r1(ing.protein * factor),
    carbs_100: r1(ing.carbs * factor),
    fat_100: r1(ing.fat * factor),
  });
  return food.id;
}

/**
 * Save a planned meal into the library as a multi-portion meal. Returns
 * the new meal's id.
 */
export async function savePlanAsMeal(meal: PlannedMeal): Promise<string> {
  const items: MealItemInput[] = [];
  for (const ing of meal.ingredients) {
    if (ing.grams <= 0) continue;
    const foodId = await resolveIngredientFood(ing);
    items.push({ food_id: foodId, qty: ing.grams, unit: 'g' });
  }
  const created = await createMeal({
    name: meal.name,
    notes: meal.description || undefined,
    servings: meal.servings,
    items,
  });
  return created.id;
}
