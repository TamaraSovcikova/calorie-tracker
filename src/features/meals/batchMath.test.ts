import { describe, expect, it } from 'vitest';
import {
  batchName,
  batchStatus,
  fitToTarget,
  portionsForGrams,
  roundAmount,
  scaleFactor,
  type FitLine,
} from './batchMath';

/** Per-100g macros -> a line at `qty` grams. */
const line = (
  qty: number,
  kcal100: number,
  protein100: number,
  locked = false,
): FitLine => ({
  qty,
  unit: 'g',
  kcal: (kcal100 * qty) / 100,
  protein: (protein100 * qty) / 100,
  locked,
});

// A plain meal prep, 5 portions: chicken, dry rice, broccoli.
const chicken = (locked = false) => line(800, 165, 31, locked);
const rice = () => line(300, 360, 7);
const broccoli = () => line(400, 34, 2.8);

describe('scaling to what was bought', () => {
  it('scales everything by the ingredient that changed', () => {
    // The recipe says 800 g chicken, the fridge has 900 g.
    const f = scaleFactor(800, 900);
    expect(roundAmount(300 * f, 'g')).toBe(340);
    expect(roundAmount(400 * f, 'g')).toBe(450);
  });

  it('rounds like a kitchen scale, and counted units to quarters', () => {
    expect(roundAmount(337.5, 'g')).toBe(340);
    expect(roundAmount(42.4, 'g')).toBe(42);
    expect(roundAmount(2.3, 'egg')).toBe(2.25);
    expect(roundAmount(0.01, 'g')).toBe(1);
    expect(scaleFactor(0, 900)).toBe(1);
  });
});

describe('fitToTarget', () => {
  it('hits protein and calories together when both groups can move', () => {
    const r = fitToTarget([chicken(), rice(), broccoli()], 5, {
      protein: 60,
      kcal: 500,
    });
    expect(r.missed).toEqual([]);
    expect(r.perPortion.protein).toBeGreaterThan(57.5);
    expect(r.perPortion.protein).toBeLessThan(62.5);
    expect(Math.abs(r.perPortion.kcal - 500)).toBeLessThan(20);
    // Sides keep their proportion to each other.
    expect(r.qtys[1] / r.qtys[2]).toBeCloseTo(300 / 400, 1);
  });

  it('leaves a locked protein alone and says protein was missed', () => {
    const r = fitToTarget([chicken(true), rice(), broccoli()], 5, {
      protein: 70,
      kcal: 500,
    });
    expect(r.qtys[0]).toBe(800);
    expect(r.missed).toEqual(['protein']);
    expect(Math.abs(r.perPortion.kcal - 500)).toBeLessThan(20);
  });

  it('with a calorie target only, moves the sides and not the protein', () => {
    const r = fitToTarget([chicken(), rice(), broccoli()], 5, { kcal: 450 });
    expect(r.qtys[0]).toBe(800);
    expect(r.qtys[1]).toBeLessThan(300);
    expect(r.missed).toEqual([]);
  });

  it('with a protein target only, moves the protein and not the sides', () => {
    const r = fitToTarget([chicken(), rice(), broccoli()], 5, { protein: 45 });
    expect(r.qtys[1]).toBe(300);
    expect(r.qtys[2]).toBe(400);
    expect(r.qtys[0]).toBeLessThan(800);
    expect(r.missed).toEqual([]);
  });

  it('reports a miss instead of going to absurd amounts', () => {
    // 150 g protein a portion out of this recipe is not happening.
    const r = fitToTarget([chicken(), rice(), broccoli()], 5, {
      protein: 150,
      kcal: 400,
    });
    expect(r.missed.length).toBeGreaterThan(0);
    expect(r.qtys[0]).toBeLessThanOrEqual(800 * 5);
  });

  it('does nothing when everything is locked or no target is given', () => {
    const locked = [chicken(true), { ...rice(), locked: true }];
    expect(fitToTarget(locked, 5, { kcal: 300 }).changed).toBe(false);
    expect(fitToTarget([chicken(), rice()], 5, {}).changed).toBe(false);
  });
});

describe('what is left of a batch', () => {
  it('counts down as portions are logged', () => {
    expect(batchStatus({ servings: 5 }, { portions: 1.5 })).toEqual({
      left: 3.5,
      finished: false,
    });
  });

  it('finishes when the last portion is logged, dated by that log', () => {
    expect(
      batchStatus({ servings: 5 }, { portions: 5, lastAt: '2026-11-10T19:00:00Z' }),
    ).toEqual({ left: 0, finished: true, finishedAt: '2026-11-10T19:00:00Z' });
  });

  it('can be finished by hand with food still left', () => {
    const s = batchStatus(
      { servings: 5, finished_at: '2026-11-09T10:00:00Z' },
      { portions: 2 },
    );
    expect(s).toMatchObject({ left: 3, finished: true });
  });

  it('converts a weighed amount into portions', () => {
    // 45 g out of a 500 g salad that counts as 5 portions.
    expect(portionsForGrams(45, 500, 5)).toBeCloseTo(0.45);
    expect(portionsForGrams(45, 0, 5)).toBe(0);
  });
});

describe('batchName', () => {
  it('appends the date once', () => {
    expect(batchName('Chicken stroganoff', '11 Nov')).toBe('Chicken stroganoff · 11 Nov');
    expect(batchName('Chicken stroganoff · 4 Nov', '11 Nov')).toBe(
      'Chicken stroganoff · 11 Nov',
    );
  });
});
