import { sigWords, wordsMatch } from '@/features/food-search/ingredientMatch';

/**
 * Turn a recipe amount into grams by rule, not by asking the model.
 *
 * The scanner used to return grams directly, doing the arithmetic itself.
 * It got it wrong often and differently each time: 2 tbsp of tomato puree
 * came back as 10 g, 1 tsp of soy sauce as 15 g. The model is good at
 * READING "2 tbsp" off a page and bad at multiplying, so it now reports
 * the amount and unit as written and this table does the rest. Same line
 * in, same grams out, every time.
 *
 * The model's own gram guess is still carried and used when the unit is
 * one this table cannot place ("a splash", "1 pack").
 */
export interface WrittenAmount {
  name: string;
  /** Number as written. Undefined when the recipe gave none ("salt"). */
  amount?: number;
  /** Unit as written, any spelling. */
  unit?: string;
  /** The model's own estimate in grams, as a fallback. */
  grams?: number;
}

export interface ConvertedAmount {
  grams: number;
  /** Where the number came from, for the review screen. */
  basis: 'weight' | 'measure' | 'count' | 'model' | 'default';
}

type UnitKind =
  | 'g' | 'kg' | 'mg' | 'oz' | 'lb' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup'
  | 'tin' | 'clove' | 'pinch' | 'slice' | 'stick' | 'cube' | 'handful'
  | 'bunch' | 'sprig' | 'leaf' | 'piece';

const UNIT_ALIASES: Record<string, UnitKind> = {
  g: 'g', gr: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  mg: 'mg', oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  tin: 'tin', tins: 'tin', can: 'tin', cans: 'tin',
  clove: 'clove', cloves: 'clove',
  pinch: 'pinch', pinches: 'pinch', dash: 'pinch',
  slice: 'slice', slices: 'slice', rasher: 'slice', rashers: 'slice',
  stick: 'stick', sticks: 'stick', stalk: 'stick', stalks: 'stick',
  cube: 'cube', cubes: 'cube',
  handful: 'handful', handfuls: 'handful',
  bunch: 'bunch', bunches: 'bunch',
  sprig: 'sprig', sprigs: 'sprig',
  leaf: 'leaf', leaves: 'leaf',
  piece: 'piece', pieces: 'piece', whole: 'piece', item: 'piece', each: 'piece',
  count: 'piece', x: 'piece', '': 'piece', unit: 'piece', units: 'piece',
  small: 'piece', medium: 'piece', large: 'piece',
};

/** Same word, allowing a plural. wordsMatch alone refuses short words
 *  ("eggs" / "egg"), which is right for search and wrong for this table. */
function same(word: string, key: string): boolean {
  const stem = (w: string) => w.replace(/(?:es|s)$/, '');
  return wordsMatch(word, key) || stem(word) === stem(key);
}

/** First table row with a word matching the ingredient name wins. */
function lookup(name: string, table: [string[], number][]): number | undefined {
  const words = sigWords(name);
  for (const [keys, grams] of table) {
    if (keys.every((k) => words.some((w) => same(w, k)))) return grams;
  }
  return undefined;
}

/** Grams in one teaspoon, by what is being measured. Default: water-like. */
const TSP: [string[], number][] = [
  [['salt'], 6], [['sugar'], 4], [['honey'], 7], [['syrup'], 7],
  [['oil'], 4.5], [['butter'], 5], [['flour'], 2.6], [['cornflour'], 2.6],
  [['baking'], 4], [['bicarbonate'], 5], [['yeast'], 3],
  [['dried'], 1], [['rosemary'], 1], [['thyme'], 1], [['oregano'], 1],
  [['basil'], 1], [['parsley'], 1], [['herbs'], 1], [['sage'], 1],
  [['flakes'], 2], [['paprika'], 2], [['cumin'], 2], [['turmeric'], 2],
  [['cinnamon'], 2], [['nutmeg'], 2], [['cayenne'], 2], [['coriander'], 2],
  [['ginger'], 2], [['powder'], 2.5], [['masala'], 2], [['pepper'], 2],
  [['spice'], 2], [['seasoning'], 2], [['seeds'], 3],
];

/** Grams in one cup. Default: 240 (a liquid). */
const CUP: [string[], number][] = [
  [['flour'], 125], [['sugar'], 200], [['rice'], 185], [['oats'], 90],
  [['lentils'], 190], [['quinoa'], 170], [['couscous'], 175], [['pasta'], 100],
  [['cheese'], 110], [['spinach'], 30], [['butter'], 225], [['honey'], 340],
  [['nuts'], 140], [['breadcrumbs'], 110], [['beans'], 175],
];

/** Grams in one tin. Drained weights for things that come in liquid. */
const TIN: [string[], number][] = [
  [['tuna'], 110], [['sardines'], 90], [['salmon'], 150], [['mackerel'], 90],
  [['coconut'], 400], [['tomatoes'], 400], [['tomato'], 400], [['passata'], 400],
  [['beans'], 240], [['chickpeas'], 240], [['lentils'], 240], [['sweetcorn'], 160],
  [['corn'], 160], [['soup'], 400],
];

