/**
 * Open Food Facts client.
 *
 * Endpoints (no API key required for reads):
 *   Search:   GET https://world.openfoodfacts.org/cgi/search.pl?...
 *   Product:  GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json
 *
 * Rate limits per OFF docs:
 *   - 10 search queries / minute / IP
 *   - 15 product queries / minute / IP
 * We enforce these client-side with a token-bucket so we fail fast instead of
 * triggering a server-side 429.
 *
 * Writes (contributing a product) require auth; that's handled in Phase 7
 * Settings (the user pastes OFF credentials).
 */

import { v4 as uuid } from 'uuid';
import type { Food } from '@/db/types';
import { currentUserId } from '@/db/userId';

const OFF_BASE = 'https://world.openfoodfacts.org';
const APP_NAME = import.meta.env.VITE_OFF_APP_NAME || 'calorie-tracker';
const APP_VERSION = import.meta.env.VITE_OFF_APP_VERSION || '0.0.1';
const USER_AGENT_HEADER = `${APP_NAME}/${APP_VERSION}`;

const FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_size',
  'image_front_small_url',
].join(',');

// ---------- Token bucket ----------

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(
    private capacity: number,
    private refillIntervalMs: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
  msUntilNext(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.max(
      0,
      this.refillIntervalMs - (Date.now() - this.lastRefill),
    );
  }
  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      const refills = Math.floor(elapsed / this.refillIntervalMs);
      this.tokens = Math.min(this.capacity, this.tokens + refills);
      this.lastRefill += refills * this.refillIntervalMs;
    }
  }
}

// 10 / 60_000ms for search, 15 / 60_000ms for product. We model each as a
// per-second drip so a quick burst still works.
const searchBucket = new TokenBucket(10, 60_000 / 10);
const productBucket = new TokenBucket(15, 60_000 / 15);

export class OffRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`OFF rate limit hit, retry in ${Math.ceil(retryAfterMs / 1000)}s`);
  }
}

// ---------- Parser ----------

interface OffNutriments {
  ['energy-kcal_100g']?: number;
  ['energy_100g']?: number; // kJ if no kcal
  ['proteins_100g']?: number;
  ['carbohydrates_100g']?: number;
  ['fat_100g']?: number;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  generic_name?: string;
  brands?: string;
  nutriments?: OffNutriments;
  serving_quantity?: number | string;
  serving_size?: string;
  image_front_small_url?: string;
}

function kcalFromNutriments(n: OffNutriments | undefined): number | null {
  if (!n) return null;
  if (typeof n['energy-kcal_100g'] === 'number') return n['energy-kcal_100g'];
  if (typeof n.energy_100g === 'number') return n.energy_100g / 4.184;
  return null;
}

function num(v: number | string | undefined): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const f = parseFloat(v);
    return Number.isFinite(f) ? f : undefined;
  }
  return undefined;
}

/**
 * Map an OFF product JSON to our local Food shape. Returns null if the
 * product doesn't have enough info to be useful (no name or no kcal).
 */
export function offProductToFood(p: OffProduct): Food | null {
  if (!p.code) return null;
  const name = p.product_name?.trim() || p.generic_name?.trim();
  if (!name) return null;
  const kcal = kcalFromNutriments(p.nutriments);
  if (kcal === null) return null;
  const now = new Date().toISOString();
  return {
    id: `off:${p.code}`,
    user_id: currentUserId(),
    source: 'off',
    off_barcode: p.code,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    kcal_100: kcal,
    protein_100: p.nutriments?.['proteins_100g'] ?? 0,
    carbs_100: p.nutriments?.['carbohydrates_100g'] ?? 0,
    fat_100: p.nutriments?.['fat_100g'] ?? 0,
    serving_g: num(p.serving_quantity),
    custom_units: [],
    created_at: now,
    updated_at: now,
  };
}

// ---------- API ----------

async function offFetch(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': USER_AGENT_HEADER },
  });
  if (!res.ok) throw new Error(`OFF HTTP ${res.status}`);
  return res.json();
}

export async function searchOff(
  query: string,
  signal?: AbortSignal,
): Promise<Food[]> {
  if (!query.trim()) return [];
  if (!searchBucket.tryTake()) {
    throw new OffRateLimitError(searchBucket.msUntilNext());
  }
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    fields: FIELDS,
    page_size: '20',
  });
  const url = `${OFF_BASE}/cgi/search.pl?${params}`;
  const data = (await offFetch(url, signal)) as { products?: OffProduct[] };
  if (!Array.isArray(data.products)) return [];
  return data.products
    .map(offProductToFood)
    .filter((f): f is Food => f !== null);
}

export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<Food | null> {
  if (!barcode.trim()) return null;
  if (!productBucket.tryTake()) {
    throw new OffRateLimitError(productBucket.msUntilNext());
  }
  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  const data = (await offFetch(url, signal)) as {
    status?: number;
    product?: OffProduct;
  };
  if (data.status !== 1 || !data.product) return null;
  const food = offProductToFood(data.product);
  if (food) {
    // Local-only barcode-derived id. Stable so a repeat scan returns the
    // same row.
    food.id = `off:${barcode}`;
  } else {
    // Could not parse — but we still want a stable id if we choose to cache
    // an empty stub. For now, return null and let the UI offer manual entry.
    return null;
  }
  return food;
}

/** Used by features/food-search/useFoodSearch to assign deterministic ids. */
export function offIdFromBarcode(code: string): string {
  return `off:${code}`;
}

/** Generate a sync-ready id for new locally-created foods. */
export function newLocalFoodId(): string {
  return uuid();
}
