import { describe, expect, it } from 'vitest';
import { isLoggable, outcomeOf } from './logReserved';
import type { Reservation } from '@/db/types';

function reservationOf(patch: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    user_id: 'u',
    date: '2026-05-23',
    kcal: 480,
    label: 'Birthday cake',
    fund_mode: 'before',
    spread_days: 7,
    created_date: '2026-05-11',
    created_at: '2026-05-11T09:00:00.000Z',
    updated_at: '2026-05-11T09:00:00.000Z',
    ...patch,
  };
}

describe('isLoggable', () => {
  it('is true for a reservation naming a food or a meal', () => {
    expect(isLoggable(reservationOf({ food_id: 'f1' }))).toBe(true);
    expect(isLoggable(reservationOf({ meal_id: 'm1' }))).toBe(true);
  });

  it('is false for a bare number', () => {
    // Nothing links those calories to a diary entry, so there is nothing
    // honest to log or to compare against.
    expect(isLoggable(reservationOf())).toBe(false);
  });
});

describe('outcomeOf', () => {
  it('reports an overspend against the reservation, not the day', () => {
    const o = outcomeOf(480, 512);
    expect(o.difference).toBe(32);
    expect(o.anyLogged).toBe(true);
  });

  it('reports coming in under', () => {
    expect(outcomeOf(480, 300).difference).toBe(-180);
  });

  it('reports nothing logged yet', () => {
    const o = outcomeOf(480, 0);
    expect(o.anyLogged).toBe(false);
    expect(o.difference).toBe(-480);
  });

  it('compares against what was FUNDED, not what was asked for', () => {
    // A request that only half funded should be judged against the half that
    // actually exists, or the day reads as under when it is exactly on.
    const o = outcomeOf(240, 240);
    expect(o.difference).toBe(0);
  });
});
