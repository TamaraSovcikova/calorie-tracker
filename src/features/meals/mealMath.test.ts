import { describe, expect, it } from 'vitest';
import type { Food, MealItem } from '@/db/types';
import { computeMealTotals, itemToQuantity, multiplyTotals } from './mealMath';

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
    });
  });
});

describe('multiplyTotals', () => {
  it('scales every macro by the factor', () => {
    expect(
      multiplyTotals({ kcal: 100, protein: 10, carbs: 20, fat: 5 }, 2.5),
    ).toEqual({ kcal: 250, protein: 25, carbs: 50, fat: 12.5 });
  });
});
