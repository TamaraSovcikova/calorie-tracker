import type { Meal } from '@/db/types';

/**
 * Meal prep maths: scaling a recipe to what was actually bought, fitting it
 * to a per-portion target, and tracking how much of a cooked batch is left.
 *
 * A BATCH is a meal row with `batch_date` set: one dated cook. A recipe is
 * the reusable template it was cooked from. The split exists because the
 * shop changes a little every week (200 g fewer mushrooms, a different
 * meat), and before it the only way to record that was a new "meal" each
 * time, which buried the recipes under near-duplicates.
 *
 * Everything here is pure. Amounts are in whatever unit the ingredient
 * uses; macros are linear in the amount, so a line only needs its totals at
 * the current amount.
 */

export function isBatch(meal: Pick<Meal, 'batch_date'>): boolean {
  return !!meal.batch_date;
}

/** Round an amount the way a person would weigh it. */
export function roundAmount(qty: number, unit: string): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  if (unit === 'g' || unit === 'ml') {
    if (qty >= 100) return Math.round(qty / 5) * 5;
    return Math.max(1, Math.round(qty));
  }
  // Counted units (eggs, slices, servings): quarters.
  return Math.max(0.25, Math.round(qty * 4) / 4);
}

/** Factor that takes one ingredient from `from` to `to`. 1 when undefined. */
export function scaleFactor(from: number, to: number): number {
  if (!(from > 0) || !(to > 0) || !Number.isFinite(to / from)) return 1;
  return to / from;
}

/** One ingredient as the fitter sees it. */
export interface FitLine {
  qty: number;
  unit: string;
  /** Totals this line contributes at `qty`. */
  kcal: number;
  protein: number;
  /** Keep this amount fixed. */
  locked: boolean;
}

export interface FitTarget {
  /** Per portion. Either may be omitted. */
  kcal?: number;
  protein?: number;
}

export interface FitResult {
  /** New amount per line, same order. */
  qtys: number[];
  perPortion: { kcal: number; protein: number };
  /** Targets that could not be reached with the unlocked ingredients. */
  missed: ('kcal' | 'protein')[];
  /** False when there was nothing to adjust (all locked, or no target). */
  changed: boolean;
}

/** An ingredient counts as a protein source above this share of its kcal. */
const LEAN_PROTEIN_SHARE = 0.35;
/** How far one fit may move an ingredient, relative to where it is now. */
const MIN_FACTOR = 0.1;
const MAX_FACTOR = 5;
const clamp = (f: number) =>
  Number.isFinite(f) ? Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, f)) : 1;

/**
 * Adjust the unlocked ingredients so one portion lands on the target.
 *
 * Only the amounts of ingredients already in the meal move. It never adds a
 * food: which rice, from which shop, is the cook's call, and a tool that
 * quietly invents a side is one whose numbers stop being trusted. When the
 * target cannot be reached, the result says which part was missed and the
 * screen says what would fix it.
 *
 * Unlocked ingredients fall into two groups that each move as one, keeping
 * the recipe's proportions inside the group: protein sources, and the rest
 * ("sides"). Protein sources are what reach a protein target; sides are
 * what reach a calorie target. With both targets and both groups that is
 * two unknowns and two equations, solved exactly.
 */
