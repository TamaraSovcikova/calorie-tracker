/**
 * Rule-based portion suggestions for common food types.
 *
 * `suggestPortions(name, brand)` returns a CustomUnit[] for a food whose name
 * matches a known category (e.g. "Hovis Wholemeal Bread" → [{ label: 'slice', grams: 38 }]).
 * These are offered as one-tap chips in QuantityStep and ManualEntryForm, and
 * are automatically pre-populated on new OFF / USDA foods that have no portions.
 *
 * `parseServingDescription(text, grams)` tries to extract a human label from a
 * serving-size string like "1 slice (38g)" or "2 biscuits" so we can store it
 * as a custom unit instead of the generic "1 serving".
 *
 * Rules are checked first-match-wins, most specific first.
 */

import type { CustomUnit } from '@/db/types';

interface PortionRule {
  /** One or more phrases - any hit triggers the rule. Phrases are
   *  matched case-insensitively; multi-word phrases use substring matching,
   *  single words require a word boundary. */
  match: string[];
  units: CustomUnit[];
}

const RULES: PortionRule[] = [
  // ---- Poultry: most specific first ----
  {
    match: ['chicken breast', 'chicken fillet', 'breast fillet'],
    units: [
      { label: 'small breast', grams: 130 },
      { label: 'medium breast', grams: 165 },
      { label: 'large breast', grams: 200 },
    ],
  },
  {
    match: ['chicken thigh'],
    units: [{ label: 'thigh (boneless)', grams: 120 }],
  },
  {
    match: ['chicken drumstick', 'chicken leg'],
    units: [{ label: 'drumstick', grams: 100 }],
  },
  {
    match: ['chicken wing'],
    units: [{ label: 'wing', grams: 90 }],
  },

  // ---- Eggs ----
  {
    match: ['egg white'],
    units: [{ label: 'egg white', grams: 30 }],
  },
  {
    match: ['egg yolk'],
    units: [{ label: 'egg yolk', grams: 18 }],
  },
  {
    match: ['egg', 'eggs'],
    units: [
      { label: 'small egg', grams: 48 },
      { label: 'medium egg', grams: 58 },
      { label: 'large egg', grams: 68 },
    ],
  },

  // ---- Fish & seafood ----
  {
    match: ['salmon steak', 'tuna steak'],
    units: [{ label: 'steak', grams: 180 }],
  },
  {
    match: [
      'salmon fillet', 'salmon portion',
      'cod fillet', 'haddock fillet', 'tilapia fillet',
      'sea bass fillet', 'bream fillet', 'plaice fillet',
    ],
    units: [{ label: 'fillet', grams: 130 }],
  },
  {
    match: ['smoked salmon'],
    units: [{ label: 'slice', grams: 23 }],
  },
  {
    match: ['king prawn', 'king shrimp'],
    units: [{ label: 'prawn', grams: 12 }],
  },
  {
    match: ['prawn', 'shrimp'],
    units: [{ label: 'prawn', grams: 8 }],
  },

  // ---- Processed meat ----
  {
    match: ['bacon rasher', 'bacon strip', 'back bacon', 'streaky bacon'],
    units: [{ label: 'rasher', grams: 30 }],
  },
  {
    match: ['bacon'],
    units: [{ label: 'rasher', grams: 30 }],
  },
  {
    match: ['chipolata'],
    units: [{ label: 'chipolata', grams: 35 }],
  },
  {
    match: ['sausage', 'banger'],
    units: [{ label: 'sausage', grams: 50 }],
  },
  {
    match: ['hot dog', 'frankfurter', 'wiener'],
    units: [{ label: 'hot dog', grams: 50 }],
  },
  {
    match: ['meatball'],
    units: [{ label: 'meatball', grams: 20 }],
  },
  {
    match: ['burger patty', 'beef burger', 'turkey burger', 'veggie burger'],
    units: [{ label: 'patty', grams: 115 }],
  },
  {
    match: ['steak'],
    units: [
      { label: 'small steak', grams: 170 },
      { label: 'medium steak', grams: 225 },
    ],
  },
  {
    match: ['ham slice', 'prosciutto', 'salami', 'pepperoni', 'chorizo slice'],
    units: [{ label: 'slice', grams: 20 }],
  },

  // ---- Bread: specific then broad ----
  {
    match: ['sourdough loaf', 'sourdough bread'],
    units: [{ label: 'slice', grams: 50 }],
  },
  {
    match: ['bagel'],
    units: [{ label: 'bagel', grams: 105 }],
  },
  {
    match: ['pitta', 'pita'],
    units: [{ label: 'pitta', grams: 60 }],
  },
  {
    match: ['crumpet'],
    units: [{ label: 'crumpet', grams: 45 }],
  },
  {
    match: ['english muffin', 'thomas muffin'],
    units: [{ label: 'muffin', grams: 58 }],
  },
  {
    match: ['croissant'],
    units: [{ label: 'croissant', grams: 67 }],
  },
  {
    match: [
      'tortilla wrap', 'flour tortilla', 'corn tortilla',
      'seeded wrap', 'protein wrap', 'high protein wrap', 'wholemeal wrap',
    ],
    units: [{ label: 'wrap', grams: 50 }],
  },
  {
    match: ['wrap'],
    units: [{ label: 'wrap', grams: 50 }],
  },
  {
    match: ['bread roll', 'dinner roll', 'burger bun', 'hot dog bun', 'bap', 'cob', 'barm'],
    units: [{ label: 'roll', grams: 55 }],
  },
  {
    // Generic bread - catch-all at the end. Multi-word rule so we avoid
    // matching "banana bread" or "breadcrumb" with a single-word boundary.
    match: [
      'white bread', 'brown bread', 'wholemeal bread', 'wholegrain bread',
      'seeded bread', 'multigrain bread', 'rye bread', 'sliced bread',
      'sandwich bread', 'farmhouse bread', 'granary bread',
    ],
    units: [{ label: 'slice', grams: 38 }],
  },

  // ---- Crackers & crispbreads ----
  {
    match: ['rice cake'],
    units: [{ label: 'rice cake', grams: 8 }],
  },
  {
    match: ['cream cracker', 'ryvita', 'crispbread', 'oat cake', 'oatcake'],
    units: [{ label: 'cracker', grams: 8 }],
  },
  {
    match: ['cracker'],
    units: [{ label: 'cracker', grams: 8 }],
  },

  // ---- Biscuits & sweet bakery ----
  {
    match: ['digestive biscuit', 'rich tea biscuit', 'hobnob', 'bourbon biscuit'],
    units: [{ label: 'biscuit', grams: 15 }],
  },
  {
    match: ['shortbread'],
    units: [{ label: 'finger', grams: 20 }],
  },
  {
    match: ['cookie'],
    units: [{ label: 'cookie', grams: 18 }],
  },

  // ---- Crisps / chips (UK-focused; single bags) ----
  {
    match: ['crisps', 'potato crisps', 'tortilla chips', 'nachos'],
    units: [
      { label: 'small bag (25g)', grams: 25 },
      { label: 'large bag (40g)', grams: 40 },
    ],
  },

  // ---- Chocolate & bars ----
  {
    match: ['mars bar', 'snickers bar', 'twix', 'bounty', 'milky way'],
    units: [{ label: 'bar', grams: 45 }],
  },
  {
    match: ['protein bar', 'quest bar', 'grenade bar', 'fulfil bar'],
    units: [{ label: 'bar', grams: 60 }],
  },
  {
    match: ['cereal bar', 'nutri-grain', 'tracker bar'],
    units: [{ label: 'bar', grams: 37 }],
  },
  {
    match: ['flapjack'],
    units: [{ label: 'flapjack', grams: 70 }],
  },
  {
    match: ['chocolate square', 'chocolate chunk'],
    units: [{ label: 'square', grams: 5 }],
  },

  // ---- Fruit ----
  {
    match: ['apple'],
    units: [
      { label: 'small apple', grams: 138 },
      { label: 'medium apple', grams: 182 },
      { label: 'large apple', grams: 223 },
    ],
  },
  {
    match: ['banana'],
    units: [
      { label: 'small banana', grams: 90 },
      { label: 'medium banana', grams: 118 },
      { label: 'large banana', grams: 152 },
    ],
  },
  {
    match: ['orange', 'clementine', 'satsuma', 'tangerine', 'mandarin'],
    units: [{ label: 'fruit', grams: 131 }],
  },
  {
    match: ['pear'],
    units: [
      { label: 'small pear', grams: 130 },
      { label: 'medium pear', grams: 166 },
    ],
  },
  {
    match: ['grape', 'grapes'],
    units: [{ label: 'handful (~16)', grams: 80 }],
  },
  {
    match: ['strawberry', 'strawberries'],
    units: [{ label: 'strawberry', grams: 12 }],
  },
  {
    match: ['blueberry', 'blueberries'],
    units: [{ label: 'handful (~40)', grams: 60 }],
  },
  {
    match: ['raspberry', 'raspberries'],
    units: [{ label: 'raspberry', grams: 5 }],
  },
  {
    match: ['avocado'],
    units: [
      { label: 'half avocado', grams: 75 },
      { label: 'whole avocado', grams: 150 },
    ],
  },
  {
    match: ['mango'],
    units: [{ label: 'mango (peeled, ~medium)', grams: 200 }],
  },
  {
    match: ['peach', 'nectarine'],
    units: [{ label: 'fruit (medium)', grams: 150 }],
  },
  {
    match: ['kiwi', 'kiwifruit'],
    units: [{ label: 'kiwi', grams: 76 }],
  },
  {
    match: ['melon', 'cantaloupe', 'honeydew'],
    units: [{ label: 'slice', grams: 200 }],
  },
  {
    match: ['pineapple'],
    units: [{ label: 'slice', grams: 84 }],
  },
  {
    match: ['cherry', 'cherries'],
    units: [{ label: 'cherry', grams: 8 }],
  },
  {
    match: ['plum'],
    units: [{ label: 'plum (medium)', grams: 78 }],
  },

  // ---- Nuts & nut butters ----
  {
    match: ['peanut butter', 'almond butter', 'cashew butter', 'hazelnut butter', 'nut butter'],
    units: [
      { label: 'teaspoon', grams: 6 },
      { label: 'tablespoon', grams: 16 },
    ],
  },
  {
    match: ['almond', 'almonds'],
    units: [{ label: 'handful (~23)', grams: 28 }],
  },
  {
    match: ['cashew', 'cashews'],
    units: [{ label: 'handful (~18)', grams: 28 }],
  },
  {
    match: ['walnut', 'walnuts'],
    units: [{ label: 'handful (~7 halves)', grams: 28 }],
  },
  {
    match: ['pecan', 'pecans'],
    units: [{ label: 'handful (~19 halves)', grams: 28 }],
  },
  {
    match: ['pistachio', 'pistachios'],
    units: [{ label: 'handful (~49)', grams: 28 }],
  },
  {
    match: ['mixed nuts'],
    units: [{ label: 'handful', grams: 30 }],
  },
  {
    match: ['brazil nut', 'brazil nuts'],
    units: [{ label: 'nut', grams: 5 }],
  },

  // ---- Dairy ----
  {
    match: ['cheddar', 'parmesan', 'gouda', 'edam', 'brie', 'camembert', 'stilton'],
    units: [
      { label: 'thin slice', grams: 18 },
      { label: 'thick slice', grams: 30 },
    ],
  },
  {
    match: ['cheese slice', 'processed cheese', 'cheese spread', 'babybel'],
    units: [{ label: 'portion', grams: 21 }],
  },
  {
    match: ['mozzarella'],
    units: [
      { label: 'slice', grams: 20 },
      { label: 'ball (125g)', grams: 125 },
    ],
  },
  {
    match: ['cream cheese', 'cottage cheese'],
    units: [{ label: 'tablespoon', grams: 15 }],
  },
  {
    match: ['butter', 'margarine', 'dairy spread'],
    units: [
      { label: 'thin scrape', grams: 5 },
      { label: 'portion', grams: 10 },
    ],
  },
  {
    match: ['greek yoghurt', 'greek yogurt', 'skyr'],
    units: [{ label: 'pot (170g)', grams: 170 }],
  },
  {
    match: ['yoghurt', 'yogurt'],
    units: [{ label: 'pot (125g)', grams: 125 }],
  },

  // ---- Grains & pasta (dry portions) ----
  {
    match: ['spaghetti', 'penne', 'fusilli', 'rigatoni', 'linguine', 'tagliatelle', 'farfalle', 'orzo'],
    units: [{ label: 'portion (dry)', grams: 75 }],
  },
  {
    match: ['pasta'],
    units: [{ label: 'portion (dry)', grams: 75 }],
  },
  {
    match: ['basmati rice', 'jasmine rice', 'brown rice', 'long grain rice', 'arborio rice'],
    units: [{ label: 'portion (dry)', grams: 75 }],
  },
  {
    match: ['rice'],
    units: [{ label: 'portion (dry)', grams: 75 }],
  },
  {
    match: ['porridge oat', 'rolled oat', 'jumbo oat'],
    units: [
      { label: 'small bowl', grams: 40 },
      { label: 'large bowl', grams: 60 },
    ],
  },
  {
    match: ['granola'],
    units: [{ label: 'portion', grams: 45 }],
  },
  {
    match: ['muesli'],
    units: [{ label: 'portion', grams: 50 }],
  },
  {
    match: ['quinoa'],
    units: [{ label: 'portion (dry)', grams: 60 }],
  },
  {
    match: ['couscous'],
    units: [{ label: 'portion (dry)', grams: 60 }],
  },
  {
    match: ['noodle', 'noodles'],
    units: [{ label: 'nest / portion (dry)', grams: 75 }],
  },

  // ---- Protein powder ----
  {
    match: ['whey protein', 'protein powder', 'casein protein', 'plant protein powder'],
    units: [{ label: 'scoop (~30g)', grams: 30 }],
  },
];

