/**
 * USDA FoodData Central client.
 *
 * Endpoint: GET https://api.nal.usda.gov/fdc/v1/foods/search?api_key=...
 * Free, 1000 req/hour/IP, just an API key (instant signup at api.data.gov).
 *
 * Datasets we query:
 *   - Foundation     analytical lab data, gold standard ("Bananas, raw")
 *   - SR Legacy      USDA's classic Standard Reference, broad coverage
 *   - Survey (FNDDS) Food and Nutrient Database for Dietary Studies — has
 *                    food portions ("1 medium banana = 118g") which become
 *                    custom_units on our Food rows.
 *   - Branded        packaged-products dataset, used as fallback
 */

import { v4 as uuid } from 'uuid';
import { currentUserId } from '@/db/userId';
import type { CustomUnit, Food, UsdaDataType } from '@/db/types';

const BASE = 'https://api.nal.usda.gov/fdc/v1';
const API_KEY_LS = 'calorie-tracker:usda-key';

export function getUsdaApiKey(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(API_KEY_LS);
}

export function setUsdaApiKey(key: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (key === null || key.trim() === '') localStorage.removeItem(API_KEY_LS);
  else localStorage.setItem(API_KEY_LS, key.trim());
}

// ---------- Rate limit (token bucket) ----------

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private capacity: number, private refillIntervalMs: number) {
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
    return Math.max(0, this.refillIntervalMs - (Date.now() - this.lastRefill));
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

// 900/hour to stay safely under USDA's 1000/hour limit.
const bucket = new TokenBucket(900, (60 * 60_000) / 900);

export class UsdaRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`USDA rate limit hit, retry in ${Math.ceil(retryAfterMs / 1000)}s`);
  }
}

export class UsdaAuthError extends Error {
  constructor() {
    super('USDA API key rejected (401)');
  }
}

// ---------- API types ----------

interface UsdaNutrient {
  // FDC uses both numeric `nutrientNumber` (string) and `nutrientId` (number).
  nutrientNumber?: string;
  nutrientId?: number;
  value?: number;
  // Branded foods use this nested shape; some endpoints flatten it.
  nutrient?: { number?: string; id?: number };
  amount?: number;
}

interface UsdaPortion {
  amount?: number;
  modifier?: string;
  portionDescription?: string;
  measureUnit?: { name?: string; abbreviation?: string };
  gramWeight?: number;
}

interface UsdaHit {
  fdcId: number;
  description?: string;
  dataType?: string;
  brandName?: string;
  brandOwner?: string;
  foodCategory?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: UsdaNutrient[];
  foodPortions?: UsdaPortion[];
  // Branded uses different field names for portions
  householdServingFullText?: string;
}

interface UsdaSearchResponse {
  totalHits?: number;
  foods?: UsdaHit[];
}

// ---------- Mapping ----------

const NUTRIENT_NUMBER_KCAL = '208';
const NUTRIENT_NUMBER_PROTEIN = '203';
const NUTRIENT_NUMBER_CARBS = '205';
const NUTRIENT_NUMBER_FAT = '204';

