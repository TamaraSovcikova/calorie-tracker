/**
 * Batch-generate a full pose set for new pet species using Gemini 2.5 Flash
 * Image ("Nano Banana"), matching the existing hand-drawn dog's art style and
 * keeping each species' character consistent across all 20 poses.
 *
 * Pipeline per species:
 *   1. Generate a REFERENCE image (neutral front-facing sit) using the dog's
 *      reference as a style/proportion anchor - same line weight, shading and
 *      cuteness, different animal.
 *   2. For each of the 20 poses, feed BOTH the species reference (identity
 *      anchor) and the matching dog pose (pose/expression guide) so the model
 *      re-poses the same character rather than inventing a new one.
 *
 * Raw PNGs land in src/assets/pet/raw/{species}-{pose}.png. Run
 * `process-pets.mjs` afterwards to trim + resize + convert to the transparent
 * .webp cutouts the app imports.
 *
 * Auth: reads the API key from GEMINI_API_KEY (never hard-code it). The key
 * must belong to a project with the Generative Language API enabled.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/generate-pets.mjs --test            # 1 image, smoke test
 *   GEMINI_API_KEY=... node scripts/generate-pets.mjs --species=cat     # one species
 *   GEMINI_API_KEY=... node scripts/generate-pets.mjs                   # all species, all poses
 *   ...add --pose=happy to limit to a single pose, --force to overwrite.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'src/assets/pet/raw');

const MODEL = 'gemini-2.5-flash-image';
// Vertex AI Express endpoint: bills the GCP project (the $300 trial credit),
// not the AI Studio prepaid balance. Uses a vertex-express API key via ?key=.
const ENDPOINT = (key) =>
  `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODEL}:generateContent?key=${key}`;

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('Set GEMINI_API_KEY in the environment (never commit it).');
  process.exit(1);
}

// Shared art direction, distilled from the existing dog reference.
const STYLE =
  'Flat 2D kawaii cartoon mascot illustration. Thick soft dark-brown outlines, ' +
  'smooth cel shading with gentle soft highlights, simple rounded chunky shapes, ' +
  'big glossy expressive eyes, wholesome and adorable. Full body, centred in frame, ' +
  'consistent character design. Fully transparent background (PNG alpha), no ground ' +
  'shadow, no text, no watermark, no border, no extra props unless described.';

const SPECIES = {
  cat: {
    identity:
      'a cute cartoon BLACK CAT with sleek solid-black fur, big round emerald-green ' +
      'eyes, a small pink nose, pink inner ears and a long expressive tail',
  },
  shepherd: {
    identity:
      'a cute cartoon GERMAN SHEPHERD puppy with a tan face and legs, a black saddle ' +
      'marking over the back, large upright pointed ears, a darker muzzle and a fluffy tail',
  },
  parrot: {
    identity:
      'a cute cartoon PARROT with a bright green body, a sunny yellow head, small rosy ' +
      'cheeks, a little curved beak and blue wing-tips. Adapt any "sitting"/"standing" ' +
      'pose naturally to a bird perched or hopping',
  },
};

// Action / expression per pose, derived from the app's DogPose semantics.
const POSES = {
  hungry: 'sitting, big pleading eyes looking up, hopeful and desperate for food',
  peckish: 'sitting, head slightly tilted, mildly hungry and hopeful',
  content: 'sitting calmly, relaxed soft smile, eyes gently closed, content',
  full: 'sitting, satisfied happy smile, comfortably full with a slightly rounded belly',
  stuffed: 'sitting back, comfortably stuffed, noticeably round belly, sleepy-satisfied',
  too_stuffed: 'lying down, very round full belly, slightly uncomfortable expression',
  overeaten: 'lying on its back, big bloated belly, queasy uncomfortable expression',
  skeleton: 'very thin and gaunt, ribs faintly showing, sad hollow eyes, comically starved and neglected',
  eating: 'happily eating from a small food bowl, joyful, tail/feathers up',
  happy: 'standing, big joyful open smile, features perked up, delighted',
  sad: 'sitting, droopy posture, teary sad eyes, downcast',
  sleeping: 'curled up asleep, eyes closed, a tiny "Zzz" above the head, peaceful',
  greeting: 'excitedly waving hello with one paw/wing, bright welcoming smile',
  stretching: 'doing a big playful stretch / play-bow, front down and back up',
  bored: 'slumped, half-lidded unamused eyes, visibly bored',
  curious: 'head tilted, wide curious eyes, one ear/feather up, intrigued',
  love: 'heart-shaped eyes, blushing, radiating affection and love',
  playful: 'mid-bounce playful leap, big grin, energetic and fun',
  smile: 'gentle warm closed-mouth smile, cheerful',
  surprised: 'wide shocked eyes and open mouth, surprised',
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

async function pngPart(file) {
  const data = await readFile(file);
  return { inlineData: { mimeType: 'image/png', data: data.toString('base64') } };
}

/** Call the model, returning the first inline image as a Buffer. Retries with
 *  exponential backoff on 429/503 - Vertex image-gen has a tight rate limit. */