/** Grams in one of something counted. Medium size. */
const PIECE: [string[], number][] = [
  [['garlic', 'bulb'], 40], [['garlic'], 3],
  [['spring', 'onion'], 15], [['red', 'onion'], 150], [['onion'], 150], [['shallot'], 30],
  [['sweet', 'potato'], 200], [['potato'], 170],
  [['cherry', 'tomato'], 15], [['tomato'], 120],
  [['carrot'], 60], [['celery'], 40], [['leek'], 150], [['courgette'], 200],
  [['zucchini'], 200], [['aubergine'], 300], [['eggplant'], 300], [['cucumber'], 300],
  [['bell', 'pepper'], 160], [['chilli'], 15], [['pepper'], 160],
  [['mushroom'], 15], [['avocado'], 150], [['broccoli'], 350],
  [['cauliflower'], 600], [['cabbage'], 900], [['lettuce'], 300],
  [['lemon', 'juice'], 45], [['lime', 'juice'], 30],
  [['lemon'], 100], [['lime'], 65], [['orange'], 150], [['apple'], 180],
  [['banana'], 120], [['pear'], 170], [['peach'], 150], [['mango'], 300],
  [['egg', 'white'], 33], [['egg', 'yolk'], 17], [['egg'], 50],
  [['chicken', 'breast'], 165], [['chicken', 'thigh'], 110], [['chicken', 'drumstick'], 90],
  [['sausage'], 60], [['bacon'], 15], [['tortilla'], 60], [['wrap'], 60],
  [['pitta'], 60], [['bagel'], 85], [['bread'], 35], [['bun'], 60],
  [['stock'], 10], [['bay'], 0.2], [['date'], 8], [['fig'], 40],
  [['salmon'], 130], [['cod'], 140], [['steak'], 200], [['burger'], 110],
];

const SLICE: [string[], number][] = [
  [['bread'], 35], [['toast'], 35], [['bacon'], 15], [['ham'], 20],
  [['cheese'], 20], [['lemon'], 8], [['tomato'], 20], [['turkey'], 20],
];

function sizeFactor(name: string, unit: string): number {
  const text = `${name} ${unit}`.toLowerCase();
  if (/\b(small|baby|mini)\b/.test(text)) return 0.75;
  if (/\b(large|big|jumbo)\b/.test(text)) return 1.3;
  return 1;
}

/** The unit as this table understands it, or null. */
export function unitKind(unit: string | undefined): UnitKind | null {
  const key = (unit ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return UNIT_ALIASES[key] ?? null;
}

function sane(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** Grams for one written amount. Never returns 0 or NaN. */
export function gramsFor(line: WrittenAmount): ConvertedAmount {
  const fallback = (): ConvertedAmount =>
    sane(line.grams)
      ? { grams: Math.round(line.grams * 10) / 10, basis: 'model' }
      : { grams: 100, basis: 'default' };

  const kind = unitKind(line.unit);
  // "salt", "pepper to taste": no amount at all. A pinch.
  if (!sane(line.amount)) {
    return sane(line.grams) ? fallback() : { grams: 2, basis: 'default' };
  }
  const n = line.amount;
  const round = (g: number, basis: ConvertedAmount['basis']): ConvertedAmount => ({
    grams: g >= 10 ? Math.round(g) : Math.round(g * 10) / 10,
    basis,
  });

  switch (kind) {
    case 'g': return round(n, 'weight');
    case 'kg': return round(n * 1000, 'weight');
    case 'mg': return round(n / 1000, 'weight');
    case 'oz': return round(n * 28.35, 'weight');
    case 'lb': return round(n * 453.6, 'weight');
    // Millilitres are treated as grams. Oil is 8% lighter and honey 40%
    // heavier, but the database's per-100 values for liquids are per 100 ml
    // as often as per 100 g, so a correction here would be false precision.
    case 'ml': return round(n, 'measure');
    case 'l': return round(n * 1000, 'measure');
    case 'tsp': return round(n * (lookup(line.name, TSP) ?? 5), 'measure');
    case 'tbsp': return round(n * (lookup(line.name, TSP) ?? 5) * 3, 'measure');
    case 'cup': return round(n * (lookup(line.name, CUP) ?? 240), 'measure');
    case 'tin': return round(n * (lookup(line.name, TIN) ?? 400), 'measure');
    case 'clove': return round(n * 3, 'count');
    case 'pinch': return round(n * 0.5, 'measure');
    case 'cube': return round(n * 10, 'count');
    case 'handful': return round(n * 30, 'measure');
    case 'bunch': return round(n * 30, 'measure');
    case 'sprig': return round(n * 1, 'count');
    case 'leaf': return round(n * 0.2, 'count');
    case 'stick': {
      const each = lookup(line.name, [[['celery'], 40], [['cinnamon'], 3], [['butter'], 113]]);
      return each ? round(n * each, 'count') : fallback();
    }
    case 'slice': {
      const each = lookup(line.name, SLICE);
      return each ? round(n * each, 'count') : fallback();
    }
    case 'piece': {
      const each = lookup(line.name, PIECE);
      return each ? round(n * each * sizeFactor(line.name, line.unit ?? ''), 'count') : fallback();
    }
    default:
      return fallback();
  }
}

/** "2 tbsp", "1 kg", "×4" - the amount as the recipe wrote it, for display. */
export function writtenLabel(line: WrittenAmount): string | null {
  if (!sane(line.amount)) return null;
  const n = String(Math.round(line.amount * 100) / 100);
  const unit = (line.unit ?? '').trim();
  return unit ? `${n} ${unit}` : `×${n}`;
}
