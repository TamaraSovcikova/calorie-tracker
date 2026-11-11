import { sigWords, wordsMatch } from '@/features/food-search/ingredientMatch';

/** The part of an ingredient draft that merging needs. */
interface Mergeable {
  name: string;
  grams: number;
  /** Id of the food it currently resolves to, if any. */
  foodId?: string;
  /** The amount as written, for display. Dropped on a merge: "2 tbsp" is
   *  no longer true of the combined row. */
  written?: string;
}

/**
 * Fold repeated ingredients into one row, adding their amounts.
 *
 * Two rows are the same ingredient when their names say the same thing once
 * normalised ("chicken breast" / "Chicken breasts" / "poitrine de poulet"),
 * or when they resolved to the same food. A scanned stroganoff came back
 * with chicken breast twice, once under a French name. Nothing downstream
 * noticed, so the meal counted the chicken double.
 *
 * The first occurrence wins the name and position.
 */
export function mergeDuplicateIngredients<T extends Mergeable>(rows: T[]): T[] {
  const out: T[] = [];
  const words = (name: string) => [...new Set(sigWords(name))];
  // Same words, allowing plurals: every word on each side has a partner.
  const sameName = (a: string[], b: string[]) =>
    a.length > 0 &&
    a.length === b.length &&
    a.every((w) => b.some((x) => wordsMatch(w, x))) &&
    b.every((w) => a.some((x) => wordsMatch(w, x)));
  for (const row of rows) {
    const key = words(row.name);
    const hit = out.findIndex(
      (o) =>
        sameName(key, words(o.name)) ||
        (!!row.foodId && o.foodId === row.foodId),
    );
    if (hit >= 0)
      out[hit] = { ...out[hit], grams: out[hit].grams + row.grams, written: undefined };
    else out.push(row);
  }
  return out;
}
