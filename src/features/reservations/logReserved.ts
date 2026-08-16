/**
 * Logging the thing that was reserved, and reporting against the
 * reservation afterwards.
 *
 * A reservation that came from the library knows exactly which food or meal
 * it is for and at what portion, so on the day it can be logged with one tap
 * and then compared against - "reserved 480, logged 512, 32 over" is a far
 * more useful sentence than "you are 32 over your target", because it names
 * the thing that actually went over.
 *
 * The comparison is only offered when the reservation points at a real row.
 * A reservation for a bare number cannot know which of the day's calories
 * were "the cake", and guessing would be worse than saying nothing.
 */

import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { createDiaryEntry } from '@/db/repos/diary';
import { computeMacros, unitToQuantityState } from '@/features/food-search/foodMath';
import { multiplyTotals } from '@/features/meals/mealMath';
import { resolveMeal } from '@/features/meals/useMealResolved';
import { defaultMealSection } from '@/lib/mealTime';
import type { LocalDate } from '@/lib/dates';
import type { MealSection, Reservation } from '@/db/types';

/** True when this reservation names something that can be logged. */
export function isLoggable(r: Reservation): boolean {
  return !!(r.food_id || r.meal_id);
}

/**
 * Diary entries on `date` that are the reserved item. Matched by food_id or
 * meal_id, which is the only honest link - the reservation carries no
 * reference to a specific entry, and inventing one would break as soon as
 * the entry was edited.
 */
export async function loggedForReservation(
  r: Reservation,
  date: LocalDate,
): Promise<number> {
  if (!isLoggable(r)) return 0;
  const rows = await db.diary_entries
    .where('[user_id+date]')
    .between([currentUserId(), date], [currentUserId(), date], true, true)
    .filter((e) => !e.deleted_at)
    .toArray();
  return rows
    .filter((e) =>
      r.food_id ? e.food_id === r.food_id : e.meal_id === r.meal_id,
    )
    .reduce((a, e) => a + e.kcal, 0);
}

export interface ReservationOutcome {
  /** kcal actually set aside for the day. */
  reserved: number;
  /** kcal logged against the reserved item, 0 when none yet. */
  logged: number;
  /** logged - reserved. Positive = the item cost more than was saved. */
  difference: number;
  /** True once anything matching has been logged. */
  anyLogged: boolean;
}

export function outcomeOf(reserved: number, logged: number): ReservationOutcome {
  return {
    reserved,
    logged,
    difference: logged - reserved,
    anyLogged: logged > 0,
  };
}

/**
 * Log the reserved item into the diary. The section defaults to whatever
 * suits the clock, the same rule quick-add uses, so the common case needs no
 * decision. Returns false when the item can no longer be resolved (the food
 * was deleted since).
 */
export async function logReservedItem(
  r: Reservation,
  date: LocalDate,
  section: MealSection = defaultMealSection(),
): Promise<boolean> {
  if (r.food_id) {
    const food = await db.foods.get(r.food_id);
    if (!food || food.deleted_at) return false;
    const state = unitToQuantityState(r.qty ?? 1, r.unit ?? 'serving');
    const macros = computeMacros(food, state);
    if (macros.grams <= 0) return false;
    await createDiaryEntry({
      date,
      section,
      kind: 'food',
      food_id: food.id,
      qty: state.qty,
      unit: macros.unit,
      kcal: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      fiber: macros.fiber,
      sugar: macros.sugar,
      sodium: macros.sodium,
    });
    return true;
  }

  if (r.meal_id) {
    const meal = await db.meals.get(r.meal_id);
    if (!meal || meal.deleted_at) return false;
    const resolved = await resolveMeal(r.meal_id);
    if (!resolved) return false;
    const multiplier = r.qty ?? 1;
    const totals = multiplyTotals(resolved.totals, multiplier);
    await createDiaryEntry({
      date,
      section,
      kind: 'meal',
      meal_id: meal.id,
      name: meal.name,
      qty: multiplier,
      unit: 'serving',
      portion_multiplier: multiplier,
      kcal: totals.kcal,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      fiber: totals.fiber,
      sugar: totals.sugar,
      sodium: totals.sodium,
    });
    return true;
  }

  return false;
}
