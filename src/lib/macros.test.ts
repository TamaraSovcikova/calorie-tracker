import { describe, expect, it } from 'vitest';
import type { Profile } from '@/db/types';
import type { DayTotals } from '@/db/repos/diary';
import {
  effectiveKcalTarget,
  formatGrams,
  formatKcal,
  macroTarget,
  macroValue,
  pct,
} from './macros';

const profile = (over: Partial<Profile> = {}): Profile =>
  ({
    user_id: 'local',
    kcal_target: 2000,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 60,
    primary_macro: 'protein',
    eat_back_burned: false,
    units: 'metric',
    theme: 'system',
    plan: 'free',
    fitbit_connected: false,
    onboarded: true,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Profile;

const totals: DayTotals = {
  kcal: 1500,
  protein: 120,
  carbs: 100,
  fat: 40,
  fiber: 20,
  sugar: 35,
  sodium: 1800,
};

describe('macroTarget / macroValue', () => {
  it('reads the matching profile target', () => {
    const p = profile();
    expect(macroTarget(p, 'protein')).toBe(150);
    expect(macroTarget(p, 'carbs')).toBe(200);
    expect(macroTarget(p, 'fat')).toBe(60);
  });

  it('reads the matching totals value', () => {
    expect(macroValue(totals, 'protein')).toBe(120);
    expect(macroValue(totals, 'carbs')).toBe(100);
    expect(macroValue(totals, 'fat')).toBe(40);
  });
});

describe('pct', () => {
  it('returns the ratio for normal input', () => {
    expect(pct(50, 100)).toBe(0.5);
  });

  it('clamps to 1.5 when over target', () => {
    expect(pct(500, 100)).toBe(1.5);
  });

  it('clamps to 0 for negative values', () => {
    expect(pct(-10, 100)).toBe(0);
  });

  it('returns 0 when target is non-positive', () => {
    expect(pct(50, 0)).toBe(0);
    expect(pct(50, -5)).toBe(0);
  });
});

describe('effectiveKcalTarget', () => {
  it('ignores burned kcal when eat-back is off', () => {
    expect(effectiveKcalTarget(profile({ eat_back_burned: false }), 300)).toBe(2000);
  });

  it('adds burned kcal when eat-back is on', () => {
    expect(effectiveKcalTarget(profile({ eat_back_burned: true }), 300)).toBe(2300);
  });
});

describe('formatting', () => {
  it('formatKcal rounds', () => {
    expect(formatKcal(1499.6)).toBe('1,500');
  });

  it('formatGrams rounds when >= 100', () => {
    expect(formatGrams(123.7)).toBe('124');
  });

  it('formatGrams keeps one decimal under 100', () => {
    expect(formatGrams(12.34)).toBe('12.3');
  });

  it('formatGrams drops a trailing .0', () => {
    expect(formatGrams(12)).toBe('12');
  });
});
