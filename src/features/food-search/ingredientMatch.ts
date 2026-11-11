/**
 * Matching a recipe ingredient name to a real food.
 *
 * Shared by the recipe scanner, the AI meal planner and the photo food log.
 * Pure and separately tested, because the previous inline version had a bug
 * that was invisible until you read a scanned recipe's totals:
 *
 *   score used `shared / foodNameWords.length`, so a food called "Pepp"
 *   scored 1.0 against the query "peppers" (its one word fully matched)
 *   while the curated "Peppers, sweet, red, raw" scored 0.25 and was
 *   rejected by the 0.6 floor. Terse junk names beat accurate descriptive
 *   ones, every time.
 *
 * Two rules follow from that:
 *  1. Coverage is measured against the QUERY, not the food name. "How much
 *     of what I asked for is present" is the question; extra descriptive
 *     words in the food name are mild noise, not a disqualification.
 *  2. A prefix only counts as a match if it covers most of the longer word.
 *     "pepper"/"peppers" yes, "pepp"/"peppers" no.
 */

import type { Food } from '@/db/types';

/**
 * Where a candidate came from, best first. The user asked for ingredients
 * they actually buy, so what they log outranks anything generic.
 */
export type MatchTier =
  | 'alias' // the user already told us this is the one
  | 'frequent' // logged often (decay-weighted)
  | 'recent' // logged or scanned lately
  | 'custom' // they created it, usually off a label scan
  | 'library' // in their library but not logged lately
  | 'curated' // bundled with the app
  | 'external'; // USDA / shared pool

/**
 * The gap between `curated` and `library` is deliberately wide. `library`
 * includes the shared pool - foods contributed by other people - which is
 * where "Pepp", "BEEF" and "BLACK BEANS" came from. At the original 0.15 vs
 * 0.10 a terse stranger entry could out-score a sanity-checked built-in by
 * hundredths, purely because the built-in's more descriptive name paid the
 * extra-word penalty. A test caught it.
 */
export const TIER_BONUS: Record<MatchTier, number> = {
  alias: 1, // an explicit answer from the user, not a guess
  frequent: 0.6,
  recent: 0.45,
  custom: 0.3, // the user's own label scan beats a built-in
  curated: 0.25,
  library: 0.08,
  external: 0,
};

/** How a tier is described to the user, on the review row and the picker. */
export const TIER_LABEL: Record<MatchTier, string> = {
  alias: 'Your choice',
  frequent: 'You use often',
  recent: 'You used recently',
  custom: 'Your food',
  library: 'In your library',
  curated: 'Built-in estimate',
  external: 'Generic estimate',
};

/** Tiers that represent "a food this user actually uses". */
export const PERSONAL_TIERS: ReadonlySet<MatchTier> = new Set<MatchTier>([
  'alias',
  'frequent',
  'recent',
  'custom',
]);

export interface IngredientCandidate {
  food: Food;
  tier: MatchTier;
  /** 0..1, name similarity alone. */
  nameScore: number;
  /** Final ranking score, name + tier + signals. */
  score: number;
}

/**
 * French and Dutch food words, mapped to the English the recipe scanner
 * produces. Brussels supermarket products are labelled in both.
 *
 * "beef mince" and "haché de boeuf" share no characters, so no amount of
 * scoring tuning connects them - the words have to be normalised to a common
 * language first. This covers generic ingredient words only; branded product
 * names are handled by the learned aliases instead, since no word list will
 * ever contain "Carrefour Haché Pur Boeuf".
 *
 * Keys are lowercase and de-accented. A value may be several words.
 */
