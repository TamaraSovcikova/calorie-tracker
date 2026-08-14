import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import { matchesSearchQuery } from '@/features/food-search/ingredientMatch';
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
 * How much a matched food deserves to survive truncation. Only a coarse
 * proxy: the real scoring happens in useFoodSearch once the shortlist is
 * built. This exists so the shortlist is the BEST matches rather than an
 * arbitrary slice of them.
 */
function localRelevance(food: Food, q: string): number {
  const name = food.name.toLowerCase();
  if (name === q) return 4;
  if (name.startsWith(q)) return 3;
  if (name.includes(q)) return 2;
  if (`${name} ${food.brand?.toLowerCase() ?? ''}`.includes(q)) return 1;
  return 0; // matched only after normalisation
}

/** Ceiling on how many rows we normalise before ranking. */
const SEARCH_SCAN_CAP = 400;

/**
 * Search local foods across name + brand, for the add-food sheet. Uses the
 * app-wide matcher, so accents, word order and French/Dutch names all work.
 *
 * Ranks BEFORE truncating. It used to take the first `limit * 3` rows Dexie
 * happened to walk past, sort those by source and date, and cut to 20 - so
 * with a few thousand cached foods an exact name match could be dropped
 * before relevance was ever considered.
 */
export async function searchLocalFoods(query: string, limit = 20): Promise<Food[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const userId = currentUserId();
  const matches = await db.foods
    .where('user_id')
    .equals(userId)
    .filter(
      (f) =>
        !f.deleted_at &&
        matchesSearchQuery(`${f.name} ${f.brand ?? ''}`, q),
    )
    .limit(SEARCH_SCAN_CAP)
    .toArray();
  // relevance, then custom first, then most-recently-updated
  return matches
    .sort((a, b) => {
      const ra = localRelevance(a, q);
      const rb = localRelevance(b, q);
      if (ra !== rb) return rb - ra;
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
