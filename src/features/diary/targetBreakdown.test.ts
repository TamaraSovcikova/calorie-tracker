import { describe, expect, it } from 'vitest';
import { explainTarget } from './targetBreakdown';
import type { WeeklyBudget } from '@/features/weekly-budget/weeklyBudget';
import type { Profile } from '@/db/types';

const DATE = '2026-05-22';

function profileOf(patch: Partial<Profile> = {}): Profile {
  return {
    kcal_target: 1700,
    protein_g: 130,
    carbs_g: 160,
    fat_g: 50,
    eat_back_burned: false,
    ...patch,
  } as Profile;
}

/** A profile paused 20-26 May at 2200. */
function pausedProfile(patch: Partial<Profile> = {}): Profile {
  return profileOf({
    diet_pauses: JSON.stringify([
      { id: 'a', start: '2026-05-20', end: '2026-05-26', kcal: 2200, note: 'Diet break' },
    ]),
    ...patch,
  });
}

function budgetOf(patch: Partial<WeeklyBudget>): WeeklyBudget {
  return {
    mode: 'adjust',
    periodLabel: 'week',
    dayIndex: 4,
    daysRemaining: 3,
    weeklyBudget: 11900,
    dailyGoal: 1700,
    baseGoal: 1700,
    pause: null,
    carryIn: 0,
    carryBalance: 0,
    balanceFrom: '2026-05-18',
    carryoverOn: false,
    trimHeldBack: 0,
    catchupApplied: 0,
    consumedBeforeDay: 0,
    weekConsumed: 0,
    adjustedTarget: 1700,
    isAdjusted: false,
    missedCount: 0,
    weekStart: '2026-05-18',
    weekDates: [],
    ...patch,
  } as WeeklyBudget;
}

const plain = { date: DATE, weekly: null, burnedKcal: 0 };

describe('explainTarget', () => {
  it('is a single base row when nothing has moved the target', () => {
    const out = explainTarget({ ...plain, profile: profileOf() });
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].key).toBe('base');
    expect(out.steps[0].delta).toBeNull();
    expect(out.total).toBe(1700);
    expect(out.adjusted).toBe(false);
  });

  it('adds a pause row carrying the difference', () => {
    const out = explainTarget({ ...plain, profile: pausedProfile() });
    expect(out.steps.map((s) => s.key)).toEqual(['base', 'pause']);
    expect(out.steps[1].delta).toBe(500);
    expect(out.steps[1].running).toBe(2200);
    expect(out.total).toBe(2200);
    expect(out.adjusted).toBe(true);
  });

  it('names the pause in its detail line', () => {
    const out = explainTarget({ ...plain, profile: pausedProfile() });
    expect(out.steps[1].detail).toContain('Diet break');
  });

  it('adds the budget row on top of the paused goal, not the base', () => {
    // Paused to 2200; the budget then trims the day to 2050.
    const out = explainTarget({
      date: DATE,
      profile: pausedProfile(),
      weekly: budgetOf({ dailyGoal: 2200, adjustedTarget: 2050, isAdjusted: true }),
      burnedKcal: 0,
    });
    expect(out.steps.map((s) => s.key)).toEqual(['base', 'pause', 'budget']);
    expect(out.steps[2].delta).toBe(-150);
    expect(out.total).toBe(2050);
  });

  it('adds exercise last, on top of everything else', () => {
    const out = explainTarget({
      date: DATE,
      profile: pausedProfile({ eat_back_burned: true }),
      weekly: budgetOf({ dailyGoal: 2200, adjustedTarget: 2050 }),
      burnedKcal: 180,
    });
    expect(out.steps.map((s) => s.key)).toEqual([
      'base',
      'pause',
      'budget',
      'eatback',
    ]);
    expect(out.steps[3].delta).toBe(180);
    expect(out.total).toBe(2230);
  });

  it('leaves out exercise when eat-back is off', () => {
    const out = explainTarget({
      date: DATE,
      profile: profileOf({ eat_back_burned: false }),
      weekly: null,
      burnedKcal: 400,
    });
    expect(out.steps.map((s) => s.key)).toEqual(['base']);
    expect(out.total).toBe(1700);
  });

  it('drops a step that changed nothing', () => {
    // Budget on, but this day lands exactly on the goal.
    const out = explainTarget({
      date: DATE,
      profile: profileOf(),
      weekly: budgetOf({ adjustedTarget: 1700 }),
      burnedKcal: 0,
    });
    expect(out.steps.map((s) => s.key)).toEqual(['base']);
    expect(out.adjusted).toBe(false);
  });

  it('keeps the chain intact when a middle step is dropped', () => {
    // Pause target equals the cut target, so the pause row vanishes - the
    // budget row must still read against the base, not against nothing.
    const profile = profileOf({
      eat_back_burned: true,
      diet_pauses: JSON.stringify([
        { id: 'a', start: '2026-05-20', end: '2026-05-26', kcal: 1700 },
      ]),
    });
    const out = explainTarget({
      date: DATE,
      profile,
      weekly: budgetOf({ dailyGoal: 1700, adjustedTarget: 1600 }),
      burnedKcal: 90,
    });
    expect(out.steps.map((s) => s.key)).toEqual(['base', 'budget', 'eatback']);
    expect(out.steps[1].delta).toBe(-100);
    expect(out.steps[2].delta).toBe(90);
    expect(out.total).toBe(1690);
  });

  it('makes the visible column add up exactly', () => {
    // Fractional values throughout: each delta must be the difference of the
    // ROUNDED running figures, or the ledger on screen fails to reconcile.
    const out = explainTarget({
      date: DATE,
      profile: pausedProfile({ kcal_target: 1712.4, eat_back_burned: true }),
      weekly: budgetOf({ dailyGoal: 2200, adjustedTarget: 2051.7 }),
      burnedKcal: 183.6,
    });
    let running = out.steps[0].running;
    for (const step of out.steps.slice(1)) {
      running += step.delta as number;
      expect(step.running).toBe(running);
    }
    expect(out.total).toBe(running);
  });

  it('explains a warn-mode catch-up in its own words', () => {
    const out = explainTarget({
      date: DATE,
      profile: profileOf(),
      weekly: budgetOf({
        mode: 'warn',
        adjustedTarget: 1550,
        catchupApplied: 150,
        carryBalance: -600,
      }),
      burnedKcal: 0,
    });
    expect(out.steps[1].detail).toContain('rate you set');
    expect(out.steps[1].delta).toBe(-150);
  });

  it('mentions the trim limit when it held the target up', () => {
    const out = explainTarget({
      date: DATE,
      profile: profileOf(),
      weekly: budgetOf({ adjustedTarget: 1500, trimHeldBack: 220 }),
      burnedKcal: 0,
    });
    expect(out.steps[1].detail).toContain('trim limit');
  });

  it('labels the total by whether the day is today', () => {
    const out = explainTarget({ ...plain, profile: profileOf() });
    expect(out.totalLabel).toBe('Target for this day');
  });
});
