import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { searchLocalFoods } from '@/db/repos/foods';
import { recentFoodsInSection } from '@/db/repos/diary';
import { OffRateLimitError, searchOff } from '@/lib/off-api';
import type { Food, MealSection } from '@/db/types';

/**
 * Combines:
 *  - section-aware recents (foods previously logged in this section)
 *  - local search across My Products + cached OFF rows
 *  - live OFF search (rate-limited 10/min)
 *
 * OFF results are written to Dexie as source='off' so subsequent searches
 * find them locally — even offline.
 */

export interface FoodSearchResult {
  query: string;
  recents: Food[];
  local: Food[];
  off: Food[];
  isSearching: boolean;
  rateLimitedSeconds: number | null;
  offError: string | null;
}

const DEBOUNCE_MS = 350;

export function useFoodSearch(
  query: string,
  section?: MealSection,
): FoodSearchResult {
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const recents = useLiveQuery(async () => {
    if (!section) return [];
    const ids = await recentFoodsInSection(section, 6);
    if (ids.length === 0) return [];
    const rows = await db.foods.bulkGet(ids);
    return rows.filter((r): r is Food => !!r && !r.deleted_at);
  }, [section]);

  const [local, setLocal] = useState<Food[]>([]);
  const [off, setOff] = useState<Food[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [offError, setOffError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setOffError(null);
    setRateLimitedSeconds(null);

    if (!debouncedQuery) {
      setLocal([]);
      setOff([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);

    const localPromise = searchLocalFoods(debouncedQuery, 30).then((rows) => {
      if (!cancelled) setLocal(rows);
    });

    const offPromise = searchOff(debouncedQuery, ctrl.signal)
      .then(async (rows) => {
        if (cancelled) return;
        setOff(rows);
        // Cache to local for offline next-time lookup. Don't await UI on
        // this; it's fire-and-forget.
        if (rows.length > 0) {
          void db.foods.bulkPut(rows).catch(() => undefined);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof OffRateLimitError) {
          setRateLimitedSeconds(Math.ceil(err.retryAfterMs / 1000));
          setOff([]);
          return;
        }
        if ((err as DOMException)?.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Search failed';
        setOffError(msg);
        setOff([]);
      });

    void Promise.allSettled([localPromise, offPromise]).then(() => {
      if (!cancelled) setIsSearching(false);
    });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [debouncedQuery]);

  // Dedupe — an OFF row may already be in `local` (cached from a prior search).
  const dedupedOff = useMemo(() => {
    const localIds = new Set(local.map((f) => f.id));
    return off.filter((f) => !localIds.has(f.id));
  }, [off, local]);

  return useMemo(
    () => ({
      query: debouncedQuery,
      recents: recents ?? [],
      local,
      off: dedupedOff,
      isSearching,
      rateLimitedSeconds,
      offError,
    }),
    [debouncedQuery, recents, local, dedupedOff, isSearching, rateLimitedSeconds, offError],
  );
}
