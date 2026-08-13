/**
 * AI recipe scanning — turn a screenshot of a recipe into a structured
 * meal.
 *
 *   POST /api/photo-recipe   (body: raw JPEG bytes)
 *   → { "recipe": { name, servings, ingredients:[{name,grams}], steps:[] } }
 *
 * Runs the Workers AI vision model on a recipe screenshot (ingredients,
 * and a method / nutrition info if present). The model extracts the
 * recipe; the client resolves real macros from the food database and
 * opens it in the meal editor for a quick review. Fails soft.
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

interface CleanRecipe {
  name: string;
  servings: number;
  ingredients: { name: string; grams: number }[];
  steps: string[];
}

function cleanRecipe(parsed: unknown): CleanRecipe | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const r = parsed as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;

  const ingredients: { name: string; grams: number }[] = [];
  if (Array.isArray(r.ingredients)) {
    for (const ing of (r.ingredients as unknown[]).slice(0, 30)) {
      if (!ing || typeof ing !== 'object') continue;
      const i = ing as Record<string, unknown>;
      const iname = typeof i.name === 'string' ? i.name.trim() : '';
      if (!iname) continue;
      let grams = Math.round(Number(i.grams) || 0);
      if (!Number.isFinite(grams) || grams <= 0) grams = 100;
      ingredients.push({
        name: iname.slice(0, 80),
        grams: Math.min(grams, 50000),
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
  'You are a recipe assistant. This image is a recipe — it may show an ' +
  'ingredients list, a method, and/or nutrition info. Extract it and ' +
  'reply with ONLY JSON, no other text: ' +
  '{"name":"<recipe name>","servings":<how many servings the recipe ' +
  'makes, default 1>,"ingredients":[{"name":"<plain ingredient name>",' +
  '"grams":<total grams for the whole recipe>}],"steps":["<method step>"]}. ' +
  'Convert ingredient quantities to grams. ' +
  // Counts were being flattened to round numbers - "4 large peppers" came
  // back as 400g when four large peppers are nearer 700g.
  'For items given as a COUNT, multiply the count by a realistic weight for ' +
  'that item at that size: large pepper 170g, medium onion 150g, large onion ' +
  '200g, garlic clove 3g, medium egg 50g, medium potato 170g, medium carrot ' +
  '60g, medium tomato 120g, tbsp of a paste or oil 15g, tsp of a dried spice ' +
  '2g. Never round a count-based amount to a suspiciously flat number. ' +
  // Dry vs cooked is the single biggest macro error: dry black beans are
  // 341 kcal/100g and cooked ones 132, so the state has to survive into the
  // name or the lookup picks the wrong food.
  'Keep the preparation state IN the ingredient name whenever the recipe ' +
  'gives one - write "cooked black beans", "dried lentils", "raw spinach", ' +
  'not just "black beans". If the recipe gives both a dry and a cooked ' +
  'weight for the same item, use the COOKED weight and say "cooked" in the ' +
  'name. ' +
  'Include "steps" only if the ' +
  'image shows a method, otherwise use []. If the image is not a recipe, ' +
  'reply {"name":""}.';

export async function handlePhotoRecipe(
  req: Request,
  env: Env,
): Promise<Response> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return jsonResponse({ recipe: null, error: 'No image received.' });
  }
  if (buf.byteLength > MAX_BYTES) {
    return jsonResponse({ recipe: null, error: 'Image too large — try again.' });
  }

  let parsed: unknown = null;
  try {
    parsed = await runVisionJson(env, buf, PROMPT);
  } catch (err) {
    console.error('photo-recipe AI error:', err instanceof Error ? err.message : err);
    return jsonResponse({
      recipe: null,
      error: "Couldn't read the recipe right now — try again.",
    });
  }

  const recipe = cleanRecipe(parsed);
  if (!recipe) {
    return jsonResponse({
      recipe: null,
      error: "Couldn't find a recipe in that image — try a clearer screenshot.",
    });
  }
  return jsonResponse({ recipe });
}
