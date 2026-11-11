import { describe, expect, it } from 'vitest';
import { applyDayOutcome, rollWellbeing, type DayOutcome } from './wellbeing';

const day = (over: Partial<DayOutcome> = {}): DayOutcome => ({
  logged: false,
  hitGoal: false,
  overGoal: false,
  ...over,
});

describe('applyDayOutcome', () => {
  it('adds 10 for a logged day that hit the goal', () => {
    expect(applyDayOutcome(70, day({ logged: true, hitGoal: true }))).toBe(80);
  });

  it('adds 6 for a logged day that missed the goal', () => {
    expect(applyDayOutcome(70, day({ logged: true }))).toBe(76);
  });

  it('subtracts 10 for a skipped day', () => {
    expect(applyDayOutcome(70, day())).toBe(60);
  });

  it('dings 3 for going over goal (net +3 on a logged over day)', () => {
    expect(applyDayOutcome(70, day({ logged: true, overGoal: true }))).toBe(73);
  });

  it('clamps to 100', () => {
    expect(applyDayOutcome(98, day({ logged: true, hitGoal: true }))).toBe(100);
  });

  it('clamps to 0', () => {
    expect(applyDayOutcome(5, day())).toBe(0);
  });
});

describe('rollWellbeing', () => {
  it('returns the start score for no elapsed days', () => {
    expect(rollWellbeing(70, [])).toBe(70);
  });

  it('folds a run of days', () => {
    // 70 → +10 → 80 → -10 → 70 → +6 → 76
    const days = [
      day({ logged: true, hitGoal: true }),
      day(),
      day({ logged: true }),
    ];
    expect(rollWellbeing(70, days)).toBe(76);
  });

  it('clamps a start score outside the range before folding', () => {
    expect(rollWellbeing(150, [])).toBe(100);
    expect(rollWellbeing(-20, [])).toBe(0);
  });
});

describe('outcomeForDay', () => {
  it('skips a day marked untracked: no dip, no lift', async () => {
    const { outcomeForDay } = await import('./wellbeing');
    expect(outcomeForDay({ kind: 'untracked', effective: 1700 }, 1700)).toBeNull();
  });

  it('treats an estimated day as logged, judged on the estimate', async () => {
    const { outcomeForDay } = await import('./wellbeing');
    expect(outcomeForDay({ kind: 'estimated', effective: 2200 }, 1700)).toEqual({
      logged: true,
      hitGoal: false,
      overGoal: true,
    });
    expect(outcomeForDay({ kind: 'estimated', effective: 1700 }, 1700)).toEqual({
      logged: true,
      hitGoal: true,
      overGoal: false,
    });
  });

  it('still counts an empty past day as skipped', async () => {
    const { outcomeForDay } = await import('./wellbeing');
    // An empty day resolves to its goal for budget purposes; the pet must
    // not read that as "ate exactly on goal".
    expect(outcomeForDay({ kind: 'empty', effective: 1700 }, 1700)).toEqual({
      logged: false,
      hitGoal: false,
      overGoal: false,
    });
  });
});
