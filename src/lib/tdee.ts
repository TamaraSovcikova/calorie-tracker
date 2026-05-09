/**
 * Mifflin-St Jeor BMR + standard activity multipliers for TDEE.
 * https://en.wikipedia.org/wiki/Basal_metabolic_rate#BMR_estimation_formulas
 */

export type Sex = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary' // little/no exercise
  | 'light' // 1-3 days/week
  | 'moderate' // 3-5 days/week
  | 'active' // 6-7 days/week
  | 'very_active'; // physical job / 2x daily

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (desk job, no exercise)',
  light: 'Light (exercise 1-3 days/wk)',
  moderate: 'Moderate (exercise 3-5 days/wk)',
  active: 'Active (exercise 6-7 days/wk)',
  very_active: 'Very active (physical job / 2x daily)',
};

export interface TdeeInput {
  sex: Sex;
  ageYears: number;
  weightKg: number;
  heightCm: number;
  activity: ActivityLevel;
}

export function bmr({ sex, ageYears, weightKg, heightCm }: TdeeInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

export function tdee(input: TdeeInput): number {
  return Math.round(bmr(input) * ACTIVITY_MULTIPLIERS[input.activity]);
}
