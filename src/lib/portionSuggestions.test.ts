import { describe, expect, it } from 'vitest';
import { parseServingDescription, suggestPortions } from './portionSuggestions';

describe('suggestPortions', () => {
  it('returns slice for a sliced bread name', () => {
    const units = suggestPortions('Hovis Wholemeal Bread');
    expect(units.length).toBeGreaterThan(0);
    expect(units[0].label).toBe('slice');
    expect(units[0].grams).toBe(38);
  });

  it('returns size variants for chicken breast', () => {
    const units = suggestPortions('Free Range Chicken Breast Fillets');
    expect(units.some((u) => u.label === 'medium breast')).toBe(true);
  });

  it('returns egg sizes for eggs', () => {
    const units = suggestPortions('Medium Free Range Eggs');
    expect(units.some((u) => u.label.includes('egg'))).toBe(true);
  });

  it('returns banana sizes for bananas', () => {
    const units = suggestPortions('Organic Bananas');
    expect(units.some((u) => u.label.includes('banana'))).toBe(true);
  });

  it('returns wrap for tortilla wraps', () => {
    const units = suggestPortions('Lidl High Protein Tortilla Wrap');
    expect(units[0].label).toBe('wrap');
  });

  it('returns rasher for bacon', () => {
    const units = suggestPortions('Unsmoked Back Bacon Rashers');
    expect(units[0].label).toBe('rasher');
  });

  it('returns tablespoon for peanut butter', () => {
    const units = suggestPortions('Whole Earth Peanut Butter Smooth');
    expect(units.some((u) => u.label === 'tablespoon')).toBe(true);
  });

  it('returns dry portion for pasta', () => {
    const units = suggestPortions('Barilla Fusilli Pasta');
    expect(units[0].label).toBe('portion (dry)');
    expect(units[0].grams).toBe(75);
  });

  it('returns empty for an unrecognised food', () => {
    expect(suggestPortions('Mystery Sauce Supreme Deluxe')).toEqual([]);
  });

  it('does not match "egg" inside "eggplant"', () => {
    const units = suggestPortions('Roasted Eggplant Dip');
    expect(units.some((u) => u.label.includes('egg'))).toBe(false);
  });

  it('does not match "bread" inside "breadcrumb"', () => {
    const units = suggestPortions('Golden Breadcrumbs');
    expect(units.some((u) => u.label === 'slice')).toBe(false);
  });

  it('returns roll for a bread roll, not slice', () => {
    const units = suggestPortions('White Bread Roll');
    expect(units[0].label).toBe('roll');
  });
});

describe('parseServingDescription', () => {
  it('parses "1 slice (38g)"', () => {
    const unit = parseServingDescription('1 slice (38g)', 38);
    expect(unit).toEqual({ label: 'slice', grams: 38 });
  });

  it('divides grams by count for multi-unit strings', () => {
    const unit = parseServingDescription('2 biscuits (30g)', 30);
    expect(unit).toEqual({ label: 'biscuits', grams: 15 });
  });

  it('handles strings without a parenthetical weight', () => {
    const unit = parseServingDescription('1 medium egg', 58);
    expect(unit).toEqual({ label: 'medium egg', grams: 58 });
  });

  it('returns null for a pure gram string', () => {
    expect(parseServingDescription('38g', 38)).toBeNull();
    expect(parseServingDescription('100 g', 100)).toBeNull();
  });

  it('returns null for generic "serving"', () => {
    expect(parseServingDescription('1 serving', 100)).toBeNull();
  });

  it('returns null for non-ASCII labels (accented characters)', () => {
    // "1 pièce" contains è (U+00E8), which is outside ASCII
    expect(parseServingDescription('1 pièce (50g)', 50)).toBeNull();
  });

  it('returns null when grams is zero', () => {
    expect(parseServingDescription('1 slice', 0)).toBeNull();
  });
});
