import { describe, expect, it } from 'vitest';
import type { Food } from '@/db/types';
import {
  availableModes,
  computeMacros,
  customUnitFromMode,
  defaultQuantity,
  gramsForQuantity,
} from './foodMath';

const food = (over: Partial<Food> = {}): Food =>
  ({
    id: 'f1',
    user_id: 'local',
    source: 'custom',
    name: 'Test food',
    kcal_100: 200,
    protein_100: 10,
    carbs_100: 20,
    fat_100: 8,
    serving_g: 50,
    custom_units: [{ label: 'slice', grams: 25 }],
    created_at: '',
    updated_at: '',
    ...over,
  }) as Food;

describe('gramsForQuantity', () => {
  it('treats qty as grams in g mode', () => {
    expect(gramsForQuantity(food(), { mode: 'g', qty: 150 })).toBe(150);
  });

  it('multiplies by serving_g in serving mode', () => {
    expect(gramsForQuantity(food({ serving_g: 50 }), { mode: 'serving', qty: 3 })).toBe(150);
  });

  it('multiplies by the custom unit weight in unit mode', () => {
    expect(gramsForQuantity(food(), { mode: 'unit:slice', qty: 2 })).toBe(50);
  });

  it('falls back to 0 grams for a missing serving_g', () => {
    expect(gramsForQuantity(food({ serving_g: undefined }), { mode: 'serving', qty: 2 })).toBe(0);
  });

  it('falls back to 0 grams for an unknown custom unit', () => {
    expect(gramsForQuantity(food(), { mode: 'unit:nope', qty: 2 })).toBe(0);
  });
});

describe('computeMacros', () => {
  it('scales per-100 macros by grams consumed', () => {
    const m = computeMacros(food(), { mode: 'g', qty: 200 });
    expect(m.kcal).toBe(400);
    expect(m.protein).toBe(20);
    expect(m.carbs).toBe(40);
    expect(m.fat).toBe(16);
    expect(m.grams).toBe(200);
    expect(m.unit).toBe('g');
  });

  it('labels serving and custom-unit modes', () => {
    expect(computeMacros(food(), { mode: 'serving', qty: 1 }).unit).toBe('serving');
    expect(computeMacros(food(), { mode: 'unit:slice', qty: 1 }).unit).toBe('slice');
  });
});

describe('customUnitFromMode', () => {
  it('returns the matching custom unit', () => {
    expect(customUnitFromMode(food(), 'unit:slice')).toEqual({ label: 'slice', grams: 25 });
  });

  it('returns null for non-unit modes', () => {
    expect(customUnitFromMode(food(), 'g')).toBeNull();
    expect(customUnitFromMode(food(), 'serving')).toBeNull();
  });

  it('returns null for an unknown unit label', () => {
    expect(customUnitFromMode(food(), 'unit:nope')).toBeNull();
  });
});

describe('defaultQuantity', () => {
  it('prefers serving when serving_g is set', () => {
    expect(defaultQuantity(food({ serving_g: 50 }))).toEqual({ mode: 'serving', qty: 1 });
  });

  it('falls back to the first custom unit', () => {
    expect(defaultQuantity(food({ serving_g: undefined }))).toEqual({
      mode: 'unit:slice',
      qty: 1,
    });
  });

  it('falls back to 100 g when nothing else is defined', () => {
    expect(defaultQuantity(food({ serving_g: undefined, custom_units: [] }))).toEqual({
      mode: 'g',
      qty: 100,
    });
  });
});

describe('availableModes', () => {
  it('always offers grams, plus serving and custom units when present', () => {
    const modes = availableModes(food());
    expect(modes.map((m) => m.value)).toEqual(['g', 'serving', 'unit:slice']);
    expect(modes[0]).toEqual({ value: 'g', label: 'grams', gramsPerOne: 1 });
    expect(modes[1].gramsPerOne).toBe(50);
    expect(modes[2].gramsPerOne).toBe(25);
  });

  it('offers only grams when no serving or units exist', () => {
    const modes = availableModes(food({ serving_g: undefined, custom_units: [] }));
    expect(modes.map((m) => m.value)).toEqual(['g']);
  });
});
