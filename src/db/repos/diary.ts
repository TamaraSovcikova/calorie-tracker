import { useLiveQuery } from 'dexie-react-hooks';
import { differenceInCalendarDays } from 'date-fns';
import { v4 as uuid } from 'uuid';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import { fromLocalDate, todayLocal, type LocalDate } from '@/lib/dates';
import type { DiaryEntry, MealSection } from '../types';
import { MEAL_SECTIONS } from '../types';
import { pulseReaction } from '@/features/pet/petReaction';

/** Eating-beat length after a log (ms). Kept in step with useDogState. */
const EAT_BEAT_MS = 2800;

export interface CreateDiaryEntryInput {
  date: LocalDate;
  section: MealSection;
  kind: 'food' | 'meal' | 'quick';
  /** Optional label, used for named quick-add entries. */
  name?: string;
  food_id?: string;
  meal_id?: string;
  qty: number;
  unit: string;
  portion_multiplier?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export async function createDiaryEntry(
  input: CreateDiaryEntryInput,
): Promise<DiaryEntry> {
  const now = new Date().toISOString();
  const entry: DiaryEntry = {
    id: uuid(),
    user_id: currentUserId(),
    created_at: now,
    updated_at: now,
    ...input,
  };
  await db.diary_entries.put(entry);
  // Today's logs make the dog tuck in. Past-date back-fills don't.
  if (entry.date === todayLocal()) pulseReaction('eating', EAT_BEAT_MS);
  return entry;
}

export async function updateDiaryEntry(
  id: string,
  patch: Partial<DiaryEntry>,
): Promise<void> {
  await db.diary_entries.update(id, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

export async function softDeleteDiaryEntry(id: string): Promise<void> {
  await db.diary_entries.update(id, { deleted_at: new Date().toISOString() });
}

/** Reverse a soft-delete - clears the tombstone so the entry reappears. */
export async function restoreDiaryEntry(id: string): Promise<void> {
  await db.diary_entries.update(id, {
    deleted_at: undefined,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Copy every (non-deleted) entry from one date onto another date - for the
 * "I ate the same as yesterday" / meal-prep case. Returns the count copied.
 * Copies are fresh rows (new ids, new timestamps); the source day is left
 * untouched.
 */
export async function copyDayEntries(
  from: LocalDate,
  to: LocalDate,
): Promise<number> {
  if (from === to) return 0;
  const userId = currentUserId();
  const source = await db.diary_entries
    .where('[user_id+date]')
    .equals([userId, from])
    .filter((e) => !e.deleted_at)
    .toArray();
  if (source.length === 0) return 0;
  const now = new Date().toISOString();
  const copies: DiaryEntry[] = source.map((e) => ({
    ...e,
    id: uuid(),
    date: to,
    created_at: now,
    updated_at: now,
    deleted_at: undefined,
  }));
  await db.diary_entries.bulkPut(copies);
  if (to === todayLocal()) pulseReaction('eating', EAT_BEAT_MS);
  return copies.length;
}

/**
 * Copy a single diary entry onto another date (default: today) - powers the
 * swipe-to-repeat gesture ("I ate this again today"). A fresh row; the source
 * entry is untouched.
 */
export async function copyEntryToDate(
  entry: DiaryEntry,
  to: LocalDate = todayLocal(),
): Promise<DiaryEntry> {
  const now = new Date().toISOString();
  const copy: DiaryEntry = {
    ...entry,
    id: uuid(),
    date: to,
    created_at: now,
    updated_at: now,
    deleted_at: undefined,
  };
  await db.diary_entries.put(copy);
  if (to === todayLocal()) pulseReaction('eating', EAT_BEAT_MS);
  return copy;
}

/** Live list of all diary entries on a given date, grouped by section. */
export function useDiaryDay(date: LocalDate): DiaryEntry[] | undefined {
  return useLiveQuery(
    async () =>
      db.diary_entries
        .where('[user_id+date]')
        .equals([currentUserId(), date])
        .filter((e) => !e.deleted_at)
        .toArray(),
    [date],
  );
}

/**
 * The most recent date (YYYY-MM-DD) on which anything was logged, or
 * undefined if the user has never logged. Walks the [user_id+date] index
 * in reverse, skipping soft-deleted-only days. Used by the pet's neglect
 * ("skeleton") state.
 */
export async function lastLoggedDate(): Promise<LocalDate | undefined> {
  const userId = currentUserId();
  // Reverse index walk; .first() stops at the most recent live entry.
  const row = await db.diary_entries
    .where('[user_id+date]')
    .between([userId, '0000-00-00'], [userId, '9999-99-99'])
    .reverse()
    .filter((e) => !e.deleted_at)
    .first();
  return row?.date;
}

/** Live version of {@link lastLoggedDate}. */
export function useLastLoggedDate(): LocalDate | undefined {
  return useLiveQuery(() => lastLoggedDate(), []);
}

export interface DayTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Micronutrients - fibre/sugar in grams, sodium in mg. */
  fiber: number;
  sugar: number;
  sodium: number;
}

export const ZERO_TOTALS: DayTotals = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
};

export function sumTotals(entries: DiaryEntry[]): DayTotals {
  return entries.reduce<DayTotals>(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
      fiber: acc.fiber + (e.fiber ?? 0),
      sugar: acc.sugar + (e.sugar ?? 0),
      sodium: acc.sodium + (e.sodium ?? 0),
    }),
    { ...ZERO_TOTALS },
  );
}

export type EntriesBySection = Record<MealSection, DiaryEntry[]>;

export function groupBySection(entries: DiaryEntry[]): EntriesBySection {
  const out: EntriesBySection = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
  };
  for (const e of entries) out[e.section].push(e);
  for (const s of MEAL_SECTIONS) {
    out[s].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  }
  return out;
}

/** The qty + unit of the most recent entry for a food, for pre-filling the
 *  add-quantity step so a daily food doesn't need re-entering each time. */
export async function lastQuantityForFood(
  foodId: string,
): Promise<{ qty: number; unit: string } | undefined> {
  const rows = await db.diary_entries
    .where('user_id')
    .equals(currentUserId())
    .filter((e) => !e.deleted_at && e.kind === 'food' && e.food_id === foodId)
    .toArray();
  if (rows.length === 0) return undefined;
  let latest = rows[0];
  for (const r of rows) if (r.created_at > latest.created_at) latest = r;
  return { qty: latest.qty, unit: latest.unit };
}

/**
 * Mark a food as "recently seen" - written when a food is scanned or looked
 * up, even if the user never logs it, so it still appears in the recent list.
 * One row per (user, food); repeated scans just bump the timestamp.
 */
export async function recordFoodSeen(foodId: string): Promise<void> {
  const userId = currentUserId();
  await db.food_recents.put({
    id: `${userId}:${foodId}`,
    user_id: userId,
    food_id: foodId,
    at: new Date().toISOString(),
  });
}

/**
 * Recent foods, most recent first, deduped - so meal-prepping the same items
 * shows them whichever section you're in. Merges two sources by their latest
 * timestamp: foods actually logged (the diary), and foods merely scanned or
 * looked up (food_recents), so a scanned-but-never-logged product still shows.
 */
export async function recentFoods(limit = 30): Promise<string[]> {
  const userId = currentUserId();
  // food_id -> latest ISO timestamp it was logged or scanned.
  const latest = new Map<string, string>();

  const bump = (foodId: string, at: string) => {
    const cur = latest.get(foodId);
    if (!cur || at > cur) latest.set(foodId, at);
  };

  // Logged foods: use the entry's created_at as "when it was used".
  // The '0000-00-00' / '9999-99-99' bounds are lexical sentinels bracketing
  // every YYYY-MM-DD on the [user_id+date] index (fixed-width ISO strings, so
  // a lexical compare equals a date compare).
  await db.diary_entries
    .where('[user_id+date]')
    .between([userId, '0000-00-00'], [userId, '9999-99-99'])
    .each((e) => {
      if (e.kind !== 'food' || !e.food_id || e.deleted_at) return;
      bump(e.food_id, e.created_at);
    });

  // Scanned / looked-up foods that may never have been logged.
  await db.food_recents
    .where('user_id')
    .equals(userId)
    .each((r) => bump(r.food_id, r.at));

  return [...latest.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * How many times each saved meal has been logged (kind='meal'), keyed by
 * meal_id. Powers the "Most logged" sort + the section a meal is most often
 * logged into (a fallback for category auto-suggest).
 */
export async function mealLogStats(): Promise<
  Map<string, { count: number; topSection: MealSection | undefined }>
> {
  const userId = currentUserId();
  const stats = new Map<
    string,
    { count: number; sections: Map<MealSection, number> }
  >();
  await db.diary_entries
    .where('[user_id+date]')
    .between([userId, '0000-00-00'], [userId, '9999-99-99'])
    .each((e) => {
      if (e.kind !== 'meal' || !e.meal_id || e.deleted_at) return;
      const cur = stats.get(e.meal_id) ?? { count: 0, sections: new Map() };
      cur.count += 1;
      cur.sections.set(e.section, (cur.sections.get(e.section) ?? 0) + 1);
      stats.set(e.meal_id, cur);
    });
  const out = new Map<
    string,
    { count: number; topSection: MealSection | undefined }
  >();
  for (const [mealId, { count, sections }] of stats) {
    let topSection: MealSection | undefined;
    let topN = 0;
    for (const [section, n] of sections) {
      if (n > topN) {
        topN = n;
        topSection = section;
      }
    }
    out.set(mealId, { count, topSection });
  }
  return out;
}

/** Live version of {@link mealLogStats}. */
export function useMealLogStats():
  | Map<string, { count: number; topSection: MealSection | undefined }>
  | undefined {
  return useLiveQuery(() => mealLogStats(), []);
}

/**
 * Half-life (days) of the recency-weighted frequency score. A food logged
 * today counts 1; ~2 weeks ago, 0.5; a month ago, 0.25 - so a burst of use
 * that has since stopped decays away and steady recent use rises to the top.
 */
const FREQUENCY_HALF_LIFE_DAYS = 14;
/**
 * Minimum decayed score to count as "frequent" (roughly two recent logs).
 * Below this a food drops off the frequent list entirely, so a single recent
 * log lands in "recent" instead, and a long-abandoned staple disappears once
 * its score decays past the floor. This is the natural decay + replacement.
 */
const FREQUENCY_MIN_SCORE = 1.5;

/**
 * Food ids ranked by how frequent they *currently* are - not raw lifetime
 * count. Each log contributes 0.5^(ageDays / half-life), so heavy use that has
 * since stopped decays out while steady recent use ranks highest. Foods below
 * FREQUENCY_MIN_SCORE are dropped.
 */
/**
 * Time-decayed log count per food id. A food eaten twice this week outscores
 * one eaten five times last spring. Exposed as the raw map so search can rank
 * by it, not just list the top few.
 */
export async function foodFrequencyScores(): Promise<Map<string, number>> {
  const userId = currentUserId();
  const today = fromLocalDate(todayLocal());
  const scores = new Map<string, number>();
  await db.diary_entries
    .where('[user_id+date]')
    .between([userId, '0000-00-00'], [userId, '9999-99-99'])
    .each((e) => {
      if (e.kind !== 'food' || !e.food_id || e.deleted_at) return;
      const ageDays = Math.max(
        0,
        differenceInCalendarDays(today, fromLocalDate(e.date)),
      );
      const weight = Math.pow(0.5, ageDays / FREQUENCY_HALF_LIFE_DAYS);
      scores.set(e.food_id, (scores.get(e.food_id) ?? 0) + weight);
    });
  return scores;
}

export async function frequentFoods(limit = 20): Promise<string[]> {
  const scores = await foodFrequencyScores();
  return [...scores.entries()]
    .filter(([, s]) => s >= FREQUENCY_MIN_SCORE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

