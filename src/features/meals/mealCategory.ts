import type { Meal, MealCategory } from '@/db/types';

/** Built-in categories, in display order (filter chips + pickers). */
export const MEAL_CATEGORIES: readonly MealCategory[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'other',
];

export const CATEGORY_LABEL: Record<MealCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  other: 'Other',
};

const BUILT_IN = new Set<string>(MEAL_CATEGORIES);

/** Normalise free text to a category token: lowercase, single-spaced. */
export function toCategoryToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Display label for any token: built-in label, else title-cased custom. */
export function categoryLabel(token: string): string {
  if ((BUILT_IN as Set<string>).has(token)) {
    return CATEGORY_LABEL[token as MealCategory];
  }
  return token.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A meal's categories as tokens, tolerant of the legacy single `category`
 * field: new `categories[]` wins; otherwise fall back to `[category]`.
 */
export function mealCategories(meal: Pick<Meal, 'categories' | 'category'>): string[] {
  if (meal.categories && meal.categories.length) return meal.categories;
  return meal.category ? [meal.category] : [];
}

/** Parse the profile's JSON array of custom category tokens. */
export function parseCustomCategories(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === 'string' && !!x.trim())
      : [];
  } catch {
    return [];
  }
}

/**
 * Keyword signals per category, matched against the meal name + ingredient
 * names. Deliberately leaves ambiguous words (smoothie, yoghurt) out of the
 * lists where they'd misfire; ties resolve by MEAL_CATEGORIES order.
 */
const KEYWORDS: Record<Exclude<MealCategory, 'other'>, readonly string[]> = {
  breakfast: [
    'breakfast',
    'brekkie',
    'oat',
    'oatmeal',
    'porridge',
    'overnight',
    'egg',
    'omelette',
    'omelet',
    'pancake',
    'waffle',
    'cereal',
    'granola',
    'muesli',
    'toast',
    'bagel',
    'croissant',
    'bacon',
  ],
  lunch: [
    'lunch',
    'sandwich',
    'wrap',
    'salad',
    'soup',
    'sushi',
    'burrito',
    'quesadilla',
    'panini',
    'baguette',
  ],
  dinner: [
    'dinner',
    'steak',
    'roast',
    'curry',
    'pasta',
    'spaghetti',
    'risotto',
    'casserole',
    'lasagne',
    'lasagna',
    'pizza',
    'stew',
    'chilli',
    'chili',
    'bolognese',
    'stir fry',
    'stir-fry',
    'salmon',
  ],
  snack: [
    'snack',
    'bar',
    'shake',
    'nuts',
    'crisps',
    'chips',
    'popcorn',
    'cookie',
    'biscuit',
    'chocolate',
    'jerky',
  ],
};

/**
 * Best-guess category from free text (meal name + ingredient names). Counts
 * whole-word keyword hits per category and returns the leader. Returns the
 * `fallback` (e.g. the section a meal is most often logged into) when no
 * keyword fires, or undefined if there's still no signal.
 */
export function suggestMealCategory(
  text: string,
  fallback?: MealCategory,
): MealCategory | undefined {
  const words = new Set(text.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
  const hay = ` ${text.toLowerCase()} `;

  let best: MealCategory | undefined;
  let bestScore = 0;
  for (const category of MEAL_CATEGORIES) {
    if (category === 'other') continue;
    const keywords = KEYWORDS[category];
    let score = 0;
    for (const kw of keywords) {
      // Multi-word keywords ("stir fry") match as a substring; single words
      // match on a word boundary so "bar" doesn't hit "barley".
      if (kw.includes(' ') || kw.includes('-')) {
        if (hay.includes(` ${kw} `) || hay.includes(kw)) score++;
      } else if (words.has(kw) || words.has(`${kw}s`)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }
  return bestScore > 0 ? best : fallback;
}