const FOOD_WORD_TRANSLATIONS: Readonly<Record<string, string>> = {
  // Not a translation, but the same job: one word for one thing, so a
  // recipe's "tinned" finds a food stored as "canned".
  canned: 'tinned',
  // ---- French: meat & fish ----
  boeuf: 'beef', veau: 'veal', porc: 'pork', agneau: 'lamb',
  poulet: 'chicken', dinde: 'turkey', canard: 'duck', jambon: 'ham',
  hache: 'mince', hachee: 'mince', viande: 'meat', poitrine: 'breast',
  cuisse: 'thigh', saucisse: 'sausage', lardons: 'bacon', bacon: 'bacon',
  saumon: 'salmon', thon: 'tuna', cabillaud: 'cod', crevettes: 'prawns',
  poisson: 'fish', oeuf: 'egg', oeufs: 'egg',
  // ---- French: dairy ----
  lait: 'milk', fromage: 'cheese', beurre: 'butter', creme: 'cream',
  yaourt: 'yogurt', yaourts: 'yogurt',
  // ---- French: veg & fruit ----
  tomate: 'tomato', tomates: 'tomato', oignon: 'onion', oignons: 'onion',
  ail: 'garlic', carotte: 'carrot', carottes: 'carrot',
  poivron: 'pepper', poivrons: 'pepper', pomme: 'apple', pommes: 'apple',
  patate: 'potato', patates: 'potato', epinards: 'spinach',
  haricots: 'beans', pois: 'peas', chou: 'cabbage', courgette: 'courgette',
  champignon: 'mushroom', champignons: 'mushroom', salade: 'lettuce',
  banane: 'banana', fraise: 'strawberry', fraises: 'strawberry',
  citron: 'lemon', orange: 'orange', concombre: 'cucumber',
  // ---- French: staples ----
  pain: 'bread', riz: 'rice', pates: 'pasta', farine: 'flour',
  huile: 'oil', sucre: 'sugar', sel: 'salt', poivre: 'pepper',
  lentilles: 'lentils', avoine: 'oats', miel: 'honey',
  // ---- Dutch ----
  rund: 'beef', rundvlees: 'beef', gehakt: 'mince', rundergehakt: 'beef mince',
  kip: 'chicken', kipfilet: 'chicken breast', varken: 'pork',
  varkensvlees: 'pork', zalm: 'salmon', tonijn: 'tuna', vis: 'fish',
  eieren: 'egg', ei: 'egg',
  kaas: 'cheese', melk: 'milk', boter: 'butter', room: 'cream',
  yoghurt: 'yogurt',
  ui: 'onion', uien: 'onion', knoflook: 'garlic', tomaat: 'tomato',
  tomaten: 'tomato', wortel: 'carrot', wortelen: 'carrot',
  spinazie: 'spinach', bonen: 'beans', erwten: 'peas', kool: 'cabbage',
  aardappel: 'potato', aardappelen: 'potato', sla: 'lettuce',
  komkommer: 'cucumber', appel: 'apple', banaan: 'banana',
  brood: 'bread', rijst: 'rice', bloem: 'flour', olie: 'oil',
  suiker: 'sugar', zout: 'salt', havermout: 'oats', honing: 'honey',
};

/**
 * Words that describe the AMOUNT, not the food. A recipe says "4 large
 * peppers"; the food is a pepper.
 *
 * These used to count as significant, which halved coverage on a two-word
 * query and rejected the match outright: "large pepper" scored 0 against the
 * curated "Bell pepper" while a bare "pepper" scored 0.94. Two staples in a
 * seven-ingredient recipe came back as "no match" because of it.
 *
 * Deliberately NOT here: whole, half, fresh, ripe, baby, fillet. "Whole milk"
 * is a different food from skimmed, and dropping the qualifier would make
 * them interchangeable.
 */
const QUALIFIER_WORDS: ReadonlySet<string> = new Set([
  // size
  'large', 'medium', 'small', 'big', 'extra', 'jumbo', 'mini',
  // count and measure
  'clove', 'cloves', 'slice', 'slices', 'piece', 'pieces', 'portion',
  'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons',
  'cup', 'cups', 'handful', 'pinch', 'bunch', 'sprig', 'sprigs',
  'stick', 'sticks', 'can', 'cans', 'tin', 'tins', 'packet', 'pack',
  'jar', 'bag', 'head', 'heads',
  // variety names that are the same food. "2 yellow onion" has to reach the
  // built-in Onion. Deliberately ONLY this one: red/green/white/brown tell
  // real foods apart (green beans, brown rice, white wine).
  'yellow',
  // knife work - changes the shape, not the macros
  'grated', 'chopped', 'diced', 'sliced', 'crushed', 'finely', 'roughly',
  'peeled', 'trimmed', 'shredded', 'cubed', 'halved', 'quartered', 'torn',
  'thinly', 'thickly', 'deseeded', 'cored', 'zested', 'juiced', 'washed',
  // butchery and tin handling - the same food either way
  'boneless', 'skinless', 'drained', 'rinsed', 'unsalted', 'salted',
  // filler a recipe line carries
  'optional', 'taste', 'freshly', 'approx', 'about',
]);
// Deliberately NOT knife work: minced and ground, which identify the cut of
// meat; dried and smoked, which change the food.

