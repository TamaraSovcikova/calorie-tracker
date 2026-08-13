/**
 * WCAG 2.1 contrast maths.
 *
 * Exists so the design tokens can be checked automatically rather than by
 * eye: the palette shipped with --color-text-faint at 1.91:1 against the
 * canvas (the AA floor for body text is 4.5:1) and nobody noticed, because
 * pale-on-cream looks fine indoors on the device you designed it on.
 *
 * Formulae: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

export interface Rgb {
  r: number; // 0-255
  g: number;
  b: number;
}

/** Parse `#rgb` or `#rrggbb`. Throws on anything else - a malformed token
 *  should fail the test loudly, not silently score as black. */
export function parseHex(hex: string): Rgb {
  const s = hex.trim().replace(/^#/, '');
  const full =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: "${hex}"`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Parse the space-separated HSL triple Tailwind stores tokens as, e.g.
 * `45 8% 38%` (no `hsl()` wrapper, no commas). Throws on anything else.
 */
export function parseHslTriple(triple: string): Rgb {
  const m = triple
    .trim()
    .match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) throw new Error(`Not an HSL triple: "${triple}"`);
  const h = parseFloat(m[1]);
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m0 = l - c / 2;
  return {
    r: Math.round((r1 + m0) * 255),
    g: Math.round((g1 + m0) * 255),
    b: Math.round((b1 + m0) * 255),
  };
}

/** Accepts either a hex string or a Tailwind-style HSL triple. */
export function parseColor(value: string): Rgb {
  return value.trim().startsWith('#')
    ? parseHex(value)
    : parseHslTriple(value);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  );
}

/** WCAG contrast ratio between two colours. Always >= 1, order-independent. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(typeof a === 'string' ? parseColor(a) : a);
  const lb = relativeLuminance(typeof b === 'string' ? parseColor(b) : b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA floor for normal-size body text. */
export const AA_NORMAL = 4.5;
/** AA floor for large text (>=18.66px bold or >=24px regular) and UI shapes. */
export const AA_LARGE = 3;
