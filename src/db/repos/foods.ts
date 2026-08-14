import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import { sigWords, wordsMatch } from '@/features/food-search/ingredientMatch';
import { getContributeShared } from '@/features/settings/foodSourceSettings';
import { contributeSharedFood } from '@/lib/shared-foods-api';
import type { CustomUnit, Food } from '../types';

export interface CreateFoodInput {
  // createFood is only used for user-entered products; 'off' is kept for
  // the manual-entry-from-a-failed-barcode path. USDA / curated foods are
  // bulk-written directly, not through here.
  source: 'off' | 'custom';
  off_barcode?: string;
  name: string;
  brand?: string;
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  /** Micronutrients per 100g (optional). Manual entry can now capture these
   *  - previously only OFF / USDA foods carried them. */
  fiber_100?: number;
  sugar_100?: number;
  sodium_100?: number;
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
  // Opt-in: share manually-entered products to the community pool so they're
  // findable later (on any device) without re-typing. Best-effort.
  if (input.source === 'custom' && getContributeShared()) {
    void contributeSharedFood(food);
  }
  return food;
}

export async function updateFood(id: string, patch: Partial<Food>): Promise<void> {
  await db.foods.update(id, { ...patch, updated_at: new Date().toISOString() });
}

/** Star / unstar a food for fast logging. */
export async function toggleFavorite(id: string): Promise<void> {
  const food = await db.foods.get(id);
  if (!food) return;
  await db.foods.update(id, {
    favorite: !food.favorite,
    updated_at: new Date().toISOString(),
  });
}

export async function softDeleteFood(id: string): Promise<void> {
  await db.foods.update(id, { deleted_at: new Date().toISOString() });
}

/** Reverse a soft-delete - clears the tombstone so the food reappears. */
export async function restoreFood(id: string): Promise<void> {
  await db.foods.update(id, {
    deleted_at: undefined,
    updated_at: new Date().toISOString(),
  });
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
 * Search local foods across name + brand, for the add-food sheet.
 *
 * Matches two ways, because raw substrings alone were losing foods the user
 * had definitely added:
 *
 *  1. Every typed token appears verbatim. Fast, and exactly what you want
 *     when you type part of a product name.
 *  2. Every SIGNIFICANT word of the query appears among the food's
 *     significant words, after both sides are de-accented, translated out of
 *     French and Dutch, and stripped of filler.
 *
 * The second rule is why "poudre de cacao" now finds a food stored as
 * "Cacao en poudre": rule 1 fails on the word "de", which is not in the
 * stored name at all, and used to return nothing. It is also what makes
 * "beef" find "Hache de boeuf" and "creme" find "Crème".
 */
export async function searchLocalFoods(query: string, limit = 20): Promise<Food[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const queryWords = sigWords(q);
  const userId = currentUserId();
  const matches = await db.foods
    .where('user_id')
    .equals(userId)
    .filter((f) => {
      if (f.deleted_at) return false;
      const hay = `${f.name} ${f.brand ?? ''}`.toLowerCase();
      if (tokens.every((t) => hay.includes(t))) return true;
      if (queryWords.length === 0) return false;
      const foodWords = sigWords(`${f.name} ${f.brand ?? ''}`);
      if (foodWords.length === 0) return false;
      return queryWords.every((qw) =>
        foodWords.some((fw) => wordsMatch(qw, fw)),
      );
    })
    .limit(limit * 3)
    .toArray();
  // custom first, then OFF/USDA, then most-recently-updated
  return matches
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === 'custom' ? -1 : 1;
      return a.updated_at < b.updated_at ? 1 : -1;
    })
    .slice(0, limit);
}

/**
 * Prune cached OFF / USDA food rows that haven't been touched in a while
 * and aren't referenced by any diary entry or saved meal. Every search
 * caches its hits into Dexie, so without this the table (and every sync
 * payload) grows unbounded. My Products and curated foods are never
 * pruned. Runs once at startup.
 */
export async function pruneStaleSearchCache(maxAgeDays = 60): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  const referenced = new Set<string>();
  await db.diary_entries.each((e) => {
    if (e.food_id) referenced.add(e.food_id);
  });
  await db.meal_items.each((it) => {
    if (it.food_id) referenced.add(it.food_id);
  });
  const stale = await db.foods
    .where('user_id')
    .equals(currentUserId())
    .filter(
      (f) =>
        (f.source === 'off' || f.source === 'usda' || f.source === 'shared') &&
        f.updated_at < cutoff &&
        !referenced.has(f.id),
    )
    .primaryKeys();
  if (stale.length > 0) await db.foods.bulkDelete(stale as string[]);
}