/**
 * Strip diacritics so "haché" and "hache" are the same token.
 *
 * Ligatures are expanded by hand first: NFD does not decompose "œ", so
 * "bœuf" was tokenising to "b" and "uf" and losing the word entirely.
 */
function deaccent(s: string): string {
  return s
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Significant (3+ char) words: lowercased, de-accented, translated out of
 * French/Dutch where known, and with amount qualifiers removed.
 *
 * Translation runs BEFORE the length filter so two-letter Dutch words like
 * "ui" (onion) and "ei" (egg) survive.
 */
export function sigWords(s: string): string[] {
  const raw = deaccent(s.toLowerCase()).match(/[a-z0-9]+/g) ?? [];
  const translated = raw.flatMap((w) => {
    const mapped = FOOD_WORD_TRANSLATIONS[w];
    return mapped ? mapped.split(' ') : [w];
  });
  const kept = translated.filter(
    (w) => w.length >= 3 && !QUALIFIER_WORDS.has(w),
  );
  // Never strip everything away: "1 large" alone should still be something.
  return kept.length > 0 ? kept : translated.filter((w) => w.length >= 3);
}

/**
 * Two words match if equal, or one is a prefix of the other AND covers at
 * least 70% of it. The ratio is the fix: without it "pepp" matched
 * "peppers", which is how a 464 kcal/100g mystery food got into a stuffed
 * pepper recipe. "pepper"/"peppers" (0.86) and "tomato"/"tomatoes" (0.75)
 * still match, which is the behaviour that was actually wanted.
 */
export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // A plain plural is the same word however short: "egg"/"eggs",
  // "oat"/"oats". Without this "3 eggs" skipped "Egg, whole, raw" and
  // landed on "Scrambled eggs".
  if (short.length >= 3 && (long === `${short}s` || long === `${short}es`)) return true;
  if (short.length < 4 || !long.startsWith(short)) return false;
  return short.length / long.length >= 0.7;
}

/**
 * Damerau-Levenshtein distance, abandoned once it exceeds `max`. The
 * transposition case matters more than the others here: "chicekn" and
 * "yoghrut" are the typos people actually make on a phone keyboard, and
 * plain Levenshtein charges 2 for them.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr: number[] = [];
  for (let i = 1; i <= a.length; i++) {
    curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      curr[j] = d;
      if (d < rowMin) rowMin = d;
    }
    // Every remaining row can only grow, so we can stop early.
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = curr;
  }
  return prev[b.length];
}

/**
 * How far off a word of this length is allowed to be. Short words get no
 * slack at all, because at 4 letters a single edit reaches a genuinely
 * different food ("oats" to "oat" to "eats").
 */
function typoBudget(len: number): number {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  return 2;
}

/**
 * wordsMatch, plus tolerance for a typo. Kept separate and opt-in: the AI
 * ingredient matcher must NOT use this, because loosening the word test is
 * exactly what let a junk ingredient called "Pepp" into a recipe.
 */
export function fuzzyWordsMatch(a: string, b: string): boolean {
  if (wordsMatch(a, b)) return true;
  const budget = typoBudget(Math.min(a.length, b.length));
  if (budget === 0) return false;
  return editDistance(a, b, budget) <= budget;
}

/**
 * The single free-text filter used by every search box in the app: the add
 * food sheet, the food library, the meal library and the in-diary meal
 * picker. Matches two ways.
 *
 *  1. Every typed token appears verbatim in the haystack. Fast, and exactly
 *     what you want while typing part of a product name.
 *  2. Every SIGNIFICANT word of the query matches a significant word of the
 *     haystack, once both sides are de-accented, translated out of French
 *     and Dutch, and stripped of filler.
 *
 * Rule 2 is why "poudre de cacao" finds a food stored as "Cacao en poudre":
 * rule 1 fails on "de", which is not in the stored name at all. It is also
 * what makes "beef" find "Hache de boeuf" and "creme" find "Crème". Each of
 * these four boxes used to carry its own substring filter, so the same query
 * behaved differently depending on which one you typed it into.
 *
 * `fuzzy` also forgives a typo per word. It is off by default and
 * meant as a SECOND pass, run only when the strict pass found nothing: a
 * search that already has good answers should never dilute them with
 * near-misses.
 */
