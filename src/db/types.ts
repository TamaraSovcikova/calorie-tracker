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

export type FoodSource = 'off' | 'custom' | 'usda' | 'curated' | 'shared';

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

  /**
   * Weekly calorie budget - when on, a day's target is recalculated as the
   * week's remaining budget split over its remaining days, so going over
   * (or under) on one day adjusts the rest. Optional: rows synced before
   * the feature existed read as off / Monday.
   */
  weekly_budget_enabled?: boolean;
  /**
   * How the budget acts on the daily target. Supersedes the boolean above,
   * which is kept in step for rows read by older clients:
   *  - 'off'    - no budget; the daily goal is the target.
   *  - 'warn'   - the target NEVER moves. Days over the goal simply read as
   *               over, and a running balance says how far ahead or behind
   *               you are, so evening it out stays the user's choice.
   *  - 'adjust' - today's target is recalculated from the period's remaining
   *               budget (the original behaviour).
   * Undefined falls back to `weekly_budget_enabled` (true -> 'adjust').
   */
  budget_mode?: 'off' | 'warn' | 'adjust';
  /**
   * Carry-over start date (YYYY-MM-DD). When set, the running balance
   * accumulates forward from this date and nothing earlier is ever counted,
   * so carry-over covers a window the user chose rather than their whole
   * history. Unset = no carry-over.
   */
  budget_carryover_start?: string;
  /**
   * Cap (kcal) on how far a single day's target may be trimmed below the
   * daily goal in 'adjust' mode - the user's own pace for clearing a
   * deficit. Undefined or <= 0 means no cap.
   */
  budget_max_daily_trim?: number;
  /**
   * 'warn' mode only. When the running balance is in the red, take this many
   * kcal off the daily target to chip away at it - the user's own paydown
   * rate, opted into rather than imposed. Never takes off more than is
   * actually owed, and stops once the balance clears. Undefined or <= 0
   * leaves the target untouched.
   */
  budget_warn_catchup?: number;
  /**
   * Budget period: 'week' (default) recalculates over a 7-day week; 'month'
   * recalculates over the calendar month, so a single bad day dilutes far
   * more and an end-of-period overage still has days left to absorb it.
   * Undefined reads as 'week' (pre-feature behaviour).
   */
  budget_period?: 'week' | 'month';
  /**
   * Carry-over: when on, a period that ends in net surplus/deficit rolls
   * that balance into the next period as an opening adjustment - so an
   * overage on the last day is not forgotten. Off = each period starts
   * fresh (the old behaviour). Optional, default off.
   */
  budget_carryover_enabled?: boolean;
  /**
   * Optional cap (kcal) on the carried-over balance, applied to both
   * directions. Undefined or <= 0 means no cap. Keeps one disastrous week
   * from dominating the next period.
   */
  budget_carryover_cap?: number;
  /** Day the budget week starts on: 0 = Sunday … 6 = Saturday. */
  week_start_day?: number;
  /**
   * Legacy soft floor - never drop a day's target below ~70% of the daily
   * goal. Superseded by `budget_max_daily_trim`; still honoured as a
   * fallback for profiles synced before that field existed.
   */
  weekly_budget_floor?: boolean;
  /**
   * JSON array of dates (YYYY-MM-DD) the user marked "untracked" - those
   * days count as exactly on-target for the weekly budget regardless of
   * what is (or isn't) logged. Stored as a string so it round-trips
   * through sync without any JSON transform.
   */
  untracked_dates?: string;

  /**
   * Diet pauses: dated windows where the daily goal is replaced by a higher
   * one (a maintenance break off a cut). JSON array of
   * `{ id, start, end?, kcal, note? }`, stored as a string so it round-trips
   * through sync without any JSON transform (parsed via parseDietPauses).
   *
   * Kept as a history rather than one current window on purpose: the budget
   * grades every past day against that day's goal, so a finished break has
   * to stay on the record or the week it covered would later read as days of
   * massive overeating.
   */
  diet_pauses?: string;

  /** User-created meal categories, as a JSON array of lowercase tokens.
   *  Stored as a string so it round-trips through sync without a JSON
   *  transform (parsed at use via parseCustomCategories). */
  custom_meal_categories?: string;

  plan: 'free' | 'pro';
  fitbit_connected: boolean;
  onboarded: boolean;

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/**
 * A calorie reservation: extra room set aside for one day, paid for by
 * trimming the goal of the days around it.
 *
 * A row rather than JSON on the profile, unlike diet pauses: several can be
 * live at once, they are edited from more than one device, they can point at
 * a food, and cancelling one should not rewrite a blob holding the others.
 *
 * The funding window is DERIVED from `date`, `fund_mode`, `spread_days` and
 * `created_date`, never stored. See `fundingDates` for why deriving it from
 * the creation date rather than from today is what keeps history still.
 */
export interface Reservation {
  id: ID;
  user_id: ID;
  /** The day being funded. */
  date: LocalDate;
  /** kcal set aside for it. */
  kcal: number;
  label: string;
  /** Which side of the event pays: before it, after it, or both. */
  fund_mode: 'before' | 'after' | 'split';
  /** How many days wide the funding window is. */
  spread_days: number;
  /**
   * The local date this was created on, and so the earliest day it may fund
   * from. Stored explicitly rather than sliced off `created_at`, which is
   * UTC and lands on the wrong day either side of midnight.
   */
  created_date: LocalDate;

