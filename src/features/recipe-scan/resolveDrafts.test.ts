import { describe, expect, it } from 'vitest';
import { CURATED_FOODS } from '@/db/curatedFoods';
import type { Food } from '@/db/types';
import { rankLibraryCandidates } from '@/features/food-search/ingredientMatch';
import { computeMacros } from '@/features/food-search/foodMath';
import { buildDrafts, type ScannedIngredient } from './resolveDrafts';

const base = { user_id: 'u', custom_units: [], created_at: '', updated_at: '' };
const curated: Food[] = CURATED_FOODS.map(
  (c) =>
    ({
      ...base,
      id: `curated:${c.slug}`,
      source: 'curated',
      name: c.name,
      kcal_100: c.kcal,
      protein_100: c.protein,
      carbs_100: c.carbs,
      fat_100: c.fat,
    }) as Food,
);
const own = (id: string, name: string, kcal: number, extra: Partial<Food> = {}): Food =>
  ({ ...base, id, source: 'off', name, kcal_100: kcal, protein_100: 1, carbs_100: 1, fat_100: 1, ...extra }) as Food;

// The library the real scan ran against, as far as the screenshots show.
const library: Food[] = [
  ...curated,
  own('c-bay', 'bay leaves', 0, { source: 'custom' }),
  own('c-chilli', 'chilli flakes', 0, { source: 'custom' }),
  own('o-salt', "Carrefour Classic' Sel", 540),
  own('o-stock', 'Organic Chicken Stock Cubes - 8 Pack', 6),
  own('o-cabbage', 'White Cabbage', 28),
  own('u-pepper', 'Spices, pepper, black', 251, { source: 'usda', usda_data_type: 'sr_legacy' }),
  own('u-beans', 'Beans, cannellini, canned, sodium added, drained and rinsed', 115, {
    source: 'usda',
    usda_data_type: 'sr_legacy',
  }),
];
// She had logged the pizza recently. That is what let it win.
const history = {
  frequentIds: new Set<string>(),
  recentIds: new Set(['curated:pizza-cheese', 'o-salt']),
};
const run = (scanned: ScannedIngredient[]) =>
  buildDrafts(scanned, (n) => rankLibraryCandidates(library, n, history), {
    hasPersonalHistory: true,
  });

/** Tuscan chicken and bean soup, as the scanner should now report it. */
const SOUP: ScannedIngredient[] = [
  { name: 'boneless chicken thighs', amount: 1, unit: 'kg', grams: 1000 },
  { name: 'onion', amount: 1, unit: '', grams: 150 },
  { name: 'carrots', amount: 2, unit: '', grams: 120 },
  { name: 'celery sticks', amount: 2, unit: 'sticks', grams: 80 },
  { name: 'garlic cloves, crushed', amount: 4, unit: 'cloves', grams: 12 },
  { name: 'cannellini beans, drained', amount: 2, unit: 'tins', grams: 420 },
  { name: 'tinned chopped tomatoes', amount: 1, unit: 'tin', grams: 400 },
  { name: 'tomato puree', amount: 2, unit: 'tbsp', grams: 10 },
  { name: 'chicken stock cubes', amount: 2, unit: 'cubes', grams: 16 },
  { name: 'water', amount: 1.5, unit: 'l', grams: 1500 },
  { name: 'soy sauce', amount: 1, unit: 'tsp', grams: 15 },
  { name: 'white cabbage, shredded', amount: 0.5, unit: '', grams: 300 },
  { name: 'bay leaves', amount: 2, unit: '', grams: 6 },
  { name: 'dried rosemary', amount: 1, unit: 'tsp', grams: 2 },
  { name: 'chilli flakes', amount: 1, unit: 'tsp', grams: 2 },
  { name: 'lemon juice', amount: 1, unit: '', grams: 150 },
  { name: 'salt', grams: 5 },
  { name: 'black pepper', grams: 2 },
];

const view = (scanned: ScannedIngredient[]) => {
  const { ingredients, leftOut } = run(scanned);
  const rows = ingredients.map((r) => {
    const food = r.chosen >= 0 ? r.candidates[r.chosen].food : undefined;
    return {
      name: r.name,
      food: food?.name,
      grams: r.grams,
      kcal: food ? Math.round(computeMacros(food, { mode: 'g', qty: r.grams }).kcal) : null,
      flagged: !r.confident,
    };
  });
  return { rows, leftOut };
};

