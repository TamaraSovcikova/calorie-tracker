import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { searchLocalFoods } from '@/db/repos/foods';
import { recentFoods } from '@/db/repos/diary';
import { OffRateLimitError, searchOff } from '@/lib/off-api';
import {
  getUsdaApiKey,
  searchUsda,
  UsdaAuthError,
  UsdaRateLimitError,
} from '@/lib/usda-api';
import {
  getShowPackaged,
  subscribeToFoodSourceSettings,
} from '@/features/settings/foodSourceSettings';
import type { Food } from '@/db/types';

/**
 * Combines:
 *  - recents (the last ~30 foods logged, across all sections)
 *  - local search across My Products + cached USDA/OFF rows
 *  - live USDA FoodData Central search (generic + branded)
 *  - live Open Food Facts search (rate-limited 10/min, packaged-product DB)
 *
 * Result groups returned to the UI:
 *   recents       — last ~30 foods logged, any section
 *   myProducts    — user's manually-added products (source='custom')
 *   common        — USDA Foundation / SR Legacy / Survey (FNDDS)
 *   packaged      — USDA Branded + OFF (hidden when showPackaged=false)
 *
 * All search hits are also written to Dexie so subsequent searches resolve
 * locally — even offline.
 */

export interface FoodSearchResult {
  query: string;
  recents: Food[];
  myProducts: Food[];
  common: Food[];
  packaged: Food[];
  isSearching: boolean;
  rateLimitedSeconds: number | null;
  /** Source-agnostic banner for unrecoverable issues. */
  errorBanner: string | null;
  /** True when the USDA key is missing — prompts to add one in Settings. */
  needsUsdaKey: boolean;
  showPackaged: boolean;
}

const DEBOUNCE_MS = 350;

/**
 * Relevance score for ranking search results. Higher = shown first.
 *
 * Two main levers:
 *  - how well the name matches the query (exact > prefix > word > contains)
 *  - dataset quality: USDA Foundation / SR Legacy are clean generic foods
 *    ("Egg, whole"), Survey FNDDS includes composite dishes ("Egg
 *    Benedict", "Bagels, egg") which should rank below the generics.
 */
function scoreFoodMatch(food: Food, q: string): number {
  if (!q) return 0;
  const name = food.name.toLowerCase();
  let score = 0;
  if (name === q) score += 1000;
  else if (name.startsWith(q)) score += 500;
  else {
    const words = name.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.includes(q)) score += 400;
    else if (words.some((w) => w.startsWith(q))) score += 200;
    else if (name.includes(q)) score += 80;
  }
  if (food.source === 'curated') score += 450;
  else if (food.source === 'custom') score += 300;
  else if (food.usda_data_type === 'foundation') score += 250;
  else if (food.usda_data_type === 'sr_legacy') score += 200;
  else if (food.usda_data_type === 'survey') score += 40;
  return score;
}

