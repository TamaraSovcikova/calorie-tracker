import { describe, expect, it } from 'vitest';
import {
  buildSessionDetail,
  durationMinutes,
  formatLocalTime,
  formatTimeRange,
  humaniseExerciseType,
  parseUtcOffsetSeconds,
} from './exerciseFormat';

describe('humaniseExerciseType', () => {
  it('maps known types to friendly labels', () => {
    expect(humaniseExerciseType('WALKING')).toBe('Walking');
    expect(humaniseExerciseType('STRENGTH_TRAINING')).toBe('Strength');
    expect(humaniseExerciseType('BIKING')).toBe('Cycling');
  });

  it('collapses generic/blank types to "Workout"', () => {
    expect(humaniseExerciseType('OTHER')).toBe('Workout');
    expect(humaniseExerciseType('UNKNOWN')).toBe('Workout');
    expect(humaniseExerciseType(undefined)).toBe('Workout');
    expect(humaniseExerciseType('')).toBe('Workout');
  });

  it('title-cases an unmapped type', () => {
    expect(humaniseExerciseType('STAIR_CLIMBING')).toBe('Stair climbing');
  });
});

describe('parseUtcOffsetSeconds', () => {
  it('parses a Google duration string', () => {
    expect(parseUtcOffsetSeconds('3600s')).toBe(3600);
    expect(parseUtcOffsetSeconds('-3600s')).toBe(-3600);
  });
  it('is 0 for missing/garbage', () => {
    expect(parseUtcOffsetSeconds(undefined)).toBe(0);
    expect(parseUtcOffsetSeconds('nope')).toBe(0);
  });
});

describe('formatLocalTime', () => {
  it('applies the offset and formats 12-hour', () => {
    // 19:12:20Z + 3600s = 20:12 local
    expect(formatLocalTime('2026-05-28T19:12:20Z', 3600)).toBe('8:12pm');
    // midnight handling
    expect(formatLocalTime('2026-05-28T23:30:00Z', 3600)).toBe('12:30am');
    expect(formatLocalTime('2026-05-28T11:05:00Z', 0)).toBe('11:05am');
  });
});

describe('formatTimeRange', () => {
  it('drops the first am/pm when it matches the second', () => {
    expect(
      formatTimeRange('2026-05-28T19:12:20Z', '2026-05-28T19:29:23Z', 3600),
    ).toBe('8:12-8:29pm');
  });
  it('keeps both meridiems when they differ', () => {
    expect(
      formatTimeRange('2026-05-28T10:50:00Z', '2026-05-28T11:10:00Z', 3600),
    ).toBe('11:50am-12:10pm');
  });
});

describe('durationMinutes', () => {
  it('rounds to whole minutes', () => {
    expect(
      durationMinutes('2026-05-28T19:12:20Z', '2026-05-28T19:29:23Z'),
    ).toBe(17);
  });
  it('is 0 for a reversed or invalid range', () => {
    expect(durationMinutes('2026-05-28T19:29:23Z', '2026-05-28T19:12:20Z')).toBe(0);
    expect(durationMinutes('nope', 'also-nope')).toBe(0);
  });
});

describe('buildSessionDetail', () => {
  it('joins the available parts', () => {
    expect(
      buildSessionDetail({
        startIso: '2026-05-28T19:12:20Z',
        endIso: '2026-05-28T19:29:23Z',
        offsetSec: 3600,
        steps: 1425,
        distanceMeters: 1023.4,
      }),
    ).toBe('8:12-8:29pm · 1,425 steps · 1.0 km');
  });

  it('omits missing parts', () => {
    expect(buildSessionDetail({ steps: 1425 })).toBe('1,425 steps');
    expect(buildSessionDetail({})).toBe('');
  });

  it('drops a trivial distance', () => {
    expect(buildSessionDetail({ steps: 10, distanceMeters: 5 })).toBe('10 steps');
  });
});
