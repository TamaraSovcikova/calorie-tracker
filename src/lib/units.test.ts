import { describe, expect, it } from 'vitest';
import {
  cmToIn,
  formatHeight,
  formatWeight,
  inToCm,
  kgToLb,
  lbToKg,
} from './units';

describe('unit conversions', () => {
  it('kg <-> lb round-trips', () => {
    expect(lbToKg(kgToLb(75))).toBeCloseTo(75, 10);
  });

  it('cm <-> in round-trips', () => {
    expect(inToCm(cmToIn(180))).toBeCloseTo(180, 10);
  });

  it('1 kg is about 2.2046 lb', () => {
    expect(kgToLb(1)).toBeCloseTo(2.20462, 4);
  });
});

describe('formatWeight', () => {
  it('shows kg for metric', () => {
    expect(formatWeight(72.5, 'metric')).toBe('72.5 kg');
  });

  it('shows lb for imperial', () => {
    expect(formatWeight(72.5, 'imperial')).toBe(`${kgToLb(72.5).toFixed(1)} lb`);
  });
});

describe('formatHeight', () => {
  it('shows rounded cm for metric', () => {
    expect(formatHeight(177.4, 'metric')).toBe('177 cm');
  });

  it('shows feet and inches for imperial', () => {
    // 180 cm = 70.87 in -> 5'11"
    expect(formatHeight(180, 'imperial')).toBe(`5'11"`);
  });
});