export function useFoodSearch(query: string): FoodSearchResult {
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  const [showPackaged, setShowPackaged] = useState(getShowPackaged());

  // Mirror the settings switch live.
  useEffect(() => subscribeToFoodSourceSettings(() => setShowPackaged(getShowPackaged())), []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const recents = useLiveQuery(async () => {
    const ids = await recentFoods(30);
    if (ids.length === 0) return [];
    const rows = await db.foods.bulkGet(ids);
    return rows.filter((r): r is Food => !!r && !r.deleted_at);
  }, []);

  const [local, setLocal] = useState<Food[]>([]);
  const [usda, setUsda] = useState<Food[]>([]);
  const [off, setOff] = useState<Food[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [needsUsdaKey, setNeedsUsdaKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setErrorBanner(null);
    setRateLimitedSeconds(null);

    if (!debouncedQuery) {
      setLocal([]);
      setUsda([]);
      setOff([]);
      setIsSearching(false);
      setNeedsUsdaKey(!getUsdaApiKey());
      return;
    }
    setIsSearching(true);

    const localPromise = searchLocalFoods(debouncedQuery, 30).then((rows) => {
      if (!cancelled) setLocal(rows);
    });

    // USDA — only if key is present.
    const apiKey = getUsdaApiKey();
    setNeedsUsdaKey(!apiKey);
    const usdaPromise = apiKey
      ? searchUsda(debouncedQuery, apiKey, {
          signal: ctrl.signal,
          genericOnly: !showPackaged,
        })
          .then(async (rows) => {
            if (cancelled) return;
            setUsda(rows);
            if (rows.length > 0) {
              void db.foods.bulkPut(rows).catch(() => undefined);
            }
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            if (err instanceof UsdaRateLimitError) {
              setRateLimitedSeconds(Math.ceil(err.retryAfterMs / 1000));
              setUsda([]);
              return;
            }
            if (err instanceof UsdaAuthError) {
              setErrorBanner('USDA API key rejected. Update it in Settings.');
              setUsda([]);
              return;
            }
            if ((err as DOMException)?.name === 'AbortError') return;
            // Don't blow up the panel — local + OFF still render.
            setUsda([]);
          })
      : Promise.resolve();

    // OFF — only when packaged products are enabled.
    const offPromise = showPackaged
      ? searchOff(debouncedQuery, ctrl.signal)
          .then(async (rows) => {
            if (cancelled) return;
            setOff(rows);
            if (rows.length > 0) {
              void db.foods.bulkPut(rows).catch(() => undefined);
            }
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            if (err instanceof OffRateLimitError) {
              // Don't override a USDA rate-limit countdown if both fire.
              setRateLimitedSeconds((prev) =>
                prev ?? Math.ceil(err.retryAfterMs / 1000),
              );
              setOff([]);
              return;
            }
            if ((err as DOMException)?.name === 'AbortError') return;
            setOff([]);
          })
      : Promise.resolve(setOff([]));

    void Promise.allSettled([localPromise, usdaPromise, offPromise]).then(() => {
      if (!cancelled) setIsSearching(false);
    });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [debouncedQuery, showPackaged]);

  // ---------- Group + dedupe + rank ----------
  const grouped = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();
    const localIds = new Set(local.map((f) => f.id));
    const usdaIds = new Set(usda.map((f) => f.id));
    const offIds = new Set(off.map((f) => f.id));

    const myProducts = local.filter((f) => f.source === 'custom');

    // Common foods = bundled curated staples + USDA Foundation/SR/Survey
    // (live) + cached USDA non-branded matches. The relevance sort below
    // floats curated foods to the top of this group.
    const curated = local.filter((f) => f.source === 'curated');
    const cachedUsdaCommon = local.filter(
      (f) =>
        f.source === 'usda' &&
        f.usda_data_type !== 'branded' &&
        !usdaIds.has(f.id),
    );
    const liveUsdaCommon = usda.filter((f) => f.usda_data_type !== 'branded');
    const common = [...curated, ...liveUsdaCommon, ...cachedUsdaCommon];

    // Packaged = USDA Branded + OFF (live and cached), de-duped.
    const cachedPackaged = local.filter(
      (f) =>
        ((f.source === 'usda' && f.usda_data_type === 'branded') ||
          f.source === 'off') &&
        !usdaIds.has(f.id) &&
        !offIds.has(f.id),
    );
    const liveUsdaBranded = usda.filter((f) => f.usda_data_type === 'branded');
    const packaged = showPackaged
      ? [...liveUsdaBranded, ...off, ...cachedPackaged]
      : [];

    // Strip myProducts from common/packaged to avoid double-listing.
    const myIds = new Set(myProducts.map((f) => f.id));
    const byRelevance = (a: Food, b: Food) =>
      scoreFoodMatch(b, q) - scoreFoodMatch(a, q);
    return {
      myProducts,
      common: common.filter((f) => !myIds.has(f.id)).sort(byRelevance),
      packaged: packaged.filter((f) => !myIds.has(f.id)).sort(byRelevance),
      _localIds: localIds,
    };
  }, [local, usda, off, showPackaged, debouncedQuery]);

  return useMemo(
    () => ({
      query: debouncedQuery,
      recents: recents ?? [],
      myProducts: grouped.myProducts,
      common: grouped.common,
      packaged: grouped.packaged,
      isSearching,
      rateLimitedSeconds,
      errorBanner,
      needsUsdaKey,
      showPackaged,
    }),
    [
      debouncedQuery,
      recents,
      grouped,
      isSearching,
      rateLimitedSeconds,
      errorBanner,
      needsUsdaKey,
      showPackaged,
    ],
  );
}
