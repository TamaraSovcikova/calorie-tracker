/**
 * The composed daily goal: the diet pause replaces the base goal, then
 * reservations move calories between days on top of it.
 *
 * Kept separate from `dietPause.ts` so each feature owns its own rule, and
 * separate from `weeklyBudget.ts` because the budget reacts to what was
 * eaten while these two are plans made in advance. Everything that needs
 * "the goal on day D" should come through here.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { goalResolver } from '@/features/diet-pause/dietPause';
import {
  EMPTY_SCHEDULE,
  planReservations,
  type ReservationSchedule,
} from './reservations';
import { listReservations } from '@/db/repos/reservations';
import type { LocalDate } from '@/lib/dates';
import type { Profile, Reservation } from '@/db/types';

/**
 * Goal lookup for one profile and one set of reservations. Clamped at zero:
 * the funding floor should keep goals far above that, so hitting the clamp
 * means something has gone wrong rather than that zero is intended.
 */
export function composedGoalResolver(
  profile: Profile | undefined,
  schedule: ReservationSchedule,
): (date: LocalDate) => number {
  const base = goalResolver(profile);
  if (schedule.deltaByDate.size === 0) return base;
  return (date) => Math.max(0, base(date) + (schedule.deltaByDate.get(date) ?? 0));
}

/** The goals for a run of dates, resolving the pause list once. */
export function composedGoalsFor(
  dates: LocalDate[],
  profile: Profile | undefined,
  schedule: ReservationSchedule,
): number[] {
  const resolve = composedGoalResolver(profile, schedule);
  return dates.map(resolve);
}

/**
 * Plan a set of reservations against a profile. The base goal a reservation
 * funds from is the PAUSED goal, not the raw target: a break raises the
 * days it covers, and a day at maintenance genuinely has more room to give.
 */
export function scheduleFor(
  reservations: Reservation[],
  profile: Profile | undefined,
): ReservationSchedule {
  if (!profile || reservations.length === 0) return EMPTY_SCHEDULE;
  return planReservations(
    reservations,
    goalResolver(profile),
    profile.budget_max_daily_trim,
  );
}

/** Load and plan the current user's reservations, outside React. */
export async function loadSchedule(
  profile: Profile | undefined,
): Promise<ReservationSchedule> {
  if (!profile) return EMPTY_SCHEDULE;
  return scheduleFor(await listReservations(), profile);
}

/** Live schedule for the current user. */
export function useReservationSchedule(
  profile: Profile | undefined,
): ReservationSchedule {
  return (
    useLiveQuery(() => loadSchedule(profile), [profile]) ?? EMPTY_SCHEDULE
  );
}
