import Dexie, { type EntityTable } from 'dexie';
import type {
  DiaryEntry,
  ExerciseEntry,
  FitbitTokens,
  Food,
  Meal,
  MealItem,
  Pet,
  Profile,
  WeightEntry,
} from './types';

/**
 * Dexie schema. Index strings:
 *   '&id' = unique primary key
 *   '[a+b]' = compound index
 *   plain field = non-unique index used for queries
 *
 * Bump the version number AND keep the prior call when changing schema -
 * Dexie chains migrations from the user's current installed version.
 */
class CalorieDB extends Dexie {
  profiles!: EntityTable<Profile, 'user_id'>;
  foods!: EntityTable<Food, 'id'>;
  meals!: EntityTable<Meal, 'id'>;
  meal_items!: EntityTable<MealItem, 'id'>;
  diary_entries!: EntityTable<DiaryEntry, 'id'>;
  exercise_entries!: EntityTable<ExerciseEntry, 'id'>;
  weight_log!: EntityTable<WeightEntry, 'id'>;
  fitbit_tokens!: EntityTable<FitbitTokens, 'user_id'>;
  pet!: EntityTable<Pet, 'user_id'>;

  constructor() {
    super('calorie-tracker');

    this.version(1).stores({
      profiles: '&user_id, updated_at',
      foods: '&id, user_id, name, source, off_barcode, deleted_at, updated_at',
      meals: '&id, user_id, name, deleted_at, updated_at',
      meal_items: '&id, meal_id, food_id',
      diary_entries:
        '&id, user_id, date, [user_id+date], [user_id+date+section], section, deleted_at, updated_at',
      exercise_entries: '&id, user_id, date, [user_id+date], deleted_at, updated_at',
      weight_log: '&id, user_id, date, [user_id+date], updated_at',
    });

    // v2: Fitbit token storage (Phase 12). Additive - Dexie keeps old data.
    this.version(2).stores({
      fitbit_tokens: '&user_id, updated_at',
    });

    // v3: virtual pet (revamp). Additive.
    this.version(3).stores({
      pet: '&user_id, updated_at',
    });
  }
}

export const db = new CalorieDB();
