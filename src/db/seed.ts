/**
 * App seeding, run once on startup (from main.tsx):
 *
 *  - ensureProfile()       — always; creates the default profile row.
 *  - ensureCuratedFoods()  — always (dev + prod); upserts the bundled
 *                            common-foods library, version-gated so it
 *                            only writes when curatedFoods.ts changes.
 *  - dev-only convenience  — flags the profile onboarded so developers
 *                            land straight in the diary.
 */

import { db } from './dexie';
import { ensureProfile } from './repos/profile';
import { pruneStaleSearchCache } from './repos/foods';
import { currentUserId } from './userId';
import { CURATED_FOODS, CURATED_VERSION } from './curatedFoods';
import type { Food } from './types';

const CURATED_MARKER_KEY = 'calorie-tracker:curated-version';
const DEV_MARKER_KEY = 'calorie-tracker:dev-seeded:v2';

/**
 * Upsert the curated common-foods library. Stable ids ('curated:{slug}')
 * mean re-running is a clean overwrite, never a duplicate. Version-gated
 * so it only does work — and only nudges the sync engine — when the
 * bundled list actually changed.
 */
export async function ensureCuratedFoods(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    const seen = localStorage.getItem(CURATED_MARKER_KEY);
    if (seen === String(CURATED_VERSION)) return;
  }
  const userId = currentUserId();
  const now = new Date().toISOString();
  const rows: Food[] = CURATED_FOODS.map((cf) => ({
    id: `curated:${cf.slug}`,
    user_id: userId,
    source: 'curated',
    name: cf.name,
    kcal_100: cf.kcal,
    protein_100: cf.protein,
    carbs_100: cf.carbs,
    fat_100: cf.fat,
    custom_units: cf.units,
    created_at: now,
    updated_at: now,
  }));
  await db.foods.bulkPut(rows);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CURATED_MARKER_KEY, String(CURATED_VERSION));
  }
}

export async function ensureSeed(): Promise<void> {
  await ensureProfile();
  await ensureCuratedFoods();
  // Background cleanup of stale OFF/USDA search cache — don't block startup.
  void pruneStaleSearchCache().catch(() => undefined);

  // Dev convenience: skip onboarding so `pnpm dev` lands in the diary.
  if (!import.meta.env.DEV) return;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(DEV_MARKER_KEY)) {
    return;
  }
  await db.profiles.update(currentUserId(), { onboarded: true });
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DEV_MARKER_KEY, '1');
  }
}
