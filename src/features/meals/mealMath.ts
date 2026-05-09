import type { Food, MealItem } from '@/db/types';
import {
  computeMacros,
  type QuantityMode,
  type QuantityState,
} from '@/features/food-search/foodMath';
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
  const totals: DayTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of items) {
    const food = foodsById.get(item.food_id);
    if (!food) continue;
    const macros = computeMacros(food, itemToQuantity(item));
    totals.kcal += macros.kcal;
    totals.protein += macros.protein;
    totals.carbs += macros.carbs;
    totals.fat += macros.fat;
  }
  return totals;
}

export function multiplyTotals(t: DayTotals, factor: number): DayTotals {
  return {
    kcal: t.kcal * factor,
    protein: t.protein * factor,
    carbs: t.carbs * factor,
    fat: t.fat * factor,
  };
}