export function matchesSearchQuery(
  haystack: string,
  query: string,
  opts: { fuzzy?: boolean } = {},
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = haystack.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every((t) => hay.includes(t))) return true;
  const queryWords = sigWords(q);
  if (queryWords.length === 0) return false;
  const hayWords = sigWords(haystack);
  if (hayWords.length === 0) return false;
  if (!opts.fuzzy) {
    return queryWords.every((qw) => hayWords.some((hw) => wordsMatch(qw, hw)));
  }
  // Compare against the literal words too, not only the translated ones.
  // The dictionary rewrites "yoghurt" to "yogurt", so a typo'd "yoghrut" is
  // one edit from what she wrote and two from what we store it as. Measuring
  // only against the translation loses the typo she actually made.
  const pool = [...new Set([...hayWords, ...rawWords(haystack)])];
  return queryWords.every((qw) => pool.some((hw) => fuzzyWordsMatch(qw, hw)));
}

/** sigWords without translation or filler-stripping: the words as written. */
function rawWords(s: string): string[] {
  return (deaccent(s.toLowerCase()).match(/[a-z0-9]+/g) ?? []).filter(
    (w) => w.length >= 3,
  );
}

/** Preparation states that materially change macros per 100g. */
const PREP_STATES = [
  'cooked',
  'boiled',
  'raw',
  'dry',
  'dried',
  'uncooked',
  'canned',
  'tinned',
  'frozen',
  'roasted',
  'baked',
  'fried',
] as const;
export type PrepState = (typeof PREP_STATES)[number];

/** Prep states named in a string, if any. */
export function prepStates(s: string): PrepState[] {
  const words = new Set(s.toLowerCase().match(/[a-z]+/g) ?? []);
  return PREP_STATES.filter((p) => words.has(p));
}

/** Groups that mean roughly the same thing for macro purposes. */
const STATE_GROUP: Record<PrepState, string> = {
  cooked: 'wet',
  boiled: 'wet',
  canned: 'wet',
  tinned: 'wet',
  raw: 'raw',
  frozen: 'raw',
  dry: 'dry',
  dried: 'dry',
  uncooked: 'dry',
  roasted: 'cooked-dry',
  baked: 'cooked-dry',
  fried: 'cooked-dry',
};

/**
 * Penalty when the query and the food disagree about preparation. Dry black
 * beans are 341 kcal/100g and cooked ones 132, so picking the wrong one is a
 * ~700 kcal error on a single ingredient. Returns 0..0.5.
 */
export function statePenalty(query: string, foodName: string): number {
  const q = prepStates(query).map((s) => STATE_GROUP[s]);
  const f = prepStates(foodName).map((s) => STATE_GROUP[s]);
  if (q.length === 0 || f.length === 0) return 0;
  return q.some((g) => f.includes(g)) ? 0 : 0.5;
}

/**
 * How far a cooked entry drops behind its raw twin when the ingredient
 * names no state. Enough to settle it without a warning.
 */
const UNSTATED_COOKED_PENALTY = 0.25;

/** Is this food stated as cooked (not raw, dry, or simply tinned)? */
function isCookedEntry(foodName: string): boolean {
  return prepStates(foodName).some(
    (s) =>
      STATE_GROUP[s] !== 'raw' &&
      STATE_GROUP[s] !== 'dry' &&
      s !== 'canned' &&
      s !== 'tinned',
  );
}

/** The food's name with its preparation words removed, as a key. */
function stateFreeKey(foodName: string): string {
  const states: ReadonlySet<string> = new Set(PREP_STATES);
  return sigWords(foodName)
    .filter((w) => !states.has(w))
    .sort()
    .join(' ');
}

/**
 * 0..1 name similarity. 0 means "not a plausible match at all".
 *
 * Coverage (how much of the query the food accounts for) drives the score.
 * Extra words in the food name cost a little, so "Beef mince, 5% fat" still
 * beats "Beef mince and onion casserole" for the query "beef mince", but
 * neither is thrown out the way the old recall floor threw them out.
 */
