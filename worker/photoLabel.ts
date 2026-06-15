/**
 * AI nutrition-label scanning — read a photo of a nutrition label and
 * transcribe its printed values into food fields.
 *
 *   POST /api/photo-label   (body: raw JPEG bytes)
 *   → { "label": { name, brand, kcal_100, protein_100, carbs_100, fat_100,
 *                  fiber_100, sugar_100, sodium_100, serving_g } }
 *
 * NOTE on the "AI never produces numbers" rule (see AI_FOOD_RESOLUTION):
 * this is the one deliberate exception. The model is TRANSCRIBING printed
 * values off a label (OCR), not estimating them, and the result lands in
 * the editable manual-entry form for the user to confirm before saving.
 * That keeps a human in the loop, which is the point of the rule.
 */

import type { Env } from './index';
import { runVisionJson } from './vision';

const MAX_BYTES = 6_000_000;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export interface CleanLabel {
  name: string;
  brand: string;
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  fiber_100: number | null;
  sugar_100: number | null;
  sodium_100: number | null;
  serving_g: number | null;
}

/**
 * Coerce to a non-negative number, tolerating strings the model sometimes
 * returns despite the JSON instruction: "250 kcal", "1,024", "10g", "<0.5".
 * Pulls the first numeric token; commas stripped, leading "<"/"~" ignored.
 */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v === 'string') {
    const m = v.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

function cleanLabel(parsed: unknown): CleanLabel | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const r = parsed as Record<string, unknown>;

  const kcal = num(r.kcal_100);
  const protein = num(r.protein_100);
  const carbs = num(r.carbs_100);
  const fat = num(r.fat_100);
  // Need at least calories to be a useful label read.
  if (kcal === null) return null;

  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : '';
  const brand = typeof r.brand === 'string' ? r.brand.trim().slice(0, 60) : '';

  return {
    name,
    brand,
    kcal_100: Math.min(kcal, 2000), // per 100g sanity cap (pure fat ~900)
    protein_100: protein ?? 0,
    carbs_100: carbs ?? 0,
    fat_100: fat ?? 0,
    fiber_100: num(r.fiber_100),
    sugar_100: num(r.sugar_100),
    sodium_100: num(r.sodium_100),
    serving_g: num(r.serving_g),
  };
}

const PROMPT =
  'You are reading the nutrition information off a food package. It may be ' +
  'laid out in ANY of these ways, so read carefully and handle all of them:\n' +
  '1. A nutrition TABLE/box with columns (often "per 100g" and "per ' +
  'serving"), possibly rotated or skewed.\n' +
  '2. A single LINE or short phrase, e.g. "Energy 540kJ/128kcal, fat 5g, ' +
  'carbohydrate 12g, protein 8g per 100g".\n' +
  '3. Values written INLINE inside a PARAGRAPH of text or next to an ' +
  'ingredients list.\n' +
  'Always report the PER 100 g (or per 100 ml) values. If a per-100g column ' +
  'or phrase exists, use it directly. If ONLY per-serving values are shown, ' +
  'convert to per-100g using the serving size (per100 = perServing / ' +
  'servingGrams * 100). Ignore the ingredients list itself; only extract the ' +
  'numbers. Reply with ONLY JSON, no other text, no markdown:\n' +
  '{"name":"<product name if visible, else \\"\\">","brand":"<brand if ' +
  'visible, else \\"\\">","kcal_100":<number>,"protein_100":<grams>,' +
  '"carbs_100":<grams>,"fat_100":<grams>,"fiber_100":<grams or null>,' +
  '"sugar_100":<grams or null>,"sodium_100":<milligrams or null>,' +
  '"serving_g":<one serving in grams if shown, else null>}. ' +
  'Energy MUST be kcal (if only kJ is shown, kcal = kJ / 4.184). Sodium in ' +
  'milligrams (if only salt in grams is shown, sodium_mg = salt_g / 2.5 * ' +
  '1000). Use null for any value you genuinely cannot find. If the image ' +
  'contains no nutrition information at all, reply {"kcal_100":null}.';

export async function handlePhotoLabel(req: Request, env: Env): Promise<Response> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return jsonResponse({ label: null, error: 'No image received.' });
  }
  if (buf.byteLength > MAX_BYTES) {
    return jsonResponse({ label: null, error: 'Image too large — try again.' });
  }

  let parsed: unknown = null;
  try {
    parsed = await runVisionJson(env, buf, PROMPT);
  } catch (err) {
    console.error('photo-label AI error:', err instanceof Error ? err.message : err);
    return jsonResponse({
      label: null,
      error: "Couldn't read the label right now — try again.",
    });
  }

  const label = cleanLabel(parsed);
  if (!label) {
    return jsonResponse({
      label: null,
      error: "Couldn't read a nutrition label in that image — try a clearer, closer photo.",
    });
  }
  return jsonResponse({ label });
}
