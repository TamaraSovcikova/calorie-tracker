/**
 * AI photo logging - send a meal photo to the Worker's vision endpoint,
 * then resolve the detected foods to real macros from the food database.
 */

import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import { computeMacros, type ResolvedMacros } from '@/features/food-search/foodMath';
import { lookupIngredientFood } from '@/features/meal-planner/mealPlanner';
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
  return Promise.all(
    foods.map(async (f) => {
      const food = await lookupIngredientFood(f.name);
      const macros = food
        ? computeMacros(food, { mode: 'g', qty: f.grams })
        : null;
      return { name: f.name, grams: f.grams, food, macros };
    }),
  );
}
