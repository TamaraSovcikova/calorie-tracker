import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { Profile } from '../types';

/**
 * Default profile applied on first run. The onboarding wizard (Phase 8)
 * walks the user through overriding these.
 */
function buildDefaultProfile(userId: string): Profile {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    kcal_target: 2000,
    protein_g: 150,
    carbs_g: 220,
    fat_g: 65,
    primary_macro: 'protein',
    // Off by default: the Fitbit/exercise row shows activity calories but
    // doesn't inflate the target. The user can opt in under Goals.
    eat_back_burned: false,
    units: 'metric',
    theme: 'system',
    plan: 'free',
    fitbit_connected: false,
    onboarded: false,
    created_at: now,
    updated_at: now,
  };
}

export async function ensureProfile(): Promise<Profile> {
  const userId = currentUserId();
  const existing = await db.profiles.get(userId);
  if (existing) return existing;
  const fresh = buildDefaultProfile(userId);
  await db.profiles.put(fresh);
  return fresh;
}

export async function getProfile(): Promise<Profile | undefined> {
  return db.profiles.get(currentUserId());
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  const userId = currentUserId();
  await db.profiles.update(userId, { ...patch, updated_at: new Date().toISOString() });
}

export function useProfile(): Profile | undefined {
  return useLiveQuery(() => db.profiles.get(currentUserId()), []);
}
