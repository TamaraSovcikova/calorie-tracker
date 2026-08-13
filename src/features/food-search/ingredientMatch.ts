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
  | 'frequent' // logged often (decay-weighted)
  | 'recent' // logged or scanned lately
  | 'custom' // they created it, usually off a label scan
  | 'library' // in their library but not logged lately
  | 'curated' // bundled with the app
  | 'external'; // USDA / shared pool

export const TIER_BONUS: Record<MatchTier, number> = {
  frequent: 0.6,
  recent: 0.45,
  custom: 0.3,
  library: 0.1,
  curated: 0.15,
  external: 0,
};

/** Tiers that represent "a food this user actually uses". */
export const PERSONAL_TIERS: ReadonlySet<MatchTier> = new Set<MatchTier>([
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

/** Significant (3+ char) words, punctuation stripped. */
export function sigWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3);
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
  if (short.length < 4 || !long.startsWith(short)) return false;
  return short.length / long.length >= 0.7;
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

  const extraWords = foodWords.length - matched;
  const noise = Math.min(0.3, extraWords * 0.06);
  const score = Math.max(0, coverage - noise);
  // A bare half-match on a multi-word query is noise, not a candidate:
  // "Beef steak" against "beef mince" shares only "beef" and would otherwise
  // clutter the picker with something the user has to reject every time.
  return score < MIN_NAME_SCORE ? 0 : score;
}

/** Floor a name has to clear, after the extra-word penalty, to be offered. */
const MIN_NAME_SCORE = 0.5;

/** Small nudges that break ties between similarly-named foods. */
function qualityBonus(food: Food): number {
  let b = 0;
  if (food.kcal_100 > 0) b += 0.05; // a real food beats an empty stub
  if (food.usda_data_type === 'foundation') b += 0.04;
  else if (food.usda_data_type === 'sr_legacy') b += 0.02;
  return b;
}

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
  const score =
    nameScore + TIER_BONUS[tier] + qualityBonus(food) - statePenalty(query, food.name);
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
  return out.sort((a, b) => b.score - a.score);
}

/** How far ahead the winner must be before we stop asking the user. */
const CONFIDENT_MARGIN = 0.25;
/** Below this the top match is not good enough to auto-accept. */
const CONFIDENT_MIN_SCORE = 0.9;

/**
 * Whether the top candidate can be taken without asking.
 *
 * Confident means: it is one of the user's own foods, it matches the name
 * well, and nothing else is close enough to be a real alternative. Anything
 * else opens the picker - which is the point, since the old code committed
 * silently to whatever won and that is how the bad matches shipped.
 */
export function isConfident(candidates: IngredientCandidate[]): boolean {
  const top = candidates[0];
  if (!top) return false;
  if (!PERSONAL_TIERS.has(top.tier)) return false;
  if (top.score < CONFIDENT_MIN_SCORE) return false;
  const runnerUp = candidates[1];
  if (!runnerUp) return true;
  return top.score - runnerUp.score >= CONFIDENT_MARGIN;
}
