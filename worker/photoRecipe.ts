/**
 * AI recipe scanning - turn a screenshot of a recipe into a structured
 * meal.
 *
 *   POST /api/photo-recipe   (body: raw JPEG bytes, or text/plain)
 *   → { "recipe": { name, servings,
 *        ingredients:[{name,amount,unit,grams}], steps:[] } }
 *
 * The model reports each amount AS WRITTEN (amount + unit). Converting to
 * grams is done by a fixed table on the client: the model reads "2 tbsp"
 * reliably and multiplies unreliably. `grams` is its own estimate, kept
 * only as a fallback for units the table does not know.
 *
 * Runs the Workers AI vision model on a recipe screenshot (ingredients,
 * and a method / nutrition info if present). The model extracts the
 * recipe; the client resolves real macros from the food database and
 * opens it in the meal editor for a quick review. Fails soft.
 */

import type { Env } from './index';
import { runTextJson, runVisionJson } from './vision';

const MAX_BYTES = 6_000_000;
const MAX_TEXT_CHARS = 8000;
// A long recipe with a method ran out at 1200 tokens and came back as
// truncated, unparseable JSON.
const MAX_TOKENS = 2600;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

interface CleanIngredient {
  name: string;
  grams: number;
  /** As written in the recipe. Absent when it gave no number. */
  amount?: number;
  unit?: string;
}

interface CleanRecipe {
  name: string;
  servings: number;
  ingredients: CleanIngredient[];
  steps: string[];
}

/** "1/2", "1 1/2", "0.5", 2 -> a number, or undefined. */
function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const t = v.trim().replace(',', '.');
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function cleanRecipe(parsed: unknown): CleanRecipe | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const r = parsed as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;

  const ingredients: CleanIngredient[] = [];
  if (Array.isArray(r.ingredients)) {
    for (const ing of (r.ingredients as unknown[]).slice(0, 40)) {
      if (!ing || typeof ing !== 'object') continue;
      const i = ing as Record<string, unknown>;
      const iname = typeof i.name === 'string' ? i.name.trim() : '';
      if (!iname) continue;
      let grams = Math.round(Number(i.grams) || 0);
      if (!Number.isFinite(grams) || grams <= 0) grams = 100;
      const amount = toNumber(i.amount);
      const unit = typeof i.unit === 'string' ? i.unit.trim().slice(0, 20) : '';
      ingredients.push({
        name: iname.slice(0, 80),
        grams: Math.min(grams, 50000),
        ...(amount !== undefined ? { amount: Math.min(amount, 50000), unit } : {}),
      });
    }
  }
  if (ingredients.length === 0) return null;

  const steps = Array.isArray(r.steps)
    ? (r.steps as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  let servings = Math.round(Number(r.servings) || 1);
  if (!Number.isFinite(servings) || servings < 1) servings = 1;
  servings = Math.min(servings, 30);

  return { name: name.slice(0, 80), servings, ingredients, steps };
}

const PROMPT =
  'You are a recipe assistant. You are given a recipe - it may show an ' +
  'ingredients list, a method, and/or nutrition info. Extract it and ' +
  'reply with ONLY JSON, no other text: ' +
  '{"name":"<recipe name>","servings":<how many servings the recipe ' +
  'makes, default 1>,"ingredients":[{"name":"<plain ingredient name>",' +
  '"amount":<the number exactly as written>,"unit":"<the unit exactly as ' +
  'written>","grams":<your estimate of total grams>}],' +
  '"steps":["<method step>"]}. ' +
  // The model reads amounts well and multiplies badly: 2 tbsp of puree came
  // back as 10 g. So it copies the amount and unit and the app converts.
  'AMOUNT AND UNIT: copy them from the recipe, do not convert. "2 tbsp ' +
  'tomato puree" is amount 2, unit "tbsp". "1 kg chicken" is amount 1, unit ' +
  '"kg". "2 tins beans" is amount 2, unit "tin". "4 garlic cloves" is ' +
  'amount 4, unit "clove". "half a cabbage" is amount 0.5, unit "". "2 ' +
  'large onions" is amount 2, unit "large". For a plain count use unit "". ' +
  'If a weight is given in brackets, use it: "1 pack soffritto mix (about ' +
  '500 g)" is amount 500, unit "g". If no amount is written at all (for ' +
  'example "salt and pepper"), leave amount and unit out. ' +
  'GRAMS: also give your own best estimate of the total grams for the ' +
  'whole recipe; it is only a fallback. ' +
  // A soup scan listed "soffritto mix" (no such food in any database) when
  // the same line offered onion, carrot and celery.
  'ALTERNATIVES: when a line offers a choice ("X, or A, B and C"), list the ' +
  'option made of plain basic ingredients (A, B and C as separate ' +
  'ingredients) and leave the other out. Never list both. ' +
  'NAMES: use the plain food name without amounts or brand names. Keep ' +
  'words that change the food: "boneless chicken thighs", "tinned chopped ' +
  'tomatoes", "dried rosemary", "tomato puree". Split joined items into ' +
  'separate ingredients: "salt and pepper" is "salt" and "black pepper". ' +
  'When only the juice or zest of a fruit is used, name it "lemon juice" ' +
  'or "lemon zest", not "lemon". ' +
  'LEAVE OUT water, ice, and anything used only for serving or greasing ' +
  'the pan. ' +
  // Dry vs cooked is the single biggest macro error: dry black beans are
  // 341 kcal/100g and cooked ones 132, so the state has to survive into the
  // name or the lookup picks the wrong food.
  'Keep the preparation state IN the ingredient name whenever the recipe ' +
  'gives one - write "cooked black beans", "dried lentils", "raw spinach", ' +
  'not just "black beans". If the recipe gives both a dry and a cooked ' +
  'weight for the same item, use the COOKED weight and say "cooked" in the ' +
  'name. ' +
  'Include "steps" only if a method is shown, otherwise use []. If this ' +
  'is not a recipe, reply {"name":""}.';

export async function handlePhotoRecipe(
  req: Request,
  env: Env,
): Promise<Response> {
  // Pasted recipe text skips the camera, and with it every misread
  // character. Same prompt, same cleaning, same response.
  const isText = (req.headers.get('content-type') ?? '').startsWith('text/plain');
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return jsonResponse({
      recipe: null,
      error: isText ? 'No recipe text received.' : 'No image received.',
    });
  }
  if (buf.byteLength > MAX_BYTES) {
    return jsonResponse({ recipe: null, error: 'Image too large - try again.' });
  }
  const text = isText ? new TextDecoder().decode(buf).slice(0, MAX_TEXT_CHARS) : '';

  const run = () =>
    isText
      ? runTextJson(env, text, PROMPT, MAX_TOKENS)
      : runVisionJson(env, buf, PROMPT, MAX_TOKENS);

  let parsed: unknown = null;
  try {
    parsed = await run();
    // The model occasionally wraps or truncates its JSON. One more try is
    // cheap next to making the user rescan.
    if (!cleanRecipe(parsed)) parsed = await run();
  } catch (err) {
    console.error('photo-recipe AI error:', err instanceof Error ? err.message : err);
    return jsonResponse({
      recipe: null,
      error: "Couldn't read the recipe right now - try again.",
    });
  }

  const recipe = cleanRecipe(parsed);
  if (!recipe) {
    return jsonResponse({
      recipe: null,
      error: isText
        ? "Couldn't find a recipe in that text - paste the ingredients list."
        : "Couldn't find a recipe in that image - try a clearer screenshot.",
    });
  }
  return jsonResponse({ recipe });
}
