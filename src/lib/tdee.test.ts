import { describe, expect, it } from 'vitest';
import { bmr, tdee, ACTIVITY_MULTIPLIERS } from './tdee';

describe('bmr (Mifflin-St Jeor)', () => {
  it('computes male BMR with the +5 constant', () => {
    // 10*80 + 6.25*180 - 5*30 + 5
    expect(bmr({ sex: 'male', ageYears: 30, weightKg: 80, heightCm: 180 })).toBe(1780);
  });

  it('computes female BMR with the -161 constant', () => {
    // 10*80 + 6.25*180 - 5*30 - 161
    expect(bmr({ sex: 'female', ageYears: 30, weightKg: 80, heightCm: 180 })).toBe(1614);
  });

  it('male and female differ by exactly 166', () => {
    const input = { ageYears: 25, weightKg: 70, heightCm: 170 } as const;
    expect(
      bmr({ ...input, sex: 'male' }) - bmr({ ...input, sex: 'female' }),
    ).toBe(166);
  });
});

describe('tdee', () => {
  it('multiplies BMR by the activity factor and rounds', () => {
    const input = { sex: 'male', ageYears: 30, weightKg: 80, heightCm: 180 } as const;
    expect(tdee({ ...input, activity: 'sedentary' })).toBe(
      Math.round(1780 * ACTIVITY_MULTIPLIERS.sedentary),
    );
    expect(tdee({ ...input, activity: 'very_active' })).toBe(
      Math.round(1780 * ACTIVITY_MULTIPLIERS.very_active),
    );
  });

  it('returns an integer', () => {
    const result = tdee({
      sex: 'female',
      ageYears: 41,
      weightKg: 63.5,
      heightCm: 167,
      activity: 'moderate',
    });
    expect(Number.isInteger(result)).toBe(true);
  });
});
