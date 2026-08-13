import { describe, expect, it } from 'vitest';
import { aliasPhrase } from './ingredientAliases';

describe('aliasPhrase', () => {
  it('normalises case, accents and punctuation to one key', () => {
    expect(aliasPhrase('Haché de bœuf,')).toBe('hache de boeuf');
    expect(aliasPhrase('  BEEF   mince ')).toBe('beef mince');
  });

  it('gives the same key for spellings a user would consider identical', () => {
    expect(aliasPhrase('Crème fraîche')).toBe(aliasPhrase('creme fraiche'));
  });

  it('keeps distinct ingredients distinct', () => {
    expect(aliasPhrase('beef mince')).not.toBe(aliasPhrase('pork mince'));
  });

  it('is empty for input with nothing usable', () => {
    expect(aliasPhrase('   ')).toBe('');
    expect(aliasPhrase('!!!')).toBe('');
  });
});
