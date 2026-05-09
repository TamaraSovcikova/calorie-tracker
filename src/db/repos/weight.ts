import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { LocalDate } from '@/lib/dates';
import type { WeightEntry } from '../types';

/**
 * One weigh-in per date — upserts on (user_id, date).
 */
export async function logWeight(
  date: LocalDate,
  weightKg: number,
  note?: string,
): Promise<WeightEntry> {
  const userId = currentUserId();
  const now = new Date().toISOString();
  const existing = await db.weight_log
    .where('[user_id+date]')
    .equals([userId, date])
    .first();
  if (existing) {
    await db.weight_log.update(existing.id, {
      weight_kg: weightKg,
      note,
      updated_at: now,
    });
    return { ...existing, weight_kg: weightKg, note, updated_at: now };
  }
  const entry: WeightEntry = {
    id: uuid(),
    user_id: userId,
    date,
    weight_kg: weightKg,
    note,
    created_at: now,
    updated_at: now,
  };
  await db.weight_log.put(entry);
  return entry;
}

export async function deleteWeight(id: string): Promise<void> {
  await db.weight_log.delete(id);
}

export function useWeightLog(): WeightEntry[] | undefined {
  return useLiveQuery(
    async () =>
      db.weight_log.where('user_id').equals(currentUserId()).sortBy('date'),
    [],
  );
}