  /** Set when the reservation came from the library rather than a number. */
  food_id?: ID;
  meal_id?: ID;
  qty?: number;
  unit?: QuantityUnit;

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at?: ISOTimestamp;
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

  /** Per-100g micronutrients - fibre/sugar in grams, sodium in mg.
   *  Optional: curated and pre-feature rows may not have them. */
  fiber_100?: number;
  sugar_100?: number;
  sodium_100?: number;

  serving_g?: number;
  custom_units: CustomUnit[];

  /** User-starred for fast logging. Optional: pre-feature rows read false. */
  favorite?: boolean;
  /** Thumbnail URL (Open Food Facts product image), when available. */
  image_url?: string;

  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at?: ISOTimestamp;
}

/**
 * A lightweight "recently interacted with" marker for a food, written when a
 * food is scanned or looked up even if it is never logged - so a scanned but
 * unlogged product still appears in the recent list. One row per (user, food);
 * `at` is the last time it was touched.
 */
export interface FoodRecent {
  id: ID; // `${user_id}:${food_id}`
  user_id: ID;
  food_id: ID;
  at: ISOTimestamp;
}

/**
 * A remembered answer to "which food is this ingredient?".
 *
 * Written when the user picks a food in the recipe-scan review, read first on
 * every later scan. This is what makes a product the app could never have
 * guessed - a French-named Brussels mince against the ingredient "beef
 * mince" - resolve correctly from the second scan onward.
 *
 * `id` is deterministic (`ia:{user}:{phrase}`) so the same pick made on two
 * devices produces one row rather than a sync conflict.
 */
export interface IngredientAlias {
  id: ID; // `ia:${user_id}:${phrase}`
  user_id: ID;
  /** Normalised ingredient phrase, e.g. "beef mince". */
  phrase: string;
  food_id: ID;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/** Coarse meal-type used for filtering the library. */
export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';

export interface Meal {
  id: ID;
  user_id: ID;
  name: string;
  notes?: string;
  /** Legacy single category. Superseded by `categories` (a meal can belong
   *  to several). Kept for back-compat reads of rows written before the
   *  multi-category change; use `mealCategories(meal)` to read either. */
  category?: MealCategory;
  /** Categories this meal belongs to, as lowercase tokens. Built-in tokens
   *  are the MealCategory values; custom ones are user-defined (see
   *  profile.custom_meal_categories). Optional/nullable: legacy rows read
   *  undefined and fall back to `category`. */
  categories?: string[];
  /**
   * How many portions the batch makes. Ingredients are entered as the
   * whole batch (e.g. all the groceries cooked at once); per-portion
   * macros = batch total ÷ servings. Defaults to 1; rows synced before
   * this field existed read as 1 via `getServings()`.
   */
  servings?: number;
  /** User-attached meal photo, stored as a downscaled JPEG data URL.
   *  Optional: pre-feature rows and meals without a photo read undefined. */
  image_url?: string;
  /** Starred for fast access - favourites pin to the top of the meal list.
   *  Optional/nullable: pre-feature rows read undefined (falsy). */
  favorite?: boolean;
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
  /** Optional label for a quick-add entry (e.g. "Pub lunch"). Nullable;
   *  pre-feature rows and food/meal entries read undefined. */
  name?: string;
  food_id?: ID;
  meal_id?: ID;
  qty: number;
  unit: QuantityUnit;
  portion_multiplier?: number; // meals only

  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Snapshot micronutrients - fibre/sugar in grams, sodium in mg.
   *  Optional: entries logged before the feature existed lack them. */
  fiber?: number;
  sugar?: number;
  sodium?: number;

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
  /** A human subtitle for the row, e.g. "8:12-8:29pm · 1,425 steps" for a
   *  Fitbit workout session. Optional/nullable. */
  detail?: string;
  /** Day's total step count. Set only on the Fitbit daily summary row, used
   *  for the Exercise section header stat (not rendered as its own row). */
  steps?: number;
  /** True once the user has renamed this row. Sync preserves a locked name
   *  rather than overwriting it with the source's generic label. */
  name_locked?: boolean;
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
 * synced via the worker - connecting on one device makes Fitbit data
 * available on every device.
 *
 * Plaintext at rest. Security model = the same as everything else here:
 * the only line of defence is the private per-user sync code (the bearer
 * token every request carries) plus your private Cloudflare account.
 */
/**
 * The virtual pet - one row per user. `wellbeing` is the long-arc 0-100
 * consistency score (it replaces the streak); the moment-to-moment
 * "fullness" is always derived from the diary, never stored.
 */
export interface Pet {
  user_id: ID;
  name: string;
  /** Reserved for future appearance customisation; v1 ships one dog. */
  breed?: string;
  coat?: string;
  /** 0-100 long-arc wellbeing score. */
  wellbeing: number;
  /** Last local date already folded into `wellbeing` (YYYY-MM-DD). */
  wellbeing_evaluated_date: LocalDate;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

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
