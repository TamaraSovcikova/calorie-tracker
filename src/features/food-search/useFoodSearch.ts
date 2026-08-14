import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { searchLocalFoods } from '@/db/repos/foods';
import { fuzzyWordsMatch, sigWords, wordsMatch } from './ingredientMatch';
import { getAliasFood } from '@/db/repos/ingredientAliases';
import {
  foodFrequencyScores,
  frequentFoods,
  recentFoods,
} from '@/db/repos/diary';
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
import type { Food } from '@/db/types';

/**
 * Combines:
 *  - recents (the last ~50 foods logged, across all sections)
 *  - local search across My Products + cached USDA/OFF rows
 *  - live USDA FoodData Central search (generic + branded)
 *  - live Open Food Facts search (rate-limited 10/min, packaged-product DB)
 *
 * Result groups returned to the UI:
 *   recents       - last ~50 foods logged, any section
 *   myProducts    - user's manually-added products (source='custom')
 *   common        - USDA Foundation / SR Legacy / Survey (FNDDS)
 *   packaged      - USDA Branded + OFF (hidden when showPackaged=false)
 *
 * All search hits are also written to Dexie so subsequent searches resolve
 * locally - even offline.
 */

export interface FoodSearchResult {
  query: string;
  /** Starred foods - shown first when the search box is empty. */
  favorites: Food[];
  /** Most-logged foods, de-duped against favourites. */
  frequent: Food[];
  recents: Food[];
  /** While searching: result foods the user has logged before. */
  recentMatches: Food[];
  myProducts: Food[];
  /** Packaged foods already in the user's library (scanned / cached). Always
   *  shown, regardless of the show-packaged toggle. */
  library: Food[];
  common: Food[];
  packaged: Food[];
  isSearching: boolean;
  rateLimitedSeconds: number | null;
  /** Source-agnostic banner for unrecoverable issues. */
  errorBanner: string | null;
  /** True when the USDA key is missing - prompts to add one in Settings. */
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
/**
 * Signals about this particular user, mixed into ranking so results are
 * ordered by what SHE eats rather than by dataset alone. Without these the
 * search treats a food she logs four times a week exactly like one she has
 * never touched, as long as the names score the same.
 */
export interface PersonalRank {
  /** Time-decayed log count per food id. */
  frequency: Map<string, number>;
  /** Food id she has explicitly taught this exact query to mean. */
  aliasFoodId: string | null;
}

const NO_PERSONAL: PersonalRank = { frequency: new Map(), aliasFoodId: null };

function scoreFoodMatch(
  food: Food,
  q: string,
  personal: PersonalRank = NO_PERSONAL,
): number {
  if (!q) return 0;
  const name = food.name.toLowerCase();
  const hay = `${name} ${(food.brand ?? '').toLowerCase()}`.trim();
  const tokens = q.split(/\s+/).filter(Boolean);
  let score = 0;

  // Whole-query signals on the name (exact > prefix > contained anywhere).
  if (name === q) score += 1000;
  else if (name.startsWith(q)) score += 500;
  else if (hay.includes(q)) score += 120;

  // Per-token coverage so multi-word / out-of-order queries rank sensibly:
  // "whey protein" should beat "protein bar" for "Gold Standard Whey
  // Protein". Word-boundary hits beat prefix hits beat anywhere-substring.
  const nameWords = name.split(/[^a-z0-9]+/).filter(Boolean);
  let tokenHits = 0;
  for (const t of tokens) {
    if (nameWords.includes(t)) {
      score += 120;
      tokenHits++;
    } else if (nameWords.some((w) => w.startsWith(t))) {
      score += 70;
      tokenHits++;
    } else if (hay.includes(t)) {
      score += 30;
      tokenHits++;
    }
  }
  if (tokens.length > 0 && tokenHits === tokens.length) score += 150;

  // Cross-language and word-order hits. The raw scoring above compares
  // characters, so a French-named product scores 0 for an English query even
  // when searchLocalFoods correctly surfaced it - it would then sort to the
  // bottom under everything irrelevant. Comparing normalised words (accents
  // folded, French and Dutch mapped to English, filler dropped) is what lets
  // "beef" rank a "Hache de boeuf" and "poudre de cacao" rank a food stored
  // as "Cacao en poudre".
  const qWords = sigWords(q);
  if (qWords.length > 0) {
    const fWords = sigWords(`${name} ${food.brand ?? ''}`);
    let normHits = 0;
    let fuzzyHits = 0;
    for (const qw of qWords) {
      if (fWords.some((fw) => wordsMatch(qw, fw))) normHits++;
      else if (fWords.some((fw) => fuzzyWordsMatch(qw, fw))) fuzzyHits++;
    }
    if (normHits > 0) {
      score += 60 * normHits;
      if (normHits === qWords.length) score += 140;
    }
    // A typo-corrected hit counts, but at a third of the weight, so a real
    // match always outranks a guess at what was meant.
    score += 20 * fuzzyHits;
  }

  // Dataset quality: curated staples + the user's own products rank above
  // clean USDA generics, which rank above composite Survey dishes.
  if (food.source === 'curated') score += 450;
  else if (food.source === 'custom') score += 300;
  else if (food.source === 'shared') score += 180; // community-contributed
  else if (food.usda_data_type === 'foundation') score += 250;
  else if (food.usda_data_type === 'sr_legacy') score += 200;
  else if (food.usda_data_type === 'survey') score -= 30; // composite dishes rank below single ingredients

  // Prefer simple ingredient-like names: a longer name for a short query
  // usually means it's a composite dish ("Chicken noodle casserole") not
  // a raw ingredient ("Chicken breast"). Penalise proportionally.
  if (tokens.length <= 2 && nameWords.length > 4) {
    score -= (nameWords.length - 4) * 12;
  }

  // What you actually eat. The decayed log count is compressed with a log
  // curve so a daily staple clearly wins, without one food eaten thirty
  // times burying everything else forever.
  const freq = personal.frequency.get(food.id) ?? 0;
  if (freq > 0) score += Math.min(320, 110 * Math.log2(1 + freq));

  // An alias is the strongest personal signal there is: she was shown a
  // list for this exact phrase and picked this food by hand.
  if (personal.aliasFoodId && food.id === personal.aliasFoodId) score += 900;

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

  // Empty-state lists (favourites / frequent / recents), computed together
  // so each food shows in exactly one group: favourites > frequent > recent.
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
    const freqIds = new Set(frequent.map((f) => f.id));

    const recentIdList = await recentFoods(50);
    const recentIdSet = new Set(recentIdList);
    const recents = (await db.foods.bulkGet(recentIdList)).filter(
      (f): f is Food =>
        !!f && !f.deleted_at && !favIds.has(f.id) && !freqIds.has(f.id),
    );

    return { favorites, frequent, recents, recentIdSet };
  }, []);

  // Decayed log counts, live so a food just logged immediately ranks higher.
  const frequency = useLiveQuery(() => foodFrequencyScores(), [], undefined);

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

    const localPromise = searchLocalFoods(debouncedQuery, 30).then((rows) => {
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

    // Community shared pool - best-effort, merged into "common".
    const sharedPromise = searchSharedFoods(debouncedQuery, ctrl.signal).then(
      (rows) => {
        if (cancelled) return;
        setShared(rows);
        if (rows.length > 0) void db.foods.bulkPut(rows).catch(() => undefined);
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
    const q = debouncedQuery.toLowerCase().trim();
    const usdaIds = new Set(usda.map((f) => f.id));

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
    // Community shared foods: the live remote hits, plus any cached locally
    // that the live call didn't return (deduped by id).
    const sharedIds = new Set(shared.map((f) => f.id));
    const cachedShared = local.filter(
      (f) => f.source === 'shared' && !sharedIds.has(f.id),
    );
    const common = [
      ...curated,
      ...liveUsdaCommon,
      ...cachedUsdaCommon,
      ...shared,
      ...cachedShared,
    ];

    // Extract recentIdSet early - used both to gate the library group and
    // to build the recentMatches group.
    const recentIdSet = emptyState?.recentIdSet ?? new Set<string>();

    // Foods the user has explicitly logged before that happen to be packaged.
    // Narrowed to recentIdSet so API-cached search results that the user has
    // never interacted with don't appear in the high-priority "Saved & scanned"
    // slot.
    const localPackaged = local.filter(
      (f) =>
        (f.source === 'off' ||
          (f.source === 'usda' && f.usda_data_type === 'branded')) &&
        recentIdSet.has(f.id),
    );
    const localPackagedIds = new Set(localPackaged.map((f) => f.id));

    // Live remote packaged hits (USDA Branded + OFF), minus what the user
    // has already logged locally. Gated by the show-packaged toggle.
    const liveUsdaBranded = usda.filter((f) => f.usda_data_type === 'branded');
    const livePackaged = [...liveUsdaBranded, ...off].filter(
      (f) => !localPackagedIds.has(f.id),
    );

    const myIds = new Set(myProducts.map((f) => f.id));
    const personal: PersonalRank = {
      frequency: frequency ?? new Map(),
      aliasFoodId,
    };
    const byRelevance = (a: Food, b: Food) =>
      scoreFoodMatch(b, q, personal) - scoreFoodMatch(a, q, personal);
    const commonNoMine = common.filter((f) => !myIds.has(f.id));
    const libraryNoMine = localPackaged.filter((f) => !myIds.has(f.id));
    const packagedNoMine = livePackaged.filter((f) => !myIds.has(f.id));

    // Pull recently-logged foods into their own group, just behind My Products.
    const seenRecent = new Set<string>();
    const recentMatches: Food[] = [];
    for (const f of [...commonNoMine, ...libraryNoMine, ...packagedNoMine]) {
      if (recentIdSet.has(f.id) && !seenRecent.has(f.id)) {
        seenRecent.add(f.id);
        recentMatches.push(f);
      }
    }
    return {
      myProducts: [...myProducts].sort(byRelevance),
      recentMatches: recentMatches.sort(byRelevance),
      library: libraryNoMine.filter((f) => !seenRecent.has(f.id)).sort(byRelevance),
      common: commonNoMine.filter((f) => !seenRecent.has(f.id)).sort(byRelevance),
      packaged: packagedNoMine
        .filter((f) => !seenRecent.has(f.id))
        .sort(byRelevance),
    };
  }, [
    local,
    usda,
    off,
    shared,
    debouncedQuery,
    emptyState,
    frequency,
    aliasFoodId,
  ]);

  return useMemo(
    () => ({
      query: debouncedQuery,
      favorites: emptyState?.favorites ?? [],
      frequent: emptyState?.frequent ?? [],
      recents: emptyState?.recents ?? [],
      recentMatches: grouped.recentMatches,
      myProducts: grouped.myProducts,
      library: grouped.library,
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
