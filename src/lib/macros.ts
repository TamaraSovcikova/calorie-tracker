import type { DayTotals } from '@/db/repos/diary';
import type { Profile } from '@/db/types';

export type MacroKey = 'protein' | 'carbs' | 'fat';

export function macroTarget(profile: Profile, macro: MacroKey): number {
  if (macro === 'protein') return profile.protein_g;
  if (macro === 'carbs') return profile.carbs_g;
  return profile.fat_g;
}

export function macroValue(totals: DayTotals, macro: MacroKey): number {
  if (macro === 'protein') return totals.protein;
  if (macro === 'carbs') return totals.carbs;
  return totals.fat;
}

export function pct(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1.5, value / target));
}

/**
 * Adjusted kcal target factoring in optional eat-back-burned mode.
 * burnedKcal can be 0 if no exercise/Fitbit data yet.
 */
export function effectiveKcalTarget(profile: Profile, burnedKcal: number): number {
  return profile.eat_back_burned ? profile.kcal_target + burnedKcal : profile.kcal_target;
}

export function formatKcal(n: number): string {
  return Math.round(n).toLocaleString();
}

export function formatGrams(n: number): string {
  if (n >= 100) return Math.round(n).toString();
  return n.toFixed(1).replace(/\.0$/, '');
}

export const MACRO_LABELS: Record<MacroKey, string> = {
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
};

export const MACRO_COLOR_VAR: Record<MacroKey, string> = {
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
};
