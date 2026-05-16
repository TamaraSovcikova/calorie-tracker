/**
 * Shared types for the local IndexedDB schema and (Phase 11+) Supabase.
 * Naming is snake_case to match the future Postgres schema 1:1, so the same
 * row shape can round-trip through the sync worker without renames.
 */

import type { LocalDate } from '@/lib/dates';
import type { ActivityLevel, Sex } from '@/lib/tdee';
import type { UnitSystem } from '@/lib/units';

export type ID = string; // uuid v4
export type ISOTimestamp = string;

export type MealSection = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export const MEAL_SECTIONS: MealSection[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const MEAL_SECTION_LABELS: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

export type FoodSource = 'off' | 'custom' | 'usda' | 'curated';

/**
 * For 'usda' rows, the more specific dataType from FoodData Central.
 * Stored on the Food row so the search panel can show the right pill and
 * group results between "Common foods" (Foundation/SR Legacy/Survey) and
 * "Packaged products" (Branded).
 */
export type UsdaDataType = 'foundation' | 'sr_legacy' | 'survey' | 'branded';

/** Quantity units a logged item can use. */
export type QuantityUnit = 'g' | 'ml' | 'serving' | string; // string = custom unit label

export interface CustomUnit {
  label: string; // e.g. "scoop", "slice", "biscuit"
  grams: number; // weight in grams of one unit
}

export interface Profile {
  user_id: ID; // 'local' until Phase 11 sign-in
  name?: string;
  sex?: Sex;
  dob?: LocalDate;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: ActivityLevel;

  kcal_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  primary_macro: 'protein' | 'carbs' | 'fat';
  /** Optional target weight, used for the projection on the weight chart. */
  goal_weight_kg?: number;

  eat_back_burned: boolean;
  units: UnitSystem;
  theme: 'system' | 'light' | 'dark';

  plan: 'free' | 'pro';
  fitbit_connected: boolean;
  onboarded: boolean;

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Food {
  id: ID;
  user_id: ID;
  source: FoodSource;
  /** When source='usda', records which FDC dataset this came from. */
  usda_data_type?: UsdaDataType;
  off_barcode?: string;
  name: string;
  brand?: string;

  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;

  serving_g?: number;
  custom_units: CustomUnit[];

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at?: ISOTimestamp;
}

export interface Meal {
  id: ID;
  user_id: ID;
  name: string;
  notes?: string;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at?: ISOTimestamp;
}

export interface MealItem {
  id: ID;
  meal_id: ID;
  food_id: ID;
  qty: number;
  unit: QuantityUnit;
}

/**
 * A row in the daily diary. Macros are denormalised: the snapshot is taken
 * at log time so editing the underlying food/meal later doesn't retroactively
 * change history. Editing the entry itself recomputes the snapshot.
 */
export interface DiaryEntry {
  id: ID;
  user_id: ID;
  date: LocalDate;
  section: MealSection;
  /** 'quick' = a bare calorie/macro entry with no underlying food or meal. */
  kind: 'food' | 'meal' | 'quick';
  food_id?: ID;
  meal_id?: ID;
  qty: number;
  unit: QuantityUnit;
  portion_multiplier?: number; // meals only

  kcal: number;
  protein: number;
  carbs: number;
  fat: number;

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at?: ISOTimestamp;
}

export interface ExerciseEntry {
  id: ID;
  user_id: ID;
  date: LocalDate;
  source: 'manual' | 'fitbit';
  name: string;
  duration_min?: number;
  kcal_burned: number;
  /** True for a Fitbit row whose calorie estimate is unavailable because
   *  the profile lacks the stats needed to estimate resting burn. The UI
   *  shows a "set up profile" hint instead of a (wrong) kcal figure. */
  needs_profile?: boolean;

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at?: ISOTimestamp;
}

export interface WeightEntry {
  id: ID; // for sync; primary key in Dexie is [user_id+date]
  user_id: ID;
  date: LocalDate;
  weight_kg: number;
  note?: string;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/**
 * OAuth tokens for the connected Fitbit account. One row per user_id (so
 * 'local' until cloud sync, then the synced user id). Stored in Dexie and
 * synced via the worker — connecting on one device makes Fitbit data
 * available on every device.
 *
 * Plaintext at rest. Security model = the same as everything else here:
 * the only line of defence is the bearer SYNC_TOKEN you set on the worker
 * + private Cloudflare account.
 */
export interface FitbitTokens {
  user_id: ID;
  access_token: string;
  refresh_token: string;
  /** ISO8601 timestamp when access_token expires. */
  expires_at: ISOTimestamp;
  /** OAuth scopes granted (space-separated). */
  scope: string;
  /** Fitbit's internal user id (the `-` placeholder works too, but storing the real one helps debugging). */
  fitbit_user_id?: string;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}
