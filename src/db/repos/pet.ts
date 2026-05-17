import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import { todayLocal } from '@/lib/dates';
import type { Pet } from '../types';

const DEFAULT_NAME = 'Biscuit';
const DEFAULT_WELLBEING = 70;

function buildDefaultPet(userId: string): Pet {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    name: DEFAULT_NAME,
    wellbeing: DEFAULT_WELLBEING,
    wellbeing_evaluated_date: todayLocal(),
    created_at: now,
    updated_at: now,
  };
}

/** Create the pet row on first run; returns the existing one otherwise. */
export async function ensurePet(): Promise<Pet> {
  const userId = currentUserId();
  const existing = await db.pet.get(userId);
  if (existing) return existing;
  const fresh = buildDefaultPet(userId);
  await db.pet.put(fresh);
  return fresh;
}

export async function getPet(): Promise<Pet | undefined> {
  return db.pet.get(currentUserId());
}

export async function updatePet(patch: Partial<Pet>): Promise<void> {
  await db.pet.update(currentUserId(), {
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

export async function renamePet(name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed) await updatePet({ name: trimmed });
}

/** Live pet row for the current user. */
export function usePet(): Pet | undefined {
  return useLiveQuery(() => db.pet.get(currentUserId()), []);
}
