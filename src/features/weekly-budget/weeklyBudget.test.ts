import { describe, expect, it } from 'vitest';
import { weekDates, weekStartFor } from './weeklyBudget';

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
