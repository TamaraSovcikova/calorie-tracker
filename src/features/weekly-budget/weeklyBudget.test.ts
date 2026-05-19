import { describe, expect, it } from 'vitest';
import { effectiveDailyKcal, weekDates, weekStartFor } from './weeklyBudget';

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

  it('counts an un-logged past day as the daily goal', () => {
    const { effective, missedCount } = effectiveDailyKcal(
      dates,
      [0, 1800, 0, 0, 0, 0, 0],
      [false, true, false, false, false, false, false],
      today,
      2000,
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
    );
    expect(effective[0]).toBe(400); // logged — a real low day, not erased
    expect(effective[1]).toBe(2000); // un-logged past day
    expect(missedCount).toBe(1);
  });
});