export function nameMatchScore(foodName: string, query: string): number {
  const fname = foodName.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!fname || !q) return 0;
  if (fname === q) return 1;

  const queryWords = sigWords(q);
  const foodWords = sigWords(fname);
  if (queryWords.length === 0 || foodWords.length === 0) return 0;

  let matched = 0;
  const usedFood = new Set<number>();
  for (const qw of queryWords) {
    const idx = foodWords.findIndex(
      (fw, i) => !usedFood.has(i) && wordsMatch(qw, fw),
    );
    if (idx >= 0) {
      usedFood.add(idx);
      matched += 1;
    }
  }
  if (matched === 0) return 0;

  const coverage = matched / queryWords.length;
  // At least half of what was asked for has to be present.
  if (coverage < 0.5) return 0;

  // Extra words cost, but not all equally. "canned", "raw", "fresh" say how
  // the same food comes; "bell" in "Bell pepper" says which food it is.
  const extras = foodWords.filter((_, i) => !usedFood.has(i));
  const descriptors = extras.filter((w) => DESCRIPTOR_WORDS.has(w)).length;
  const noise = Math.min(0.3, descriptors * 0.02 + (extras.length - descriptors) * 0.06);
  const score = Math.max(0, coverage - noise);
  // A bare half-match on a multi-word query is noise, not a candidate:
  // "Beef steak" against "beef mince" shares only "beef" and would otherwise
  // clutter the picker with something the user has to reject every time.
  return score < MIN_NAME_SCORE ? 0 : score;
}

/** Words that describe how a food comes without changing which food it is. */
const DESCRIPTOR_WORDS: ReadonlySet<string> = new Set([
  'raw', 'fresh', 'frozen', 'whole', 'plain', 'natural', 'lean', 'cooked',
  'boiled', 'dried', 'dry', 'uncooked', 'ground', 'organic', 'average',
  'generic', 'unsweetened', 'rolled',
  // Deliberately NOT tinned: fresh tomatoes and tinned ones are different
  // answers to "3 tomatoes", so a tinned entry is not a near-exact match.
]);

/** Floor a name has to clear, after the extra-word penalty, to be offered. */
const MIN_NAME_SCORE = 0.5;

/** Score for a food the user explicitly chose for this phrase before. Above
 *  anything the scorer can produce, because it is an answer, not a guess. */
export const ALIAS_SCORE = 2;

/**
 * Words naming a processed FORM of an ingredient. Tomato puree is ~80
 * kcal/100g against a fresh tomato's 18, so matching "tomato puree" to
 * "Tomato" is a wrong answer dressed as a near one - it reported 5 kcal for
 * 30 g when the truth is nearer 24. Peanut butter vs peanut, almond flour vs
 * almonds and coconut milk vs coconut are the same trap.
 */
const FORM_WORDS: ReadonlySet<string> = new Set([
  'puree', 'paste', 'powder', 'powdered', 'concentrate', 'sauce', 'juice',
  'oil', 'syrup', 'extract', 'flour', 'butter', 'milk', 'cream', 'stock',
  'broth', 'dressing', 'spread',
]);

function formsIn(s: string): Set<string> {
  const words = new Set(deaccent(s.toLowerCase()).match(/[a-z]+/g) ?? []);
  return new Set([...FORM_WORDS].filter((f) => words.has(f)));
}

/**
 * Penalty when one side names a processed form the other does not. Asking
 * for the form and getting the raw ingredient is the worse error, so it
 * costs more than the reverse. Returns 0..0.45.
 */
export function formPenalty(query: string, foodName: string): number {
  const q = formsIn(query);
  const f = formsIn(foodName);
  if (q.size === 0 && f.size === 0) return 0;
  const shared = [...q].some((w) => f.has(w));
  if (shared) return 0;
  if (q.size > 0 && f.size === 0) return 0.45; // asked for puree, got tomato
  if (f.size > 0 && q.size === 0) return 0.2; // asked for tomato, got puree
  return 0.45; // both name a form, and they disagree
}

