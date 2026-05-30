import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  mealCategories,
  parseCustomCategories,
  suggestMealCategory,
  toCategoryToken,
} from './mealCategory';

describe('suggestMealCategory', () => {
  it('detects breakfast from name keywords', () => {
    expect(suggestMealCategory('Overnight oats with berries')).toBe('breakfast');
    expect(suggestMealCategory('Veggie omelette')).toBe('breakfast');
    expect(suggestMealCategory('Scrambled eggs on toast')).toBe('breakfast');
  });

  it('detects lunch', () => {
    expect(suggestMealCategory('Chicken caesar salad')).toBe('lunch');
    expect(suggestMealCategory('Turkey wrap')).toBe('lunch');
  });

  it('detects dinner', () => {
    expect(suggestMealCategory('Beef lasagne')).toBe('dinner');
    expect(suggestMealCategory('Chicken stir-fry')).toBe('dinner');
    expect(suggestMealCategory('Spaghetti bolognese')).toBe('dinner');
  });

  it('detects snack', () => {
    expect(suggestMealCategory('Protein bar')).toBe('snack');
    expect(suggestMealCategory('Handful of nuts')).toBe('snack');
  });

  it('matches keywords inside ingredient text too', () => {
    expect(suggestMealCategory('My usual · oats, milk, banana')).toBe('breakfast');
  });

  it('uses the fallback when no keyword fires', () => {
    expect(suggestMealCategory('Mystery meal', 'dinner')).toBe('dinner');
  });

  it('returns undefined with no signal and no fallback', () => {
    expect(suggestMealCategory('Mystery meal')).toBeUndefined();
  });

  it('does not false-positive on substrings (bar in barley)', () => {
    expect(suggestMealCategory('Barley risotto')).toBe('dinner'); // risotto, not "bar"
  });
});

describe('toCategoryToken', () => {
  it('lowercases and collapses whitespace', () => {
    expect(toCategoryToken('  Pre   Workout ')).toBe('pre workout');
    expect(toCategoryToken('Lunch')).toBe('lunch');
  });
});

describe('categoryLabel', () => {
  it('uses the built-in label for built-in tokens', () => {
    expect(categoryLabel('breakfast')).toBe('Breakfast');
    expect(categoryLabel('snack')).toBe('Snack');
  });
  it('title-cases custom tokens', () => {
    expect(categoryLabel('pre workout')).toBe('Pre Workout');
    expect(categoryLabel('high-protein')).toBe('High-Protein');
  });
});

describe('mealCategories', () => {
  it('returns the categories array when present', () => {
    expect(mealCategories({ categories: ['lunch', 'dinner'] })).toEqual([
      'lunch',
      'dinner',
    ]);
  });
  it('falls back to the legacy single category', () => {
    expect(mealCategories({ category: 'breakfast' })).toEqual(['breakfast']);
  });
  it('prefers categories over the legacy field', () => {
    expect(mealCategories({ category: 'breakfast', categories: ['lunch'] })).toEqual([
      'lunch',
    ]);
  });
  it('is empty when neither is set', () => {
    expect(mealCategories({})).toEqual([]);
    expect(mealCategories({ categories: [] })).toEqual([]);
  });
});

describe('parseCustomCategories', () => {
  it('parses a JSON array of strings', () => {
    expect(parseCustomCategories('["pre workout","supper"]')).toEqual([
      'pre workout',
      'supper',
    ]);
  });
  it('tolerates undefined / junk', () => {
    expect(parseCustomCategories(undefined)).toEqual([]);
    expect(parseCustomCategories('not json')).toEqual([]);
    expect(parseCustomCategories('{"a":1}')).toEqual([]);
  });
});
