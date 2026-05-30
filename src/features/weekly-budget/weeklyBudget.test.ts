import { describe, expect, it } from 'vitest';
import {
  carryInClamped,
  effectiveDailyKcal,
  monthDates,
  periodDatesFor,
  previousPeriodDatesFor,
  weekDates,
  weekStartFor,
} from './weeklyBudget';

// 2026-05-19 is a Tuesday.
describe('weekStartFor', () => {
  it('finds the Monday-based week start', () => {
    expect(weekStartFor('2026-05-19', 1)).toBe('2026-05-18');
  });

  it('finds the Saturday-based week start', () => {
    expect(weekStartFor('2026-05-19', 6)).toBe('2026-05-16');
  });

  it('returns the date itself when it is the start day', () => {
    expect(weekStartFor('2026-05-19', 2)).toBe('2026-05-19');
  });

  it('finds the Sunday-based week start', () => {
    expect(weekStartFor('2026-05-19', 0)).toBe('2026-05-17');
  });
});

describe('weekDates', () => {
  it('returns 7 consecutive dates from the week start', () => {
    expect(weekDates('2026-05-19', 1)).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
      '2026-05-24',
    ]);
  });

  it('includes the queried date', () => {
    for (const startDay of [0, 1, 3, 6]) {
      expect(weekDates('2026-05-19', startDay)).toContain('2026-05-19');
    }
  });
});

describe('effectiveDailyKcal', () => {
  // Week Mon-Sun; "today" is Wed 2026-05-20.
  const dates = [
    '2026-05-18',
    '2026-05-19',
    '2026-05-20',
    '2026-05-21',
    '2026-05-22',
    '2026-05-23',
    '2026-05-24',
  ];
  const today = '2026-05-20';

  const none = new Set<string>();

  it('counts an un-logged past day as the daily goal', () => {
    const { effective, missedCount } = effectiveDailyKcal(
      dates,
      [0, 1800, 0, 0, 0, 0, 0],
      [false, true, false, false, false, false, false],
      today,
      2000,
      none,
    );
    expect(effective[0]).toBe(2000); // Mon — missed, neutralised
    expect(effective[1]).toBe(1800); // Tue — logged, kept
    expect(missedCount).toBe(1);
  });

  it('never marks today or future days as missed', () => {
    const { effective, missedCount } = effectiveDailyKcal(
      dates,
      [2000, 2000, 0, 0, 0, 0, 0],
      [true, true, false, false, false, false, false],
      today,
      2000,
      none,
    );
    expect(effective[2]).toBe(0); // today, nothing logged yet
    expect(effective[3]).toBe(0); // future day
    expect(missedCount).toBe(0);
  });

  it('keeps a logged past day even when its calories are low', () => {
    const { effective, missedCount } = effectiveDailyKcal(
      dates,
      [400, 0, 0, 0, 0, 0, 0],
      [true, false, false, false, false, false, false],
      today,
      2000,
      none,
    );
    expect(effective[0]).toBe(400); // logged — a real low day, not erased
    expect(effective[1]).toBe(2000); // un-logged past day
    expect(missedCount).toBe(1);
  });

  it('neutralises a day the user explicitly marked untracked', () => {
    const { effective, missedCount } = effectiveDailyKcal(
      dates,
      [400, 2000, 0, 0, 0, 0, 0],
      [true, true, false, false, false, false, false],
      today,
      2000,
      new Set(['2026-05-18']), // Mon marked untracked despite being logged
    );
    expect(effective[0]).toBe(2000); // overridden to on-target
    expect(effective[1]).toBe(2000); // Tue — logged, kept
    expect(missedCount).toBe(1);
  });
});

describe('monthDates', () => {
  it('returns every day of a 31-day month', () => {
    const days = monthDates('2026-05-19');
    expect(days.length).toBe(31);
    expect(days[0]).toBe('2026-05-01');
    expect(days[30]).toBe('2026-05-31');
    expect(days).toContain('2026-05-19');
  });

  it('handles a short month (February, non-leap)', () => {
    const days = monthDates('2026-02-10');
    expect(days.length).toBe(28);
    expect(days[27]).toBe('2026-02-28');
  });
});

describe('periodDatesFor', () => {
  it('delegates to weekDates for the week period', () => {
    expect(periodDatesFor('2026-05-19', 'week', 1)).toEqual(
      weekDates('2026-05-19', 1),
    );
  });

  it('delegates to monthDates for the month period', () => {
    expect(periodDatesFor('2026-05-19', 'month', 1)).toEqual(
      monthDates('2026-05-19'),
    );
  });
});

describe('previousPeriodDatesFor', () => {
  it('returns the prior week', () => {
    const prev = previousPeriodDatesFor('2026-05-19', 'week', 1);
    expect(prev[0]).toBe('2026-05-11');
    expect(prev[6]).toBe('2026-05-17');
  });

  it('returns the prior calendar month', () => {
    const prev = previousPeriodDatesFor('2026-05-19', 'month', 1);
    expect(prev[0]).toBe('2026-04-01');
    expect(prev.length).toBe(30); // April
    expect(prev[29]).toBe('2026-04-30');
  });
});

describe('carryInClamped', () => {
  it('carries a banked surplus forward as positive', () => {
    // ate 13000 against a 14000 budget -> banked 1000
    expect(carryInClamped(14000, 13000, undefined)).toBe(1000);
  });

  it('carries an overage forward as negative (the penalty)', () => {
    // ate 15000 against a 14000 budget -> 1000 over
    expect(carryInClamped(14000, 15000, undefined)).toBe(-1000);
  });

  it('clamps to +/- the cap when one is set', () => {
    expect(carryInClamped(14000, 9000, 2000)).toBe(2000); // +5000 capped
    expect(carryInClamped(14000, 20000, 2000)).toBe(-2000); // -6000 capped
  });

  it('treats a zero or negative cap as no cap', () => {
    expect(carryInClamped(14000, 9000, 0)).toBe(5000);
  });
});