/**
 * Words that name a DISH or a made product. When the food has one and the
 * ingredient asked for does not, it is a different food that merely
 * contains the ingredient: "chopped tomatoes" is not "Pizza, cheese &
 * tomato", "water" is not "Porridge, cooked with water", "garlic" is not
 * "Garlic bread". Before this, each of those cost 0.06 as "an extra word"
 * and the pizza won a real scan on the strength of having been logged
 * recently, adding 1,064 kcal to a soup.
 *
 * Deliberately NOT here: cheese, seeds, vinegar, yogurt, flakes. A recipe
 * says "feta", "sesame", "balsamic" and means the food whose name ends in
 * one of those.
 */
const DISH_WORDS: ReadonlySet<string> = new Set([
  'pizza', 'porridge', 'bread', 'soup', 'stew', 'pie', 'cake', 'ketchup',
  'salad', 'sandwich', 'burger', 'curry', 'lasagne', 'lasagna', 'casserole',
  'smoothie', 'jam', 'crisps', 'chips', 'biscuit', 'cookie', 'bar', 'cereal',
  'muffin', 'pancake', 'omelette', 'quiche', 'risotto', 'gravy', 'sausage',
  'nugget', 'kebab', 'cracker', 'dip', 'hummus', 'houmous', 'pesto', 'mayo',
  'mayonnaise', 'marinade', 'seasoning', 'wrap', 'roll', 'toast', 'bake',
  'noodle', 'dumpling', 'chocolate', 'drink',
  'tea', 'coffee', 'wine', 'beer', 'pickle', 'pickled', 'relish',
  'chutney', 'salsa', 'tart', 'crumble', 'pudding', 'custard', 'granola',
  'muesli', 'bagel', 'croissant', 'pastry', 'fritter',
  'meatball', 'pasty', 'tortilla', 'taco', 'burrito', 'ramen', 'sushi',
]);

/**
 * Penalty for a food that is a dish built around the ingredient rather than
 * the ingredient. 0.4 per dish word the query did not ask for, capped so a
 * long product name is not punished twice over. Returns 0..0.6.
 */
export function dishPenalty(query: string, foodName: string): number {
  const q = sigWords(query);
  const extra = sigWords(foodName).filter(
    (fw) =>
      [...DISH_WORDS].some((d) => wordsMatch(fw, d)) &&
      !q.some((qw) => wordsMatch(qw, fw)),
  );
  return Math.min(0.6, extra.length * 0.4);
}

/**
 * Pantry items that are worth no decision at all.
 *
 *  - 'water' is not an ingredient for calorie purposes. It is dropped.
 *  - 'negligible' covers salt, pepper, dried herbs, spices and raising
 *    agents: a few grams, a few calories. Whatever they resolve to cannot
 *    move the total, so they are never worth a warning.
 *
 * Returns null for anything that deserves real matching.
 */
export function pantryClass(name: string): 'water' | 'negligible' | null {
  const words = sigWords(name);
  if (words.length === 0) return null;
  if (words.every((w) => WATER_WORDS.has(w))) return 'water';
  // A real food that happens to carry a seasoning word is not seasoning:
  // "pepper steak", "garlic and herb chicken", "salted butter".
  if (words.some((w) => [...NOT_SEASONING].some((n) => wordsMatch(w, n)))) return null;
  if (words.includes('pepper')) {
    // Bare "pepper" in a recipe can be a bell pepper. Only the ground kind.
    return words.some((w) => PEPPER_KINDS.has(w)) ? 'negligible' : null;
  }
  return words.some((w) => [...SEASONINGS].some((x) => wordsMatch(w, x)))
    ? 'negligible'
    : null;
}

const WATER_WORDS: ReadonlySet<string> = new Set([
  'water', 'cold', 'hot', 'warm', 'boiling', 'boiled', 'tap', 'ice',
]);
const PEPPER_KINDS: ReadonlySet<string> = new Set([
  'black', 'white', 'ground', 'cracked', 'peppercorn', 'peppercorns', 'cayenne',
]);
const SEASONINGS: ReadonlySet<string> = new Set([
  'salt', 'peppercorn', 'rosemary', 'thyme', 'oregano', 'basil', 'parsley',
  'sage', 'dill', 'mint', 'coriander', 'cilantro', 'chives', 'tarragon',
  'marjoram', 'bay', 'paprika', 'cumin', 'turmeric', 'cinnamon', 'nutmeg',
  'cayenne', 'allspice', 'cardamom', 'saffron', 'masala', 'herbs', 'spice',
  'seasoning', 'bicarbonate', 'yeast', 'vanilla',
]);
/** Words that make it a food in its own right, seasoning word or not. */
const NOT_SEASONING: ReadonlySet<string> = new Set([
  'chicken', 'beef', 'pork', 'lamb', 'fish', 'steak', 'butter', 'cheese',
  'bread', 'sauce', 'oil', 'cream', 'yogurt', 'nuts', 'peanuts', 'crisps',
  'tea', 'chocolate', 'sugar',
]);

