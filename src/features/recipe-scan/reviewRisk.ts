import { computeMacros } from '@/features/food-search/foodMath';
import {
  CONFIDENT_MARGIN,
  type IngredientCandidate,
} from '@/features/food-search/ingredientMatch';

/**
 * Which scanned ingredients are worth stopping for.
 *
 * The first version stopped for every match that was not certain. On a real
 * 16-ingredient soup that was 12 warnings: salt, bay leaves, garlic that
 * had matched correctly. The two that mattered (a pizza standing in for
 * chopped tomatoes at 1,064 kcal, porridge standing in for water at 825)
 * looked exactly like the ten that did not, and every one blocked the save.
 *
 * Doubt alone is not the test. What matters is doubt multiplied by how many
 * calories are riding on it: an uncertain 5 kcal cannot hurt the total, an
 * uncertain 1,000 can.
 */
export interface RiskInput {
  candidates: IngredientCandidate[];
  grams: number;
  /** The matcher is sure of its top candidate. */
  confident: boolean;
  /** Salt, herbs, spices: never worth a look. */
  negligible: boolean;
}

const kcalOf = (cand: IngredientCandidate, grams: number) =>
  computeMacros(cand.food, { mode: 'g', qty: grams }).kcal;

/**
 * The most calories that could be wrong if the top match is wrong: the
 * largest figure among the top candidate and any rival scoring close to it.
 */
export function kcalAtStake(candidates: IngredientCandidate[], grams: number): number {
  const top = candidates[0];
  if (!top) return 0;
  return Math.max(
    ...candidates
      .filter((c) => top.score - c.score < CONFIDENT_MARGIN)
      .map((c) => kcalOf(c, grams)),
  );
}

const UNKNOWN_KCAL_PER_GRAM = 4;

/** Calories below which an uncertain match is not worth a tap. */
export function lookThreshold(recipeKcal: number): number {
  return Math.max(30, recipeKcal * 0.03);
}

export function needsLook(input: RiskInput, threshold: number): boolean {
  if (input.negligible || input.confident) return false;
  // No match at all: the calories are unknown. Assume a fairly dense food
  // (4 kcal/g) so a teaspoon of something obscure is let through and a
  // cupful is not.
  if (input.candidates.length === 0) {
    return input.grams * UNKNOWN_KCAL_PER_GRAM >= threshold;
  }
  return kcalAtStake(input.candidates, input.grams) >= threshold;
}

/** Calories the current top picks add up to. */
export function recipeKcal(rows: { candidates: IngredientCandidate[]; grams: number }[]): number {
  return rows.reduce(
    (sum, r) => sum + (r.candidates[0] ? kcalOf(r.candidates[0], r.grams) : 0),
    0,
  );
}
