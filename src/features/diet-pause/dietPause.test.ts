import { describe, expect, it } from 'vitest';
import {
  dailyGoalFor,
  dailyGoalsFor,
  daysLeftInPause,
  endPauseAt,
  goalResolver,
  maintenanceEstimate,
  parseDietPauses,
  pauseLength,
  pauseMacros,
  pauseOn,
  removePause,
  serializeDietPauses,
  upcomingPause,
  withPause,
  type DietPause,
} from './dietPause';
import type { Profile } from '@/db/types';

function profileOf(patch: Partial<Profile>): Profile {
  return {
    kcal_target: 1700,
    protein_g: 130,
    carbs_g: 160,
    fat_g: 50,
    ...patch,
  } as Profile;
}

/** A profile with a pause running 20-26 May at 2200 kcal. */
function pausedProfile(patch: Partial<Profile> = {}): Profile {
  return profileOf({
    diet_pauses: JSON.stringify([
      { id: 'a', start: '2026-05-20', end: '2026-05-26', kcal: 2200 },
    ]),
    ...patch,
  });
}

const pauseA: DietPause = {
  id: 'a',
  start: '2026-05-20',
  end: '2026-05-26',
  kcal: 2200,
};

describe('parseDietPauses', () => {
  it('returns nothing for missing or malformed JSON', () => {
    expect(parseDietPauses(undefined)).toEqual([]);
    expect(parseDietPauses('')).toEqual([]);
    expect(parseDietPauses('{not json')).toEqual([]);
    expect(parseDietPauses('{"a":1}')).toEqual([]);
  });

  it('drops rows with no start or no usable kcal', () => {
    const raw = JSON.stringify([
      { id: 'ok', start: '2026-05-20', kcal: 2200 },
      { id: 'no-start', kcal: 2200 },
      { id: 'no-kcal', start: '2026-05-20' },
      { id: 'zero-kcal', start: '2026-05-20', kcal: 0 },
    ]);
    expect(parseDietPauses(raw).map((p) => p.id)).toEqual(['ok']);
  });

  it('sorts by start date', () => {
    const raw = JSON.stringify([
      { id: 'b', start: '2026-06-01', kcal: 2200 },
      { id: 'a', start: '2026-05-20', kcal: 2200 },
    ]);
    expect(parseDietPauses(raw).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('treats an end before the start as a one-day window', () => {
    const raw = JSON.stringify([
      { id: 'a', start: '2026-05-20', end: '2026-05-01', kcal: 2200 },
    ]);
    expect(parseDietPauses(raw)[0].end).toBe('2026-05-20');
  });

  it('round-trips through serialize', () => {
    expect(parseDietPauses(serializeDietPauses([pauseA]))).toEqual([pauseA]);
  });
});

describe('pauseOn', () => {
  it('matches the first and last day of the window inclusively', () => {
    expect(pauseOn('2026-05-20', [pauseA])?.id).toBe('a');
    expect(pauseOn('2026-05-26', [pauseA])?.id).toBe('a');
  });

  it('does not match the day before or after', () => {
    expect(pauseOn('2026-05-19', [pauseA])).toBeNull();
    expect(pauseOn('2026-05-27', [pauseA])).toBeNull();
  });

  it('matches every day from the start of an open-ended window', () => {
    const open: DietPause = { id: 'o', start: '2026-05-20', kcal: 2200 };
    expect(pauseOn('2026-09-01', [open])?.id).toBe('o');
    expect(pauseOn('2026-05-19', [open])).toBeNull();
  });

  it('lets the latest-starting window win when two overlap', () => {
    // Only reachable by syncing two devices; the newer decision holds.
    const older: DietPause = { id: 'old', start: '2026-05-18', kcal: 2000 };
    const newer: DietPause = { id: 'new', start: '2026-05-20', kcal: 2400 };
    expect(pauseOn('2026-05-21', [older, newer])?.id).toBe('new');
  });
});

describe('dailyGoalFor', () => {
  it('returns the cut target outside any pause', () => {
    expect(dailyGoalFor('2026-05-19', pausedProfile())).toBe(1700);
    expect(dailyGoalFor('2026-05-27', pausedProfile())).toBe(1700);
  });

  it('returns the maintenance target inside the pause', () => {
    expect(dailyGoalFor('2026-05-22', pausedProfile())).toBe(2200);
  });

  it('returns the cut target when there are no pauses at all', () => {
    expect(dailyGoalFor('2026-05-22', profileOf({}))).toBe(1700);
  });

  it('is 0 with no profile', () => {
    expect(dailyGoalFor('2026-05-22', undefined)).toBe(0);
  });

  it('keeps a PAST pause in force for the days it covered', () => {
    // The whole point of storing windows: a finished break must not be
    // re-graded against today's cut target.
    const p = pausedProfile({ kcal_target: 1600 });
    expect(dailyGoalFor('2026-05-22', p)).toBe(2200);
    expect(dailyGoalFor('2026-05-30', p)).toBe(1600);
  });
});

describe('dailyGoalsFor', () => {
  it('resolves a week straddling the start of a pause', () => {
    const dates = [
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
      '2026-05-24',
    ];
    expect(dailyGoalsFor(dates, pausedProfile())).toEqual([
      1700, 1700, 2200, 2200, 2200, 2200, 2200,
    ]);
  });

  it('sums to a part-cut, part-maintenance period budget', () => {
    const dates = ['2026-05-18', '2026-05-19', '2026-05-20'];
    const total = dailyGoalsFor(dates, pausedProfile()).reduce((a, b) => a + b, 0);
    expect(total).toBe(1700 + 1700 + 2200);
  });
});

describe('goalResolver', () => {
  it('answers repeatedly without re-parsing', () => {
    const resolve = goalResolver(pausedProfile());
    expect(resolve('2026-05-19')).toBe(1700);
    expect(resolve('2026-05-21')).toBe(2200);
  });

  it('is 0 for every date with no profile', () => {
    expect(goalResolver(undefined)('2026-05-21')).toBe(0);
  });
});

describe('upcomingPause', () => {
  it('finds the next booked window', () => {
    expect(upcomingPause('2026-05-01', pausedProfile())?.id).toBe('a');
  });

  it('is null once the window has started', () => {
    expect(upcomingPause('2026-05-20', pausedProfile())).toBeNull();
  });
});

describe('daysLeftInPause / pauseLength', () => {
  it('counts today as one of the days left', () => {
    expect(daysLeftInPause(pauseA, '2026-05-26')).toBe(1);
    expect(daysLeftInPause(pauseA, '2026-05-20')).toBe(7);
  });

  it('has no number for an open-ended window', () => {
    expect(daysLeftInPause({ id: 'o', start: '2026-05-20', kcal: 2200 }, '2026-05-21'))
      .toBeNull();
    expect(pauseLength({ id: 'o', start: '2026-05-20', kcal: 2200 })).toBeNull();
  });

  it('measures the window inclusively', () => {
    expect(pauseLength(pauseA)).toBe(7);
  });
});

describe('withPause', () => {
  it('replaces a window with the same id', () => {
    const next = withPause([pauseA], { ...pauseA, kcal: 2400 });
    expect(next).toHaveLength(1);
    expect(next[0].kcal).toBe(2400);
  });

  it('clips an open-ended window to the day before a new one starts', () => {
    const open: DietPause = { id: 'o', start: '2026-05-01', kcal: 2000 };
    const next = withPause([open], pauseA);
    expect(next[0].id).toBe('o');
    expect(next[0].end).toBe('2026-05-19');
    expect(next[1].id).toBe('a');
  });

  it('drops a window the new one completely covers', () => {
    const inner: DietPause = {
      id: 'i',
      start: '2026-05-21',
      end: '2026-05-23',
      kcal: 2000,
    };
    expect(withPause([inner], pauseA).map((p) => p.id)).toEqual(['a']);
  });

  it('leaves an earlier, already-closed window alone', () => {
    const earlier: DietPause = {
      id: 'e',
      start: '2026-04-01',
      end: '2026-04-07',
      kcal: 2100,
    };
    expect(withPause([earlier], pauseA).map((p) => p.id)).toEqual(['e', 'a']);
  });

  it('leaves no overlap for pauseOn to have to disambiguate', () => {
    const open: DietPause = { id: 'o', start: '2026-05-01', kcal: 2000 };
    const list = withPause([open], pauseA);
    expect(pauseOn('2026-05-19', list)?.id).toBe('o');
    expect(pauseOn('2026-05-20', list)?.id).toBe('a');
  });
});

describe('endPauseAt', () => {
  it('ends a running window early', () => {
    const next = endPauseAt([pauseA], 'a', '2026-05-22');
    expect(next[0].end).toBe('2026-05-22');
  });

  it('removes a window that had not started yet', () => {
    expect(endPauseAt([pauseA], 'a', '2026-05-19')).toEqual([]);
  });

  it('leaves other windows untouched', () => {
    const other: DietPause = { id: 'b', start: '2026-06-01', kcal: 2200 };
    expect(endPauseAt([pauseA, other], 'a', '2026-05-22').map((p) => p.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('removePause', () => {
  it('drops the named window only', () => {
    const other: DietPause = { id: 'b', start: '2026-06-01', kcal: 2200 };
    expect(removePause([pauseA, other], 'a').map((p) => p.id)).toEqual(['b']);
  });
});

describe('pauseMacros', () => {
  it('holds protein exactly', () => {
    expect(pauseMacros(profileOf({}), 2200).protein_g).toBe(130);
  });

  it('splits the extra calories the way the existing split leans', () => {
    // 160C = 640 kcal, 50F = 450 kcal -> carbs carry 640/1090 of the energy.
    const out = pauseMacros(profileOf({}), 2200);
    const delta = 500;
    const carbShare = 640 / 1090;
    expect(out.carbs_g).toBe(Math.round((640 + delta * carbShare) / 4));
    expect(out.fat_g).toBe(Math.round((450 + delta * (1 - carbShare)) / 9));
  });

  it('moves exactly the calorie difference, keeping any existing drift', () => {
    // The profile's own macros need not sum to its kcal target, and the pause
    // is not the place to silently "fix" that: it shifts by the delta only.
    const p = profileOf({});
    const before = p.protein_g * 4 + p.carbs_g * 4 + p.fat_g * 9;
    const out = pauseMacros(p, 2200);
    const after = out.protein_g * 4 + out.carbs_g * 4 + out.fat_g * 9;
    expect(Math.abs(after - before - (2200 - 1700))).toBeLessThan(10);
  });

  it('never returns a negative gram target', () => {
    const out = pauseMacros(profileOf({}), 200);
    expect(out.carbs_g).toBeGreaterThanOrEqual(0);
    expect(out.fat_g).toBeGreaterThanOrEqual(0);
  });

  it('falls back to an even energy split with no carbs or fat set', () => {
    const out = pauseMacros(profileOf({ carbs_g: 0, fat_g: 0 }), 2200);
    expect(out.carbs_g).toBe(Math.round((2200 - 1700) / 2 / 4));
    expect(out.fat_g).toBe(Math.round((2200 - 1700) / 2 / 9));
  });
});

describe('maintenanceEstimate', () => {
  it('is null when the profile is incomplete', () => {
    expect(maintenanceEstimate(profileOf({}))).toBeNull();
    expect(maintenanceEstimate(undefined)).toBeNull();
  });

  it('produces a TDEE when every input is present', () => {
    const est = maintenanceEstimate(
      profileOf({
        sex: 'female',
        dob: '2000-01-01',
        height_cm: 168,
        weight_kg: 62,
        activity_level: 'light',
      }),
    );
    expect(est).not.toBeNull();
    expect(est as number).toBeGreaterThan(1500);
    expect(est as number).toBeLessThan(2600);
  });
});
