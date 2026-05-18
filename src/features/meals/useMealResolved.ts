import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import type { Food, Meal, MealItem } from '@/db/types';
import { computeMealTotals, getServings, perServingTotals } from './mealMath';
import type { DayTotals } from '@/db/repos/diary';

export interface ResolvedMeal {
  meal: Meal;
  items: MealItem[];
  foodsById: Map<string, Food>;
  /** How many portions the batch makes (always ≥ 1). */
  servings: number;
  /** Macros for the whole batch (every ingredient summed). */
  wholeTotals: DayTotals;
  /** Macros for one portion = wholeTotals ÷ servings. */
  totals: DayTotals;
}

/** Live query yielding meal + items + their foods + per-portion totals. */
export function useMealResolved(mealId: string | undefined): ResolvedMeal | null | undefined {
  return useLiveQuery<ResolvedMeal | null>(async () => {
    if (!mealId) return null;
    const meal = await db.meals.get(mealId);
    if (!meal || meal.deleted_at) return null;
    const items = await db.meal_items.where('meal_id').equals(mealId).toArray();
    const foodIds = [...new Set(items.map((i) => i.food_id))];
    const foods = await db.foods.bulkGet(foodIds);
    const foodsById = new Map<string, Food>();
    for (const f of foods) if (f) foodsById.set(f.id, f);
    const wholeTotals = computeMealTotals(items, foodsById);
    const servings = getServings(meal);
    return {
      meal,
      items,
      foodsById,
      servings,
      wholeTotals,
      totals: perServingTotals(wholeTotals, servings),
    };
  }, [mealId]);
}
