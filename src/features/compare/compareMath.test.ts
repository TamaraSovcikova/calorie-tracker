import { describe, expect, it } from 'vitest';
import type { Food } from '@/db/types';
import { bestIndex, compareProduct } from './compareMath';

const food = (kcal: number, protein: number, carbs = 0, fat = 0): Food =>
  ({
    id: 'x',
    user_id: 'u',
    source: 'off',
    name: 'x',
    kcal_100: kcal,
    protein_100: protein,
    carbs_100: carbs,
    fat_100: fat,
    custom_units: [],
    created_at: '',
    updated_at: '',
  }) as Food;

// Two yogurts: a pricey high-protein one and a plain cheap one.
const skyr = food(63, 11, 4, 0.2);
const plain = food(61, 3.5, 4.7, 3.3);
const skyrPrice = { price: 2.4, pack_g: 450 };
const plainPrice = { price: 0.99, pack_g: 500 };

describe('compareProduct', () => {
  it('per 100 g is the label, plus price per 100 g', () => {
    const r = compareProduct(skyr, { kind: 'per100' }, skyrPrice);
    expect(r.grams).toBe(100);
    expect(r.kcal).toBe(63);
    expect(r.cost).toBeCloseTo(0.533, 3);
    expect(r.costPer100).toBeCloseTo(0.533, 3);
  });

  it('works out how much to eat for a protein target, and what it costs', () => {
    const a = compareProduct(skyr, { kind: 'protein', target: 30 }, skyrPrice);
    const b = compareProduct(plain, { kind: 'protein', target: 30 }, plainPrice);
    expect(a.grams).toBeCloseTo(272.7, 1);
    expect(a.protein).toBeCloseTo(30);
    expect(a.kcal).toBeCloseTo(171.8, 1);
    // The plain one needs far more of it, with far more calories...
    expect(b.grams).toBeCloseTo(857.1, 1);
    expect(b.kcal).toBeCloseTo(522.9, 1);
    // ...and here still costs more per gram of protein.
    expect(a.cost).toBeCloseTo(1.45, 2);
    expect(b.cost).toBeCloseTo(1.7, 2);
    expect(a.costPer10gProtein).toBeCloseTo(0.485, 3);
    expect(b.costPer10gProtein).toBeCloseTo(0.566, 3);
  });

  it('works out how much a calorie target buys', () => {
    const r = compareProduct(skyr, { kind: 'kcal', target: 200 }, skyrPrice);
    expect(r.grams).toBeCloseTo(317.5, 1);
    expect(r.protein).toBeCloseTo(34.9, 1);
  });

  it('per pack needs the pack size', () => {
    expect(compareProduct(skyr, { kind: 'pack' }, {}).grams).toBeNull();
    expect(compareProduct(skyr, { kind: 'pack' }, skyrPrice).kcal).toBeCloseTo(283.5);
    expect(compareProduct(skyr, { kind: 'pack' }, skyrPrice).cost).toBeCloseTo(2.4);
  });

  it('leaves gaps rather than inventing numbers', () => {
    const noPrice = compareProduct(skyr, { kind: 'per100' });
    expect(noPrice.cost).toBeNull();
    expect(noPrice.costPer10gProtein).toBeNull();
    const oil = food(900, 0, 0, 100);
    expect(compareProduct(oil, { kind: 'protein', target: 30 }).grams).toBeNull();
    expect(compareProduct(oil, { kind: 'per100' }, skyrPrice).costPer10gProtein).toBeNull();
  });
});

describe('bestIndex', () => {
  it('picks the lowest or highest', () => {
    expect(bestIndex([1.45, 1.7, null], 'lowest')).toBe(0);
    expect(bestIndex([11, 3.5], 'highest')).toBe(0);
  });
  it('calls nothing on a tie or with one value', () => {
    expect(bestIndex([2, 2], 'lowest')).toBe(-1);
    expect(bestIndex([2, null], 'lowest')).toBe(-1);
  });
});
