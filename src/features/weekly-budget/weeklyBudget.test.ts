import { describe, expect, it } from 'vitest';
import {
  carryInClamped,
  catchupTrim,
  clampCarry,
  datesBetween,
  effectiveDailyKcal,
  maxDailyTrimFor,
  monthDates,
  periodDatesFor,
  previousPeriodDatesFor,
  resolveBudgetMode,
  weekDates,
  weekStartFor,
} from './weeklyBudget';
import type { Profile } from '@/db/types';

/** Minimal profile for the pure-helper tests. */
function profileOf(patch: Partial<Profile>): Profile {
  return { kcal_target: 2000, ...patch } as Profile;
}

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
    expect(effective[0]).toBe(2000); // Mon - missed, neutralised
    expect(effective[1]).toBe(1800); // Tue - logged, kept
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
    expect(effective[0]).toBe(400); // logged - a real low day, not erased
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
    expect(effective[1]).toBe(2000); // Tue - logged, kept
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

describe('clampCarry', () => {
  it('passes a balance through untouched with no cap', () => {
    expect(clampCarry(-3200, undefined)).toBe(-3200);
    expect(clampCarry(3200, 0)).toBe(3200);
  });

  it('clamps both directions to the cap', () => {
    expect(clampCarry(-3200, 1500)).toBe(-1500);
    expect(clampCarry(3200, 1500)).toBe(1500);
  });
});

describe('resolveBudgetMode', () => {
  it('reads the explicit mode when set', () => {
    expect(resolveBudgetMode(profileOf({ budget_mode: 'warn' }))).toBe('warn');
    expect(resolveBudgetMode(profileOf({ budget_mode: 'off' }))).toBe('off');
  });

  it('falls back to the pre-mode boolean for older profiles', () => {
    expect(resolveBudgetMode(profileOf({ weekly_budget_enabled: true }))).toBe('adjust');
    expect(resolveBudgetMode(profileOf({ weekly_budget_enabled: false }))).toBe('off');
    expect(resolveBudgetMode(profileOf({}))).toBe('off');
  });

  it('prefers the explicit mode over a stale boolean', () => {
    expect(
      resolveBudgetMode(
        profileOf({ budget_mode: 'warn', weekly_budget_enabled: true }),
      ),
    ).toBe('warn');
  });

  it('is off with no profile at all', () => {
    expect(resolveBudgetMode(undefined)).toBe('off');
  });
});

describe('maxDailyTrimFor', () => {
  it('uses the explicit kcal cap when set', () => {
    expect(maxDailyTrimFor(profileOf({ budget_max_daily_trim: 200 }), 2000)).toBe(200);
  });

  it('falls back to the legacy 70% floor when the cap was never set', () => {
    // 70% floor on a 2000 goal = never below 1400, i.e. a 600 kcal trim.
    expect(
      maxDailyTrimFor(profileOf({ weekly_budget_floor: true }), 2000),
    ).toBeCloseTo(600);
  });

  it('treats an explicit 0 as "no limit", retiring the legacy floor', () => {
    expect(
      maxDailyTrimFor(
        profileOf({ budget_max_daily_trim: 0, weekly_budget_floor: true }),
        2000,
      ),
    ).toBeUndefined();
  });

  it('is undefined when neither is configured', () => {
    expect(maxDailyTrimFor(profileOf({}), 2000)).toBeUndefined();
  });
});

describe('datesBetween', () => {
  it('is inclusive of both ends', () => {
    expect(datesBetween('2026-05-18', '2026-05-21')).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
    ]);
  });

  it('returns a single date when start equals end', () => {
    expect(datesBetween('2026-05-19', '2026-05-19')).toEqual(['2026-05-19']);
  });

  it('returns nothing when the range is inverted', () => {
    expect(datesBetween('2026-05-20', '2026-05-19')).toEqual([]);
  });

  it('keeps only the most recent days when the window is huge', () => {
    // A carry-over start left untouched for a decade must not scan it all.
    const dates = datesBetween('2016-01-01', '2026-05-19');
    expect(dates.length).toBe(1096);
    expect(dates[dates.length - 1]).toBe('2026-05-19');
    expect(dates[0]).toBe('2023-05-20');
  });
});

describe('catchupTrim', () => {
  it('takes the full daily rate off while plenty is owed', () => {
    expect(catchupTrim(150, -1200)).toBe(150);
  });

  it('never takes off more than is actually owed', () => {
    // 150/day rate but only 40 outstanding - clear the 40, don't overshoot
    // into a fresh surplus.
    expect(catchupTrim(150, -40)).toBe(40);
  });

  it('stops once the balance is level or banked', () => {
    expect(catchupTrim(150, 0)).toBe(0);
    expect(catchupTrim(150, 900)).toBe(0);
  });

  it('is off when no rate is set', () => {
    expect(catchupTrim(undefined, -1200)).toBe(0);
    expect(catchupTrim(0, -1200)).toBe(0);
  });

  it('clears a balance over several days at the chosen rate', () => {
    // 500 owed, 200/day -> 200, 200, then the remaining 100, then nothing.
    let owed = -500;
    const taken: number[] = [];
    for (let day = 0; day < 4; day++) {
      const t = catchupTrim(200, owed);
      taken.push(t);
      owed += t;
    }
    expect(taken).toEqual([200, 200, 100, 0]);
    expect(owed).toBe(0);
  });
});
