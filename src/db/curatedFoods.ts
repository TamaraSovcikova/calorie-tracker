/**
 * Curated common-foods library.
 *
 * A hand-maintained set of everyday staples with sensible per-100g macros
 * AND natural portion units ("1 large egg", "1 slice", "1 medium banana").
 * Bundled with the app — instant, offline, no API flakiness — and ranked
 * at the top of search so logging the basics is one tap.
 *
 * Open Food Facts (barcodes / packaged) and USDA (broader generic search)
 * stay as secondary online sources for anything not in here.
 *
 * Macros are approximate, sourced from standard UK/US nutrition data, and
 * are per 100 g (or per 100 ml for liquids — close enough at ~1 g/ml).
 *
 * Bump CURATED_VERSION whenever this list changes so installed apps
 * re-seed on next load.
 */

export const CURATED_VERSION = 1;

export interface CuratedUnit {
  label: string;
  grams: number;
}

export interface CuratedFood {
  slug: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  units: CuratedUnit[];
}

export const CURATED_FOODS: CuratedFood[] = [
  // ---- Eggs ----
  {
    slug: 'egg-whole',
    name: 'Egg, whole, raw',
    kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5,
    units: [
      { label: 'large egg', grams: 50 },
      { label: 'medium egg', grams: 44 },
      { label: 'small egg', grams: 38 },
    ],
  },
  {
    slug: 'egg-white',
    name: 'Egg white, raw',
    kcal: 52, protein: 10.9, carbs: 0.7, fat: 0.2,
    units: [{ label: 'large egg white', grams: 33 }],
  },
  {
    slug: 'egg-fried',
    name: 'Egg, fried',
    kcal: 196, protein: 13.6, carbs: 0.8, fat: 15,
    units: [{ label: 'large egg', grams: 46 }],
  },
  // ---- Bread & grains ----
  {
    slug: 'bread-white',
    name: 'White bread',
    kcal: 265, protein: 9, carbs: 49, fat: 3.2,
    units: [
      { label: 'slice', grams: 36 },
      { label: 'thick slice', grams: 44 },
    ],
  },
  {
    slug: 'bread-wholemeal',
    name: 'Wholemeal bread',
    kcal: 247, protein: 13, carbs: 41, fat: 3.4,
    units: [
      { label: 'slice', grams: 36 },
      { label: 'thick slice', grams: 44 },
    ],
  },
  {
    slug: 'bagel-plain',
    name: 'Bagel, plain',
    kcal: 250, protein: 10, carbs: 48, fat: 1.5,
    units: [{ label: 'bagel', grams: 85 }],
  },
  {
    slug: 'oats-rolled',
    name: 'Rolled oats, dry',
    kcal: 379, protein: 13.2, carbs: 67.7, fat: 6.5,
    units: [
      { label: 'serving', grams: 40 },
      { label: 'cup', grams: 80 },
    ],
  },
  {
    slug: 'rice-white-cooked',
    name: 'White rice, cooked',
    kcal: 130, protein: 2.7, carbs: 28, fat: 0.3,
    units: [
      { label: 'serving', grams: 150 },
      { label: 'cup', grams: 158 },
    ],
  },
  {
    slug: 'pasta-cooked',
    name: 'Pasta, cooked',
    kcal: 158, protein: 5.8, carbs: 31, fat: 0.9,
    units: [
      { label: 'serving', grams: 180 },
      { label: 'cup', grams: 140 },
    ],
  },
  {
    slug: 'potato-boiled',
    name: 'Potato, boiled',
    kcal: 87, protein: 1.9, carbs: 20, fat: 0.1,
    units: [{ label: 'medium potato', grams: 150 }],
  },
  {
    slug: 'sweet-potato-baked',
    name: 'Sweet potato, baked',
    kcal: 90, protein: 2, carbs: 21, fat: 0.15,
    units: [{ label: 'medium', grams: 130 }],
  },
  // ---- Dairy ----
  {
    slug: 'milk-whole',
    name: 'Whole milk',
    kcal: 64, protein: 3.4, carbs: 4.7, fat: 3.6,
    units: [
      { label: 'glass (200ml)', grams: 200 },
      { label: 'splash', grams: 30 },
    ],
  },
  {
    slug: 'milk-semi',
    name: 'Semi-skimmed milk',
    kcal: 50, protein: 3.5, carbs: 4.8, fat: 1.8,
    units: [
      { label: 'glass (200ml)', grams: 200 },
      { label: 'splash', grams: 30 },
    ],
  },
  {
    slug: 'milk-skimmed',
    name: 'Skimmed milk',
    kcal: 35, protein: 3.5, carbs: 5, fat: 0.1,
    units: [{ label: 'glass (200ml)', grams: 200 }],
  },
  {
    slug: 'yogurt-greek',
    name: 'Greek yogurt, plain',
    kcal: 97, protein: 9, carbs: 4, fat: 5,
    units: [
      { label: 'pot (150g)', grams: 150 },
      { label: 'tbsp', grams: 18 },
    ],
  },
  {
    slug: 'yogurt-natural',
    name: 'Natural yogurt',
    kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3,
    units: [{ label: 'pot (150g)', grams: 150 }],
  },
  {
    slug: 'cheese-cheddar',
    name: 'Cheddar cheese',
    kcal: 416, protein: 25, carbs: 0.1, fat: 35,
    units: [
      { label: 'slice', grams: 25 },
      { label: 'matchbox', grams: 30 },
    ],
  },
  {
    slug: 'butter',
    name: 'Butter',
    kcal: 717, protein: 0.85, carbs: 0.06, fat: 81,
    units: [
      { label: 'tsp', grams: 5 },
      { label: 'tbsp', grams: 14 },
    ],
  },
  // ---- Proteins ----
  {
    slug: 'chicken-breast-cooked',
    name: 'Chicken breast, cooked',
    kcal: 165, protein: 31, carbs: 0, fat: 3.6,
    units: [
      { label: 'breast', grams: 120 },
      { label: 'serving', grams: 100 },
    ],
  },
  {
    slug: 'chicken-breast-raw',
    name: 'Chicken breast, raw',
    kcal: 110, protein: 23, carbs: 0, fat: 1.5,
    units: [{ label: 'breast', grams: 150 }],
  },
  {
    slug: 'chicken-thigh-cooked',
    name: 'Chicken thigh, cooked',
    kcal: 209, protein: 26, carbs: 0, fat: 11,
    units: [{ label: 'thigh', grams: 90 }],
  },
  {
    slug: 'beef-mince-5',
    name: 'Beef mince, 5% fat, cooked',
    kcal: 182, protein: 26, carbs: 0, fat: 8,
    units: [{ label: 'serving', grams: 125 }],
  },
  {
    slug: 'salmon-cooked',
    name: 'Salmon, cooked',
    kcal: 206, protein: 22, carbs: 0, fat: 13,
    units: [{ label: 'fillet', grams: 120 }],
  },
  {
    slug: 'tuna-canned',
    name: 'Tuna, canned in brine, drained',
    kcal: 116, protein: 26, carbs: 0, fat: 1,
    units: [{ label: 'can (145g)', grams: 145 }],
  },
  {
    slug: 'prawns-cooked',
    name: 'Prawns, cooked',
    kcal: 99, protein: 24, carbs: 0.2, fat: 0.3,
    units: [{ label: 'serving', grams: 100 }],
  },
  {
    slug: 'tofu-firm',
    name: 'Tofu, firm',
    kcal: 144, protein: 17, carbs: 3, fat: 9,
    units: [
      { label: 'serving', grams: 100 },
      { label: 'block', grams: 350 },
    ],
  },
  // ---- Fruit ----
  {
    slug: 'banana',
    name: 'Banana',
    kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3,
    units: [
      { label: 'medium', grams: 118 },
      { label: 'large', grams: 136 },
      { label: 'small', grams: 101 },
    ],
  },
  {
    slug: 'apple',
    name: 'Apple',
    kcal: 52, protein: 0.3, carbs: 14, fat: 0.2,
    units: [
      { label: 'medium', grams: 182 },
      { label: 'small', grams: 149 },
    ],
  },
  {
    slug: 'orange',
    name: 'Orange',
    kcal: 47, protein: 0.9, carbs: 12, fat: 0.1,
    units: [{ label: 'medium', grams: 131 }],
  },
  {
    slug: 'strawberries',
    name: 'Strawberries',
    kcal: 32, protein: 0.7, carbs: 7.7, fat: 0.3,
    units: [
      { label: 'serving', grams: 100 },
      { label: 'cup', grams: 144 },
    ],
  },
  {
    slug: 'blueberries',
    name: 'Blueberries',
    kcal: 57, protein: 0.7, carbs: 14, fat: 0.3,
    units: [
      { label: 'handful', grams: 40 },
      { label: 'cup', grams: 148 },
    ],
  },
  {
    slug: 'grapes',
    name: 'Grapes',
    kcal: 69, protein: 0.7, carbs: 18, fat: 0.2,
    units: [
      { label: 'handful', grams: 50 },
      { label: 'cup', grams: 151 },
    ],
  },
  // ---- Vegetables ----
  {
    slug: 'broccoli',
    name: 'Broccoli',
    kcal: 34, protein: 2.8, carbs: 7, fat: 0.4,
    units: [
      { label: 'serving', grams: 80 },
      { label: 'cup', grams: 91 },
    ],
  },
  {
    slug: 'carrot',
    name: 'Carrot',
    kcal: 41, protein: 0.9, carbs: 10, fat: 0.2,
    units: [{ label: 'medium', grams: 61 }],
  },
  {
    slug: 'spinach',
    name: 'Spinach',
    kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4,
    units: [
      { label: 'handful', grams: 25 },
      { label: 'cup', grams: 30 },
    ],
  },
  {
    slug: 'tomato',
    name: 'Tomato',
    kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2,
    units: [{ label: 'medium', grams: 123 }],
  },
  {
    slug: 'cucumber',
    name: 'Cucumber',
    kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1,
    units: [{ label: 'serving', grams: 100 }],
  },
  {
    slug: 'bell-pepper',
    name: 'Bell pepper',
    kcal: 31, protein: 1, carbs: 6, fat: 0.3,
    units: [{ label: 'medium', grams: 119 }],
  },
  {
    slug: 'avocado',
    name: 'Avocado',
    kcal: 160, protein: 2, carbs: 9, fat: 15,
    units: [
      { label: 'half', grams: 100 },
      { label: 'whole', grams: 200 },
    ],
  },
  // ---- Nuts, fats & misc ----
  {
    slug: 'peanut-butter',
    name: 'Peanut butter',
    kcal: 588, protein: 25, carbs: 20, fat: 50,
    units: [{ label: 'tbsp', grams: 16 }],
  },
  {
    slug: 'almonds',
    name: 'Almonds',
    kcal: 579, protein: 21, carbs: 22, fat: 50,
    units: [
      { label: 'handful', grams: 28 },
      { label: 'serving', grams: 30 },
    ],
  },
  {
    slug: 'olive-oil',
    name: 'Olive oil',
    kcal: 884, protein: 0, carbs: 0, fat: 100,
    units: [
      { label: 'tbsp', grams: 14 },
      { label: 'tsp', grams: 5 },
    ],
  },
  {
    slug: 'honey',
    name: 'Honey',
    kcal: 304, protein: 0.3, carbs: 82, fat: 0,
    units: [
      { label: 'tsp', grams: 7 },
      { label: 'tbsp', grams: 21 },
    ],
  },
  {
    slug: 'baked-beans',
    name: 'Baked beans',
    kcal: 78, protein: 4.8, carbs: 13, fat: 0.5,
    units: [
      { label: 'serving', grams: 200 },
      { label: 'half can', grams: 207 },
    ],
  },
  {
    slug: 'hummus',
    name: 'Hummus',
    kcal: 166, protein: 8, carbs: 14, fat: 10,
    units: [
      { label: 'tbsp', grams: 15 },
      { label: 'serving', grams: 50 },
    ],
  },
];
