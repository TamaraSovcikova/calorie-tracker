import { describe, expect, it } from 'vitest';
import {
  createdDateOf,
  dayEffect,
  floorFor,
  fundingDates,
  planReservations,
  previewReservation,
} from './reservations';
import type { Reservation } from '@/db/types';

/** Event on Sat 2026-05-23, created Mon 2026-05-11. */
function reservationOf(patch: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    user_id: 'u',
    date: '2026-05-23',
    kcal: 700,
    label: 'Birthday cake',
    fund_mode: 'before',
    spread_days: 7,
    created_date: '2026-05-11',
    created_at: '2026-05-11T09:00:00.000Z',
    updated_at: '2026-05-11T09:00:00.000Z',
    ...patch,
  };
}

/** A flat 2000 kcal goal on every day. */
const flatGoal = () => 2000;

/** Sum of every delta - must be zero for any set of reservations. */
function netOf(deltas: Map<string, number>): number {
  return [...deltas.values()].reduce((a, b) => a + b, 0);
}

describe('createdDateOf', () => {
  it('prefers the explicit local date over the UTC timestamp', () => {
    // 00:30 local CEST is the previous day in UTC; the local date is right.
    const r = reservationOf({
      created_date: '2026-05-12',
      created_at: '2026-05-11T22:30:00.000Z',
    });
    expect(createdDateOf(r)).toBe('2026-05-12');
  });
});

describe('fundingDates', () => {
  it('takes the days before the event, never the event itself', () => {
    const days = fundingDates(reservationOf());
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-05-16');
    expect(days[6]).toBe('2026-05-22');
    expect(days).not.toContain('2026-05-23');
  });

  it('takes the days after the event in after mode', () => {
    const days = fundingDates(reservationOf({ fund_mode: 'after', spread_days: 3 }));
    expect(days).toEqual(['2026-05-24', '2026-05-25', '2026-05-26']);
  });

  it('takes both sides in split mode, favouring the run-up', () => {
    const days = fundingDates(reservationOf({ fund_mode: 'split', spread_days: 5 }));
    // 3 before, 2 after.
    expect(days).toEqual([
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-24',
      '2026-05-25',
    ]);
  });

  it('never funds from before the reservation existed', () => {
    const days = fundingDates(
      reservationOf({ created_date: '2026-05-20', spread_days: 7 }),
    );
    expect(days).toEqual(['2026-05-20', '2026-05-21', '2026-05-22']);
  });

  it('does not shrink as time passes', () => {
    // The window is derived from the creation date, not from "today", so
    // calling it later gives the same answer and past funding days keep
    // their deltas instead of being retroactively zeroed.
    const r = reservationOf();
    expect(fundingDates(r)).toEqual(fundingDates(r));
    expect(fundingDates(r)[0]).toBe('2026-05-16');
  });

  it('is empty when created on the event day in before mode', () => {
    expect(fundingDates(reservationOf({ created_date: '2026-05-23' }))).toEqual([]);
  });
});

describe('floorFor', () => {
  it('honours an explicit trim limit as the user set it', () => {
    expect(floorFor(2000, 300)).toBe(1700);
  });

  it('defaults to the stricter of 70% and 1200 kcal', () => {
    expect(floorFor(2000, undefined)).toBe(1400); // 70% wins
    expect(floorFor(1500, undefined)).toBe(1200); // the flat floor wins
  });

  it('never returns a floor above the goal itself', () => {
    expect(floorFor(900, undefined)).toBe(900);
  });
});

