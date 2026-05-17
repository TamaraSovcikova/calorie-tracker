/**
 * Quantity math for the add-food flow.
 *
 * Three modes, all reduce to "how many grams did the user eat":
 *   - mode 'g'        → qty IS grams
 *   - mode 'serving'  → grams = qty * food.serving_g
 *   - mode 'unit:X'   → grams = qty * customUnits[X].grams
 *
 * Macros are then per_100 * grams / 100.
 */

import type { CustomUnit, Food } from '@/db/types';

export type QuantityMode = 'g' | 'serving' | `unit:${string}`;

export interface QuantityState {
  mode: QuantityMode;
  qty: number;
}

export interface ResolvedMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** grams of the food consumed at this quantity */
  grams: number;
  /** snake_case unit label for storage on DiaryEntry */
  unit: string;
}

/** Map a stored {qty, unit} pair (diary entry / meal item) back to a state. */
export function unitToQuantityState(qty: number, unit: string): QuantityState {
  if (unit === 'g' || unit === 'ml') return { mode: 'g', qty };
  if (unit === 'serving') return { mode: 'serving', qty };
  return { mode: `unit:${unit}` as QuantityMode, qty };
}

export function customUnitFromMode(food: Food, mode: QuantityMode): CustomUnit | null {
  if (!mode.startsWith('unit:')) return null;
  const label = mode.slice('unit:'.length);
  return food.custom_units.find((u) => u.label === label) ?? null;
}

export function gramsForQuantity(
  food: Food,
  state: QuantityState,
): number {
  if (state.mode === 'g') return state.qty;
  if (state.mode === 'serving') return state.qty * (food.serving_g ?? 0);
  const unit = customUnitFromMode(food, state.mode);
  return state.qty * (unit?.grams ?? 0);
}

export function computeMacros(food: Food, state: QuantityState): ResolvedMacros {
  const grams = gramsForQuantity(food, state);
  const factor = grams / 100;
  return {
    kcal: food.kcal_100 * factor,
    protein: food.protein_100 * factor,
    carbs: food.carbs_100 * factor,
    fat: food.fat_100 * factor,
    grams,
    unit:
      state.mode === 'g'
        ? 'g'
        : state.mode === 'serving'
          ? 'serving'
          : state.mode.slice('unit:'.length),
  };
}

/** Sensible default mode + qty for a food the user just picked. */
export function defaultQuantity(food: Food): QuantityState {
  if (food.serving_g && food.serving_g > 0) {
    return { mode: 'serving', qty: 1 };
  }
  if (food.custom_units.length > 0) {
    return { mode: `unit:${food.custom_units[0].label}` as QuantityMode, qty: 1 };
  }
  return { mode: 'g', qty: 100 };
}

export interface ModeOption {
  value: QuantityMode;
  label: string;
  /** grams represented by qty=1 in this mode (for the helper line) */
  gramsPerOne: number;
}

export function availableModes(food: Food): ModeOption[] {
  const options: ModeOption[] = [{ value: 'g', label: 'grams', gramsPerOne: 1 }];
  if (food.serving_g && food.serving_g > 0) {
    options.push({
      value: 'serving',
      label: `serving (${food.serving_g}g)`,
      gramsPerOne: food.serving_g,
    });
  }
  for (const u of food.custom_units) {
    options.push({
      value: `unit:${u.label}` as QuantityMode,
      label: `${u.label} (${u.grams}g)`,
      gramsPerOne: u.grams,
    });
  }
  return options;
}
