/**
 * Dev-only seed. Runs once on a fresh IndexedDB to give the app something
 * to render before the user has logged anything. Idempotent: checks for an
 * existing seed marker before inserting.
 *
 * In production we run the same `ensureProfile()` step but skip the foods
 * and diary entries — the user starts empty.
 */

import { db } from './dexie';
import { ensureProfile } from './repos/profile';
import { createFood } from './repos/foods';
import { createDiaryEntry } from './repos/diary';
import { todayLocal } from '@/lib/dates';
import { currentUserId } from './userId';

const SEED_MARKER_KEY = 'calorie-tracker:seeded:v1';

export async function ensureSeed(): Promise<void> {
  await ensureProfile();

  if (!import.meta.env.DEV) return;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(SEED_MARKER_KEY)) {
    return;
  }

  const userId = currentUserId();
  const existing = await db.foods.where('user_id').equals(userId).count();
  if (existing > 0) {
    localStorage.setItem(SEED_MARKER_KEY, '1');
    return;
  }

  // Skip onboarding in the dev seed so we land in the diary directly.
  await db.profiles.update(userId, { onboarded: true });

  // Seed a handful of staples so the search list isn't empty during dev.
  const oats = await createFood({
    source: 'custom',
    name: 'Rolled oats',
    kcal_100: 379,
    protein_100: 13.2,
    carbs_100: 67.7,
    fat_100: 6.5,
    serving_g: 40,
    custom_units: [],
  });
  const milk = await createFood({
    source: 'custom',
    name: 'Whole milk',
    kcal_100: 64,
    protein_100: 3.4,
    carbs_100: 4.7,
    fat_100: 3.6,
    serving_g: 200,
    custom_units: [],
  });
  await createFood({
    source: 'custom',
    name: 'Chicken breast (raw)',
    kcal_100: 110,
    protein_100: 23,
    carbs_100: 0,
    fat_100: 1.5,
    serving_g: 150,
    custom_units: [],
  });
  await createFood({
    source: 'custom',
    name: 'Whey protein',
    brand: 'Generic',
    kcal_100: 380,
    protein_100: 75,
    carbs_100: 9,
    fat_100: 5,
    custom_units: [{ label: 'scoop', grams: 30 }],
  });
  await createFood({
    source: 'custom',
    name: 'Banana',
    kcal_100: 89,
    protein_100: 1.1,
    carbs_100: 22.8,
    fat_100: 0.3,
    serving_g: 120,
    custom_units: [],
  });

  // One sample breakfast for today so the diary isn't empty on first run.
  const today = todayLocal();
  const oatsGrams = 50;
  await createDiaryEntry({
    date: today,
    section: 'breakfast',
    kind: 'food',
    food_id: oats.id,
    qty: oatsGrams,
    unit: 'g',
    kcal: (oats.kcal_100 * oatsGrams) / 100,
    protein: (oats.protein_100 * oatsGrams) / 100,
    carbs: (oats.carbs_100 * oatsGrams) / 100,
    fat: (oats.fat_100 * oatsGrams) / 100,
  });
  const milkGrams = 200;
  await createDiaryEntry({
    date: today,
    section: 'breakfast',
    kind: 'food',
    food_id: milk.id,
    qty: milkGrams,
    unit: 'ml',
    kcal: (milk.kcal_100 * milkGrams) / 100,
    protein: (milk.protein_100 * milkGrams) / 100,
    carbs: (milk.carbs_100 * milkGrams) / 100,
    fat: (milk.fat_100 * milkGrams) / 100,
  });

  localStorage.setItem(SEED_MARKER_KEY, '1');
}
