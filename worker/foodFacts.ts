/**
 * AI food facts.
 *
 *   POST /api/food-fact  { "name": "<food name>" }  →  { "fact": "<text>" | null }
 *
 * A fact is generic knowledge about a food, so it is generated once by
 * Cloudflare Workers AI and cached in D1 keyed by the normalised name —
 * every later request for that food (any user) is a free cache hit. If
 * Workers AI is unavailable (e.g. the daily free allocation is spent) the
 * handler fails soft with `fact: null`; the client just shows nothing.
 */

import type { Env } from './index';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function normaliseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
}

/** Tidy the model output into a single clean sentence, or null if unusable. */
function cleanFact(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().split('\n')[0].trim();
  s = s.replace(/^["'\s]+|["'\s]+$/g, '');
  if (s.length < 8) return null;
  if (s.length > 240) s = s.slice(0, 240).trim() + '…';
  return s;
}

export async function handleFoodFact(req: Request, env: Env): Promise<Response> {
  let name = '';
  try {
    const body = (await req.json()) as { name?: unknown };
    if (typeof body.name === 'string') name = body.name.trim();
  } catch {
    /* malformed body — treated as no name */
  }
  if (!name) return jsonResponse({ fact: null });

  const key = normaliseKey(name);

  // Cache hit — free, instant.
  const cached = await env.DB.prepare('SELECT fact FROM food_facts WHERE key = ?')
    .bind(key)
    .first<{ fact: string }>();
  if (cached?.fact) return jsonResponse({ fact: cached.fact });

  // Generate with Workers AI.
  let fact: string | null = null;
  try {
    const out = (await env.AI.run(MODEL, {
      max_tokens: 90,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            'You give one short, accurate nutrition insight about a food. ' +
            'Reply with a SINGLE sentence under 30 words — friendly and ' +
            'specific, naming a key nutrient or genuine benefit. If the ' +
            'food is low in nutrients (sweets, fried snacks, sugary ' +
            'drinks), say so honestly but kindly. No preamble, no quotes, ' +
            'no markdown, no list.',
        },
        { role: 'user', content: `Food: ${name}` },
      ],
    })) as { response?: string };
    fact = cleanFact(out.response);
  } catch {
    fact = null; // Workers AI unavailable / daily allocation spent.
  }

  if (fact) {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO food_facts (key, name, fact, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind(key, name, fact, new Date().toISOString())
      .run();
  }
  return jsonResponse({ fact });
}
