/**
 * Cloudflare Worker entry point.
 *
 * Two responsibilities:
 *   1. /api/* routes — sync API for the PWA.
 *   2. Everything else — fall through to the static-assets binding (the
 *      Vite SPA build in ./dist).
 *
 * Auth: every device sends a private **sync code** as its bearer token.
 * The account id is `SHA-256(code)` — there is no server-side user list,
 * a code simply *is* its own isolated, private dataset. Every sync query
 * is scoped to that derived id, so no two codes ever see each other's
 * data.
 */

import { handleSync } from './sync';
import { handleFoodFact } from './foodFacts';
import { handleMealPlan } from './mealPlan';
import { handlePhotoFood } from './photoFood';
import { handlePhotoRecipe } from './photoRecipe';
import { checkRateLimit } from './rateLimit';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Cloudflare Workers AI binding — food facts + meal planner. */
  AI: Ai;
}

/** Shortest accepted sync code — generated codes are far longer; this
 *  just rejects empty / obviously-bogus tokens. */
const MIN_TOKEN_LENGTH = 12;

/**
 * Derive the account id from a sync code: SHA-256, hex, truncated to 32
 * chars. MUST stay byte-identical to the client's `deriveUserId`
 * (`src/db/userId.ts`).
 */
async function deriveUserId(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

/** Extract the bearer token, or null if missing / too short. */
function bearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer (.+)$/.exec(auth);
  const token = m?.[1]?.trim() ?? '';
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}

const CORS_HEADERS: Record<string, string> = {
  // Allow the dev origin. In production the SPA is served from the same
  // worker so CORS isn't strictly needed, but including it lets `pnpm dev`
  // hit the deployed Worker.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight.
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Google Health API proxy. health.googleapis.com sends no CORS
    // headers so the browser can't call it directly — forward the
    // request server-side, passing the user's Google bearer token
    // through unchanged. The Google token is the only auth needed; this
    // proxy only ever targets one fixed host.
    if (url.pathname.startsWith('/gh-api/')) {
      const target =
        'https://health.googleapis.com' +
        url.pathname.replace(/^\/gh-api/, '') +
        url.search;
      // Forward only the headers Google needs — copying Host would point
      // the upstream request back at the worker.
      const fwdHeaders = new Headers();
      const auth = req.headers.get('authorization');
      if (auth) fwdHeaders.set('authorization', auth);
      const ct = req.headers.get('content-type');
      if (ct) fwdHeaders.set('content-type', ct);
      const isBodyless = req.method === 'GET' || req.method === 'HEAD';
      const resp = await fetch(target, {
        method: req.method,
        headers: fwdHeaders,
        body: isBodyless ? undefined : await req.arrayBuffer(),
      });
      const headers = new Headers(resp.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    }

    if (url.pathname.startsWith('/api/')) {
      // /api/health — unauthenticated, lets the client probe reachability.
      if (url.pathname === '/api/health' && req.method === 'GET') {
        return jsonResponse({ ok: true, version: 1 });
      }

      // Everything else under /api requires a sync code. The code's
      // SHA-256 is the account id every query is scoped to.
      const token = bearerToken(req);
      if (!token) {
        return jsonResponse({ error: 'unauthorized' }, { status: 401 });
      }
      const userId = await deriveUserId(token);

      if (url.pathname === '/api/sync' && req.method === 'POST') {
        try {
          return await handleSync(req, env, userId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'sync error';
          return jsonResponse({ error: msg }, { status: 500 });
        }
      }

      // /api/food-fact — AI nutrition fact for a logged food (cached).
      if (url.pathname === '/api/food-fact' && req.method === 'POST') {
        if (!(await checkRateLimit(env, `fact:${userId}`, 30, 60))) {
          return jsonResponse({ fact: null }, { status: 429 });
        }
        try {
          return await handleFoodFact(req, env);
        } catch {
          return jsonResponse({ fact: null });
        }
      }

      // /api/meal-plan — AI meal-prep suggestions from the user's
      // ingredients + macro targets.
      if (url.pathname === '/api/meal-plan' && req.method === 'POST') {
        if (!(await checkRateLimit(env, `plan:${userId}`, 6, 60))) {
          return jsonResponse(
            {
              meals: [],
              error:
                'Too many plans in a short time — give it a minute and try again.',
            },
            { status: 429 },
          );
        }
        try {
          return await handleMealPlan(req, env);
        } catch {
          return jsonResponse({ meals: [], error: 'Planner failed — try again.' });
        }
      }

      // /api/photo-food — AI vision: identify foods in a meal photo.
      if (url.pathname === '/api/photo-food' && req.method === 'POST') {
        if (!(await checkRateLimit(env, `photo:${userId}`, 12, 60))) {
          return jsonResponse(
            { foods: [], error: 'Too many photos in a short time — wait a minute.' },
            { status: 429 },
          );
        }
        try {
          return await handlePhotoFood(req, env);
        } catch {
          return jsonResponse({ foods: [], error: 'Photo analysis failed — try again.' });
        }
      }

      // /api/photo-recipe — AI vision: extract a recipe from a screenshot.
      if (url.pathname === '/api/photo-recipe' && req.method === 'POST') {
        if (!(await checkRateLimit(env, `recipe:${userId}`, 12, 60))) {
          return jsonResponse(
            { recipe: null, error: 'Too many scans in a short time — wait a minute.' },
            { status: 429 },
          );
        }
        try {
          return await handlePhotoRecipe(req, env);
        } catch {
          return jsonResponse({ recipe: null, error: 'Recipe scan failed — try again.' });
        }
      }

      // /api/auth — minimal "is my code accepted" probe used by the
      // Settings panel to validate before saving.
      if (url.pathname === '/api/auth' && req.method === 'GET') {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: 'not found' }, { status: 404 });
    }

    // Fall through to the static SPA.
    return env.ASSETS.fetch(req);
  },
};