export function fitToTarget(
  lines: FitLine[],
  servings: number,
  target: FitTarget,
): FitResult {
  const n = servings > 0 ? servings : 1;
  const wantK = target.kcal && target.kcal > 0 ? target.kcal * n : undefined;
  const wantP =
    target.protein && target.protein > 0 ? target.protein * n : undefined;

  const sum = (rows: FitLine[]) =>
    rows.reduce(
      (t, l) => ({ k: t.k + l.kcal, p: t.p + l.protein }),
      { k: 0, p: 0 },
    );
  const usable = (l: FitLine) => !l.locked && l.qty > 0 && l.kcal > 0;
  const isLean = (l: FitLine) => (l.protein * 4) / l.kcal >= LEAN_PROTEIN_SHARE;
  const lean = lines.filter((l) => usable(l) && isLean(l));
  const sides = lines.filter((l) => usable(l) && !isLean(l));
  const fixed = sum(lines.filter((l) => !usable(l)));
  const A = sum(lean);
  const B = sum(sides);

  let a = 1; // factor on protein sources
  let b = 1; // factor on sides
  const forProtein = (bNow: number) =>
    A.p > 0 && wantP !== undefined ? clamp((wantP - fixed.p - bNow * B.p) / A.p) : 1;
  const forKcalViaSides = (aNow: number) =>
    B.k > 0 && wantK !== undefined ? clamp((wantK - fixed.k - aNow * A.k) / B.k) : 1;

  if (wantP !== undefined && wantK !== undefined && A.k > 0 && B.k > 0) {
    const det = A.p * B.k - B.p * A.k;
    const rp = wantP - fixed.p;
    const rk = wantK - fixed.k;
    const exactA = (rp * B.k - B.p * rk) / det;
    const exactB = (A.p * rk - rp * A.k) / det;
    const inRange = (f: number) => f >= MIN_FACTOR && f <= MAX_FACTOR;
    if (Math.abs(det) > 1e-9 && inRange(exactA) && inRange(exactB)) {
      a = exactA;
      b = exactB;
    } else {
      // No exact answer inside sane bounds. Protein first, then calories,
      // then protein once more against the sides that calories settled on.
      a = forProtein(1);
      b = forKcalViaSides(a);
      a = forProtein(b);
    }
  } else if (wantP !== undefined && wantK !== undefined) {
    // One group only. Sides can only chase calories; protein sources chase
    // protein, since that is the number that is harder to make up later.
    if (B.k > 0) b = forKcalViaSides(1);
    else if (A.k > 0) a = forProtein(1);
  } else if (wantK !== undefined) {
    // Calories only: move the sides and leave the protein alone. With no
    // sides, the protein sources are all there is to move.
    if (B.k > 0) b = forKcalViaSides(1);
    else if (A.k > 0) a = clamp((wantK - fixed.k) / A.k);
  } else if (wantP !== undefined) {
    if (A.p > 0) a = forProtein(1);
    else if (B.p > 0) b = clamp((wantP - fixed.p) / B.p);
  }

  const qtys = lines.map((l) => {
    if (!usable(l)) return l.qty;
    return roundAmount(l.qty * (isLean(l) ? a : b), l.unit);
  });
  // Report what the ROUNDED amounts give: that is what will be cooked.
  const after = lines.reduce(
    (t, l, i) => {
      const f = l.qty > 0 ? qtys[i] / l.qty : 1;
      return { k: t.k + l.kcal * f, p: t.p + l.protein * f };
    },
    { k: 0, p: 0 },
  );
  const perPortion = { kcal: after.k / n, protein: after.p / n };
  const missed: FitResult['missed'] = [];
  if (target.protein && Math.abs(perPortion.protein - target.protein) > Math.max(2, target.protein * 0.04))
    missed.push('protein');
  if (target.kcal && Math.abs(perPortion.kcal - target.kcal) > Math.max(15, target.kcal * 0.04))
    missed.push('kcal');

  return {
    qtys,
    perPortion,
    missed,
    changed: qtys.some((q, i) => q !== lines[i].qty),
  };
}

/** Portions of a batch not yet logged. Never negative. */
export function portionsLeft(servings: number, logged: number): number {
  return Math.max(0, Math.round((servings - logged) * 100) / 100);
}

/** Below this many portions a batch is as good as gone. */
const EMPTY_PORTIONS = 0.05;

export interface BatchStatus {
  left: number;
  finished: boolean;
  /** ISO timestamp it finished: marked by hand, or the last log that
   *  emptied it. Undefined while active. */
  finishedAt?: string;
}

export function batchStatus(
  meal: Pick<Meal, 'servings' | 'finished_at'>,
  logged: { portions: number; lastAt?: string } | undefined,
): BatchStatus {
  const servings =
    typeof meal.servings === 'number' && meal.servings > 0 ? meal.servings : 1;
  const left = portionsLeft(servings, logged?.portions ?? 0);
  if (meal.finished_at) return { left, finished: true, finishedAt: meal.finished_at };
  if (left <= EMPTY_PORTIONS)
    return { left: 0, finished: true, finishedAt: logged?.lastAt };
  return { left, finished: false };
}

