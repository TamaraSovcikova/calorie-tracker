import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { CustomUnit, Food } from '../types';

export interface CreateFoodInput {
  source: 'off' | 'custom';
  off_barcode?: string;
  name: string;
  brand?: string;
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  serving_g?: number;
  custom_units?: CustomUnit[];
}

export async function createFood(input: CreateFoodInput): Promise<Food> {
  const now = new Date().toISOString();
  const food: Food = {
    id: uuid(),
    user_id: currentUserId(),
    custom_units: input.custom_units ?? [],
    created_at: now,
    updated_at: now,
    ...input,
  };
  await db.foods.put(food);
  return food;
}

export async function updateFood(id: string, patch: Partial<Food>): Promise<void> {
  await db.foods.update(id, { ...patch, updated_at: new Date().toISOString() });
}

export async function softDeleteFood(id: string): Promise<void> {
  await db.foods.update(id, { deleted_at: new Date().toISOString() });
}

export async function getFood(id: string): Promise<Food | undefined> {
  return db.foods.get(id);
}

/** Live list of My Products (custom foods), most recent first. */
export function useMyProducts(): Food[] | undefined {
  return useLiveQuery(async () => {
    const userId = currentUserId();
    const all = await db.foods
      .where('user_id')
      .equals(userId)
      .filter((f) => f.source === 'custom' && !f.deleted_at)
      .toArray();
    return all.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }, []);
}

/**
 * Search local foods by name (case-insensitive substring).
 * Used by the add-food sheet to surface user's library + recently-cached
 * Open Food Facts hits ahead of a fresh OFF call.
 */
export async function searchLocalFoods(query: string, limit = 20): Promise<Food[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const userId = currentUserId();
  const matches = await db.foods
    .where('user_id')
    .equals(userId)
    .filter((f) => !f.deleted_at && f.name.toLowerCase().includes(q))
    .limit(limit * 2)
    .toArray();
  // custom first, then OFF, then most-recently-updated
  return matches
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === 'custom' ? -1 : 1;
      return a.updated_at < b.updated_at ? 1 : -1;
    })
    .slice(0, limit);
}
