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
