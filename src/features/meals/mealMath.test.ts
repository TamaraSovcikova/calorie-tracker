import { describe, expect, it } from 'vitest';
import type { Food, MealItem } from '@/db/types';
import type { DayTotals } from '@/db/repos/diary';
import {
  compareMealsForList,
  computeMealTotals,
  filterMealsByQuery,
  formatServings,
  getServings,
  itemToQuantity,
  matchesMealQuery,
  multiplyTotals,
  perServingTotals,
} from './mealMath';

const food = (id: string, over: Partial<Food> = {}): Food =>
  ({
    id,
    user_id: 'local',
    source: 'custom',
    name: id,
    kcal_100: 100,
    protein_100: 10,
    carbs_100: 20,
    fat_100: 5,
    custom_units: [{ label: 'slice', grams: 25 }],
    created_at: '',
    updated_at: '',
    ...over,
  }) as Food;

const item = (over: Partial<MealItem> = {}): MealItem => ({
  id: 'i1',
  meal_id: 'm1',
  food_id: 'f1',
  qty: 100,
  unit: 'g',
  ...over,
});

describe('itemToQuantity', () => {
  it('maps g and ml units to grams mode', () => {
    expect(itemToQuantity(item({ unit: 'g', qty: 80 }))).toEqual({ mode: 'g', qty: 80 });
    expect(itemToQuantity(item({ unit: 'ml', qty: 200 }))).toEqual({ mode: 'g', qty: 200 });
  });

  it('maps serving unit to serving mode', () => {
    expect(itemToQuantity(item({ unit: 'serving', qty: 2 }))).toEqual({
      mode: 'serving',
      qty: 2,
    });
  });

  it('maps a custom-unit label to unit mode', () => {
    expect(itemToQuantity(item({ unit: 'slice', qty: 3 }))).toEqual({
      mode: 'unit:slice',
      qty: 3,
    });
  });
});

describe('computeMealTotals', () => {
  it('sums macros across resolvable ingredients', () => {
    const foods = new Map([
      ['f1', food('f1')],
      ['f2', food('f2', { kcal_100: 200, protein_100: 5, carbs_100: 0, fat_100: 10 })],
    ]);
    const totals = computeMealTotals(
      [
        item({ food_id: 'f1', unit: 'g', qty: 100 }),
        item({ id: 'i2', food_id: 'f2', unit: 'g', qty: 50 }),
      ],
      foods,
    );
    expect(totals.kcal).toBe(100 + 100);
    expect(totals.protein).toBe(10 + 2.5);
    expect(totals.fat).toBe(5 + 5);
  });

  it('skips ingredients whose food is missing', () => {
    const foods = new Map([['f1', food('f1')]]);
    const totals = computeMealTotals(
      [item({ food_id: 'f1', qty: 100 }), item({ id: 'i2', food_id: 'gone', qty: 100 })],
      foods,
    );
    expect(totals.kcal).toBe(100);
  });

  it('returns zeros for an empty meal', () => {
    expect(computeMealTotals([], new Map())).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
    });
  });
});

/** Build a full DayTotals from a partial, defaulting every field to 0. */
const dt = (o: Partial<DayTotals>): DayTotals => ({
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
  ...o,
});

describe('multiplyTotals', () => {
  it('scales every macro by the factor', () => {
    expect(
      multiplyTotals(
        dt({ kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 4, sodium: 200 }),
        2.5,
      ),
    ).toEqual(
      dt({ kcal: 250, protein: 25, carbs: 50, fat: 12.5, fiber: 10, sodium: 500 }),
    );
  });
});

describe('getServings', () => {
  it('returns the meal servings when valid', () => {
    expect(getServings({ servings: 5 })).toBe(5);
    expect(getServings({ servings: 1.5 })).toBe(1.5);
  });

  it('falls back to 1 for missing or invalid values', () => {
    expect(getServings({ servings: undefined })).toBe(1);
    expect(getServings({ servings: 0 })).toBe(1);
    expect(getServings({ servings: -3 })).toBe(1);
    expect(getServings({ servings: NaN })).toBe(1);
  });
});

