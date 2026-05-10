/**
 * Cloudflare Worker entry point.
 *
 * Two responsibilities:
 *   1. /api/* routes — sync API for the PWA.
 *   2. Everything else — fall through to the static-assets binding (the
 *      Vite SPA build in ./dist).
 *
 * Auth: a single shared bearer token in the SYNC_TOKEN secret. Personal
 * use, no multi-tenant. Set with:
 *   wrangler secret put SYNC_TOKEN
 */

import { handleSync } from './sync';

export interface Env {
  DB: D1Database;
  SYNC_TOKEN: string;
  ASSETS: Fetcher;
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

function authorize(req: Request, env: Env): Response | null {
  if (!env.SYNC_TOKEN) {
    return jsonResponse({ error: 'SYNC_TOKEN not configured on server' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.SYNC_TOKEN}`;
  if (auth !== expected) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight.
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname.startsWith('/api/')) {
      // /api/health — unauthenticated, lets the client probe reachability.
      if (url.pathname === '/api/health' && req.method === 'GET') {
        return jsonResponse({ ok: true, version: 1 });
      }

      // Everything else under /api requires the bearer token.
      const blocked = authorize(req, env);
      if (blocked) return blocked;

      if (url.pathname === '/api/sync' && req.method === 'POST') {
        try {
          return await handleSync(req, env);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'sync error';
          return jsonResponse({ error: msg }, { status: 500 });
        }
      }

      // /api/auth — minimal "is my token correct" probe used by the
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
