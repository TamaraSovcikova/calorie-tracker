import { describe, expect, it } from 'vitest';
import {
  dogPose,
  expectedIntakeFraction,
  fullnessState,
  wellbeingBand,
  type FullnessState,
} from './petLogic';

// Local-time date at a given hour (no Z → parsed as local, so getHours()
// returns the hour we asked for in any timezone).
const at = (hhmm: string) => new Date(`2026-05-17T${hhmm}:00`);

describe('expectedIntakeFraction', () => {
  it('is 0 before the breakfast window', () => {
    expect(expectedIntakeFraction(at('06:00'))).toBe(0);
  });

  it('hits the anchor fractions on the curve', () => {
    expect(expectedIntakeFraction(at('10:00'))).toBeCloseTo(0.25, 5);
    expect(expectedIntakeFraction(at('18:00'))).toBeCloseTo(0.7, 5);
  });

  it('interpolates between anchors', () => {
    // halfway between [07:00,0] and [10:00,0.25]
    expect(expectedIntakeFraction(at('08:30'))).toBeCloseTo(0.125, 5);
  });

  it('is 1 in the evening', () => {
    expect(expectedIntakeFraction(at('23:00'))).toBe(1);
  });
});

describe('fullnessState', () => {
  it('is content when no goal is set', () => {
    expect(fullnessState(0, 0, at('13:00'))).toBe('content');
  });

  it('is full when the goal is essentially met', () => {
    expect(fullnessState(2000, 2000, at('19:00'))).toBe('full');
  });

  it('steps through the over-goal bands', () => {
    // full up to +5%, then stuffed, too_stuffed, overeaten
    expect(fullnessState(2040, 2000, at('20:00'))).toBe('full'); // +2%
    expect(fullnessState(2150, 2000, at('20:00'))).toBe('stuffed'); // +7.5%
    expect(fullnessState(2300, 2000, at('20:00'))).toBe('too_stuffed'); // +15%
    expect(fullnessState(2600, 2000, at('20:00'))).toBe('overeaten'); // +30%
  });

  it('places the band boundaries on the lower edge', () => {
    expect(fullnessState(2100, 2000, at('20:00'))).toBe('stuffed'); // exactly +5%
    expect(fullnessState(2240, 2000, at('20:00'))).toBe('too_stuffed'); // exactly +12%
    expect(fullnessState(2500, 2000, at('20:00'))).toBe('overeaten'); // exactly +25%
  });

  it('is hungry mid-afternoon with little logged', () => {
    // 13:00 expects ~0.36 of goal (720 kcal); 150 is well under half
    expect(fullnessState(150, 2000, at('13:00'))).toBe('hungry');
  });

  it('is peckish when somewhat behind the time-of-day expectation', () => {
    expect(fullnessState(500, 2000, at('13:00'))).toBe('peckish');
  });

  it('is content when on track for the time of day', () => {
    expect(fullnessState(700, 2000, at('13:00'))).toBe('content');
  });

  it('is hungry first thing with nothing logged', () => {
    expect(fullnessState(0, 2000, at('06:30'))).toBe('hungry');
  });
});

describe('dogPose', () => {
  const base = { wellbeing: 60, now: at('13:00') };

  it('shows eating when the user just logged food', () => {
    expect(dogPose({ ...base, fullness: 'content', justAte: true })).toBe('eating');
  });

  it('shows greeting on app open', () => {
    expect(dogPose({ ...base, fullness: 'hungry', greeting: true })).toBe('greeting');
  });

  it('sleeps at night', () => {
    expect(dogPose({ fullness: 'content', wellbeing: 60, now: at('23:30') })).toBe(
      'sleeping',
    );
    expect(dogPose({ fullness: 'hungry', wellbeing: 60, now: at('03:00') })).toBe(
      'sleeping',
    );
  });

  it('looks sad on very low wellbeing', () => {
    expect(dogPose({ ...base, fullness: 'hungry', wellbeing: 10 })).toBe('sad');
  });

  it('still looks fed (not sad) when stuffed despite low wellbeing', () => {
    expect(dogPose({ ...base, fullness: 'stuffed', wellbeing: 10 })).toBe('stuffed');
  });

  it('shows the over-full pose (not sad) despite low wellbeing', () => {
    expect(dogPose({ ...base, fullness: 'too_stuffed', wellbeing: 10 })).toBe(
      'too_stuffed',
    );
    expect(dogPose({ ...base, fullness: 'overeaten', wellbeing: 10 })).toBe(
      'overeaten',
    );
  });

  it('is happy when content and thriving', () => {
    expect(dogPose({ ...base, fullness: 'content', wellbeing: 90 })).toBe('happy');
  });

  it('falls through to the fullness state otherwise', () => {
    const states: FullnessState[] = [
      'hungry',
      'peckish',
      'content',
      'full',
      'stuffed',
      'too_stuffed',
      'overeaten',
    ];
    for (const f of states) {
      expect(dogPose({ ...base, fullness: f })).toBe(f);
    }
  });

  describe('skeleton (neglect) override', () => {
    it('shows the skeleton after 3+ days without logging', () => {
      expect(dogPose({ ...base, fullness: 'hungry', daysSinceLastLog: 3 })).toBe(
        'skeleton',
      );
      expect(dogPose({ ...base, fullness: 'content', daysSinceLastLog: 9 })).toBe(
        'skeleton',
      );
    });

    it('does not show before the 3-day threshold', () => {
      expect(dogPose({ ...base, fullness: 'hungry', daysSinceLastLog: 2 })).toBe(
        'hungry',
      );
    });

    it('hard-overrides night sleep, greeting and sad', () => {
      expect(
        dogPose({ fullness: 'hungry', wellbeing: 60, now: at('03:00'), daysSinceLastLog: 4 }),
      ).toBe('skeleton');
      expect(
        dogPose({ ...base, fullness: 'hungry', greeting: true, daysSinceLastLog: 4 }),
      ).toBe('skeleton');
      expect(
        dogPose({ ...base, fullness: 'hungry', wellbeing: 5, daysSinceLastLog: 4 }),
      ).toBe('skeleton');
    });

    it('yields to a fresh log (eating wins, and logging resets the count)', () => {
      expect(
        dogPose({ ...base, fullness: 'content', justAte: true, daysSinceLastLog: 5 }),
      ).toBe('eating');
    });
  });
});

describe('wellbeingBand', () => {
  it('maps scores to dispositions', () => {
    expect(wellbeingBand(95)).toBe('thriving');
    expect(wellbeingBand(80)).toBe('thriving');
    expect(wellbeingBand(60)).toBe('happy');
    expect(wellbeingBand(30)).toBe('down');
    expect(wellbeingBand(10)).toBe('sad');
  });
});
