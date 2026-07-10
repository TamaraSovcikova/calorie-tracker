/**
 * Client for the community shared-foods pool (worker /api/shared-foods).
 * Contributing publishes a manually-entered product's name + macros so other
 * users - and the same user on a new device - can find it without re-typing.
 * Both calls are best-effort and never throw: search returns [] on any error,
 * contribute silently no-ops.
 */

import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import { currentUserId } from '@/db/userId';
import type { CustomUnit, Food } from '@/db/types';

interface SharedFoodRow {
  key: string;
  name: string;
  brand?: string | null;
  off_barcode?: string | null;
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  fiber_100?: number | null;
  sugar_100?: number | null;
  sodium_100?: number | null;
  serving_g?: number | null;
  custom_units?: string | null;
}

function rowToFood(r: SharedFoodRow): Food {
  let units: CustomUnit[] = [];
  try {
    if (r.custom_units) units = JSON.parse(r.custom_units) as CustomUnit[];
  } catch {
    units = [];
  }
  const now = new Date().toISOString();
  return {
    id: `shared:${r.key}`,
    user_id: currentUserId(),
    source: 'shared',
    off_barcode: r.off_barcode ?? undefined,
    name: r.name,
    brand: r.brand ?? undefined,
    kcal_100: r.kcal_100,
    protein_100: r.protein_100,
    carbs_100: r.carbs_100,
    fat_100: r.fat_100,
    fiber_100: r.fiber_100 ?? undefined,
    sugar_100: r.sugar_100 ?? undefined,
    sodium_100: r.sodium_100 ?? undefined,
    serving_g: r.serving_g ?? undefined,
    custom_units: units,
    created_at: now,
    updated_at: now,
  };
}

/** Search the shared pool. Returns [] when sync isn't configured or on error. */
export async function searchSharedFoods(
  query: string,
  signal?: AbortSignal,
): Promise<Food[]> {
  const { token } = getSyncConfig();
  const q = query.trim();
  if (!token || q.length < 2) return [];
  try {
    const res = await fetch(
      `${syncBaseUrl()}/api/shared-foods?q=${encodeURIComponent(q)}`,
      { headers: { authorization: `Bearer ${token}` }, signal },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { foods?: SharedFoodRow[] };
    return (data.foods ?? []).map(rowToFood);
  } catch {
    return [];
  }
}

/** Contribute a manually-entered food to the shared pool (fire-and-forget). */
export async function contributeSharedFood(food: Food): Promise<void> {
  const { token } = getSyncConfig();
  if (!token) return;
  try {
    await fetch(`${syncBaseUrl()}/api/shared-foods`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: food.name,
        brand: food.brand ?? null,
        off_barcode: food.off_barcode ?? null,
        kcal_100: food.kcal_100,
        protein_100: food.protein_100,
        carbs_100: food.carbs_100,
        fat_100: food.fat_100,
        fiber_100: food.fiber_100 ?? null,
        sugar_100: food.sugar_100 ?? null,
        sodium_100: food.sodium_100 ?? null,
        serving_g: food.serving_g ?? null,
        custom_units: JSON.stringify(food.custom_units ?? []),
      }),
    });
  } catch {
    // best-effort
  }
}
