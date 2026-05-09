import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { Meal, MealItem } from '../types';

export interface MealItemInput {
  food_id: string;
  qty: number;
  unit: string;
}

export interface CreateMealInput {
  name: string;
  notes?: string;
  items: MealItemInput[];
}

export async function createMeal(input: CreateMealInput): Promise<Meal> {
  const now = new Date().toISOString();
  const userId = currentUserId();
  const meal: Meal = {
    id: uuid(),
    user_id: userId,
    name: input.name,
    notes: input.notes,
    created_at: now,
    updated_at: now,
  };
  const items: MealItem[] = input.items.map((it) => ({
    id: uuid(),
    meal_id: meal.id,
    food_id: it.food_id,
    qty: it.qty,
    unit: it.unit,
  }));
  await db.transaction('rw', db.meals, db.meal_items, async () => {
    await db.meals.put(meal);
    if (items.length) await db.meal_items.bulkPut(items);
  });
  return meal;
}

export async function replaceMealItems(
  mealId: string,
  items: MealItemInput[],
): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.meals, db.meal_items, async () => {
    await db.meal_items.where('meal_id').equals(mealId).delete();
    if (items.length) {
      await db.meal_items.bulkPut(
        items.map((it) => ({
          id: uuid(),
          meal_id: mealId,
          food_id: it.food_id,
          qty: it.qty,
          unit: it.unit,
        })),
      );
    }
    await db.meals.update(mealId, { updated_at: now });
  });
}

export async function updateMeal(id: string, patch: Partial<Meal>): Promise<void> {
  await db.meals.update(id, { ...patch, updated_at: new Date().toISOString() });
}

export async function softDeleteMeal(id: string): Promise<void> {
  await db.meals.update(id, { deleted_at: new Date().toISOString() });
}

export async function duplicateMeal(id: string): Promise<Meal | undefined> {
  const original = await db.meals.get(id);
  if (!original) return undefined;
  const items = await db.meal_items.where('meal_id').equals(id).toArray();
  return createMeal({
    name: `Copy of ${original.name}`,
    notes: original.notes,
    items: items.map((it) => ({ food_id: it.food_id, qty: it.qty, unit: it.unit })),
  });
}

export async function getMealWithItems(
  id: string,
): Promise<{ meal: Meal; items: MealItem[] } | undefined> {
  const meal = await db.meals.get(id);
  if (!meal) return undefined;
  const items = await db.meal_items.where('meal_id').equals(id).toArray();
  return { meal, items };
}

export function useMeals(): Meal[] | undefined {
  return useLiveQuery(
    async () =>
      db.meals
        .where('user_id')
        .equals(currentUserId())
        .filter((m) => !m.deleted_at)
        .reverse()
        .sortBy('updated_at'),
    [],
  );
}
