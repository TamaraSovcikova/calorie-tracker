import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeStreak } from './streak';

const TODAY = '2026-05-16';

describe('computeStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is 0 for no logged days', () => {
    expect(computeStreak([])).toBe(0);
  });

  it('counts a run ending today', () => {
    expect(computeStreak(['2026-05-14', '2026-05-15', '2026-05-16'])).toBe(3);
  });

  it('counts a run ending yesterday when today is missing', () => {
    expect(computeStreak(['2026-05-13', '2026-05-14', '2026-05-15'])).toBe(3);
  });

  it('is 0 when neither today nor yesterday is logged', () => {
    expect(computeStreak(['2026-05-10', '2026-05-11', '2026-05-12'])).toBe(0);
  });

  it('stops at the first gap', () => {
    // gap on 2026-05-14
    expect(computeStreak(['2026-05-12', '2026-05-13', '2026-05-15', '2026-05-16'])).toBe(2);
  });

  it('ignores future dates and counts only the current run', () => {
    expect(computeStreak(['2026-05-20', '2026-05-15', '2026-05-16'])).toBe(2);
  });

  it('deduplicates repeated dates', () => {
    expect(computeStreak(['2026-05-16', '2026-05-16', '2026-05-15'])).toBe(2);
  });
});