/** How long a finished batch stays in the list before it folds away. */
export const FINISHED_VISIBLE_DAYS = 7;

/** Portions that `grams` of the finished dish amount to. */
export function portionsForGrams(
  grams: number,
  totalGrams: number,
  servings: number,
): number {
  if (!(grams > 0) || !(totalGrams > 0)) return 0;
  return (grams / totalGrams) * (servings > 0 ? servings : 1);
}

/** "Chicken stroganoff · 11 Nov" from a recipe name and a formatted date. */
export function batchName(recipeName: string, dateLabel: string): string {
  // Cooking from a batch should not stack dates: "X · 4 Nov · 11 Nov".
  const base = recipeName.replace(/\s+·\s+\d{1,2} [A-Z][a-z]{2}$/, '');
  return `${base} · ${dateLabel}`;
}

/* ------------------------------------------------------------------ *
 * Changing the portion: "what could I add to get 100 kcal more?"
 * ------------------------------------------------------------------ */

/** One ingredient as the options list sees it. */
export interface OptionLine {
  qty: number;
  unit: string;
  /** Totals this line contributes at `qty`. */
  kcal: number;
  protein: number;
  /** Salt, herbs, spices: never offered as a way to change a portion. */
  negligible?: boolean;
}

/** A per-portion change. Set exactly one. May be negative. */
export interface PortionChange {
  kcal?: number;
  protein?: number;
}

export interface PortionOption {
  /** 'one' moves a single ingredient, 'all' scales the whole recipe. */
  kind: 'one' | 'all';
  /** The ingredient moved, for 'one'. */
  index?: number;
  /** New amount for every line, same order. */
  qtys: number[];
  /** What a portion comes to with these amounts (after rounding). */
  perPortion: { kcal: number; protein: number };
  /**
   * Shown straight away. The rest sit behind "more options": they work,
   * but they lean on a minor ingredient.
   */
  primary: boolean;
}

/** How far one option may move an ingredient: at most 2.5x, at least 1/4. */
const OPTION_MAX_FACTOR = 2.5;
const OPTION_MIN_FACTOR = 0.25;
/** An ingredient is a "main" one from this share of the recipe upward. */
const MAIN_SHARE = 0.1;
/** At most this many single-ingredient options up front. */
const MAX_PRIMARY = 4;
/** To count as a way to add protein, this share of its kcal is protein. */
const PROTEIN_SOURCE_SHARE = 0.2;
/** Rounding (whole eggs, quarter wraps) may miss the ask by this much. */
const OPTION_TOLERANCE = 0.3;

/**
 * The sensible ways to change a portion by `change`.
 *
 * The earlier design had one "fit" button that picked an answer. But "100
 * kcal more" has several good answers (more chicken, more rice, more
 * cheese) that differ in what they do to the protein and to the shopping,
 * and only the cook knows which she wants. So this lists them.
 *
 * It also refuses to list the silly ones, which matter as much:
 *  - seasonings are never an option;
 *  - nothing that would need an ingredient more than 2.5x or under a
 *    quarter of what the recipe has (100 kcal more "by adding broccoli" is
 *    half a kilo of broccoli);
 *  - for protein, only ingredients that are actually a protein source;
 *  - nothing where rounding to a real amount misses the ask by over 30%;
 *  - counted things (wraps, eggs) only in halves per portion, and only up
 *    front when it is a whole one each.
 * Minor ingredients that pass are kept, but not shown first.
 */
