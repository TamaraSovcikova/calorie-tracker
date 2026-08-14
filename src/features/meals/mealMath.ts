import type { Food, Meal, MealItem } from '@/db/types';
import {
  computeMacros,
  type QuantityMode,
  type QuantityState,
} from '@/features/food-search/foodMath';
import { matchesSearchQuery } from '@/features/food-search/ingredientMatch';
import type { DayTotals } from '@/db/repos/diary';

/** Convert a stored MealItem unit + qty into a QuantityState. */
export function itemToQuantity(item: MealItem): QuantityState {
  if (item.unit === 'g' || item.unit === 'ml') {
    return { mode: 'g', qty: item.qty };
  }
  if (item.unit === 'serving') {
    return { mode: 'serving', qty: item.qty };
  }
  return { mode: `unit:${item.unit}` as QuantityMode, qty: item.qty };
}

/**
 * Sum the macros across a meal's ingredients at portion multiplier 1.
 * Missing-food rows contribute zero (e.g. a food was deleted).
 */
export function computeMealTotals(
  items: MealItem[],
  foodsById: Map<string, Food>,
): DayTotals {
  const totals: DayTotals = {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
  };
  for (const item of items) {
    const food = foodsById.get(item.food_id);
    if (!food) continue;
    const macros = computeMacros(food, itemToQuantity(item));
    totals.kcal += macros.kcal;
    totals.protein += macros.protein;
    totals.carbs += macros.carbs;
    totals.fat += macros.fat;
    totals.fiber += macros.fiber;
    totals.sugar += macros.sugar;
    totals.sodium += macros.sodium;
  }
  return totals;
}

export function multiplyTotals(t: DayTotals, factor: number): DayTotals {
  return {
    kcal: t.kcal * factor,
    protein: t.protein * factor,
    carbs: t.carbs * factor,
    fat: t.fat * factor,
    fiber: t.fiber * factor,
    sugar: t.sugar * factor,
    sodium: t.sodium * factor,
  };
}

/**
 * How many portions a meal's batch makes. Always ≥ 1; missing/invalid
 * values (old rows, bad input) read as 1 so per-portion math is safe.
 */
export function getServings(meal: Pick<Meal, 'servings'>): number {
  const s = meal.servings;
  return typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 1;
}

/** Divide a whole-batch total into one portion's worth. */
export function perServingTotals(
  whole: DayTotals,
  servings: number,
): DayTotals {
  return multiplyTotals(whole, 1 / (servings > 0 ? servings : 1));
}

/** Display a servings count: "5 portions", "1 portion", "1.5 portions". */
export function formatServings(servings: number): string {
  const n = Math.round(servings * 10) / 10;
  return `${n} ${n === 1 ? 'portion' : 'portions'}`;
}

/**
 * Free-text meal filter over name + notes + ingredient names. Shares the
 * app-wide matcher, so a meal is findable by an ingredient typed in another
 * language or with different accents, exactly like the food search.
 */
export function matchesMealQuery(
  haystack: string,
  query: string,
  opts: { fuzzy?: boolean } = {},
): boolean {
  return matchesSearchQuery(haystack, query, opts);
}

/**
 * Apply a free-text query to a list of meals, forgiving a typo only when the
 * strict pass found nothing. Pass an already category-filtered list, so "no
 * strict matches in Dinner" retries within Dinner rather than escaping it.
 */
export function filterMealsByQuery<T extends { haystack: string }>(
  rows: T[],
  query: string,
): T[] {
  if (!query.trim()) return rows;
  const strict = rows.filter((r) => matchesMealQuery(r.haystack, query));
  if (strict.length > 0) return strict;
  return rows.filter((r) => matchesMealQuery(r.haystack, query, { fuzzy: true }));
}

/**
 * List sort comparator: favourites first, then most-recently-updated. Used
 * for the meal library + the in-diary meal picker so starred staples pin to
 * the top everywhere.
 */
export function compareMealsForList(
  a: Pick<Meal, 'favorite' | 'updated_at'>,
  b: Pick<Meal, 'favorite' | 'updated_at'>,
): number {
  const fa = a.favorite ? 1 : 0;
  const fb = b.favorite ? 1 : 0;
  if (fa !== fb) return fb - fa; // favourites first
  return a.updated_at < b.updated_at ? 1 : -1; // newest-updated first
}