/** Small nudges that break ties between similarly-named foods. */
function qualityBonus(food: Food): number {
  let b = 0;
  if (food.usda_data_type === 'foundation') b += 0.04;
  else if (food.usda_data_type === 'sr_legacy') b += 0.02;
  return b;
}

/**
 * A food with no calories carries no information. These are almost always
 * blank stubs - the old recipe scanner created one for every ingredient it
 * could not match, so libraries are littered with them. One such stub
 * ("Garlic", 0 kcal) outranked the real curated Garlic at 149 kcal/100g,
 * because the custom-tier bonus exactly cancelled the old +0.05 for having
 * macros. A stub should lose to anything real, so it is a penalty now.
 */
const BLANK_FOOD_PENALTY = 0.5;

/**
 * Score one candidate. Exported so the tier weighting is testable on its own.
 */
export function candidateScore(
  food: Food,
  tier: MatchTier,
  query: string,
): number {
  const nameScore = nameMatchScore(food.name, query);
  if (nameScore === 0) return 0;
  // A dish built around the ingredient is not a weaker match, it is a
  // wrong one. If the penalty takes it under the floor it is not offered.
  const matched = nameScore - dishPenalty(query, food.name);
  if (matched < MIN_NAME_SCORE) return 0;
  // "You use this" only means something when it IS this. The personal
  // bonus fades out as the name match weakens, so a recently logged food
  // cannot ride a loose match past the right built-in.
  const closeness = PERSONAL_TIERS.has(tier)
    ? Math.min(1, Math.max(0, (matched - MIN_NAME_SCORE) / (0.9 - MIN_NAME_SCORE)))
    : 1;
  const score =
    matched +
    TIER_BONUS[tier] * closeness +
    qualityBonus(food) -
    statePenalty(query, food.name) -
    formPenalty(query, food.name) -
    // A built-in at 0 kcal (salt) is a fact, not a stub.
    (food.kcal_100 > 0 || tier === 'curated' ? 0 : BLANK_FOOD_PENALTY);
  return Math.max(0, score);
}

/**
 * Rank every food that plausibly matches `query`, best first.
 * `tierOf` says which tier a food belongs to; foods scoring 0 are dropped.
 */
