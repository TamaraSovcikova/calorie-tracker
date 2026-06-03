import { describe, expect, it } from 'vitest';
import {
  buildMealFilterChips,
  categoryLabel,
  customCategoryTokens,
  mealCategories,
  mealMatchesFilter,
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

describe('customCategoryTokens', () => {
  it('unions the profile list with tokens still referenced by a meal', () => {
    const tokens = customCategoryTokens(
      [{ categories: ['lunch', 'supper'] }, { category: 'breakfast' }],
      '["pre workout"]',
    );
    // "supper" is referenced by a meal but not in the profile list; both kept.
    expect(tokens).toContain('pre workout');
    expect(tokens).toContain('supper');
    // Built-ins are never custom tokens.
    expect(tokens).not.toContain('lunch');
    expect(tokens).not.toContain('breakfast');
  });
  it('de-dupes', () => {
    const tokens = customCategoryTokens(
      [{ categories: ['supper'] }],
      '["supper"]',
    );
    expect(tokens.filter((t) => t === 'supper')).toHaveLength(1);
  });
});

describe('buildMealFilterChips', () => {
  it('starts with All + Favourites, then built-ins, then custom', () => {
    const chips = buildMealFilterChips(
      [{ categories: ['pre workout'] }],
      undefined,
    );
    expect(chips[0]).toEqual({ value: 'all', label: 'All' });
    expect(chips[1].value).toBe('favorites');
    expect(chips.map((c) => c.value)).toContain('breakfast');
    expect(chips.find((c) => c.value === 'pre workout')?.label).toBe('Pre Workout');
  });
});

describe('mealMatchesFilter', () => {
  it('all matches everything', () => {
    expect(mealMatchesFilter({}, 'all')).toBe(true);
  });
  it('favorites matches only starred meals', () => {
    expect(mealMatchesFilter({ favorite: true }, 'favorites')).toBe(true);
    expect(mealMatchesFilter({ favorite: false }, 'favorites')).toBe(false);
  });
  it('a category filter matches meals in that category (multi-aware)', () => {
    expect(mealMatchesFilter({ categories: ['lunch', 'dinner'] }, 'dinner')).toBe(true);
    expect(mealMatchesFilter({ categories: ['lunch'] }, 'dinner')).toBe(false);
    expect(mealMatchesFilter({ category: 'breakfast' }, 'breakfast')).toBe(true);
  });
});
