/**
 * Contrast guard for the Stone & Amber palette.
 *
 * Reads the REAL token values out of src/index.css rather than a copy, so a
 * palette tweak that drops a token below AA fails the build instead of
 * shipping. The app went live with --color-text-faint at 1.91:1 (AA is 4.5:1)
 * carrying the macro labels, the date eyebrow and the arc scale numbers; this
 * test is what stops that recurring.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AA_NORMAL,
  contrastRatio,
  parseColor,
  parseHex,
  parseHslTriple,
  relativeLuminance,
} from './contrast';

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../index.css'),
  'utf8',
);

/** Pull one `--token: value;` out of a named block of index.css. */
function tokensIn(selector: string): Record<string, string> {
  // Match the block body up to the first line that closes it at 2-space indent.
  const start = CSS.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No "${selector}" block in index.css`);
  const body = CSS.slice(start, CSS.indexOf('\n  }', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[m[1]] = m[2].split('/*')[0].trim();
  }
  return out;
}

const light = tokensIn(':root');
const dark = tokensIn('.dark');

/**
 * Text tokens paired with every background they actually render on.
 * Backgrounds are listed worst-case-first; each pair must clear AA.
 */
const TEXT_ON_BG: [text: string, bg: string][] = [
  ['--color-text', '--color-bg'],
  ['--color-text-muted', '--color-bg'],
  ['--color-text-faint', '--color-bg'],
  ['--muted-foreground', '--background'],
  ['--muted-foreground', '--muted'],
  ['--muted-foreground', '--card'],
  ['--foreground', '--background'],
  ['--card-foreground', '--card'],
  ['--color-text-muted', '--card'],
  ['--color-text-faint', '--card'],
  // The over-budget colour carries an 11px "KCAL OVER" label, so it is body
  // text and needs the normal floor, not the large-text one.
  ['--over', '--color-bg'],
  ['--over', '--card'],
];

describe('parseHex', () => {
  it('parses long and short form', () => {
    expect(parseHex('#F4F3EF')).toEqual({ r: 244, g: 243, b: 239 });
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('throws rather than silently scoring a bad value as black', () => {
    expect(() => parseHex('nope')).toThrow();
  });
});

describe('parseHslTriple', () => {
  it('parses the Tailwind space-separated form', () => {
    // 0 0% 100% is white.
    expect(parseHslTriple('0 0% 100%')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHslTriple('0 0% 0%')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('handles a warm mid tone', () => {
    const { r, g, b } = parseHslTriple('45 8% 38%');
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('throws on hsl() wrapper or comma form', () => {
    expect(() => parseHslTriple('hsl(45, 8%, 38%)')).toThrow();
  });
});

describe('relativeLuminance / contrastRatio', () => {
  it('matches the WCAG reference extremes', () => {
    expect(relativeLuminance(parseColor('#FFFFFF'))).toBeCloseTo(1, 5);
    expect(relativeLuminance(parseColor('#000000'))).toBeCloseTo(0, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 2);
  });

  it('is order-independent and never below 1', () => {
    expect(contrastRatio('#F4F3EF', '#605D55')).toBeCloseTo(
      contrastRatio('#605D55', '#F4F3EF'),
      10,
    );
    expect(contrastRatio('#888', '#888')).toBeCloseTo(1, 10);
  });

  it('agrees with a known third-party value', () => {
    // #767676 on white is the canonical "exactly passes AA" grey.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeLessThan(4.6);
  });
});

describe('token contrast (light theme)', () => {
  it.each(TEXT_ON_BG)('%s on %s clears AA', (text, bg) => {
    const ratio = contrastRatio(light[text], light[bg]);
    expect(
      ratio,
      `light ${text} (${light[text]}) on ${bg} (${light[bg]}) = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('token contrast (dark theme)', () => {
  it.each(TEXT_ON_BG)('%s on %s clears AA', (text, bg) => {
    const ratio = contrastRatio(dark[text], dark[bg]);
    expect(
      ratio,
      `dark ${text} (${dark[text]}) on ${bg} (${dark[bg]}) = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('token sanity', () => {
  it('found tokens in both themes', () => {
    expect(Object.keys(light).length).toBeGreaterThan(20);
    expect(Object.keys(dark).length).toBeGreaterThan(20);
  });

  it('keeps faint lighter than muted in light mode, and vice versa in dark', () => {
    // The visual hierarchy still has to hold after the AA retune.
    expect(relativeLuminance(parseColor(light['--color-text-faint']))).toBeGreaterThan(
      relativeLuminance(parseColor(light['--color-text-muted'])),
    );
    expect(relativeLuminance(parseColor(dark['--color-text-faint']))).toBeLessThan(
      relativeLuminance(parseColor(dark['--color-text-muted'])),
    );
  });
});