describe('planReservations', () => {
  it('funds the request evenly and nets to zero', () => {
    const r = reservationOf({ kcal: 700 });
    const s = planReservations([r], flatGoal, undefined);
    const plan = s.byId.get('r1')!;
    expect(plan.funded).toBeCloseTo(700);
    expect(plan.shortfall).toBe(0);
    expect(plan.days).toHaveLength(7);
    expect(plan.evenPerDay).toBeCloseTo(100);
    expect(s.deltaByDate.get('2026-05-23')).toBeCloseTo(700);
    expect(s.deltaByDate.get('2026-05-22')).toBeCloseTo(-100);
    expect(netOf(s.deltaByDate)).toBeCloseTo(0);
  });

  it('caps at the floor and reports the shortfall rather than over-trimming', () => {
    // 7 days x 600 kcal of room = 4200 available; asking for 6000.
    const s = planReservations(
      [reservationOf({ kcal: 6000 })],
      flatGoal,
      undefined,
    );
    const plan = s.byId.get('r1')!;
    expect(plan.funded).toBeCloseTo(4200);
    expect(plan.shortfall).toBeCloseTo(1800);
    expect(plan.reason).toBe('floor');
    // No funding day is taken below the 1400 floor.
    for (const d of plan.days) {
      expect(2000 - (plan.perDay.get(d) ?? 0)).toBeGreaterThanOrEqual(1400 - 0.001);
    }
  });

  it('gives the event day only what was actually funded', () => {
    // Otherwise the day would receive calories nobody saved, which is exactly
    // how a reservation would silently blow the period budget.
    const s = planReservations(
      [reservationOf({ kcal: 6000 })],
      flatGoal,
      undefined,
    );
    expect(s.deltaByDate.get('2026-05-23')).toBeCloseTo(4200);
    expect(netOf(s.deltaByDate)).toBeCloseTo(0);
  });

  it('reports having nowhere to fund from', () => {
    const s = planReservations(
      [reservationOf({ created_date: '2026-05-23' })],
      flatGoal,
      undefined,
    );
    const plan = s.byId.get('r1')!;
    expect(plan.funded).toBe(0);
    expect(plan.reason).toBe('no-days');
    expect(s.deltaByDate.size).toBe(0);
  });

  it('redistributes to days with room when one day is at its floor', () => {
    // A 1200 kcal day is already at the flat floor, so it can give nothing
    // and the other six carry its share rather than the request shrinking.
    const goal = (d: string) => (d === '2026-05-22' ? 1200 : 2000);
    const s = planReservations([reservationOf({ kcal: 700 })], goal, undefined);
    const plan = s.byId.get('r1')!;
    expect(plan.perDay.get('2026-05-22') ?? 0).toBeCloseTo(0);
    expect(plan.funded).toBeCloseTo(700);
    expect(plan.days).toHaveLength(6);
    expect(plan.evenPerDay).toBeCloseTo(700 / 6);
    expect(netOf(s.deltaByDate)).toBeCloseTo(0);
  });

  it('partially caps a day with only some room left', () => {
    // 1300 kcal day has 100 of room against the 1200 floor; an even split
    // would want 100 exactly, so push it with a bigger request.
    const goal = (d: string) => (d === '2026-05-22' ? 1300 : 2000);
    const s = planReservations([reservationOf({ kcal: 1400 })], goal, undefined);
    const plan = s.byId.get('r1')!;
    expect(plan.perDay.get('2026-05-22')).toBeCloseTo(100);
    expect(plan.funded).toBeCloseTo(1400);
    expect(netOf(s.deltaByDate)).toBeCloseTo(0);
  });

  it('compounds two reservations without pushing a day through the floor', () => {
    const a = reservationOf({ id: 'a', date: '2026-05-20', kcal: 3000 });
    const b = reservationOf({ id: 'b', date: '2026-05-21', kcal: 3000 });
    const s = planReservations([a, b], flatGoal, undefined);
    // No day gives more than its 600 kcal of room across BOTH reservations.
    const perDayTotal = new Map<string, number>();
    for (const plan of s.plans) {
      for (const [d, take] of plan.perDay) {
        perDayTotal.set(d, (perDayTotal.get(d) ?? 0) + take);
      }
    }
    for (const total of perDayTotal.values()) {
      expect(total).toBeLessThanOrEqual(600.001);
    }
    expect(netOf(s.deltaByDate)).toBeCloseTo(0);
  });

  it('gives the nearer event first call on the days it can still reach', () => {
    const soon = reservationOf({ id: 'soon', date: '2026-05-18', kcal: 1200 });
    const later = reservationOf({ id: 'later', date: '2026-05-25', kcal: 1200 });
    const s = planReservations([later, soon], flatGoal, undefined);
    // Sorted by event date regardless of input order.
    expect(s.plans.map((p) => p.id)).toEqual(['soon', 'later']);
    expect(s.byId.get('soon')!.funded).toBeCloseTo(1200);
  });

  it('ignores deleted and zero-kcal rows', () => {
    const s = planReservations(
      [
        reservationOf({ id: 'x', deleted_at: '2026-05-12T00:00:00.000Z' }),
        reservationOf({ id: 'y', kcal: 0 }),
      ],
      flatGoal,
      undefined,
    );
    expect(s.plans).toHaveLength(0);
    expect(s.deltaByDate.size).toBe(0);
  });

  it('funds from a paused day at its raised goal', () => {
    // A maintenance day genuinely has more room to give than a cut day.
    const goal = (d: string) => (d >= '2026-05-18' ? 2400 : 1700);
    const s = planReservations([reservationOf({ kcal: 700 })], goal, undefined);
    const plan = s.byId.get('r1')!;
    expect(plan.funded).toBeCloseTo(700);
    expect(netOf(s.deltaByDate)).toBeCloseTo(0);
  });

  it('nets to zero however the request is shaped', () => {
    for (const mode of ['before', 'after', 'split'] as const) {
      for (const kcal of [100, 700, 6000]) {
        const s = planReservations(
          [reservationOf({ kcal, fund_mode: mode })],
          flatGoal,
          undefined,
        );
        expect(netOf(s.deltaByDate)).toBeCloseTo(0);
      }
    }
  });
});