describe('perServingTotals', () => {
  it('divides a whole-batch total by the servings count', () => {
    expect(
      perServingTotals(
        dt({ kcal: 1000, protein: 50, carbs: 200, fat: 30, sodium: 500 }),
        5,
      ),
    ).toEqual(dt({ kcal: 200, protein: 10, carbs: 40, fat: 6, sodium: 100 }));
  });

  it('is a no-op for a single-serving batch', () => {
    const t = dt({ kcal: 420, protein: 30, carbs: 40, fat: 12 });
    expect(perServingTotals(t, 1)).toEqual(t);
  });

  it('treats a non-positive servings count as 1', () => {
    const t = dt({ kcal: 420, protein: 30, carbs: 40, fat: 12 });
    expect(perServingTotals(t, 0)).toEqual(t);
  });
});

describe('formatServings', () => {
  it('pluralises and rounds', () => {
    expect(formatServings(1)).toBe('1 portion');
    expect(formatServings(5)).toBe('5 portions');
    expect(formatServings(1.5)).toBe('1.5 portions');
    expect(formatServings(2.04)).toBe('2 portions');
  });
});

describe('matchesMealQuery', () => {
  const hay = 'high protein chicken bowl jasmine rice broccoli';

  it('matches an empty query (shows everything)', () => {
    expect(matchesMealQuery(hay, '')).toBe(true);
    expect(matchesMealQuery(hay, '   ')).toBe(true);
  });

  it('matches a single word anywhere in the haystack', () => {
    expect(matchesMealQuery(hay, 'chicken')).toBe(true);
    expect(matchesMealQuery(hay, 'rice')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesMealQuery(hay, 'CHICKEN')).toBe(true);
  });

  it('requires every word (AND) but ignores word order', () => {
    expect(matchesMealQuery(hay, 'rice chicken')).toBe(true);
    expect(matchesMealQuery(hay, 'chicken tofu')).toBe(false);
  });

  it('matches on an ingredient even when the name does not contain it', () => {
    // "broccoli" is an ingredient in the haystack, not the meal name word.
    expect(matchesMealQuery(hay, 'broccoli')).toBe(true);
  });
});

describe('compareMealsForList', () => {
  const meal = (favorite: boolean, updated_at: string) => ({ favorite, updated_at });

  it('sorts favourites ahead of non-favourites', () => {
    expect(
      compareMealsForList(meal(false, '2026-05-27'), meal(true, '2026-01-01')),
    ).toBeGreaterThan(0);
    expect(
      compareMealsForList(meal(true, '2026-01-01'), meal(false, '2026-05-27')),
    ).toBeLessThan(0);
  });

  it('falls back to most-recently-updated within the same favourite state', () => {
    expect(
      compareMealsForList(meal(true, '2026-05-27'), meal(true, '2026-05-20')),
    ).toBeLessThan(0);
    expect(
      compareMealsForList(meal(false, '2026-05-20'), meal(false, '2026-05-27')),
    ).toBeGreaterThan(0);
  });
});

describe('filterMealsByQuery', () => {
  const rows = [
    { haystack: 'bolognese weeknight batch hache de boeuf, tomato puree' },
    { haystack: 'chicken curry rice, kipfilet, coconut milk' },
    { haystack: 'overnight oats yoghurt, banana' },
  ];

  it('finds a meal by an ingredient named in another language', () => {
    expect(filterMealsByQuery(rows, 'beef')).toHaveLength(1);
    expect(filterMealsByQuery(rows, 'chicken')).toHaveLength(1);
  });

  it('ignores word order and filler', () => {
    expect(filterMealsByQuery(rows, 'puree de tomato')).toHaveLength(1);
  });

  it('forgives a typo only when nothing matched strictly', () => {
    expect(filterMealsByQuery(rows, 'yoghrut')).toHaveLength(1);
    // "chicken" matches one meal outright, so the curry is returned alone
    // rather than being joined by whatever a typo pass would drag in.
    expect(filterMealsByQuery(rows, 'chicken')).toHaveLength(1);
  });

  it('returns everything for an empty query', () => {
    expect(filterMealsByQuery(rows, '  ')).toHaveLength(3);
  });

  it('returns nothing for an unrelated query', () => {
    expect(filterMealsByQuery(rows, 'salmon')).toHaveLength(0);
  });
});