const OLD_SOUP: ScannedIngredient[] = [
  { name: 'boneless chicken thighs', grams: 1000 },
  { name: 'soffritto mix', grams: 500 },
  { name: 'garlic cloves, crushed', grams: 12 },
  { name: 'cannellini beans, drained', grams: 420 },
  { name: 'chopped tomatoes', grams: 400 },
  { name: 'tomato puree', grams: 10 },
  { name: 'chicken stock cubes', grams: 16 },
  { name: 'water', grams: 1500 },
  { name: 'soy sauce', grams: 15 },
  { name: 'white cabbage, shredded', grams: 300 },
  { name: 'bay leaves', grams: 6 },
  { name: 'dried rosemary', grams: 2 },
  { name: 'chilli flakes', grams: 2 },
  { name: 'lemon', grams: 150 },
  { name: 'salt', grams: 5 },
  { name: 'black pepper', grams: 2 },
];
const STROGANOFF: ScannedIngredient[] = [
  { name: 'chicken breast', amount: 600, unit: 'g', grams: 600 },
  { name: 'yellow onion', amount: 2, unit: '', grams: 300 },
  { name: 'mushrooms, sliced', amount: 250, unit: 'g', grams: 250 },
  { name: 'garlic', amount: 2, unit: 'cloves', grams: 6 },
  { name: 'butter', amount: 1, unit: 'tbsp', grams: 14 },
  { name: 'olive oil', amount: 1, unit: 'tbsp', grams: 14 },
  { name: 'paprika', amount: 2, unit: 'tsp', grams: 4 },
  { name: 'dijon mustard', amount: 1, unit: 'tbsp', grams: 15 },
  { name: 'chicken stock', amount: 250, unit: 'ml', grams: 250 },
  { name: 'sour cream', amount: 150, unit: 'ml', grams: 150 },
  { name: 'poitrine de poulet', amount: 200, unit: 'g', grams: 200 },
  { name: 'fresh parsley', amount: 1, unit: 'handful', grams: 10 },
  { name: 'long grain rice', amount: 300, unit: 'g', grams: 300 },
];
const CURRY: ScannedIngredient[] = [
  { name: 'chickpeas', amount: 2, unit: 'tins', grams: 800 },
  { name: 'coconut milk', amount: 1, unit: 'tin', grams: 400 },
  { name: 'spinach', amount: 200, unit: 'g', grams: 200 },
  { name: 'red onion', amount: 1, unit: 'large', grams: 200 },
  { name: 'curry powder', amount: 2, unit: 'tbsp', grams: 30 },
  { name: 'fresh ginger', amount: 1, unit: 'thumb', grams: 15 },
  { name: 'vegetable oil', amount: 1, unit: 'tbsp', grams: 15 },
  { name: 'basmati rice', amount: 1.5, unit: 'cups', grams: 280 },
  { name: 'tomatoes', amount: 3, unit: '', grams: 360 },
  { name: 'red lentils', amount: 100, unit: 'g', grams: 100 },
];
const BAKE: ScannedIngredient[] = [
  { name: 'plain flour', amount: 2, unit: 'cups', grams: 250 },
  { name: 'caster sugar', amount: 150, unit: 'g', grams: 150 },
  { name: 'eggs', amount: 3, unit: 'large', grams: 180 },
  { name: 'unsalted butter', amount: 125, unit: 'g', grams: 125 },
  { name: 'milk', amount: 120, unit: 'ml', grams: 120 },
  { name: 'baking powder', amount: 2, unit: 'tsp', grams: 8 },
  { name: 'vanilla extract', amount: 1, unit: 'tsp', grams: 5 },
  { name: 'bananas', amount: 3, unit: 'ripe', grams: 360 },
  { name: 'oats', amount: 1, unit: 'cup', grams: 90 },
  { name: 'honey', amount: 2, unit: 'tbsp', grams: 40 },
  { name: 'greek yogurt', amount: 200, unit: 'g', grams: 200 },
  { name: 'peanut butter', amount: 2, unit: 'tbsp', grams: 32 },
];

const find = (v: ReturnType<typeof view>, name: string) => {
  const r = v.rows.find((x) => x.name === name);
  if (!r) throw new Error(`no row for ${name}`);
  return r;
};
const total = (v: ReturnType<typeof view>) =>
  v.rows.reduce((s, r) => s + (r.kcal ?? 0), 0);

describe('the soup that went wrong (Tuscan chicken and bean, 6 portions)', () => {
  // First scan: 611 kcal a portion, 12 of 16 rows flagged, a pizza standing
  // in for the tomatoes and porridge for the water.
  const v = view(SOUP);

  it('matches every ingredient to the food it is', () => {
    const got = Object.fromEntries(v.rows.map((r) => [r.name, r.food]));
    expect(got).toEqual({
      'boneless chicken thighs': 'Chicken thigh, raw',
      onion: 'Onion',
      carrots: 'Carrot',
      'celery sticks': 'Celery',
      'garlic cloves, crushed': 'Garlic',
      'cannellini beans, drained': 'Cannellini beans, canned',
      'tinned chopped tomatoes': 'Chopped tomatoes, tinned',
      'tomato puree': 'Tomato puree',
      'chicken stock cubes': 'Organic Chicken Stock Cubes - 8 Pack',
      'soy sauce': 'Soy sauce',
      'white cabbage, shredded': 'White cabbage',
      'bay leaves': 'Bay leaves',
      'dried rosemary': 'Dried rosemary',
      'chilli flakes': 'Chilli flakes',
      'lemon juice': 'Lemon juice',
      salt: 'Salt',
      'black pepper': 'Black pepper',
    });
  });

  it('leaves the water out instead of matching it to porridge', () => {
    expect(v.leftOut).toEqual(['water']);
    expect(v.rows.some((r) => /porridge|pizza/i.test(r.food ?? ''))).toBe(false);
  });

  it('converts the amounts by rule', () => {
    expect(find(v, 'tomato puree').grams).toBe(30); // the model said 10
    expect(find(v, 'soy sauce').grams).toBe(5); // the model said 15
    expect(find(v, 'cannellini beans, drained').grams).toBe(480);
    expect(find(v, 'lemon juice').grams).toBe(45); // not a 150 g lemon
  });

  it('asks about nothing, because nothing here is in doubt', () => {
    expect(v.rows.filter((r) => r.flagged)).toEqual([]);
  });

  it('lands on a believable total', () => {
    // About 345 kcal a portion. The first scan said 611.
    expect(total(v) / 6).toBeGreaterThan(300);
    expect(total(v) / 6).toBeLessThan(400);
    expect(find(v, 'salt').kcal).toBe(0);
  });
});

