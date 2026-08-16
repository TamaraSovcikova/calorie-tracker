import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import { todayLocal, type LocalDate } from '@/lib/dates';
import type { Reservation } from '../types';

export interface NewReservation {
  date: LocalDate;
  kcal: number;
  label: string;
  fund_mode: Reservation['fund_mode'];
  spread_days: number;
  food_id?: string;
  meal_id?: string;
  qty?: number;
  unit?: string;
}

/** Every live reservation for the current user, oldest event first. */
export async function listReservations(): Promise<Reservation[]> {
  const rows = await db.reservations
    .where('user_id')
    .equals(currentUserId())
    .filter((r) => !r.deleted_at)
    .toArray();
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function useReservations(): Reservation[] | undefined {
  return useLiveQuery(() => listReservations(), []);
}

export async function createReservation(input: NewReservation): Promise<Reservation> {
  const now = new Date().toISOString();
  const row: Reservation = {
    id: uuid(),
    user_id: currentUserId(),
    // The local date, not `now.slice(0, 10)`: created_at is UTC and lands on
    // the wrong day either side of midnight, which would let a reservation
    // fund from a day before it existed.
    created_date: todayLocal(),
    created_at: now,
    updated_at: now,
    ...input,
  };
  await db.reservations.put(row);
  return row;
}

export async function updateReservation(
  id: string,
  patch: Partial<Reservation>,
): Promise<void> {
  await db.reservations.update(id, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Soft-delete, so the tombstone propagates through sync like every other
 * table. Days already funded keep the lowered goal they had - that is the
 * honest outcome, and those calories are simply banked in the balance.
 */
export async function deleteReservation(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.reservations.update(id, { deleted_at: now, updated_at: now });
}
