/**
 * Client side of the AI meal planner.
 *
 *  1. requestMealPlan() — ask the Worker for recipe ideas (ingredient names
 *     + gram amounts only; no macros — the model is unreliable at those).
 *  2. resolveAndFitMeal() — look every ingredient up in the real food
 *     database (curated foods, then USDA), compute true macros, and scale
 *     the recipe so each portion fits the kcal / protein targets.
 *  3. savePlanAsMeal() — store the fitted recipe as a multi-portion meal.
 */

import { db } from '@/db/dexie';
import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import { createFood, searchLocalFoods } from '@/db/repos/foods';
import { createMeal, type MealItemInput } from '@/db/repos/meals';
import { recentFoods, type DayTotals } from '@/db/repos/diary';
import { computeMacros } from '@/features/food-search/foodMath';
import { getUsdaApiKey, searchUsda } from '@/lib/usda-api';
import type { Food } from '@/db/types';

// ---------------------------------------------------------------- types

/** A recipe idea straight from the AI — no macros. */
export interface PlannedIngredient {
  name: string;
  /** Amount for the whole batch, in grams. */
  grams: number;
}
export interface PlannedMeal {
  name: string;
  description: string;
  ingredients: PlannedIngredient[];
  steps: string[];
}
export interface MealPlanResult {
  meals: PlannedMeal[];
  error?: string;
}
export interface MealPlanRequest {
  /** How many meal-prep portions the batch should make. */
  portions: number;
  kcalMax?: number;
  proteinMin?: number;
  ingredients?: string[];
  notes?: string;
}

/** An ingredient after database lookup + fit-scaling. */
export interface ResolvedIngredient {
  name: string;
  /** Fitted amount for the whole batch, in grams. */
  grams: number;
  /** The matched food, or null if nothing was found. */
  food: Food | null;
  /** This ingredient's macros for ONE portion. */
  perPortion: DayTotals;
}
export interface ResolvedMeal {
  meal: PlannedMeal;
  portions: number;
  ingredients: ResolvedIngredient[];
  /** Whole-meal macros for one portion. */
  perPortion: DayTotals;
  fitsKcal: boolean;
  fitsProtein: boolean;
  /** Ingredients with no nutrition data found. */
  unresolvedCount: number;
}

const ZERO: DayTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

// ------------------------------------------------------------- request