export function portionOptions(
  lines: OptionLine[],
  servings: number,
  change: PortionChange,
): PortionOption[] {
  const n = servings > 0 ? servings : 1;
  const byProtein = change.protein !== undefined && change.protein !== 0;
  const ask = byProtein ? (change.protein as number) : (change.kcal ?? 0);
  if (!ask || !Number.isFinite(ask)) return [];
  const want = ask * n; // change across the whole batch
  const valueOf = (l: OptionLine) => (byProtein ? l.protein : l.kcal);

  const usable = (l: OptionLine) => !l.negligible && l.qty > 0 && l.kcal > 0;
  const total = lines.reduce(
    (t, l) => ({ kcal: t.kcal + l.kcal, protein: t.protein + l.protein }),
    { kcal: 0, protein: 0 },
  );
  const totalValue = byProtein ? total.protein : total.kcal;

  const outcome = (qtys: number[]) => {
    const t = lines.reduce(
      (acc, l, i) => {
        const f = l.qty > 0 ? qtys[i] / l.qty : 1;
        return { kcal: acc.kcal + l.kcal * f, protein: acc.protein + l.protein * f };
      },
      { kcal: 0, protein: 0 },
    );
    return { kcal: t.kcal / n, protein: t.protein / n };
  };
  /** Did the rounded amounts deliver roughly what was asked? */
  const delivers = (per: { kcal: number; protein: number }) => {
    const got = (byProtein ? per.protein : per.kcal) - totalValue / n;
    return Math.sign(got) === Math.sign(ask) && Math.abs(got - ask) <= Math.abs(ask) * OPTION_TOLERANCE;
  };

  const options: (PortionOption & { share: number })[] = [];
  lines.forEach((l, i) => {
    if (!usable(l)) return;
    const value = valueOf(l);
    if (!(value > 0)) return;
    if (byProtein && ask > 0 && (l.protein * 4) / l.kcal < PROTEIN_SOURCE_SHARE) return;
    const factor = 1 + want / value;
    if (factor > OPTION_MAX_FACTOR || factor < OPTION_MIN_FACTOR) return;
    // Counted things (wraps, eggs) move in halves PER PORTION. "0.6 of a
    // wrap more each" is arithmetic, not a suggestion anyone can cook.
    const counted = l.unit !== 'g' && l.unit !== 'ml';
    const step = n * 0.5;
    const next = counted
      ? Math.max(step, Math.round((l.qty * factor) / step) * step)
      : roundAmount(l.qty * factor, l.unit);
    const qtys = lines.map((x, j) => (j === i ? next : x.qty));
    if (qtys[i] === l.qty) return;
    const perPortion = outcome(qtys);
    if (!delivers(perPortion)) return;
    // Half a wrap more each is possible but awkward: offered, not up front.
    const awkward = counted && !Number.isInteger((next - l.qty) / n);
    options.push({
      kind: 'one',
      index: i,
      qtys,
      perPortion,
      primary: false,
      share: awkward ? 0 : totalValue > 0 ? value / totalValue : 0,
    });
  });

  // Biggest contributors first: they are the least surprising to change.
  options.sort((a, b) => b.share - a.share);
  let shown = 0;
  for (const o of options) {
    if (o.share >= MAIN_SHARE && shown < MAX_PRIMARY) {
      o.primary = true;
      shown += 1;
    }
  }

  const result: PortionOption[] = options.map(({ share: _share, ...o }) => o);

  // Everything together: a bigger or smaller portion of the same dish.
  const scalable = lines.filter(usable).reduce((s, l) => s + valueOf(l), 0);
  if (scalable > 0) {
    const factor = 1 + want / scalable;
    if (factor <= 2 && factor >= 0.5) {
      const qtys = lines.map((l) => (usable(l) ? roundAmount(l.qty * factor, l.unit) : l.qty));
      const perPortion = outcome(qtys);
      if (delivers(perPortion)) {
        result.push({ kind: 'all', qtys, perPortion, primary: true });
      }
    }
  }
  return result;
}

/**
 * Scale every amount for a new number of portions, keeping each portion
 * the same. This is what "make 10 instead of 5" means on every recipe site;
 * the first version of the cook screen kept the food and shrank the
 * portions instead, which is the rarer question.
 */
export function scaleForPortions(
  lines: { qty: number; unit: string }[],
  fromPortions: number,
  toPortions: number,
): number[] {
  const f = scaleFactor(fromPortions, toPortions);
  return lines.map((l) => roundAmount(l.qty * f, l.unit));
}
