import { describe, expect, it } from 'vitest';
import { suggestMealCategory } from './mealCategory';

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