export async function requestMealPlan(
  input: MealPlanRequest,
): Promise<MealPlanResult> {
  const { token } = getSyncConfig();
  if (!token) {
    return {
      meals: [],
      error: 'Connect a sync code in Settings to use the AI planner.',
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`${syncBaseUrl()}/api/meal-plan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as MealPlanResult | null;
    if (!data) {
      return { meals: [], error: 'Planner returned nothing — try again.' };
    }
    return {
      meals: Array.isArray(data.meals) ? data.meals : [],
      error: data.error,
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      meals: [],
      error: aborted
        ? 'The planner took too long — please try again.'
        : 'Could not reach the planner. Check your connection.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ------------------------------------------------ ingredient resolution

/** Score a candidate food against an ingredient name — higher is better. */
function scoreFood(food: Food, query: string): number {
  const name = food.name.toLowerCase();
  let score = 0;
  if (name === query) score += 1000;
  else if (name.startsWith(query)) score += 500;
  else if (name.includes(query) || query.includes(name)) score += 250;
  else {
    const words = name.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some((w) => query.includes(w))) score += 120;
  }
  if (food.source === 'curated') score += 400;
  else if (food.source === 'custom') score += 250;
  else if (food.usda_data_type === 'foundation') score += 220;
  else if (food.usda_data_type === 'sr_legacy') score += 180;
  else if (food.usda_data_type === 'survey') score += 60;
  return score;
}

// Dedupe lookups across all meal cards for the lifetime of the page.
const lookupCache = new Map<string, Promise<Food | null>>();
let recentsCache: Promise<Food[]> | null = null;

/** The foods the user has logged recently — what they actually buy. */
function loadRecentFoods(): Promise<Food[]> {
  if (!recentsCache) {
    recentsCache = (async () => {
      const ids = await recentFoods(40).catch(() => [] as string[]);
      if (ids.length === 0) return [];
      const rows = await db.foods.bulkGet(ids);
      return rows.filter((r): r is Food => !!r && !r.deleted_at);
    })();
  }
  return recentsCache;
}

/** Clear per-session caches — call when the planner page opens so recents
 *  and lookups are fresh. */
export function resetPlannerCaches(): void {
  lookupCache.clear();
  recentsCache = null;
}

/** Significant (3+ char) words of a name. */
function sigWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3);
}

/** True when every significant word of the ingredient appears in the food
 *  name — strict enough to match "chicken breast" to a recent branded
 *  "Tesco Chicken Breast Fillets" without matching it to "chicken soup". */
function nameContainsIngredient(food: Food, query: string): boolean {
  const name = food.name.toLowerCase();
  if (name === query) return true;
  const words = sigWords(query);
  if (words.length === 0) return name.includes(query);
  return words.every((w) => name.includes(w));
}

async function lookupIngredientFood(name: string): Promise<Food | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const cached = lookupCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<Food | null> => {
    // 0. Recents — match against what the user actually logs, so a brand
    //    they buy is used for the estimate rather than a generic entry.
    const recents = await loadRecentFoods();
    const recentHits = recents.filter((f) => nameContainsIngredient(f, key));
    if (recentHits.length > 0) {
      return [...recentHits].sort((a, b) => scoreFood(b, key) - scoreFood(a, key))[0];
    }

    // 1. Local DB — curated common foods, the user's products, cached hits.
    const local = await searchLocalFoods(key, 25).catch(() => [] as Food[]);
    if (local.length > 0) {
      return [...local].sort((a, b) => scoreFood(b, key) - scoreFood(a, key))[0];
    }
    // 2. USDA FoodData Central.
    const apiKey = getUsdaApiKey();
    if (!apiKey) return null;
    try {
      const hits = await searchUsda(key, apiKey, { genericOnly: true });
      if (hits.length === 0) return null;
      const best = [...hits].sort((a, b) => scoreFood(b, key) - scoreFood(a, key))[0];
      // Cache into Dexie so the saved meal can reference it by id.
      await db.foods.put(best).catch(() => undefined);
      return best;
    } catch {
      return null; // rate-limited / offline / no match — fail soft
    }
  })();

  lookupCache.set(key, promise);
  return promise;
}

/** Per-gram macros for a food (zeros when the food is unknown). */
function perGram(food: Food | null): DayTotals {
  if (!food) return ZERO;
  return {
    kcal: food.kcal_100 / 100,
    protein: food.protein_100 / 100,
    carbs: food.carbs_100 / 100,
    fat: food.fat_100 / 100,
  };
}

function totalsFor(grams: number[], perG: DayTotals[]): DayTotals {
  return grams.reduce<DayTotals>(
    (acc, g, i) => ({
      kcal: acc.kcal + g * perG[i].kcal,
      protein: acc.protein + g * perG[i].protein,
      carbs: acc.carbs + g * perG[i].carbs,
      fat: acc.fat + g * perG[i].fat,
    }),
    { ...ZERO },
  );
}

/**
 * Resolve a planned meal's ingredients to real foods, then scale amounts
 * so each portion lands near the kcal / protein targets:
 *  - too little protein → grow the biggest protein ingredient;
 *  - too many calories → shrink the non-protein "filler" ingredients.
 * Bounded so amounts never become absurd.
 */
export async function resolveAndFitMeal(
  meal: PlannedMeal,
  req: { portions: number; kcalMax?: number; proteinMin?: number },
): Promise<ResolvedMeal> {
  const portions = req.portions > 0 ? req.portions : 1;
  const foods = await Promise.all(
    meal.ingredients.map((i) => lookupIngredientFood(i.name)),
  );
  const perG = foods.map(perGram);
  const grams = meal.ingredients.map((i) => i.grams);

  // Protein anchor = the ingredient contributing the most protein.
  let anchor = -1;
  let anchorProtein = 0;
  for (let i = 0; i < grams.length; i++) {
    const p = grams[i] * perG[i].protein;
    if (p > anchorProtein) {
      anchorProtein = p;
      anchor = i;
    }
  }

  // Step A — lift protein to the floor by growing the anchor.
  if (req.proteinMin && anchor >= 0 && perG[anchor].protein > 0) {
    const perPortionProtein = totalsFor(grams, perG).protein / portions;
    if (perPortionProtein < req.proteinMin) {
      const deficit = (req.proteinMin - perPortionProtein) * portions;
      const add = deficit / perG[anchor].protein;
      grams[anchor] = Math.min(grams[anchor] + add, grams[anchor] * 3.5);
    }
  }

  // Step B — pull calories under the cap by shrinking the fillers.
  if (req.kcalMax) {
    const perPortionKcal = totalsFor(grams, perG).kcal / portions;
    if (perPortionKcal > req.kcalMax) {
      const excess = (perPortionKcal - req.kcalMax) * portions;
      let fillerKcal = 0;
      for (let i = 0; i < grams.length; i++) {
        if (i !== anchor) fillerKcal += grams[i] * perG[i].kcal;
      }
      if (fillerKcal > 0) {
        const factor = Math.max(0.2, (fillerKcal - excess) / fillerKcal);
        for (let i = 0; i < grams.length; i++) {
          if (i !== anchor) grams[i] *= factor;
        }
      }
    }
  }

  // Round, keep every ingredient at >= 1 g.
  for (let i = 0; i < grams.length; i++) {
    grams[i] = Math.max(1, Math.round(grams[i]));
  }

  const ingredients: ResolvedIngredient[] = meal.ingredients.map((ing, i) => {
    const food = foods[i];
    const macros = food
      ? computeMacros(food, { mode: 'g', qty: grams[i] })
      : null;
    return {
      name: ing.name,
      grams: grams[i],
      food,
      perPortion: {
        kcal: (macros?.kcal ?? 0) / portions,
        protein: (macros?.protein ?? 0) / portions,
        carbs: (macros?.carbs ?? 0) / portions,
        fat: (macros?.fat ?? 0) / portions,
      },
    };
  });

  const perPortion = ingredients.reduce<DayTotals>(
    (acc, i) => ({
      kcal: acc.kcal + i.perPortion.kcal,
      protein: acc.protein + i.perPortion.protein,
      carbs: acc.carbs + i.perPortion.carbs,
      fat: acc.fat + i.perPortion.fat,
    }),
    { ...ZERO },
  );

  return {
    meal,
    portions,
    ingredients,
    perPortion,
    fitsKcal: !req.kcalMax || perPortion.kcal <= req.kcalMax * 1.07,
    fitsProtein: !req.proteinMin || perPortion.protein >= req.proteinMin * 0.93,
    unresolvedCount: foods.filter((f) => !f).length,
  };
}

// ----------------------------------------------------------------- save

/** Save a resolved meal into the library as a multi-portion meal. */
export async function savePlanAsMeal(resolved: ResolvedMeal): Promise<string> {
  const items: MealItemInput[] = [];
  for (const ing of resolved.ingredients) {
    let foodId = ing.food?.id;
    if (!foodId) {
      // No nutrition found — bank a zero-macro placeholder the user can edit.
      const placeholder = await createFood({
        source: 'custom',
        name: ing.name,
        kcal_100: 0,
        protein_100: 0,
        carbs_100: 0,
        fat_100: 0,
      });
      foodId = placeholder.id;
    }
    items.push({ food_id: foodId, qty: ing.grams, unit: 'g' });
  }
  const created = await createMeal({
    name: resolved.meal.name,
    notes: resolved.meal.description || undefined,
    servings: resolved.portions,
    items,
  });
  return created.id;
}
