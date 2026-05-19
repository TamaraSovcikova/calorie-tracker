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
import { currentUserId } from '@/db/userId';
import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
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

const ZERO: DayTotals = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
};

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

let allFoodsCache: Promise<Food[]> | null = null;

/** Every food in the user's library — curated, custom, and cached search
 *  hits (incl. barcode-scanned products). Cached for the session. */
function loadAllFoods(): Promise<Food[]> {
  if (!allFoodsCache) {
    allFoodsCache = (async () => {
      const uid = currentUserId();
      return db.foods
        .where('user_id')
        .equals(uid)
        .filter((f) => !f.deleted_at)
        .toArray()
        .catch(() => [] as Food[]);
    })();
  }
  return allFoodsCache;
}

/** Clear per-session caches — call when the planner page opens so recents
 *  and lookups are fresh. */
export function resetPlannerCaches(): void {
  lookupCache.clear();
  recentsCache = null;
  allFoodsCache = null;
}

/** Significant (3+ char) words of a name. */
function sigWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3);
}

/** Two words match if equal, or one is a prefix of the other (shorter
 *  ≥ 4 chars) — so "wrap"/"wraps", "tomato"/"tomatoes" match. */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/**
 * Score how well a library food matches a free-text ingredient name.
 * Returns 0 when it doesn't qualify.
 *
 * Tolerant of the AI producing a *more verbose* name than the stored
 * product — e.g. "Lidl Rowan Hill Bakery 6 High Protein Tortilla Wraps"
 * vs a stored "High Protein Tortilla Wraps": the match is driven by how
 * much of the FOOD's name the query covers (recall), not the reverse, so
 * extra brand words in the AI name don't break it. Recently-logged foods
 * match more leniently — "use what you actually buy".
 */
function localMatchScore(
  food: Food,
  query: string,
  queryWords: string[],
  isRecent: boolean,
): number {
  const fname = food.name.trim().toLowerCase();
  let base: number;
  if (fname === query) {
    base = 1.5;
  } else {
    const foodWords = sigWords(fname);
    if (queryWords.length === 0 || foodWords.length === 0) return 0;
    let shared = 0;
    for (const fw of foodWords) {
      if (queryWords.some((qw) => wordsMatch(qw, fw))) shared += 1;
    }
    const recall = shared / foodWords.length; // food name covered by query
    const precision = shared / queryWords.length; // query covered by food
    const minShared = isRecent ? 1 : Math.min(2, foodWords.length);
    const minRecall = isRecent ? 0.34 : 0.6;
    if (shared < minShared || recall < minRecall || precision < 0.2) return 0;
    base = recall + precision * 0.15;
  }
  if (isRecent) base += 0.3; // prefer the brands the user actually logs
  if (food.kcal_100 > 0) base += 0.05; // a real food beats an empty stub
  if (food.source === 'curated' || food.source === 'custom') base += 0.03;
  return base;
}

/** Resolve a free-text food name to a real Food (library fuzzy match,
 *  recents-weighted → USDA), or null. Shared by the meal planner, photo
 *  logging and recipe scanning. */
export async function lookupIngredientFood(name: string): Promise<Food | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const cached = lookupCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<Food | null> => {
    const queryWords = sigWords(key);
    const [recents, all] = await Promise.all([
      loadRecentFoods(),
      loadAllFoods(),
    ]);
    const recentIds = new Set(recents.map((f) => f.id));

    // 1. Best fuzzy match across the whole library.
    let best: Food | null = null;
    let bestScore = 0;
    for (const f of all) {
      const s = localMatchScore(f, key, queryWords, recentIds.has(f.id));
      if (s > bestScore) {
        bestScore = s;
        best = f;
      }
    }
    if (best) return best;

    // 2. USDA FoodData Central — for generic ingredients not in the library.
    const apiKey = getUsdaApiKey();
    if (!apiKey) return null;
    try {
      const hits = await searchUsda(key, apiKey, { genericOnly: true });
      if (hits.length === 0) return null;
      const top = [...hits].sort((a, b) => scoreFood(b, key) - scoreFood(a, key))[0];
      // Cache into Dexie so a saved meal can reference it by id.
      await db.foods.put(top).catch(() => undefined);
      return top;
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
    fiber: (food.fiber_100 ?? 0) / 100,
    sugar: (food.sugar_100 ?? 0) / 100,
    sodium: (food.sodium_100 ?? 0) / 100,
  };
}

function totalsFor(grams: number[], perG: DayTotals[]): DayTotals {
  return grams.reduce<DayTotals>(
    (acc, g, i) => ({
      kcal: acc.kcal + g * perG[i].kcal,
      protein: acc.protein + g * perG[i].protein,
      carbs: acc.carbs + g * perG[i].carbs,
      fat: acc.fat + g * perG[i].fat,
      fiber: acc.fiber + g * perG[i].fiber,
      sugar: acc.sugar + g * perG[i].sugar,
      sodium: acc.sodium + g * perG[i].sodium,
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
        fiber: (macros?.fiber ?? 0) / portions,
        sugar: (macros?.sugar ?? 0) / portions,
        sodium: (macros?.sodium ?? 0) / portions,
      },
    };
  });

  const perPortion = ingredients.reduce<DayTotals>(
    (acc, i) => ({
      kcal: acc.kcal + i.perPortion.kcal,
      protein: acc.protein + i.perPortion.protein,
      carbs: acc.carbs + i.perPortion.carbs,
      fat: acc.fat + i.perPortion.fat,
      fiber: acc.fiber + i.perPortion.fiber,
      sugar: acc.sugar + i.perPortion.sugar,
      sodium: acc.sodium + i.perPortion.sodium,
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

export interface SavedPlanResult {
  mealId: string;
  /** Ingredient names dropped because no nutrition data was found. */
  skipped: string[];
}

/**
 * Save a resolved meal into the library as a multi-portion meal.
 * Ingredients with no nutrition match are skipped (rather than saved as
 * zero-macro foods that would clutter "My Products") and reported back so
 * the UI can tell the user to add them by hand.
 */
export async function savePlanAsMeal(
  resolved: ResolvedMeal,
): Promise<SavedPlanResult> {
  const items: MealItemInput[] = [];
  const skipped: string[] = [];
  for (const ing of resolved.ingredients) {
    if (!ing.food) {
      skipped.push(ing.name);
      continue;
    }
    items.push({ food_id: ing.food.id, qty: ing.grams, unit: 'g' });
  }
  const created = await createMeal({
    name: resolved.meal.name,
    notes: resolved.meal.description || undefined,
    servings: resolved.portions,
    items,
  });
  return { mealId: created.id, skipped };
}