async function generate(prompt, imageParts, attempt = 0) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
    generationConfig: { responseModalities: ['Image'] },
  };
  const res = await fetch(ENDPOINT(KEY), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if ((res.status === 429 || res.status === 503) && attempt < 7) {
    const wait = Math.min(90_000, 8_000 * 2 ** attempt); // 8s,16s,32s,64s,90s…
    console.log(`    …${res.status}, backing off ${Math.round(wait / 1000)}s (retry ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, wait));
    return generate(prompt, imageParts, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!img) {
    throw new Error(`No image in response: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return Buffer.from(img, 'base64');
}

async function ensureReference(species) {
  const refPath = path.join(RAW_DIR, `${species}-reference.png`);
  if (existsSync(refPath) && !flag('force')) return refPath;
  const { identity } = SPECIES[species];
  const prompt =
    `Create ${identity}. Neutral friendly expression, sitting front-facing. ` +
    `Style: ${STYLE} The attached image is ONLY a style/proportion reference - match its ` +
    `line weight, shading and overall cuteness, but draw the animal described above, not a dog.`;
  const dogRef = await pngPart(path.join(RAW_DIR, 'dog-reference.png'));
  const buf = await generate(prompt, [dogRef]);
  await writeFile(refPath, buf);
  console.log(`  ✓ reference -> ${path.relative(ROOT, refPath)}`);
  return refPath;
}

async function generatePose(species, pose, refPath) {
  const outPath = path.join(RAW_DIR, `${species}-${pose}.png`);
  if (existsSync(outPath) && !flag('force')) {
    console.log(`  · ${pose} (exists, skip)`);
    return;
  }
  const { identity } = SPECIES[species];
  const prompt =
    `Two images are attached. Image 1 is ${identity} - keep this exact character ` +
    `identity, colours and art style. Image 2 shows a pose and expression to copy. Redraw ` +
    `the Image-1 character in the SAME pose, body language and facial expression as Image 2. ` +
    `Pose: ${POSES[pose]}. Style: ${STYLE} Output only the single character on a fully ` +
    `transparent background.`;
  const refPart = await pngPart(refPath);
  const dogPosePath = path.join(RAW_DIR, `dog-${pose}.png`);
  const parts = existsSync(dogPosePath)
    ? [refPart, await pngPart(dogPosePath)]
    : [refPart];
  const buf = await generate(prompt, parts);
  await writeFile(outPath, buf);
  console.log(`  ✓ ${pose} -> ${path.relative(ROOT, outPath)}`);
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  if (flag('test')) {
    console.log('Smoke test: cat reference + one pose');
    const ref = await ensureReference('cat');
    await generatePose('cat', opt('pose') ?? 'happy', ref);
    return;
  }

  const speciesList = opt('species') ? [opt('species')] : Object.keys(SPECIES);
  const poseList = opt('pose') ? [opt('pose')] : Object.keys(POSES);

  for (const species of speciesList) {
    if (!SPECIES[species]) throw new Error(`Unknown species: ${species}`);
    console.log(`\n${species}:`);
    let ref;
    try {
      ref = await ensureReference(species);
    } catch (err) {
      console.error(`  ✗ reference (skipping species): ${err.message}`);
      continue;
    }
    for (const pose of poseList) {
      if (!POSES[pose]) throw new Error(`Unknown pose: ${pose}`);
      try {
        await generatePose(species, pose, ref);
      } catch (err) {
        console.error(`  ✗ ${pose}: ${err.message}`);
      }
      // Gentle spacing so a burst of 20 calls doesn't trip rate limits.
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  console.log('\nDone. Review raw/, then run: node scripts/process-pets.mjs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