describe('the same soup when the scanner ignores the new instructions', () => {
  // Names and grams exactly as the first scan returned them. The prompt
  // asks for better; the matching must not depend on getting it.
  const v = view(OLD_SOUP);

  it('still keeps the pizza and the porridge out', () => {
    expect(v.leftOut).toEqual(['water']);
    expect(v.rows.some((r) => /porridge|pizza/i.test(r.food ?? ''))).toBe(false);
    expect(find(v, 'chopped tomatoes').food).toMatch(/tomato/i);
    expect(find(v, 'soffritto mix').food).toBe('Soffritto mix');
    expect(find(v, 'salt').food).toBe('Salt');
  });

  it('flags nothing trivial', () => {
    expect(v.rows.filter((r) => r.flagged).length).toBeLessThanOrEqual(1);
    for (const n of ['salt', 'bay leaves', 'dried rosemary', 'chilli flakes', 'black pepper'])
      expect(find(v, n).flagged).toBe(false);
  });
});

describe('other recipes', () => {
  it('stroganoff: merges the chicken listed twice, finds dry rice', () => {
    const v = view(STROGANOFF);
    expect(v.rows.filter((r) => /chicken breast/i.test(r.food ?? ''))).toHaveLength(1);
    expect(find(v, 'chicken breast')).toMatchObject({ food: 'Chicken breast, raw', grams: 800 });
    expect(find(v, 'yellow onion')).toMatchObject({ food: 'Onion', grams: 300 });
    expect(find(v, 'long grain rice').food).toBe('Long grain rice, dry');
    expect(find(v, 'sour cream').food).toBe('Sour cream');
    expect(find(v, 'chicken stock').food).toBe('Chicken stock, prepared');
    expect(find(v, 'butter')).toMatchObject({ food: 'Butter', grams: 15 });
  });

  it('curry: tins by drained weight, cups by what is in them', () => {
    const v = view(CURRY);
    expect(find(v, 'chickpeas')).toMatchObject({ food: 'Chickpeas, canned', grams: 480 });
    expect(find(v, 'coconut milk')).toMatchObject({ food: 'Coconut milk, tinned', grams: 400 });
    expect(find(v, 'basmati rice')).toMatchObject({ food: 'Basmati rice, dry', grams: 278 });
    expect(find(v, 'red onion').food).toBe('Red onion');
    expect(find(v, 'red lentils').food).toBe('Red lentils, dry');
    expect(find(v, 'tomatoes').food).toBe('Tomato');
  });

  it('baking: eggs are eggs', () => {
    const v = view(BAKE);
    expect(find(v, 'eggs')).toMatchObject({ food: 'Egg, whole, raw', grams: 195 });
    expect(find(v, 'plain flour')).toMatchObject({ food: 'Plain flour', grams: 250 });
    expect(find(v, 'unsalted butter').food).toBe('Butter');
    expect(find(v, 'caster sugar').food).toBe('Caster sugar');
    expect(find(v, 'oats').food).toBe('Rolled oats, dry');
  });
});

describe('what still gets a warning', () => {
  it('an ingredient nothing matches', () => {
    const v = view([
      { name: 'chicken breast', amount: 500, unit: 'g', grams: 500 },
      { name: 'gochujang glaze', amount: 100, unit: 'g', grams: 100 },
    ]);
    expect(find(v, 'gochujang glaze')).toMatchObject({ food: undefined, flagged: true });
    expect(find(v, 'chicken breast').flagged).toBe(false);
  });

  it('a loose match with real calories behind it', () => {
    // "cheese" could be cheddar, cottage or cream cheese: 200 g of doubt.
    const v = view([{ name: 'cheese', amount: 200, unit: 'g', grams: 200 }]);
    expect(v.rows[0].flagged).toBe(true);
  });

  it('but not a loose match worth a few calories', () => {
    const v = view([
      { name: 'chicken breast', amount: 500, unit: 'g', grams: 500 },
      { name: 'mustard of some kind', amount: 1, unit: 'tsp', grams: 5 },
    ]);
    expect(find(v, 'mustard of some kind').flagged).toBe(false);
  });
});
