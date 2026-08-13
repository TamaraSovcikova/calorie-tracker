/**
 * AI photo logging - send a meal photo to the Worker's vision endpoint,
 * then resolve the detected foods to real macros from the food database.
 */

import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import { computeMacros, type ResolvedMacros } from '@/features/food-search/foodMath';
import {
  rankIngredientCandidates,
  resetPlannerCaches,
} from '@/features/meal-planner/mealPlanner';
import type { IngredientCandidate } from '@/features/food-search/ingredientMatch';
import type { Food } from '@/db/types';

export interface PhotoFood {
  name: string;
  grams: number;
}
export interface PhotoAnalysis {
  foods: PhotoFood[];
  error?: string;
}

/** Detected food after database resolution. */
export interface ResolvedPhotoFood {
  name: string;
  grams: number;
  /** Matched food, or null when nothing was found. */
  food: Food | null;
  /** Macros at `grams`, or null when unresolved. */
  macros: ResolvedMacros | null;
  /**
   * Everything that plausibly matched, best first, so the user can correct
   * a wrong pick. Photo logging writes straight to the diary, so until this
   * existed it was the AI path with the least oversight: you could include
   * or exclude a row, but not fix one.
   */
  candidates: IngredientCandidate[];
  /** Index into `candidates`, or -1 when nothing matched. */
  chosen: number;
}

/** Shrink an image to a small JPEG so uploads (and the AI call) stay fast. */
export async function downscaleImage(file: Blob, maxDim = 1024): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82);
    });
  } catch {
    return file;
  }
}

/** Send a photo to the Worker and get back detected foods. Never throws. */
export async function analyzePhoto(file: Blob): Promise<PhotoAnalysis> {
  const { token } = getSyncConfig();
  if (!token) {
    return {
      foods: [],
      error: 'Connect a sync code in Settings to use photo logging.',
    };
  }
  const body = await downscaleImage(file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${syncBaseUrl()}/api/photo-food`, {
      method: 'POST',
      headers: {
        'content-type': 'image/jpeg',
        authorization: `Bearer ${token}`,
      },
      body,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as PhotoAnalysis | null;
    if (!data) return { foods: [], error: 'No response - try again.' };
    return {
      foods: Array.isArray(data.foods) ? data.foods : [],
      error: data.error,
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      foods: [],
      error: aborted
        ? 'Analysis took too long - try again.'
        : 'Could not reach the photo analyser.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve detected foods to real macros from the food database. */
export async function resolvePhotoFoods(
  foods: PhotoFood[],
): Promise<ResolvedPhotoFood[]> {
  // The recipe scanner and the planner both do this; the photo log did not,
  // so logging a new food and then photo-logging in the same session matched
  // against a stale library and never saw the food just added.
  resetPlannerCaches();
  return Promise.all(
    foods.map(async (f) => {
      const candidates = await rankIngredientCandidates(f.name);
      const food = candidates[0]?.food ?? null;
      const macros = food
        ? computeMacros(food, { mode: 'g', qty: f.grams })
        : null;
      return {
        name: f.name,
        grams: f.grams,
        food,
        macros,
        candidates,
        chosen: candidates.length > 0 ? 0 : -1,
      };
    }),
  );
}

/** Re-point a resolved row at a different candidate, recomputing macros. */
export function repickPhotoFood(
  row: ResolvedPhotoFood,
  chosen: number,
  grams = row.grams,
): ResolvedPhotoFood {
  const food = chosen >= 0 ? (row.candidates[chosen]?.food ?? null) : null;
  return {
    ...row,
    grams,
    chosen,
    food,
    macros: food ? computeMacros(food, { mode: 'g', qty: grams }) : null,
  };
}
