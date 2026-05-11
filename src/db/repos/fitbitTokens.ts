import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { FitbitTokens } from '../types';

export async function getFitbitTokens(): Promise<FitbitTokens | undefined> {
  return db.fitbit_tokens.get(currentUserId());
}

export async function putFitbitTokens(
  tokens: Omit<FitbitTokens, 'user_id' | 'created_at' | 'updated_at'>,
): Promise<FitbitTokens> {
  const userId = currentUserId();
  const now = new Date().toISOString();
  const existing = await db.fitbit_tokens.get(userId);
  const row: FitbitTokens = {
    user_id: userId,
    ...tokens,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await db.fitbit_tokens.put(row);
  return row;
}

export async function deleteFitbitTokens(): Promise<void> {
  await db.fitbit_tokens.delete(currentUserId());
}

export function useFitbitTokens(): FitbitTokens | undefined | null {
  // null = loaded-but-none; undefined = still loading.
  return useLiveQuery(async () => {
    const row = await db.fitbit_tokens.get(currentUserId());
    return row ?? null;
  }, []);
}
