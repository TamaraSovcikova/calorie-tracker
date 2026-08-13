import { describe, expect, it } from 'vitest';
import {
  candidateScore,
  isConfident,
  nameMatchScore,
  prepStates,
  rankCandidates,
  rankLibraryCandidates,
  resolveTier,
  sigWords,
  formPenalty,
  statePenalty,
  TIER_BONUS,
  wordsMatch,
  type IngredientCandidate,
  type MatchTier,
} from './ingredientMatch';
import type { Food } from '@/db/types';

function food(name: string, patch: Partial<Food> = {}): Food {
  return {
    id: `f:${name}`,
    user_id: 'u',
    source: 'custom',
    name,
    kcal_100: 100,
    protein_100: 5,
    carbs_100: 10,
    fat_100: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...patch,
  } as Food;
}

describe('wordsMatch', () => {
  it('matches plurals and stems', () => {
    expect(wordsMatch('pepper', 'peppers')).toBe(true);
    expect(wordsMatch('tomato', 'tomatoes')).toBe(true);
    expect(wordsMatch('wrap', 'wraps')).toBe(true);
    expect(wordsMatch('beans', 'beans')).toBe(true);
  });

  it('rejects a short fragment of a longer word', () => {
    // The regression: "Pepp" used to match "peppers" and win the whole
    // ingredient, bringing 464 kcal/100g into a stuffed pepper recipe.
    expect(wordsMatch('pepp', 'peppers')).toBe(false);
    expect(wordsMatch('bean', 'beansprouts')).toBe(false);
  });

  it('still needs 4 characters to prefix-match at all', () => {
    expect(wordsMatch('oat', 'oats')).toBe(false);
  });

  it('is order-independent', () => {
    expect(wordsMatch('peppers', 'pepper')).toBe(wordsMatch('pepper', 'peppers'));
  });
});

describe('sigWords', () => {
  it('drops short words and punctuation', () => {
    expect(sigWords('Black beans, canned')).toEqual(['black', 'beans', 'canned']);
    expect(sigWords('5% fat beef mince')).toEqual(['fat', 'beef', 'mince']);
  });
});

describe('nameMatchScore', () => {
  it('scores an exact name 1', () => {
    expect(nameMatchScore('Bell pepper', 'bell pepper')).toBe(1);
  });

  it('does NOT reward a terse name over a descriptive one', () => {
    // The core bug. Both should beat the junk fragment.
    const junk = nameMatchScore('Pepp', 'peppers');
    const curated = nameMatchScore('Bell pepper', 'peppers');
    const descriptive = nameMatchScore('Peppers, sweet, red, raw', 'peppers');
    expect(junk).toBe(0);
    expect(curated).toBeGreaterThan(0);
    expect(descriptive).toBeGreaterThan(0);
  });

  it('does not reject a descriptive name for having extra words', () => {
    // Old code: recall = 1/4 = 0.25, below the 0.6 floor, rejected outright.
    expect(nameMatchScore('Peppers, sweet, red, raw', 'peppers')).toBeGreaterThan(0.5);
  });

  it('prefers the tighter name when both cover the query', () => {
    const tight = nameMatchScore('Beef mince, 5% fat', 'beef mince');
    const loose = nameMatchScore('Beef mince and onion casserole bake', 'beef mince');
    expect(tight).toBeGreaterThan(loose);
  });

  it('requires at least half the query to be present', () => {
    expect(nameMatchScore('Black beans, canned', 'black beans')).toBeGreaterThan(0);
    expect(nameMatchScore('Coconut oil', 'black beans')).toBe(0);
  });

  it('returns 0 for empty input', () => {
    expect(nameMatchScore('', 'beans')).toBe(0);
    expect(nameMatchScore('Beans', '')).toBe(0);
  });
});

describe('prepStates / statePenalty', () => {
  it('finds states in either string', () => {
    expect(prepStates('cooked black beans')).toEqual(['cooked']);
    expect(prepStates('Black beans, dried')).toEqual(['dried']);
  });

  it('penalises dry-vs-cooked, the 700 kcal mistake', () => {
    expect(statePenalty('cooked black beans', 'Black beans, dried')).toBe(0.5);
  });

  it('does not penalise equivalent states', () => {
    expect(statePenalty('cooked black beans', 'Black beans, canned')).toBe(0);
    expect(statePenalty('cooked rice', 'Rice, boiled')).toBe(0);
  });

  it('stays neutral when either side says nothing about state', () => {
    expect(statePenalty('black beans', 'Black beans, dried')).toBe(0);
    expect(statePenalty('cooked black beans', 'BLACK BEANS')).toBe(0);
  });
});

