import { fuzzyWordsMatch, sigWords, wordsMatch } from './ingredientMatch';
import type { Food } from '@/db/types';

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

export function scoreFoodMatch(
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


/**
 * Is this food "hers"? Anything she made, starred, logged, scanned, or put
 * in a meal. These are the rows a search must never lose.
 */
export function isOwnFood(food: Food, usedIds: ReadonlySet<string>): boolean {
  return food.source === 'custom' || !!food.favorite || usedIds.has(food.id);
}

/**
 * Ranking inside the "Yours" group. Name match still matters, but what she
 * actually eats matters more: typing "rice" should put the long grain rice
 * she logs daily above a "Rice" she touched once. The general frequency
 * boost is capped at 320 so one staple cannot bury a database; here every
 * row is already hers, so the cap is lifted.
 */
export function ownFoodScore(food: Food, q: string, personal: PersonalRank): number {
  const freq = personal.frequency.get(food.id) ?? 0;
  return (
    scoreFoodMatch(food, q, personal) +
    Math.min(1400, 350 * Math.log2(1 + freq)) +
    (food.favorite ? 150 : 0)
  );
}

/** Same product, different database row: same name and brand once folded. */
export function foodNameKey(food: Food): string {
  const fold = (v: string | undefined) =>
    (v ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${fold(food.name)}|${fold(food.brand)}`;
}

export interface GroupInput {
  /** Local matches (already filtered to the query). */
  local: Food[];
  /** Live remote hits. */
  usda: Food[];
  off: Food[];
  shared: Food[];
  query: string;
  personal: PersonalRank;
  /** Ids of foods she has logged, scanned or used in a meal. */
  usedIds: ReadonlySet<string>;
}

export interface GroupedResults {
  /** Everything of hers that matches, best first. Never truncated. */
  yours: Food[];
  /** Generic foods: curated staples, USDA generics, the shared pool. */
  common: Food[];
  /** Packaged products from Open Food Facts. */
  packaged: Food[];
  /** USDA brand-name rows. Noisy, so the UI keeps them behind a tap. */
  branded: Food[];
}

/**
 * Turn the raw result lists into the groups the panel shows.
 *
 * Three rules, each one a bug this replaced:
 *  - A food of hers always shows, in "Yours", whatever its source. It used
 *    to show only while it was among her 50 most recent foods.
 *  - A database row she has never touched never sits above one of hers.
 *  - Rows that are the same product by name and brand are shown once.
 */
export function groupSearchResults(input: GroupInput): GroupedResults {
  const q = input.query.toLowerCase().trim();
  const { personal, usedIds } = input;

  // A live hit can be a food she already owns (same id). Her stored row
  // wins: it carries her favourite flag and any edits.
  const byId = new Map<string, Food>();
  for (const f of [...input.usda, ...input.off, ...input.shared]) {
    if (!byId.has(f.id)) byId.set(f.id, f);
  }
  for (const f of input.local) byId.set(f.id, f);
  const all = [...byId.values()];

  const yours = all
    .filter((f) => isOwnFood(f, usedIds))
    .sort((a, b) => ownFoodScore(b, q, personal) - ownFoodScore(a, q, personal));
  const yoursIds = new Set(yours.map((f) => f.id));
  const takenKeys = new Set(yours.map(foodNameKey));

  const byRelevance = (a: Food, b: Food) =>
    scoreFoodMatch(b, q, personal) - scoreFoodMatch(a, q, personal);
  /** Best-first, minus her foods, minus rows repeating a name already shown. */
  const finish = (rows: Food[]) => {
    const out: Food[] = [];
    for (const f of rows.filter((r) => !yoursIds.has(r.id)).sort(byRelevance)) {
      const key = foodNameKey(f);
      if (takenKeys.has(key)) continue;
      takenKeys.add(key);
      out.push(f);
    }
    return out;
  };

  const isBranded = (f: Food) =>
    f.source === 'usda' && f.usda_data_type === 'branded';
  // Order matters: each group claims its names before the next one.
  const common = finish(
    all.filter(
      (f) =>
        f.source === 'curated' ||
        f.source === 'shared' ||
        (f.source === 'usda' && !isBranded(f)),
    ),
  );
  // Only LIVE packaged hits. A cached packaged row she never used is noise.
  const liveIds = new Set([...input.usda, ...input.off].map((f) => f.id));
  const packaged = finish(
    all.filter((f) => f.source === 'off' && liveIds.has(f.id)),
  );
  const branded = finish(all.filter((f) => isBranded(f) && liveIds.has(f.id)));

  return { yours, common, packaged, branded };
}
