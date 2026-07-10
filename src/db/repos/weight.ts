import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { LocalDate } from '@/lib/dates';
import type { WeightEntry } from '../types';

/**
 * One weigh-in per date - upserts on (user_id, date).
 *
 * The row id is DETERMINISTIC (`w:{user}:{date}`), not a random uuid, so
 * the same date logged on two devices produces the same id. Without this
 * each device makes a different-id row and sync hits the server's
 * UNIQUE(user_id, date) index, aborting the whole batch.
 */
function weightId(userId: string, date: LocalDate): string {
  return `w:${userId}:${date}`;
}
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
    id: weightId(userId, date),
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