describe('candidateScore and tiers', () => {
  it('puts a frequent personal food above an identical external one', () => {
    const mine = candidateScore(food('Beef mince'), 'frequent', 'beef mince');
    const theirs = candidateScore(food('Beef mince'), 'external', 'beef mince');
    expect(mine).toBeGreaterThan(theirs);
  });

  it('lets a much better name beat a weaker tier', () => {
    // Tier is a thumb on the scale, not an override.
    const exact = candidateScore(food('Black beans, canned'), 'curated', 'black beans canned');
    const vague = candidateScore(food('Beans'), 'frequent', 'black beans canned');
    expect(exact).toBeGreaterThan(vague);
  });

  it('is 0 when the name does not match at all', () => {
    expect(candidateScore(food('Olive oil'), 'frequent', 'black beans')).toBe(0);
  });
});

describe('rankCandidates', () => {
  const tier = (map: Record<string, MatchTier>) => (f: Food) => map[f.name] ?? 'external';

  it('ranks the user\'s own food first and drops non-matches', () => {
    const foods = [
      food('Pepp', { kcal_100: 464 }),
      food('Bell pepper', { source: 'curated', kcal_100: 26 }),
      food('Olive oil'),
    ];
    const ranked = rankCandidates(foods, 'peppers', tier({ 'Bell pepper': 'curated' }));
    expect(ranked.map((c) => c.food.name)).toEqual(['Bell pepper']);
  });

  it('returns several candidates when several genuinely match', () => {
    const foods = [
      food('Beef mince, 5% fat'),
      food('Beef mince, 20% fat'),
      // Shares only "beef" of "beef mince" - a half-match, so it is dropped
      // rather than cluttering the picker with something always rejected.
      food('Beef steak'),
    ];
    const ranked = rankCandidates(
      foods,
      'beef mince',
      tier({ 'Beef mince, 5% fat': 'frequent', 'Beef mince, 20% fat': 'recent' }),
    );
    expect(ranked.map((c) => c.food.name)).toEqual([
      'Beef mince, 5% fat',
      'Beef mince, 20% fat',
    ]);
  });

  it('keeps a single-word query matching a descriptive food', () => {
    const ranked = rankCandidates(
      [food('Peppers, sweet, red, raw', { source: 'curated' })],
      'peppers',
      tier({ 'Peppers, sweet, red, raw': 'curated' }),
    );
    expect(ranked).toHaveLength(1);
  });
});

describe('isConfident', () => {
  const cand = (
    name: string,
    tier: MatchTier,
    score: number,
  ): IngredientCandidate => ({
    food: food(name),
    tier,
    nameScore: score,
    score,
  });

  it('is confident about a clear win among the user\'s own foods', () => {
    expect(isConfident([cand('Beef mince', 'frequent', 1.6)])).toBe(true);
  });

  it('is not confident when a runner-up is close', () => {
    expect(
      isConfident([
        cand('Beef mince, 5%', 'frequent', 1.6),
        cand('Beef mince, 20%', 'recent', 1.45),
      ]),
    ).toBe(false);
  });

  it('is never confident about a generic estimate', () => {
    expect(isConfident([cand('BEEF', 'external', 1.6)])).toBe(false);
  });

  it('is not confident about a PARTIAL built-in match', () => {
    // An exact built-in match is accepted (see below); a partial one is
    // exactly the ambiguity the flag exists for.
    expect(isConfident([cand('Bell pepper', 'curated', 0.95)])).toBe(false);
  });

  it('is not confident about a weak match even if it is personal', () => {
    expect(isConfident([cand('Beans', 'frequent', 0.7)])).toBe(false);
  });

  it('is not confident with nothing to go on', () => {
    expect(isConfident([])).toBe(false);
  });

  describe('a user with no logging history', () => {
    const fresh = { hasPersonalHistory: false };

    it('accepts a strong curated match, so a fresh install is not all warnings', () => {
      // Otherwise nothing can reach a personal tier and every ingredient in
      // a twelve-ingredient recipe opens flagged.
      expect(isConfident([cand('Bell pepper', 'curated', 1.1)], fresh)).toBe(true);
    });

    it('still refuses a generic estimate', () => {
      // 'external' is USDA / the shared pool - where the junk came from.
      expect(isConfident([cand('BEEF', 'external', 1.6)], fresh)).toBe(false);
    });

    it('still refuses when a rival is close', () => {
      expect(
        isConfident(
          [cand('Bell pepper', 'curated', 1.1), cand('Peppers, raw', 'curated', 1.0)],
          fresh,
        ),
      ).toBe(false);
    });

    it('does not loosen a PARTIAL built-in match for a user with history', () => {
      expect(
        isConfident([cand('Bell pepper', 'curated', 0.95)], { hasPersonalHistory: true }),
      ).toBe(false);
    });
  });
});

