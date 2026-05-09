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
  kind: 'food' | 'meal';
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

/** For Phase 9 streak: which dates have at least one non-deleted entry? */
export async function listLoggedDates(): Promise<LocalDate[]> {
  const userId = currentUserId();
  const all = await db.diary_entries
    .where('user_id')
    .equals(userId)
    .filter((e) => !e.deleted_at)
    .toArray();
  const set = new Set<LocalDate>();
  for (const e of all) set.add(e.date);
  return [...set].sort();
}

/** Recent foods logged into a given section, most recent first, deduped. */
export async function recentFoodsInSection(
  section: MealSection,
  limit = 10,
): Promise<string[]> {
  const userId = currentUserId();
  const rows = await db.diary_entries
    .where('[user_id+date+section]')
    .between([userId, '0000-00-00', section], [userId, '9999-99-99', section])
    .filter((e) => !e.deleted_at && e.kind === 'food' && !!e.food_id)
    .reverse()
    .limit(limit * 4)
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