export function rankCandidates(
  foods: Food[],
  query: string,
  tierOf: (food: Food) => MatchTier,
): IngredientCandidate[] {
  const out: IngredientCandidate[] = [];
  for (const food of foods) {
    const tier = tierOf(food);
    const score = candidateScore(food, tier, query);
    if (score <= 0) continue;
    out.push({ food, tier, nameScore: nameMatchScore(food.name, query), score });
  }
  // A recipe that just says "1 kg chicken thighs" means them as bought, and
  // cooked meat is far denser (thigh: 121 kcal raw, 209 cooked). So when
  // the ingredient names no state and the SAME food is on offer both raw
  // and cooked, the cooked one steps back. Done here rather than per food
  // because it only applies when there is a raw twin to prefer: many
  // built-ins exist only as "cooked", and those must not lose to junk.
  if (prepStates(query).length === 0) {
    const hasUncooked = new Set(
      out
        // Only a twin worth trusting counts. A stray database row called
        // "BEEF MINCE" must not push the built-in cooked mince down.
        .filter(
          (c) =>
            !isCookedEntry(c.food.name) &&
            (c.tier === 'curated' || PERSONAL_TIERS.has(c.tier)),
        )
        .map((c) => stateFreeKey(c.food.name)),
    );
    for (const c of out) {
      if (isCookedEntry(c.food.name) && hasUncooked.has(stateFreeKey(c.food.name))) {
        c.score = Math.max(0.01, c.score - UNSTATED_COOKED_PENALTY);
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** What the user has logged, for tier resolution. Ids, not foods. */
export interface PersonalHistory {
  /** Logged often, decay-weighted. */
  frequentIds: ReadonlySet<string>;
  /** Logged or scanned lately. */
  recentIds: ReadonlySet<string>;
}

/**
 * Which tier a food belongs to. Pure and exported so the ordering that the
 * whole feature rests on ("prefer what I actually buy") is testable without
 * a database - it used to live as an inline closure and was the one part of
 * the pipeline with no coverage.
 *
 * Frequent beats recent deliberately: a mince bought weekly should outrank
 * a barcode scanned once in a shop.
 */
export function resolveTier(food: Food, history: PersonalHistory): MatchTier {
  if (history.frequentIds.has(food.id)) return 'frequent';
  if (history.recentIds.has(food.id)) return 'recent';
  if (food.source === 'custom') return 'custom';
  if (food.source === 'curated') return 'curated';
  return 'library';
}

/**
 * Rank a library against an ingredient name. The whole local matching
 * pipeline in one pure call; the Dexie side only has to supply the rows.
 */
export function rankLibraryCandidates(
  foods: Food[],
  query: string,
  history: PersonalHistory,
): IngredientCandidate[] {
  return rankCandidates(foods, query, (f) => resolveTier(f, history));
}

/** How far ahead the winner must be before we stop asking the user. */
export const CONFIDENT_MARGIN = 0.25;
/** Below this the top match is not good enough to auto-accept. */
const CONFIDENT_MIN_SCORE = 0.9;

export interface ConfidenceContext {
  /**
   * Whether this user has enough logging history for "one of your foods" to
   * mean anything. Without it, nothing can ever reach a personal tier, so a
   * fresh install would flag EVERY ingredient - a twelve-ingredient recipe
   * would open as twelve warnings, which reads as broken rather than
   * careful. With no history, a strong curated match is accepted instead.
   */
  hasPersonalHistory: boolean;
}

/**
 * Whether the top candidate can be taken without asking.
 *
 * Confident means: it matches the name well, nothing else is close enough to
 * be a real alternative, and it comes from a source worth trusting silently.
 * Anything else opens the picker - which is the point, since the old code
 * committed to whatever won and that is how the bad matches shipped.
 *
 * `external` (USDA / shared pool) is never confident. That is where the junk
 * came from, and a generic estimate is exactly the case worth a glance.
 */
export function isConfident(
  candidates: IngredientCandidate[],
  ctx: ConfidenceContext = { hasPersonalHistory: true },
): boolean {
  const top = candidates[0];
  if (!top) return false;
  // An exact name match to a sanity-checked built-in is not uncertainty.
  // Flagging "large onion" -> "Onion" alongside genuine ambiguity trains the
  // user to tap past the warning, which defeats it.
  // "Cannellini beans, canned" for "cannellini beans" is the same food with
  // descriptors on the end (0.96+); "Bell pepper" for "pepper" (0.94) is not.
  const exactCurated = top.tier === 'curated' && top.nameScore >= 0.955;
  const trusted =
    PERSONAL_TIERS.has(top.tier) ||
    exactCurated ||
    (!ctx.hasPersonalHistory && top.tier === 'curated');
  if (!trusted) return false;
  if (top.score < CONFIDENT_MIN_SCORE) return false;
  // Only a rival worth trusting can cast doubt on a trusted winner. A row
  // from a database or an unused product scoring close behind the built-in
  // is the same food with different paperwork, not a real alternative.
  // It also has to match the name about as well. "Spring onion" behind an
  // exact "Onion" is a different, more specific food, not a rival reading.
  const runnerUp = candidates
    .slice(1)
    .find(
      (c) =>
        (PERSONAL_TIERS.has(c.tier) || c.tier === 'curated') &&
        c.nameScore >= top.nameScore - 0.015,
    );
  if (!runnerUp) return true;
  return top.score - runnerUp.score >= CONFIDENT_MARGIN;
}

/**
 * Whether a stored food may be offered as an ingredient match. Anything the
 * user made, starred or has used qualifies, as do the built-ins and USDA
 * generics. A packaged or community row she has never touched does not.
 */
export function isMatchable(food: Food, usedIds: ReadonlySet<string>): boolean {
  if (usedIds.has(food.id) || food.favorite) return true;
  if (food.source === 'custom' || food.source === 'curated') return true;
  return food.source === 'usda' && food.usda_data_type !== 'branded';
}
