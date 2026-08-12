import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import { shiftDate, todayLocal } from '@/lib/dates';
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
    weekly_budget_enabled: false,
    budget_mode: 'off',
    week_start_day: 1, // Monday
    weekly_budget_floor: false,
    untracked_dates: '[]',
    units: 'metric',
    theme: 'system',
    plan: 'free',
    fitbit_connected: false,
    onboarded: false,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Bring a profile written before the budget-mode rework up to date:
 *  - the old on/off boolean becomes an explicit mode;
 *  - the old carry-over boolean becomes a dated window. Two weeks back is
 *    the widest we'll infer on the user's behalf - the old switch reached
 *    back exactly one period, so anything longer would silently pull in
 *    history they never opted into.
 * Idempotent, and a no-op once `budget_mode` is set.
 */
function legacyBudgetPatch(p: Profile): Partial<Profile> | null {
  if (p.budget_mode) return null;
  const patch: Partial<Profile> = {
    budget_mode: p.weekly_budget_enabled ? 'adjust' : 'off',
  };
  if (p.budget_carryover_enabled && !p.budget_carryover_start) {
    patch.budget_carryover_start = shiftDate(todayLocal(), -14);
  }
  return patch;
}

export async function ensureProfile(): Promise<Profile> {
  const userId = currentUserId();
  const existing = await db.profiles.get(userId);
  if (existing) {
    const patch = legacyBudgetPatch(existing);
    if (!patch) return existing;
    await updateProfile(patch);
    return { ...existing, ...patch };
  }
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
