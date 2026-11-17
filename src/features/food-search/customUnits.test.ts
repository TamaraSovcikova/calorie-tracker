import { describe, expect, it } from 'vitest';
import { mergeUnits, readUnitDraft } from './customUnits';

const scoop = { label: 'scoop', grams: 35 };

describe('readUnitDraft', () => {
  it('reads a plain unit', () => {
    expect(readUnitDraft(' wrap ', '60', [])).toEqual({ unit: { label: 'wrap', grams: 60 } });
  });

  it('accepts a decimal comma', () => {
    // parseFloat("37,5") is 37, and a number field hands back "" for it.
    expect(readUnitDraft('scoop', '37,5', [])).toEqual({ unit: { label: 'scoop', grams: 37.5 } });
  });

  it('says what is wrong instead of doing nothing', () => {
    expect(readUnitDraft('', '60', []).error).toMatch(/name/);
    expect(readUnitDraft('wrap', '', []).error).toMatch(/grams/);
    expect(readUnitDraft('wrap', 'abc', []).error).toMatch(/number/);
    expect(readUnitDraft('wrap', '0', []).error).toMatch(/above 0/);
    expect(readUnitDraft('Scoop', '30', [scoop]).error).toMatch(/already/);
  });

  it('treats two empty fields as nothing to add', () => {
    expect(readUnitDraft('  ', '', [])).toEqual({});
  });
});

describe('mergeUnits', () => {
  it('keeps both sides, the first winning a name clash', () => {
    expect(
      mergeUnits([scoop], [{ label: 'Scoop', grams: 99 }, { label: 'tbsp', grams: 15 }]),
    ).toEqual([scoop, { label: 'tbsp', grams: 15 }]);
  });
});