describe('resolveTier', () => {
  const history = (frequent: string[] = [], recent: string[] = []) => ({
    frequentIds: new Set(frequent),
    recentIds: new Set(recent),
  });

  it('ranks frequent above recent for the same food', () => {
    const f = food('Beef mince');
    expect(resolveTier(f, history([f.id], [f.id]))).toBe('frequent');
  });

  it('falls to recent when only logged lately', () => {
    const f = food('Beef mince');
    expect(resolveTier(f, history([], [f.id]))).toBe('recent');
  });

  it('reads source when the food has never been logged', () => {
    expect(resolveTier(food('X', { source: 'custom' }), history())).toBe('custom');
    expect(resolveTier(food('X', { source: 'curated' }), history())).toBe('curated');
  });

  it('puts the shared pool in the library tier, below curated', () => {
    // 'Pepp', 'BEEF' and 'BLACK BEANS' came from source: 'shared'.
    expect(resolveTier(food('BEEF', { source: 'shared' }), history())).toBe('library');
    expect(TIER_BONUS.library).toBeLessThan(TIER_BONUS.curated);
  });

  it('lets logging history override a weak source', () => {
    // A shared-pool food the user actually logs IS one they use.
    const f = food('BEEF', { source: 'shared' });
    expect(resolveTier(f, history([f.id]))).toBe('frequent');
  });
});

describe('rankLibraryCandidates — the ordering the feature rests on', () => {
  const mine = food('Beef mince 5%', { id: 'mine', source: 'shared' });
  const once = food('Beef mince value', { id: 'once', source: 'shared' });
  const builtIn = food('Beef mince, cooked', { id: 'curated', source: 'curated' });
  const stranger = food('BEEF MINCE', { id: 'shared', source: 'shared' });
  const library = [mine, once, builtIn, stranger];

  it('picks the food I buy weekly over an identical stranger entry', () => {
    const ranked = rankLibraryCandidates(library, 'beef mince', {
      frequentIds: new Set(['mine']),
      recentIds: new Set(),
    });
    expect(ranked[0].food.id).toBe('mine');
    expect(ranked[0].tier).toBe('frequent');
  });

  it('prefers something logged once over something never logged', () => {
    const ranked = rankLibraryCandidates(library, 'beef mince', {
      frequentIds: new Set(),
      recentIds: new Set(['once']),
    });
    expect(ranked[0].food.id).toBe('once');
  });

  it('falls back to the built-in before a stranger when I have no history', () => {
    const ranked = rankLibraryCandidates(library, 'beef mince', {
      frequentIds: new Set(),
      recentIds: new Set(),
    });
    const curatedAt = ranked.findIndex((c) => c.food.id === 'curated');
    const sharedAt = ranked.findIndex((c) => c.food.id === 'shared');
    expect(curatedAt).toBeLessThan(sharedAt);
  });

  it('reproduces the shipped bug and shows it is fixed', () => {
    // The exact library that produced "Pepp 400g, 1,857 kcal": a junk
    // shared-pool fragment against a proper curated entry.
    const pepperLibrary = [
      food('Pepp', { id: 'junk', source: 'shared', kcal_100: 464 }),
      food('Bell pepper', { id: 'bell', source: 'curated', kcal_100: 26 }),
    ];
    const ranked = rankLibraryCandidates(pepperLibrary, 'peppers', {
      frequentIds: new Set(),
      recentIds: new Set(),
    });
    expect(ranked.map((c) => c.food.id)).toEqual(['bell']);
  });

  it('keeps dry beans out when the recipe asked for cooked', () => {
    const beans = [
      food('Black beans, dried', { id: 'dry', source: 'shared', kcal_100: 341 }),
      food('Black beans, canned', { id: 'wet', source: 'curated', kcal_100: 91 }),
    ];
    const ranked = rankLibraryCandidates(beans, 'cooked black beans', {
      frequentIds: new Set(),
      recentIds: new Set(),
    });
    expect(ranked[0].food.id).toBe('wet');
  });
});

