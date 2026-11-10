import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { searchLocalFoods } from '@/db/repos/foods';
import { getAliasFood } from '@/db/repos/ingredientAliases';
import { foodUsage, frequentFoods, recentFoods } from '@/db/repos/diary';
import { currentUserId } from '@/db/userId';
import { OffRateLimitError, searchOff } from '@/lib/off-api';
import { searchSharedFoods } from '@/lib/shared-foods-api';
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
import { groupSearchResults, type PersonalRank } from './searchRanking';
import type { Food } from '@/db/types';

/**
 * Combines:
 *  - local search across everything stored on the device
 *  - live USDA FoodData Central search (generic + branded)
 *  - live Open Food Facts search (rate-limited 10/min, packaged-product DB)
 *  - the community shared pool
 *
 * Grouping and ranking live in `searchRanking.ts` (pure, tested).
 *
 * Remote hits are NOT written to Dexie here. A hit becomes a stored food
 * when it is picked (`ensureFoodSaved`). Caching every hit is what buried
 * the user's own foods under dozens of identical database rows.
 */

export interface FoodSearchResult {
  query: string;
  /** Starred foods - shown first when the search box is empty. */
  favorites: Food[];
  /** Most-logged foods, de-duped against favourites. */
  frequent: Food[];
  /** The last foods logged or scanned, newest first. Nothing filtered out. */
  recents: Food[];
  /** While searching: every match that is hers (made, starred, logged,
   *  scanned, or used in a meal), ranked by how much she uses it. */
  yours: Food[];
  common: Food[];
  /** Open Food Facts products (hidden when showPackaged=false). */
  packaged: Food[];
  /** USDA brand-name rows, shown behind a "more results" tap. */
  branded: Food[];
  isSearching: boolean;
  /** Seconds until USDA / OFF rate limit clears (when one is hit). */
  rateLimitedSeconds: number | null;
  /** Source-agnostic banner for unrecoverable issues. */
  errorBanner: string | null;
  /** True when the USDA key is missing - prompts to add one in Settings. */
  needsUsdaKey: boolean;
  showPackaged: boolean;
}

const DEBOUNCE_MS = 350;
const RECENT_LIMIT = 30;
const NO_IDS: ReadonlySet<string> = new Set();

export function useFoodSearch(query: string): FoodSearchResult {
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  const [showPackaged, setShowPackaged] = useState(getShowPackaged());

  // Mirror the settings switch live.
  useEffect(() => subscribeToFoodSourceSettings(() => setShowPackaged(getShowPackaged())), []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Empty-state lists. Recents is deliberately complete: it is "the last
  // things I logged", so a staple that is also frequent still belongs in it.
  const emptyState = useLiveQuery(async () => {
    const uid = currentUserId();
    const favorites = (
      await db.foods
        .where('user_id')
        .equals(uid)
        .filter((f) => !!f.favorite && !f.deleted_at)
        .toArray()
    ).sort((a, b) => a.name.localeCompare(b.name));
    const favIds = new Set(favorites.map((f) => f.id));

    const frequent = (await db.foods.bulkGet(await frequentFoods(20))).filter(
      (f): f is Food => !!f && !f.deleted_at && !favIds.has(f.id),
    );

    const recents = (
      await db.foods.bulkGet(await recentFoods(RECENT_LIMIT))
    ).filter((f): f is Food => !!f && !f.deleted_at);

    return { favorites, frequent, recents };
  }, []);

  // What she eats, live so a food just logged immediately ranks higher.
  const usage = useLiveQuery(() => foodUsage(), [], undefined);

  // Has she already taught this exact phrase to mean a specific food?
  const [aliasFoodId, setAliasFoodId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!debouncedQuery) {
      setAliasFoodId(null);
      return;
    }
    void getAliasFood(debouncedQuery).then((f) => {
      if (!cancelled) setAliasFoodId(f?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const [local, setLocal] = useState<Food[]>([]);
  const [usda, setUsda] = useState<Food[]>([]);
  const [off, setOff] = useState<Food[]>([]);
  const [shared, setShared] = useState<Food[]>([]);
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
      setShared([]);
      setIsSearching(false);
      setNeedsUsdaKey(!getUsdaApiKey());
      return;
    }
    setIsSearching(true);

    // Read usage fresh here rather than depending on the live value, so a
    // diary change does not re-fire every remote search.
    const localPromise = foodUsage()
      .then((u) => searchLocalFoods(debouncedQuery, 30, u.usedIds))
      .then((rows) => {
        if (!cancelled) setLocal(rows);
      });

    // USDA - only if key is present.
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
            // Don't blow up the panel - local + OFF still render.
            setUsda([]);
          })
      : Promise.resolve();

    // OFF - only when packaged products are enabled.
    const offPromise = showPackaged
      ? searchOff(debouncedQuery, ctrl.signal)
          .then(async (rows) => {
            if (cancelled) return;
            setOff(rows);
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

    // Community shared pool - best-effort, merged into "common".
    const sharedPromise = searchSharedFoods(debouncedQuery, ctrl.signal).then(
      (rows) => {
        if (cancelled) return;
        setShared(rows);
      },
    );

    void Promise.allSettled([
      localPromise,
      usdaPromise,
      offPromise,
      sharedPromise,
    ]).then(() => {
      if (!cancelled) setIsSearching(false);
    });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [debouncedQuery, showPackaged]);

  // ---------- Group + dedupe + rank ----------
  const grouped = useMemo(() => {
    const personal: PersonalRank = {
      frequency: usage?.frequency ?? new Map(),
      aliasFoodId,
    };
    return groupSearchResults({
      local,
      usda,
      off,
      shared,
      query: debouncedQuery,
      personal,
      usedIds: usage?.usedIds ?? NO_IDS,
    });
  }, [local, usda, off, shared, debouncedQuery, usage, aliasFoodId]);

  return useMemo(
    () => ({
      query: debouncedQuery,
      favorites: emptyState?.favorites ?? [],
      frequent: emptyState?.frequent ?? [],
      recents: emptyState?.recents ?? [],
      yours: grouped.yours,
      common: grouped.common,
      packaged: grouped.packaged,
      branded: grouped.branded,
      isSearching,
      rateLimitedSeconds,
      errorBanner,
      needsUsdaKey,
      showPackaged,
    }),
    [
      debouncedQuery,
      emptyState,
      grouped,
      isSearching,
      rateLimitedSeconds,
      errorBanner,
      needsUsdaKey,
      showPackaged,
    ],
  );
}
