import { describe, expect, it } from 'vitest';
import { mergeDuplicateIngredients } from './mergeIngredients';

describe('mergeDuplicateIngredients', () => {
  it('merges the same ingredient across wording and language', () => {
    const out = mergeDuplicateIngredients([
      { name: 'chicken breast', grams: 400 },
      { name: 'onion', grams: 300 },
      { name: 'Poitrine de poulet', grams: 400 },
      { name: 'Chicken breasts', grams: 100 },
    ]);
    expect(out).toEqual([
      { name: 'chicken breast', grams: 900 },
      { name: 'onion', grams: 300 },
    ]);
  });

  it('merges rows that resolved to the same food', () => {
    const out = mergeDuplicateIngredients([
      { name: 'beef mince', grams: 250, foodId: 'a' },
      { name: 'americain naturel', grams: 250, foodId: 'a' },
    ]);
    expect(out).toEqual([{ name: 'beef mince', grams: 500, foodId: 'a' }]);
  });

  it('keeps different foods apart', () => {
    const rows = [
      { name: 'white rice', grams: 200, foodId: 'a' },
      { name: 'brown rice', grams: 200, foodId: 'b' },
      { name: 'chicken thigh', grams: 300 },
      { name: 'chicken breast', grams: 300 },
    ];
    expect(mergeDuplicateIngredients(rows)).toEqual(rows);
  });
});
