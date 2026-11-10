import { describe, expect, it } from 'vitest';
import type { Food } from '@/db/types';
import { groupSearchResults, type GroupInput } from './searchRanking';

let n = 0;
function food(name: string, patch: Partial<Food> = {}): Food {
  n += 1;
  return {
    id: `f${n}`,
    user_id: 'u',
    source: 'usda',
    name,
    kcal_100: 100,
    protein_100: 1,
    carbs_100: 1,
    fat_100: 1,
    custom_units: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...patch,
  } as Food;
}

function group(patch: Partial<GroupInput>) {
  return groupSearchResults({
    local: [],
    usda: [],
    off: [],
    shared: [],
    query: '',
    personal: { frequency: new Map(), aliasFoodId: null },
    usedIds: new Set(),
    ...patch,
  });
}

const names = (rows: Food[]) => rows.map((f) => f.name);

describe('groupSearchResults', () => {
  it('shows a scanned product she uses, however old, above database rows', () => {
    // The "runny honey" case: a scanned (source off) food, long out of the
    // recent list, competing with exact-name database rows.
    const runny = food('Runny honey', { source: 'off', id: 'off:123' });
    const generic = food('Honey', { usda_data_type: 'sr_legacy' });
    const out = group({
      query: 'honey',
      local: [runny, generic],
      usedIds: new Set([runny.id]),
    });
    expect(names(out.yours)).toEqual(['Runny honey']);
    expect(names(out.common)).toEqual(['Honey']);
  });

  it('hides a cached packaged row she has never used', () => {
    const cached = food('Honey nut cereal', { source: 'off' });
    const out = group({ query: 'honey', local: [cached] });
    expect(out.yours).toEqual([]);
    expect(out.packaged).toEqual([]);
  });

  it('ranks the rice she eats daily above one she barely touches', () => {
    const staple = food('Long grain rice', { source: 'off', brand: 'Simply' });
    const rare = food('Rice', { source: 'custom' });
    const out = group({
      query: 'rice',
      local: [rare, staple],
      usedIds: new Set([staple.id, rare.id]),
      personal: {
        frequency: new Map([
          [staple.id, 20],
          [rare.id, 0.1],
        ]),
        aliasFoodId: null,
      },
    });
    expect(names(out.yours)).toEqual(['Long grain rice', 'Rice']);
  });

  it('still lets an exact name win between two foods used equally', () => {
    const a = food('Rice', { source: 'custom' });
    const b = food('Rice pudding', { source: 'custom' });
    const out = group({ query: 'rice', local: [b, a] });
    expect(names(out.yours)).toEqual(['Rice', 'Rice pudding']);
  });

  it('collapses same-name rows and keeps USDA brands in their own list', () => {
    const brand = (b: string) =>
      food('HONEY', { usda_data_type: 'branded', brand: b });
    const usda = [
      brand('BILLYBEE'),
      brand('BILLYBEE'),
      brand('DABUR'),
      food('Honey', { usda_data_type: 'sr_legacy' }),
    ];
    const out = group({ query: 'honey', usda });
    expect(names(out.common)).toEqual(['Honey']);
    expect(out.branded.map((f) => f.brand)).toEqual(['BILLYBEE', 'DABUR']);
    expect(out.packaged).toEqual([]);
  });

  it('prefers her stored row over a live hit with the same id', () => {
    const mine = food('Runny honey', { source: 'off', id: 'off:9', favorite: true });
    const live = food('Runny honey', { source: 'off', id: 'off:9' });
    const out = group({ query: 'honey', local: [mine], off: [live] });
    expect(out.yours).toEqual([mine]);
    expect(out.packaged).toEqual([]);
  });

  it('does not repeat one of her foods under a database group', () => {
    const mine = food('Greek yogurt', { source: 'custom', brand: 'Fage' });
    const live = food('Greek Yogurt', { source: 'off', brand: 'FAGE' });
    const out = group({ query: 'yogurt', local: [mine], off: [live] });
    expect(out.packaged).toEqual([]);
  });
});
