/**
 * AI photo logging.
 *
 *   POST /api/photo-food   (body: raw JPEG bytes)
 *   → { "foods": [ { "name": "grilled chicken", "grams": 150 } ] }
 *
 * Runs a vision model on Cloudflare Workers AI (free tier) to identify the
 * foods in a meal photo and estimate portions. As with the meal planner,
 * the model is NOT trusted for macros — it only names foods and rough
 * gram amounts; the client resolves real macros from the food database.
 * Fails soft with an `error` string.
 */

import type { Env } from './index';

const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const MAX_BYTES = 6_000_000;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function extractJson(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cleanFoods(parsed: unknown): { name: string; grams: number }[] {
  const arr = (parsed as { foods?: unknown } | null)?.foods;
  if (!Array.isArray(arr)) return [];
  const out: { name: string; grams: number }[] = [];
  for (const f of arr.slice(0, 12)) {
    if (!f || typeof f !== 'object') continue;
    const r = f as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    let grams = Math.round(Number(r.grams) || 0);
    if (!Number.isFinite(grams) || grams <= 0) grams = 100;
    out.push({ name: name.slice(0, 80), grams: Math.min(grams, 5000) });
  }
  return out;
}

export async function handlePhotoFood(req: Request, env: Env): Promise<Response> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return jsonResponse({ foods: [], error: 'No image received.' });
  }
  if (buf.byteLength > MAX_BYTES) {
    return jsonResponse({ foods: [], error: 'Image too large — try again.' });
  }
  const image = [...new Uint8Array(buf)];

  let parsed: unknown = null;
  try {
    const out = (await env.AI.run(VISION_MODEL, {
      image,
      prompt:
        'You are a nutrition assistant. Identify each distinct food or ' +
        'drink in this meal photo and estimate a realistic portion size ' +
        'in grams. Reply with ONLY JSON and no other text: ' +
        '{"foods":[{"name":"<plain food name>","grams":<number>}]}. ' +
        'If no food is visible, reply {"foods":[]}.',
      max_tokens: 800,
    })) as { response?: string };
    parsed = extractJson(out.response);
  } catch {
    return jsonResponse({
      foods: [],
      error: "Couldn't analyse the photo right now — try again.",
    });
  }

  return jsonResponse({ foods: cleanFoods(parsed) });
}
