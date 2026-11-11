import type { Food } from '@/db/types';

/**
 * Side-by-side product comparison.
 *
 * Reading two labels in a shop fails for a boring reason: every pack states
 * its numbers for a different serving. The fix is to put every product on
 * the SAME footing and let the footing be chosen:
 *  - per 100 g: the label basis, like for like;
 *  - per pack:  what buying it actually gets you;
 *  - to hit a protein target: how much of each you would have to eat for,
 *    say, 30 g of protein, and what calories and cost come with that;
 *  - to hit a calorie target: the same, for a fixed number of calories.
 *
 * The last two answer the real question ("is the high-protein one worth
 * three times the price, or do I just eat more of the cheap one?").
 */
export type Basis =
  | { kind: 'per100' }
  | { kind: 'pack' }
  | { kind: 'protein'; target: number }
  | { kind: 'kcal'; target: number };

export interface PriceInfo {
  /** Price of one pack. */
  price?: number;
  /** Grams in one pack. */
  pack_g?: number;
}

export interface ComparedProduct {
  /** Grams this basis works out to. Null when it cannot be worked out:
   *  no pack size, or a food with none of the target nutrient. */
  grams: number | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  /** Cost of `grams`. Null without a price and pack size. */
  cost: number | null;
  /** Price per 100 g. Independent of the basis. */
  costPer100: number | null;
  /** Price of 10 g of protein. Independent of the basis. */
  costPer10gProtein: number | null;
}

const positive = (n: number | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

export function gramsFor(food: Food, basis: Basis, price: PriceInfo): number | null {
  switch (basis.kind) {
    case 'per100':
      return 100;
    case 'pack':
      return positive(price.pack_g) ? price.pack_g : null;
    case 'protein':
      return positive(food.protein_100) && positive(basis.target)
        ? (basis.target / food.protein_100) * 100
        : null;
    case 'kcal':
      return positive(food.kcal_100) && positive(basis.target)
        ? (basis.target / food.kcal_100) * 100
        : null;
  }
}

export function compareProduct(
  food: Food,
  basis: Basis,
  price: PriceInfo = {},
): ComparedProduct {
  const perGram =
    positive(price.price) && positive(price.pack_g)
      ? price.price / price.pack_g
      : null;
  const grams = gramsFor(food, basis, price);
  const at = (per100: number) => (grams === null ? null : (per100 * grams) / 100);
  return {
    grams,
    kcal: at(food.kcal_100),
    protein: at(food.protein_100),
    carbs: at(food.carbs_100),
    fat: at(food.fat_100),
    cost: grams === null || perGram === null ? null : perGram * grams,
    costPer100: perGram === null ? null : perGram * 100,
    costPer10gProtein:
      perGram === null || !positive(food.protein_100)
        ? null
        : (perGram * 100 * 10) / food.protein_100,
  };
}

/**
 * Index of the single best value, or -1 when there is nothing to call:
 * fewer than two products have a value, or the best is tied. A highlight
 * on a tie would be a claim the numbers do not support.
 */
export function bestIndex(
  values: (number | null)[],
  want: 'lowest' | 'highest',
): number {
  const known = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null);
  if (known.length < 2) return -1;
  const sorted = [...known].sort((a, b) =>
    want === 'lowest' ? a.v - b.v : b.v - a.v,
  );
  // Equal to within display rounding is a tie.
  if (Math.abs(sorted[0].v - sorted[1].v) < 0.005) return -1;
  return sorted[0].i;
}
