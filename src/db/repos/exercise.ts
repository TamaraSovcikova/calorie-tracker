import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { LocalDate } from '@/lib/dates';
import type { ExerciseEntry } from '../types';

export interface CreateExerciseInput {
  date: LocalDate;
  source?: 'manual' | 'fitbit';
  name: string;
  duration_min?: number;
  kcal_burned: number;
}

export async function createExercise(
  input: CreateExerciseInput,
): Promise<ExerciseEntry> {
  const now = new Date().toISOString();
  const entry: ExerciseEntry = {
    id: uuid(),
    user_id: currentUserId(),
    source: input.source ?? 'manual',
    name: input.name,
    duration_min: input.duration_min,
    kcal_burned: input.kcal_burned,
    date: input.date,
    created_at: now,
    updated_at: now,
  };
  await db.exercise_entries.put(entry);
  return entry;
}

export async function softDeleteExercise(id: string): Promise<void> {
  await db.exercise_entries.update(id, { deleted_at: new Date().toISOString() });
}

export function useExerciseDay(date: LocalDate): ExerciseEntry[] | undefined {
  return useLiveQuery(
    async () =>
      db.exercise_entries
        .where('[user_id+date]')
        .equals([currentUserId(), date])
        .filter((e) => !e.deleted_at)
        .toArray(),
    [date],
  );
}

export function totalBurned(entries: ExerciseEntry[]): number {
  return entries.reduce((sum, e) => sum + e.kcal_burned, 0);
}
