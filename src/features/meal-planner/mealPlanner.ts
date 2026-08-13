/**
 * Client side of the AI meal planner.
 *
 *  1. requestMealPlan() - ask the Worker for recipe ideas (ingredient names
 *     + gram amounts only; no macros - the model is unreliable at those).
 *  2. resolveAndFitMeal() - look every ingredient up in the real food
 *     database (curated foods, then USDA), compute true macros, and scale
 *     the recipe so each portion fits the kcal / protein targets.
 *  3. savePlanAsMeal() - store the fitted recipe as a multi-portion meal.
 */

import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import { createMeal, type MealItemInput } from '@/db/repos/meals';
import { frequentFoods, recentFoods, type DayTotals } from '@/db/repos/diary';
import { getAliasFood } from '@/db/repos/ingredientAliases';
import { computeMacros } from '@/features/food-search/foodMath';
import {
  rankCandidates,
  rankLibraryCandidates,
  ALIAS_SCORE,
  type IngredientCandidate,
} from '@/features/food-search/ingredientMatch';
import { getUsdaApiKey, searchUsda } from '@/lib/usda-api';
import type { Food } from '@/db/types';

// ---------------------------------------------------------------- types

/** A recipe idea straight from the AI - no macros. */
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
      return { meals: [], error: 'Planner returned nothing - try again.' };
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
        ? 'The planner took too long - please try again.'
        : 'Could not reach the planner. Check your connection.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ------------------------------------------------ ingredient resolution

// Dedupe lookups across all meal cards for the lifetime of the page.
const candidateCache = new Map<string, Promise<IngredientCandidate[]>>();
let recentsCache: Promise<Food[]> | null = null;

/** The foods the user has logged recently - what they actually buy. */
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

/** Every food in the user's library - curated, custom, and cached search
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

/** Clear per-session caches - call when the planner page opens so recents
 *  and lookups are fresh. */
export function resetPlannerCaches(): void {
  candidateCache.clear();
  recentsCache = null;
  allFoodsCache = null;
  frequentCache = null;
}

let frequentCache: Promise<Set<string>> | null = null;

/** Ids of the foods the user logs OFTEN (decay-weighted), not just lately.
 *  A weekly staple should beat something scanned once in a shop. */
function loadFrequentIds(): Promise<Set<string>> {
  if (!frequentCache) {
    frequentCache = (async () => {
      const ids = await frequentFoods(40).catch(() => [] as string[]);
      return new Set(ids);
    })();
  }
  return frequentCache;
}

/**
 * Whether the user has logged enough for "one of your foods" to mean
 * anything. Drives how strict the recipe review is: on a fresh install
 * nothing can reach a personal tier, so demanding one would flag every
 * ingredient.
 */
export async function hasPersonalFoodHistory(): Promise<boolean> {
  const [frequentIds, recents] = await Promise.all([
    loadFrequentIds(),
    loadRecentFoods(),
  ]);
  return frequentIds.size > 0 || recents.length > 0;
}

/**
 * Rank every plausible food for an ingredient name, best first.
 *
 * Tiering is the point: the user asked for the ingredients they actually
 * buy, so what they log often outranks what they logged once, which
 * outranks the bundled curated list, which outranks anything from USDA or
 * the shared pool. Scoring lives in `ingredientMatch.ts` and is tested
 * there.
 *
 * Falls out to USDA only when the local library has nothing, and marks
 * those hits `external` so the review screen can flag them as estimates.
 */
export async function rankIngredientCandidates(
  name: string,
): Promise<IngredientCandidate[]> {
  const key = name.trim().toLowerCase();
  if (!key) return [];
  const cached = candidateCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<IngredientCandidate[]> => {
    const [recents, all, frequentIds] = await Promise.all([
      loadRecentFoods(),
      loadAllFoods(),
      loadFrequentIds(),
    ]);
    const history = {
      frequentIds,
      recentIds: new Set(recents.map((f) => f.id)),
    };
    const local = rankLibraryCandidates(all, key, history);

    // A food the user has already chosen for this exact phrase wins outright.
    // This is what makes a product no word list could contain - a French
    // supermarket mince against "beef mince" - resolve from the second scan
    // on. Kept at the head of the list rather than replacing it, so the
    // picker still offers the alternatives.
    const aliased = await getAliasFood(key);
    if (aliased) {
      const rest = local.filter((c) => c.food.id !== aliased.id);
      return [
        {
          food: aliased,
          tier: 'alias' as const,
          nameScore: 1,
          score: ALIAS_SCORE,
        },
        ...rest,
      ];
    }
    if (local.length > 0) return local;

    // Nothing of the user's matches - reach out for a generic value. Marked
    // `external` so the UI can say plainly that this is an estimate.
    const apiKey = getUsdaApiKey();
    if (!apiKey) return [];
    try {
      const hits = await searchUsda(key, apiKey, { genericOnly: true });
      if (hits.length === 0) return [];
      const ranked = rankCandidates(hits, key, () => 'external');
      const keep = ranked.slice(0, 5);
      // Cache into Dexie so a saved meal can reference them by id.
      await Promise.all(
        keep.map((c) => db.foods.put(c.food).catch(() => undefined)),
      );
      return keep;
    } catch {
      return []; // rate-limited / offline / no match - fail soft
    }
  })();

  candidateCache.set(key, promise);
  return promise;
}

/**
 * The single best food for an ingredient name, or null.
 * Thin wrapper over the ranking above, so the meal planner and the photo
 * food log inherit the same tiering without their own copy of it.
 */
export async function lookupIngredientFood(name: string): Promise<Food | null> {
  const ranked = await rankIngredientCandidates(name);
  return ranked[0]?.food ?? null;
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

  // Step A - lift protein to the floor by growing the anchor.
  if (req.proteinMin && anchor >= 0 && perG[anchor].protein > 0) {
    const perPortionProtein = totalsFor(grams, perG).protein / portions;
    if (perPortionProtein < req.proteinMin) {
      const deficit = (req.proteinMin - perPortionProtein) * portions;
      const add = deficit / perG[anchor].protein;
      grams[anchor] = Math.min(grams[anchor] + add, grams[anchor] * 3.5);
    }
  }

  // Step B - pull calories under the cap by shrinking the fillers.
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
