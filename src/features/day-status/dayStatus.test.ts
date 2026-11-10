import { describe, expect, it } from 'vitest';
import {
  averageEffective,
  latestSuspectDay,
  parseDayMarks,
  resolveDay,
  serializeDayMarks,
  withDayMark,
} from './dayStatus';

const today = '2026-11-10';
const day = (date: string, kcal: number, goal = 1700) => ({
  date,
  kcal,
  goal,
  hasEntries: kcal > 0,
});

describe('day marks storage', () => {
  it('reads the old plain list of dates as untracked', () => {
    const marks = parseDayMarks('["2026-11-01","2026-11-02"]');
    expect([...marks.keys()]).toEqual(['2026-11-01', '2026-11-02']);
    expect(marks.get('2026-11-01')).toEqual({});
  });

  it('round-trips all three kinds, untracked staying a plain string', () => {
    let marks = parseDayMarks('[]');
    marks = withDayMark(marks, '2026-11-03', { over: 500 });
    marks = withDayMark(marks, '2026-11-01', {});
    marks = withDayMark(marks, '2026-11-02', { ok: true });
    const raw = serializeDayMarks(marks);
    expect(raw).toBe(
      '["2026-11-01",{"date":"2026-11-02","ok":true},{"date":"2026-11-03","over":500}]',
    );
    expect(parseDayMarks(raw)).toEqual(marks);
    expect(withDayMark(marks, '2026-11-01', null).has('2026-11-01')).toBe(false);
  });

  it('ignores junk', () => {
    expect(parseDayMarks('not json').size).toBe(0);
    expect(parseDayMarks('[1,null,{"date":"x"},"nope"]').size).toBe(0);
  });
});

describe('resolveDay', () => {
  it('flags a finished day logged under 60% of its goal', () => {
    const r = resolveDay(day('2026-11-09', 1000), undefined, today);
    expect(r).toMatchObject({ kind: 'logged', effective: 1000, suspect: true });
    expect(resolveDay(day('2026-11-09', 1100), undefined, today).suspect).toBe(false);
  });

  it('never flags today', () => {
    expect(resolveDay(day(today, 300), undefined, today).suspect).toBe(false);
  });

  it('stops flagging once confirmed, and keeps the real number', () => {
    const r = resolveDay(day('2026-11-09', 1000), { ok: true }, today);
    expect(r).toMatchObject({ kind: 'logged', effective: 1000, suspect: false });
  });

  it('counts an untracked or empty past day as exactly on goal, outside the average', () => {
    expect(resolveDay(day('2026-11-09', 1000), {}, today)).toMatchObject({
      kind: 'untracked',
      effective: 1700,
      inAverage: false,
    });
    expect(resolveDay(day('2026-11-09', 0), undefined, today)).toMatchObject({
      kind: 'empty',
      effective: 1700,
      inAverage: false,
    });
  });

  it('counts an estimate as goal plus the amount over', () => {
    expect(resolveDay(day('2026-11-09', 1000), { over: 500 }, today)).toMatchObject({
      kind: 'estimated',
      effective: 2200,
      inAverage: true,
    });
  });
});

describe('averageEffective', () => {
  it('is not dragged down by days that were not really tracked', () => {
    // The reported case: the average read low because half-logged days
    // counted at face value.
    const days = [
      resolveDay(day('2026-11-06', 1800), undefined, today),
      resolveDay(day('2026-11-07', 600), {}, today), // marked untracked
      resolveDay(day('2026-11-08', 0), undefined, today), // empty
      resolveDay(day('2026-11-09', 900), { over: 400 }, today), // estimate
    ];
    expect(averageEffective(days)).toBe((1800 + 2100) / 2);
  });
});

describe('latestSuspectDay', () => {
  it('picks the newest unanswered low day', () => {
    const days = [day('2026-11-05', 700), day('2026-11-08', 900), day('2026-11-09', 1650)];
    const marks = parseDayMarks('[]');
    expect(latestSuspectDay(days, marks, today)?.date).toBe('2026-11-08');
    expect(
      latestSuspectDay(days, withDayMark(marks, '2026-11-08', { ok: true }), today)?.date,
    ).toBe('2026-11-05');
    expect(
      latestSuspectDay(days, marks, today, new Set(['2026-11-08', '2026-11-05'])),
    ).toBeNull();
  });
});
