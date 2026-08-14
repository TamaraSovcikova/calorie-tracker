/**
 * AI meal planner.
 *
 *   POST /api/meal-plan
 *   {
 *     "portions": 5,             // how many meal-prep portions to make
 *     "kcalMax": 500,            // optional, per portion
 *     "proteinMin": 40,          // optional, per portion (g)
 *     "ingredients": ["chicken breast", ...],   // optional, to build around
 *     "notes": "vegetarian, no oven"            // optional
 *   }
 *
 *   → { "meals": [ { name, description, ingredients:[{name,grams}], steps } ] }
 *
 * The model ONLY proposes recipes — names, ingredient amounts and method.
 * It is deliberately NOT asked for calories or macros: small models are
 * unreliable at nutrition numbers. The client computes real macros from
 * the food database (curated foods + USDA) and scales each recipe to fit
 * the targets. Ingredient amounts are for the WHOLE batch of `portions`.
 */

import type { Env } from './index';

// 8B "fast" — quick (~10-20s) and good enough now it only writes recipes.
const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

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
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                grams: { type: 'number' },
              },
              required: ['name', 'grams'],
            },
          },
          steps: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'description', 'ingredients', 'steps'],
      },
    },
  },
  required: ['meals'],
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
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

/** Pull the JSON object out of a response that may be wrapped in prose. */
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
}
interface CleanMeal {
  name: string;
  description: string;
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
      for (const ing of (r.ingredients as unknown[]).slice(0, 14)) {
        if (!ing || typeof ing !== 'object') continue;
        const i = ing as Record<string, unknown>;
        const name = typeof i.name === 'string' ? i.name.trim() : '';
        const grams = Math.round(Number(i.grams) || 0);
        if (!name || grams <= 0) continue;
        ingredients.push({ name: name.slice(0, 80), grams: clamp(grams, 1, 50000) });
      }
    }
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name || ingredients.length === 0) continue;
    const steps = Array.isArray(r.steps)
      ? (r.steps as unknown[])
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10)
      : [];
    meals.push({
      name: name.slice(0, 80),
      description:
        typeof r.description === 'string' ? r.description.trim().slice(0, 200) : '',
      ingredients,
      steps,
    });
  }
  return meals;
}

export async function handleMealPlan(req: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ meals: [], error: 'Bad request.' }, { status: 400 });
  }

  const portions = clamp(Math.round(posNum(body.portions) ?? 5), 1, 30);
  const kcalMax = posNum(body.kcalMax);
  const proteinMin = posNum(body.proteinMin);
  const notes =
    typeof body.notes === 'string' ? body.notes.trim().slice(0, 300) : '';
  const ingredients = Array.isArray(body.ingredients)
    ? (body.ingredients as unknown[])
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 30)
    : [];

  const targetLines: string[] = [
    `Each recipe must make exactly ${portions} portion(s) — ingredient ` +
      `amounts are the totals for the whole batch.`,
  ];
  if (kcalMax) targetLines.push(`Aim for at most ${kcalMax} kcal per portion.`);
  if (proteinMin)
    targetLines.push(`Aim for at least ${proteinMin} g protein per portion.`);
  if (notes) targetLines.push(`Preferences: ${notes}`);

  const ingredientLine =
    ingredients.length > 0
      ? `Build the meals around these ingredients where they fit: ` +
        `${ingredients.join(', ')}. You don't have to use all of them and ` +
        `may add others.`
      : `I haven't picked ingredients — suggest varied meals for inspiration.`;

  // What the app knows about this cook. None of this used to be sent, so the
  // planner was a stranger every single time - the main reason it lost to a
  // chat that at least remembers the conversation.
  const ctx = (body.context ?? {}) as Record<string, unknown>;
  const strList = (v: unknown, n: number): string[] =>
    Array.isArray(v)
      ? (v as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, n)
      : [];
  const contextLines: string[] = [];
  const dailyKcal = posNum(ctx.dailyKcal);
  const dailyProtein = posNum(ctx.dailyProtein);
  if (dailyKcal || dailyProtein) {
    contextLines.push(
      `For background, their whole-day targets are ` +
        [
          dailyKcal ? `${dailyKcal} kcal` : null,
          dailyProtein ? `${dailyProtein} g protein` : null,
        ]
          .filter(Boolean)
          .join(' and ') +
        `. Treat that as context about the person, NOT as the target for ` +
        `these meals - the per-portion limits above are what matter.`,
    );
  }
  const freq = strList(ctx.frequentFoods, 15);
  if (freq.length > 0) {
    contextLines.push(
      `They cook regularly with: ${freq.join(', ')}. Favour these where ` +
        `they fit, but do not force them and do not use only these.`,
    );
  }
  const saved = strList(ctx.savedMeals, 25);
  if (saved.length > 0) {
    contextLines.push(
      `They already have these saved, so suggest something different: ` +
        `${saved.join(', ')}.`,
    );
  }
  const recent = strList(ctx.recentMeals, 10);
  if (recent.length > 0) {
    contextLines.push(
      `They ate these in the last two weeks, so avoid repeating them: ` +
        `${recent.join(', ')}.`,
    );
  }

  // Refining ONE suggestion rather than rolling five new ones. Regenerating
  // used to re-send the identical request, throwing away the meal they liked.
  const refine = body.refine as
    | { meal?: { name?: unknown; ingredients?: unknown }; instruction?: unknown }
    | undefined;
  const refineInstruction =
    typeof refine?.instruction === 'string' ? refine.instruction.trim().slice(0, 300) : '';
  const refineName =
    typeof refine?.meal?.name === 'string' ? refine.meal.name.slice(0, 80) : '';

  const userPrompt = refineInstruction && refineName
    ? `${targetLines.join('\n')}\n` +
      (contextLines.length ? `${contextLines.join('\n')}\n` : '') +
      `\nHere is a recipe they liked:\n` +
      `${JSON.stringify(refine?.meal).slice(0, 2000)}\n\n` +
      `Change it as follows: ${refineInstruction}\n` +
      `Return exactly 3 variations of THAT recipe with the change applied - ` +
      `keep what made it good and change only what was asked. Same JSON ` +
      `shape. Do NOT include calories or macros.`
    : `${ingredientLine}\n${targetLines.join('\n')}\n` +
      (contextLines.length ? `${contextLines.join('\n')}\n` : '') +
      `\nSuggest exactly 5 distinct, realistic meal-prep recipes. For each: a ` +
      `short name, a one-line description, an ingredient list (each with a ` +
      `name and a gram amount for the whole batch — include staples like oil ` +
      `and salt), and up to 8 short method steps. Do NOT include calories or ` +
      `macros — only ingredient names and gram amounts.`;

  let parsed: unknown = null;
  try {
    const out = (await env.AI.run(MODEL, {
      max_tokens: 3000,
      temperature: 0.7,
      response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
      messages: [
        {
          role: 'system',
          content:
            'You are a practical meal-prep planner. Reply ONLY with JSON ' +
            'matching the requested schema — no prose, no markdown. Use ' +
            'realistic gram amounts for a batch of the requested size.',
        },
        { role: 'user', content: userPrompt },
      ],
    })) as { response?: unknown };
    parsed = extractJson(out.response);
  } catch {
    return jsonResponse({
      meals: [],
      error:
        "The planner is busy right now (today's free AI limit may be reached). Try again later.",
    });
  }

  const meals = cleanMeals((parsed as Record<string, unknown> | null)?.meals);
  if (meals.length === 0) {
    return jsonResponse({
      meals: [],
      error: 'Could not generate a plan — please try again.',
    });
  }
  return jsonResponse({ meals });
}
