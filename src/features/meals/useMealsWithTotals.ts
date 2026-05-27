import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import type { DayTotals } from '@/db/repos/diary';
import type { Food, Meal, MealItem } from '@/db/types';
import {
  compareMealsForList,
  computeMealTotals,
  getServings,
  perServingTotals,
} from './mealMath';

export interface MealWithTotals {
  meal: Meal;
  /** Per-portion macros (whole batch ÷ servings). */
  totals: DayTotals;
  /** How many portions the batch makes (always ≥ 1). */
  servings: number;
  itemCount: number;
  /** Lowercased name + notes + ingredient names, for free-text search. */
  haystack: string;
}

/**
 * Live list of every saved meal with its per-portion totals — for the
 * Library list, where each row shows kcal. Resolves all meals' items and
 * foods in one pass rather than a query per row.
 */
export function useMealsWithTotals(): MealWithTotals[] | undefined {
  return useLiveQuery(async () => {
    const meals = await db.meals
      .where('user_id')
      .equals(currentUserId())
      .filter((m) => !m.deleted_at)
      .reverse()
      .sortBy('updated_at');
    if (meals.length === 0) return [];

    const items = await db.meal_items
      .where('meal_id')
      .anyOf(meals.map((m) => m.id))
      .toArray();

    const foods = await db.foods.bulkGet([
      ...new Set(items.map((i) => i.food_id)),
    ]);
    const foodsById = new Map<string, Food>();
    for (const f of foods) if (f) foodsById.set(f.id, f);

    const itemsByMeal = new Map<string, MealItem[]>();
    for (const it of items) {
      const arr = itemsByMeal.get(it.meal_id);
      if (arr) arr.push(it);
      else itemsByMeal.set(it.meal_id, [it]);
    }

    return meals
      .map((meal): MealWithTotals => {
        const mealItems = itemsByMeal.get(meal.id) ?? [];
        const servings = getServings(meal);
        const ingredientNames = mealItems
          .map((it) => foodsById.get(it.food_id)?.name ?? '')
          .filter(Boolean);
        const haystack = [meal.name, meal.notes ?? '', ...ingredientNames]
          .join(' ')
          .toLowerCase();
        return {
          meal,
          servings,
          totals: perServingTotals(computeMealTotals(mealItems, foodsById), servings),
          itemCount: mealItems.length,
          haystack,
        };
      })
      // Favourites pinned to the top, then most-recently-updated.
      .sort((a, b) => compareMealsForList(a.meal, b.meal));
  }, []);
}
