import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { searchLocalFoods } from '@/db/repos/foods';
import { recentFoodsInSection } from '@/db/repos/diary';
import type { Food, MealSection } from '@/db/types';

/**
 * Combines:
 *  - section-aware recents (foods previously logged in this section)
 *  - local search across My Products + cached OFF rows
 *  - (Phase 5+) live OFF search for queries
 *
 * Phase 4 returns empty `off` results — search is local-only here.
 */

export interface FoodSearchResult {
  query: string;
  recents: Food[];
  local: Food[]; // local matches for the query (non-recent)
  off: Food[]; // remote results — empty in Phase 4
  isSearching: boolean;
}

const DEBOUNCE_MS = 250;

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
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!debouncedQuery) {
      setLocal([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    void searchLocalFoods(debouncedQuery, 30).then((rows) => {
      if (cancelled) return;
      setLocal(rows);
      setIsSearching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  return useMemo(
    () => ({
      query: debouncedQuery,
      recents: recents ?? [],
      local,
      off: [],
      isSearching,
    }),
    [debouncedQuery, recents, local, isSearching],
  );
}