describe('the stuffed-pepper scan, second run', () => {
  // Every case below came back wrong on a real scan. Size and unit words
  // were counting as significant, which halved coverage on a two-word query
  // and rejected the match outright.
  it('finds the curated pepper behind a size word', () => {
    expect(nameMatchScore('Bell pepper', 'large pepper')).toBeGreaterThan(0.9);
    expect(nameMatchScore('Peppers, sweet, red, raw', 'large pepper')).toBeGreaterThan(0.5);
  });

  it('finds onion and garlic behind size and unit words', () => {
    expect(nameMatchScore('Onion', 'large onion')).toBe(1);
    expect(nameMatchScore('Garlic', 'garlic clove')).toBe(1);
  });

  it('ignores knife work', () => {
    expect(nameMatchScore('Cheddar', 'grated cheddar')).toBe(1);
    expect(nameMatchScore('Onion', 'finely chopped onion')).toBe(1);
  });

  it('does NOT strip words that identify a different food', () => {
    // "whole" separates whole milk from skimmed; stripping it would make
    // them interchangeable.
    expect(nameMatchScore('Milk, whole', 'whole milk')).toBe(1);
    expect(nameMatchScore('Milk, skimmed', 'whole milk')).toBe(0);
  });
});

describe('formPenalty — a processed form is a different food', () => {
  it('penalises asking for a form and getting the raw ingredient', () => {
    // Reported 5 kcal for 30 g of tomato puree; the truth is nearer 24.
    expect(formPenalty('tomato puree', 'Tomato')).toBe(0.45);
    expect(formPenalty('peanut butter', 'Peanuts')).toBe(0.45);
    expect(formPenalty('almond flour', 'Almonds')).toBe(0.45);
  });

  it('penalises the reverse more gently', () => {
    expect(formPenalty('tomato', 'Tomato puree')).toBe(0.2);
  });

  it('is neutral when both agree, or neither says anything', () => {
    expect(formPenalty('tomato puree', 'Tomato puree')).toBe(0);
    expect(formPenalty('tomato', 'Tomato')).toBe(0);
  });

  it('lets the right food win once both exist', () => {
    const raw = candidateScore(food('Tomato', { source: 'curated' }), 'curated', 'tomato puree');
    const right = candidateScore(food('Tomato puree', { source: 'curated' }), 'curated', 'tomato puree');
    expect(right).toBeGreaterThan(raw);
  });
});

describe('blank stubs never win', () => {
  it('loses to a real food even from a better tier', () => {
    // A 0 kcal "Garlic" stub, left behind by an abandoned scan, outranked
    // the real curated Garlic at 149 kcal/100g.
    const stub = candidateScore(food('Garlic', { kcal_100: 0 }), 'custom', 'garlic');
    const real = candidateScore(food('Garlic', { source: 'curated', kcal_100: 149 }), 'curated', 'garlic');
    expect(real).toBeGreaterThan(stub);
  });
});

describe('French and Dutch product names', () => {
  it('matches a French mince to an English ingredient name', () => {
    expect(nameMatchScore('Hache de boeuf 5% MG', 'beef mince')).toBe(1);
  });

  it('handles accents', () => {
    expect(nameMatchScore('Haché de bœuf', 'beef mince')).toBeGreaterThan(0.9);
  });

  it('matches Dutch too', () => {
    expect(nameMatchScore('Rundergehakt 5%', 'beef mince')).toBe(1);
    expect(nameMatchScore('Kipfilet', 'chicken breast')).toBe(1);
  });

  it('survives the 3-character floor for short Dutch words', () => {
    // "ui" is onion and "ei" is egg; both are shorter than the word floor.
    expect(sigWords('ui')).toEqual(['onion']);
    expect(nameMatchScore('Ui', 'onion')).toBe(1);
  });

  it('does not translate English words that happen to look foreign', () => {
    expect(sigWords('orange juice')).toEqual(['orange', 'juice']);
  });
});

describe('exact curated matches stop nagging', () => {
  const cand = (name: string, tier: MatchTier, nameScore: number): IngredientCandidate => ({
    food: food(name),
    tier,
    nameScore,
    score: nameScore + TIER_BONUS[tier],
  });

  it('accepts an exact built-in match', () => {
    expect(isConfident([cand('Onion', 'curated', 1)])).toBe(true);
  });

  it('still asks about a partial built-in match', () => {
    expect(isConfident([cand('Bell pepper', 'curated', 0.94)])).toBe(false);
  });

  it('still never accepts a generic estimate', () => {
    expect(isConfident([cand('BEEF', 'external', 1)])).toBe(false);
  });
});
