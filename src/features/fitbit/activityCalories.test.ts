import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/db/types';
import {
  activeCaloriesForDate,
  elapsedDayFraction,
  profileDailyBmr,
} from './activityCalories';

const profile = (over: Partial<Profile> = {}): Profile =>
  ({
    user_id: 'local',
    sex: 'female',
    dob: '1990-05-16',
    weight_kg: 65,
    height_cm: 168,
    kcal_target: 2000,
    protein_g: 120,
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

describe('profileDailyBmr', () => {
  it('returns null for an undefined profile', () => {
    expect(profileDailyBmr(undefined)).toBeNull();
  });

  it('returns null when a required stat is missing', () => {
    expect(profileDailyBmr(profile({ sex: undefined }))).toBeNull();
    expect(profileDailyBmr(profile({ dob: undefined }))).toBeNull();
    expect(profileDailyBmr(profile({ weight_kg: undefined }))).toBeNull();
    expect(profileDailyBmr(profile({ height_cm: undefined }))).toBeNull();
  });

  it('returns a positive BMR for a complete profile', () => {
    const value = profileDailyBmr(profile());
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThan(1000);
  });
});

describe('elapsedDayFraction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is 1 for a past day', () => {
    expect(elapsedDayFraction('2026-05-10')).toBe(1);
  });

  it('is 0 for a future day', () => {
    expect(elapsedDayFraction('2026-05-20')).toBe(0);
  });

  it('is between 0 and 1 for today', () => {
    const frac = elapsedDayFraction('2026-05-16');
    expect(frac).toBeGreaterThan(0);
    expect(frac).toBeLessThan(1);
  });
});

describe('activeCaloriesForDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when there is no active stream and no BMR', () => {
    expect(activeCaloriesForDate(2200, 0, null, '2026-05-10')).toBeNull();
  });

  it('subtracts a full day of BMR for a past day (no active stream)', () => {
    expect(activeCaloriesForDate(2200, 0, 1500, '2026-05-10')).toBe(700);
  });

  it('never goes negative', () => {
    expect(activeCaloriesForDate(1000, 0, 1500, '2026-05-10')).toBe(0);
  });

  it('prorates resting burn for today', () => {
    // today fraction < 1, so less BMR is subtracted than a full day
    expect(activeCaloriesForDate(2200, 0, 1500, '2026-05-16')).toBeGreaterThan(
      700,
    );
  });

  it('uses the device active-energy figure with no profile needed', () => {
    // A logged workout that lands in active-energy-burned but barely moves
    // the total: 600 active surfaces even though total-minus-BMR would be 0.
    expect(activeCaloriesForDate(1500, 600, null, '2026-05-10')).toBe(600);
  });

  it('prefers active-energy-burned over total-minus-BMR when both present', () => {
    // active-energy-burned = 773, total-minus-BMR = 1170. Since active-energy
    // is present, use it as the base (it is the authoritative active figure).
    expect(activeCaloriesForDate(2670, 773, 1500, '2026-05-28')).toBe(773);
  });

  it('subtracts session calories to avoid double-counting named exercise rows', () => {
    // active-energy-burned = 773, sessions = 691 -> background = 82.
    expect(activeCaloriesForDate(2670, 773, 1500, '2026-05-28', 691)).toBe(82);
  });

  it('clamps background row to 0 when sessions exceed active-energy total', () => {
    expect(activeCaloriesForDate(2000, 400, 1500, '2026-05-10', 500)).toBe(0);
  });

  it('falls back to total-minus-BMR when active-energy is 0 (no workout)', () => {
    // Non-workout day: active-energy-burned = 0, total-minus-BMR = 700.
    expect(activeCaloriesForDate(2200, 0, 1500, '2026-05-10')).toBe(700);
  });
});
