import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeStreak, computeStreakStats } from './streak';

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

describe('computeStreakStats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is all-zero for no logged days', () => {
    expect(computeStreakStats([])).toEqual({
      current: 0,
      longest: 0,
      totalDays: 0,
    });
  });

  it('reports current, longest, and total', () => {
    // a 4-day run in the past, a 2-day run ending today
    const stats = computeStreakStats([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
      '2026-05-15',
      '2026-05-16',
    ]);
    expect(stats.current).toBe(2);
    expect(stats.longest).toBe(4);
    expect(stats.totalDays).toBe(6);
  });

  it('deduplicates and ignores future dates', () => {
    const stats = computeStreakStats([
      '2026-05-16',
      '2026-05-16',
      '2026-05-20', // future
    ]);
    expect(stats.current).toBe(1);
    expect(stats.longest).toBe(1);
    expect(stats.totalDays).toBe(1);
  });
});