function valueByNutrientNumber(
  nutrients: UsdaNutrient[] | undefined,
  num: string,
): number {
  if (!nutrients) return 0;
  for (const n of nutrients) {
    const candidate = n.nutrientNumber ?? n.nutrient?.number;
    if (candidate === num) {
      const v = n.value ?? n.amount;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
  }
  return 0;
}

function dataTypeKey(rawDataType: string | undefined): UsdaDataType {
  switch (rawDataType) {
    case 'Foundation':
      return 'foundation';
    case 'SR Legacy':
      return 'sr_legacy';
    case 'Survey (FNDDS)':
      return 'survey';
    case 'Branded':
    default:
      return 'branded';
  }
}

function portionsToCustomUnits(portions: UsdaPortion[] | undefined): CustomUnit[] {
  if (!portions || portions.length === 0) return [];
  const out: CustomUnit[] = [];
  const seen = new Set<string>();
  for (const p of portions) {
    const grams = p.gramWeight;
    if (typeof grams !== 'number' || grams <= 0) continue;
    let label = (p.portionDescription || p.modifier || '').trim();
    if (!label && p.measureUnit?.name) {
      const amount = p.amount ?? 1;
      label = `${amount} ${p.measureUnit.name}`;
    }
    if (!label) continue;
    // Common cleanup: drop redundant prefixes
    label = label.replace(/^\d+\s*[a-zA-Z]*\s+/, (m) =>
      // keep if it's a meaningful descriptor like "1 cup", drop bare "1 "
      /^\d+\s+(cup|tbsp|tsp|oz|ml|g|piece|slice|medium|large|small)/i.test(m) ? m : '',
    );
    label = label.slice(0, 60);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, grams: Math.round(grams * 10) / 10 });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Convert a USDA hit into our Food shape. Returns null if the hit lacks
 * enough info to be useful (no name, or zero kcal — the search has surfaced
 * something we'd render uselessly).
 */
export function usdaHitToFood(hit: UsdaHit): Food | null {
  const name = hit.description?.trim();
  if (!name) return null;

  const dt = dataTypeKey(hit.dataType);
  const nutrients = hit.foodNutrients;
  const isBranded = dt === 'branded';

  // For Foundation/SR/Survey, foodNutrients are per 100 g.
  // For Branded, they're per "labelNutrients" serving — but the search
  // endpoint already normalises to per-100g for the returned values when
  // dataType=Branded (FDC docs). We treat all four datasets as per-100g
  // here; if Branded hits look off in practice we can refine.
  let kcal = valueByNutrientNumber(nutrients, NUTRIENT_NUMBER_KCAL);
  const protein = valueByNutrientNumber(nutrients, NUTRIENT_NUMBER_PROTEIN);
  const carbs = valueByNutrientNumber(nutrients, NUTRIENT_NUMBER_CARBS);
  const fat = valueByNutrientNumber(nutrients, NUTRIENT_NUMBER_FAT);

  // If kcal is missing but macros are present, derive (4P + 4C + 9F).
  if (kcal === 0) {
    kcal = protein * 4 + carbs * 4 + fat * 9;
    if (kcal === 0) return null;
  }

  const servingG =
    typeof hit.servingSize === 'number' &&
    typeof hit.servingSizeUnit === 'string' &&
    /^(g|grm)$/i.test(hit.servingSizeUnit)
      ? hit.servingSize
      : undefined;

  const customUnits = portionsToCustomUnits(hit.foodPortions);

  const now = new Date().toISOString();
  return {
    id: `usda:${hit.fdcId}`,
    user_id: currentUserId(),
    source: 'usda',
    usda_data_type: dt,
    name,
    brand: isBranded ? hit.brandName ?? hit.brandOwner ?? undefined : undefined,
    kcal_100: kcal,
    protein_100: protein,
    carbs_100: carbs,
    fat_100: fat,
    serving_g: servingG,
    custom_units: customUnits,
    created_at: now,
    updated_at: now,
  };
}

// ---------- Search ----------

export interface SearchUsdaOptions {
  signal?: AbortSignal;
  /** Restrict to generic datasets — used when the user has hidden packaged. */
  genericOnly?: boolean;
}

export async function searchUsda(
  query: string,
  apiKey: string,
  options: SearchUsdaOptions = {},
): Promise<Food[]> {
  if (!query.trim()) return [];
  if (!apiKey.trim()) return [];
  if (!bucket.tryTake()) {
    throw new UsdaRateLimitError(bucket.msUntilNext());
  }

  const dataTypes = options.genericOnly
    ? ['Foundation', 'SR Legacy', 'Survey (FNDDS)']
    : ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'];

  const params = new URLSearchParams({
    api_key: apiKey,
    query,
    pageSize: '25',
    dataType: dataTypes.join(','),
  });

  const res = await fetch(`${BASE}/foods/search?${params}`, {
    signal: options.signal,
  });
  if (res.status === 401 || res.status === 403) throw new UsdaAuthError();
  if (res.status === 429) throw new UsdaRateLimitError(60_000);
  if (!res.ok) throw new Error(`USDA HTTP ${res.status}`);

  const data = (await res.json()) as UsdaSearchResponse;
  if (!Array.isArray(data.foods)) return [];
  return data.foods
    .map(usdaHitToFood)
    .filter((f): f is Food => f !== null);
}

/**
 * Cheap probe used by the Settings panel to validate the key.
 * Returns true on 200, false on 401/403, throws on network errors.
 */
export async function probeUsdaKey(apiKey: string): Promise<boolean> {
  if (!apiKey.trim()) return false;
  const params = new URLSearchParams({
    api_key: apiKey,
    query: 'banana',
    pageSize: '1',
  });
  const res = await fetch(`${BASE}/foods/search?${params}`);
  if (res.status === 401 || res.status === 403) return false;
  return res.ok;
}

/** Stable id helper, matches off-api's pattern. */
export function usdaIdFromFdcId(fdcId: number | string): string {
  return `usda:${fdcId}`;
}

/** uuid re-export so call sites importing one symbol are tidy. */
export const newLocalFoodId = uuid;
