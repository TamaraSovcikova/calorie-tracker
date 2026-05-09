/**
 * Feature-flag registry.
 *
 * Every feature in the app — current and future — is keyed here with the
 * minimum plan required to use it. The default is 'free'. Premium features
 * are documented but not gated until they ship; the layer is in place so
 * adding the gate later is a one-line change.
 */

import type { Profile } from '@/db/types';

export type Plan = 'free' | 'pro';

export type FeatureKey =
  // --- shipped, all free ---
  | 'diary'
  | 'foodSearch'
  | 'barcodeScan'
  | 'savedMeals'
  | 'manualProducts'
  | 'weightLog'
  | 'weeklySummary'
  | 'streak'
  | 'exerciseLog'
  | 'unitsImperial'
  | 'darkMode'
  | 'dataExport'
  | 'fitbitSync'
  // --- placeholders for future gating ---
  | 'aiPhotoLog'
  | 'monthlyReports'
  | 'recipeImporter'
  | 'multiWeekPlanner';

export const FEATURE_PLAN: Record<FeatureKey, Plan> = {
  diary: 'free',
  foodSearch: 'free',
  barcodeScan: 'free',
  savedMeals: 'free',
  manualProducts: 'free',
  weightLog: 'free',
  weeklySummary: 'free',
  streak: 'free',
  exerciseLog: 'free',
  unitsImperial: 'free',
  darkMode: 'free',
  dataExport: 'free',
  fitbitSync: 'free',
  aiPhotoLog: 'pro',
  monthlyReports: 'pro',
  recipeImporter: 'pro',
  multiWeekPlanner: 'pro',
};

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1 };

export function planAllows(plan: Plan, required: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

export function profileAllows(
  profile: Profile | undefined,
  feature: FeatureKey,
): boolean {
  const plan: Plan = profile?.plan ?? 'free';
  return planAllows(plan, FEATURE_PLAN[feature]);
}
