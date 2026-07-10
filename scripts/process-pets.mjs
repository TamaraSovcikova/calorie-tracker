/**
 * Turn the raw generated PNGs in src/assets/pet/raw/{species}-{pose}.png into
 * the trimmed, transparent .webp cutouts the app imports from
 * src/assets/pet/{species}-{pose}.webp.
 *
 * The image model returns the character on an opaque white background (plus a
 * soft drop shadow), so we can't just trim. Instead we flood-fill from the
 * borders: every near-white / low-saturation pixel connected to the edge
 * becomes transparent, which drops the background and shadow while preserving
 * interior whites (eye glints, teeth) that aren't edge-connected. Then trim +
 * resize + webp.
 *
 * Usage:
 *   node scripts/process-pets.mjs                 # every raw {species}-*.png
 *   node scripts/process-pets.mjs --species=cat   # one species
 */

import { readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'src/assets/pet/raw');
const OUT_DIR = path.join(ROOT, 'src/assets/pet');

const BOX = 512; // final square frame, subject trimmed + centred
// A pixel counts as background if it's bright and near-grey (white or the
// grey drop shadow). Tuned to leave the dark outline and coloured fills alone.
const BG_MIN_LUMA = 178;
const BG_MAX_CHROMA = 32;

const opt = (name) =>
  process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

/** Flood-fill edge-connected background pixels to transparent, in place. */
function removeBackground(data, width, height) {
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max >= BG_MIN_LUMA && max - min <= BG_MAX_CHROMA;
  };
  const visited = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    if (isBg(p * 4)) stack.push(p);
  };
  // Seed from the whole border.
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }

  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0; // clear alpha
    const x = p % width;
    const y = (p / width) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
}

async function processFile(file) {
  const base = file.replace(/\.png$/, '');
  const outPath = path.join(OUT_DIR, `${base}.webp`);
  const { data, info } = await sharp(path.join(RAW_DIR, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  removeBackground(data, info.width, info.height);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 10 })
    .resize(BOX, BOX, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(outPath);
  console.log(`✓ ${file} -> ${path.relative(ROOT, outPath)}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const species = opt('species');
  const files = (await readdir(RAW_DIR)).filter(
    (f) =>
      f.endsWith('.png') &&
      !f.startsWith('dog-') &&
      !f.endsWith('-reference.png') &&
      (!species || f.startsWith(`${species}-`)),
  );
  if (files.length === 0) {
    console.log('No raw species PNGs to process.');
    return;
  }
  for (const file of files) await processFile(file);
  console.log(`\nDone (${files.length}). Wire the new species into Dog.tsx / petLogic.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