describe('dayEffect', () => {
  const r = reservationOf();

  it('reports a funding day as saving, with what it is for', () => {
    const s = planReservations([r], flatGoal, undefined);
    const e = dayEffect('2026-05-20', [r], s);
    expect(e.saving).toBeCloseTo(100);
    expect(e.event).toBe(0);
    expect(e.net).toBeCloseTo(-100);
    expect(e.fundingFor[0].reservation.label).toBe('Birthday cake');
    expect(e.hosting).toBeNull();
  });

  it('reports the event day as hosting', () => {
    const s = planReservations([r], flatGoal, undefined);
    const e = dayEffect('2026-05-23', [r], s);
    expect(e.event).toBeCloseTo(700);
    expect(e.net).toBeCloseTo(700);
    expect(e.hosting?.reservation.label).toBe('Birthday cake');
  });

  it('is empty on an unrelated day', () => {
    const s = planReservations([r], flatGoal, undefined);
    const e = dayEffect('2026-04-01', [r], s);
    expect(e.saving).toBe(0);
    expect(e.event).toBe(0);
    expect(e.net).toBe(0);
  });
});

describe('previewReservation', () => {
  it('costs a draft out before anything is saved', () => {
    const plan = previewReservation(
      { date: '2026-05-23', kcal: 700, fund_mode: 'before', spread_days: 7 },
      '2026-05-11',
      [],
      flatGoal,
      undefined,
    );
    expect(plan.funded).toBeCloseTo(700);
    expect(plan.evenPerDay).toBeCloseTo(100);
  });

  it('takes only the capacity left by reservations already saved', () => {
    const existing = reservationOf({ id: 'existing', kcal: 4200 });
    const plan = previewReservation(
      { date: '2026-05-23', kcal: 700, fund_mode: 'before', spread_days: 7 },
      '2026-05-11',
      [existing],
      flatGoal,
      undefined,
    );
    expect(plan.funded).toBeCloseTo(0);
    expect(plan.shortfall).toBeCloseTo(700);
  });
});
