import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { LocalDate } from '@/lib/dates';
import type { DiaryEntry, MealSection } from '../types';
import { MEAL_SECTIONS } from '../types';

export interface CreateDiaryEntryInput {
  date: LocalDate;
  section: MealSection;
  kind: 'food' | 'meal' | 'quick';
  food_id?: string;
  meal_id?: string;
  qty: number;
  unit: string;
  portion_multiplier?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
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

/** Reverse a soft-delete — clears the tombstone so the entry reappears. */
export async function restoreDiaryEntry(id: string): Promise<void> {
  await db.diary_entries.update(id, {
    deleted_at: undefined,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Copy every (non-deleted) entry from one date onto another date — for the
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
  return copies.length;
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

export interface DayTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO_TOTALS: DayTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function sumTotals(entries: DiaryEntry[]): DayTotals {
  return entries.reduce<DayTotals>(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
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
 * Recent foods logged across ALL sections, most recent first, deduped —
 * so meal-prepping the same items shows them whichever section you're in.
 */
export async function recentFoods(limit = 30): Promise<string[]> {
  const userId = currentUserId();
  // The '0000-00-00' / '9999-99-99' bounds aren't real dates — they're
  // lexical sentinels that bracket every YYYY-MM-DD string on the
  // [user_id, date] compound index. Safe because dates are fixed-width ISO
  // strings, so a lexical compare equals a date compare.
  const rows = await db.diary_entries
    .where('[user_id+date]')
    .between([userId, '0000-00-00'], [userId, '9999-99-99'])
    .filter((e) => !e.deleted_at && e.kind === 'food' && !!e.food_id)
    .reverse()
    .limit(limit * 6)
    .toArray();
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of rows) {
    if (r.food_id && !seen.has(r.food_id)) {
      seen.add(r.food_id);
      ids.push(r.food_id);
      if (ids.length >= limit) break;
    }
  }
  return ids;
}