/**
 * Return suggested custom units for a food based on its name (and optional brand).
 * Rules are evaluated in declaration order; the first match wins.
 * Returns an empty array if nothing matches.
 */
export function suggestPortions(name: string, brand?: string): CustomUnit[] {
  const haystack = `${name} ${brand ?? ''}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.match.some((phrase) => phraseMatches(haystack, phrase))) {
      return rule.units;
    }
  }
  return [];
}

function phraseMatches(haystack: string, phrase: string): boolean {
  const p = phrase.toLowerCase();
  if (p.includes(' ')) {
    // Multi-word phrase: simple substring match is fine
    return haystack.includes(p);
  }
  // Single word: require a word boundary so "egg" doesn't match "eggplant"
  // and "bread" doesn't match "breadcrumb".
  // We allow a single trailing 's' so "banana" matches "bananas" and
  // "egg" matches "eggs" - but we still reject two+ trailing letters
  // ("eggplant" has "pl" after "egg", "breadcrumb" has "cr" after "bread").
  try {
    return new RegExp(`(?<![a-z])${escRe(p)}(?![a-z][a-z])`).test(haystack);
  } catch {
    return haystack.includes(p);
  }
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Try to extract a human-readable serving label from a serving-size string
 * (as provided by Open Food Facts or USDA Branded `householdServingFullText`).
 *
 * Examples that parse successfully:
 *   "1 slice (38g)"       → { label: 'slice', grams: 38 }
 *   "2 biscuits (30g)"    → { label: 'biscuit', grams: 15 }  (per biscuit)
 *   "1 medium egg (58g)"  → { label: 'medium egg', grams: 58 }
 *   "1 slice"             → { label: 'slice', grams: <servingGrams> }
 *
 * Returns null for strings like "38g", "100g", "1 serving", or foreign text.
 */
export function parseServingDescription(
  text: string,
  servingGrams: number,
): CustomUnit | null {
  if (!text || !servingGrams || servingGrams <= 0) return null;

  // Strip a parenthetical gram weight: "1 slice (38g)" → "1 slice"
  const stripped = text
    .trim()
    .replace(/\s*\(\d+(?:\.\d+)?\s*(?:g|ml)\)/i, '')
    .trim();

  // Must start with a positive number
  const m = stripped.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!m) return null;

  const count = parseFloat(m[1]);
  const rawLabel = m[2].trim();

  if (!rawLabel || !Number.isFinite(count) || count <= 0) return null;

  // Reject non-ASCII (foreign-language labels look odd)
  if (/[^\x00-\x7F]/.test(rawLabel)) return null;

  const lower = rawLabel.toLowerCase();

  // Generic labels that add no value over plain grams
  const skip = new Set([
    'g', 'ml', 'oz', 'kg', 'lb', 'gram', 'grams', 'milligram', 'milligrams',
    'serving', 'servings', 'portion', 'portions', 'unit', 'units',
    'pack', 'packet', 'package', 'container',
  ]);
  if (skip.has(lower)) return null;

  if (rawLabel.length < 2 || rawLabel.length > 60) return null;

  const gramsPerUnit = Math.round((servingGrams / count) * 10) / 10;
  if (gramsPerUnit <= 0 || !Number.isFinite(gramsPerUnit)) return null;

  return { label: lower, grams: gramsPerUnit };
}
