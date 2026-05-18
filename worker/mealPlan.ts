/**
 * AI meal planner.
 *
 *   POST /api/meal-plan
 *   {
 *     "ingredients": ["chicken breast", "rice", ...],
 *     "days": 5,
 *     "mealsPerDay": 1,
 *     "kcalMax": 500,        // optional, per portion
 *     "proteinMin": 40,      // optional, per portion (g)
 *     "notes": "vegetarian, no oven"   // optional
 *   }
 *
 *   → { "meals": [ ...PlannedMeal ], "shoppingList": [ {name, amount} ] }
 *
 * Runs Llama 3.3 70B on Cloudflare Workers AI in JSON mode. Each meal is a
 * batch recipe — ingredient amounts are for the WHOLE batch and the meal
 * "makes" `servings` portions, matching the app's multi-portion meals.
 * Fails soft with `{ meals: [], error }` if the AI is unavailable.
 */

import type { Env } from './index';

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          servings: { type: 'number' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                grams: { type: 'number' },
                kcal: { type: 'number' },
                protein: { type: 'number' },
                carbs: { type: 'number' },
                fat: { type: 'number' },
              },
              required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
            },
          },
          steps: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'description', 'servings', 'ingredients', 'steps'],
      },
    },
    shoppingList: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, amount: { type: 'string' } },
        required: ['name', 'amount'],
      },
    },
  },
  required: ['meals', 'shoppingList'],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function posNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Pull the JSON object out of a model response that may be wrapped in
 *  prose or ```json fences. */
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

interface CleanIngredient {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
interface CleanMeal {
  name: string;
  description: string;
  servings: number;
  ingredients: CleanIngredient[];
  steps: string[];
}

function cleanMeals(value: unknown): CleanMeal[] {
  if (!Array.isArray(value)) return [];
  const meals: CleanMeal[] = [];
  for (const m of value.slice(0, 6)) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    const ingredients: CleanIngredient[] = [];
    if (Array.isArray(r.ingredients)) {
      for (const ing of (r.ingredients as unknown[]).slice(0, 25)) {
        if (!ing || typeof ing !== 'object') continue;
        const i = ing as Record<string, unknown>;
        const name = typeof i.name === 'string' ? i.name.trim() : '';
        if (!name) continue;
        ingredients.push({
          name: name.slice(0, 80),
          grams: Math.max(0, Number(i.grams) || 0),
          kcal: Math.max(0, Number(i.kcal) || 0),
          protein: Math.max(0, Number(i.protein) || 0),
          carbs: Math.max(0, Number(i.carbs) || 0),
          fat: Math.max(0, Number(i.fat) || 0),
        });
      }
    }
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name || ingredients.length === 0) continue;
    const steps = Array.isArray(r.steps)
      ? (r.steps as unknown[])
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 15)
      : [];
    meals.push({
      name: name.slice(0, 80),
      description:
        typeof r.description === 'string' ? r.description.trim().slice(0, 200) : '',
      servings: clamp(Math.round(Number(r.servings) || 1), 1, 30),
      ingredients,
      steps,
    });
  }
  return meals;
}

function cleanShoppingList(value: unknown): { name: string; amount: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { name: string; amount: string }[] = [];
  for (const s of value.slice(0, 50)) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    out.push({
      name: name.slice(0, 80),
      amount: typeof r.amount === 'string' ? r.amount.trim().slice(0, 40) : '',
    });
  }
  return out;
}

export async function handleMealPlan(req: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ meals: [], shoppingList: [], error: 'Bad request.' }, 400);
  }

  const ingredients = Array.isArray(body.ingredients)
    ? (body.ingredients as unknown[])
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 30)
    : [];
  const days = clamp(Math.round(posNum(body.days) ?? 3), 1, 14);
  const mealsPerDay = clamp(Math.round(posNum(body.mealsPerDay) ?? 1), 1, 5);
  const kcalMax = posNum(body.kcalMax);
  const proteinMin = posNum(body.proteinMin);
  const notes =
    typeof body.notes === 'string' ? body.notes.trim().slice(0, 300) : '';

  const constraints: string[] = [
    `Plan batch-cook meals for ${days} day(s), ${mealsPerDay} meal(s) per day.`,
  ];
  if (kcalMax) constraints.push(`Each portion must be at most ${kcalMax} kcal.`);
  if (proteinMin)
    constraints.push(`Each portion should have at least ${proteinMin} g protein.`);
  if (notes) constraints.push(`Extra preferences: ${notes}`);

  const ingredientLine =
    ingredients.length > 0
      ? `I'd like meals built around these ingredients: ${ingredients.join(', ')}. ` +
        `Use them where they fit — I don't have to use all of them, and you ` +
        `can freely add any other ingredients the recipes need.`
      : `I haven't picked specific ingredients — suggest meals freely for ` +
        `inspiration, choosing whatever ingredients fit the targets below.`;

  const userPrompt =
    `${ingredientLine}\n` +
    `${constraints.join('\n')}\n\n` +
    `Suggest 3 to 5 distinct meal-prep recipes. For each meal:\n` +
    `- "servings" is how many portions the batch makes.\n` +
    `- "ingredients" amounts are for the WHOLE batch, in grams, each with ` +
    `realistic kcal/protein/carbs/fat for that amount.\n` +
    `- include every ingredient the recipe needs, staples included.\n` +
    `- "steps" are short cooking instructions.\n` +
    `Also return a combined "shoppingList" of everything needed across all meals.`;

  let parsed: unknown = null;
  try {
    const out = (await env.AI.run(MODEL, {
      max_tokens: 4096,
      temperature: 0.6,
      response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
      messages: [
        {
          role: 'system',
          content:
            'You are a practical meal-prep planner. You reply ONLY with ' +
            'JSON matching the requested schema — no prose, no markdown. ' +
            'Macros must be realistic and internally consistent.',
        },
        { role: 'user', content: userPrompt },
      ],
    })) as { response?: unknown };
    parsed = extractJson(out.response);
  } catch {
    return jsonResponse(
      {
        meals: [],
        shoppingList: [],
        error: "The planner is busy right now (today's free AI limit may be reached). Try again later.",
      },
      200,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    return jsonResponse(
      { meals: [], shoppingList: [], error: 'Could not generate a plan — try again.' },
      200,
    );
  }
  const root = parsed as Record<string, unknown>;
  const meals = cleanMeals(root.meals);
  if (meals.length === 0) {
    return jsonResponse(
      { meals: [], shoppingList: [], error: 'Could not generate a plan — try again.' },
      200,
    );
  }
  return jsonResponse({ meals, shoppingList: cleanShoppingList(root.shoppingList) });
}
