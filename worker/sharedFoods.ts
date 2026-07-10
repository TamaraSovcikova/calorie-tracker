/**
 * Community shared-foods pool. A single, non-user-scoped table of foods that
 * users opt to contribute (manually-entered products), so anyone can find a
 * product by name/barcode without re-typing its macros.
 *
 * Dedupe key: the barcode when present, else a normalised name|brand. First
 * contributor's macros win; later contributions of the same key just bump a
 * `uses` counter (used for ranking). The table is created on first use so no
 * separate D1 migration step is needed.
 */

import type { Env } from './index';

const CORS = { 'Access-Control-Allow-Origin': '*' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

let ensured = false;
async function ensureTable(env: Env): Promise<void> {
  if (ensured) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS shared_foods (
       key          TEXT PRIMARY KEY,
       name         TEXT NOT NULL,
       brand        TEXT,
       off_barcode  TEXT,
       kcal_100     REAL NOT NULL,
       protein_100  REAL NOT NULL,
       carbs_100    REAL NOT NULL,
       fat_100      REAL NOT NULL,
       fiber_100    REAL,
       sugar_100    REAL,
       sodium_100   REAL,
       serving_g    REAL,
       custom_units TEXT NOT NULL,
       contributor  TEXT NOT NULL,
       uses         INTEGER NOT NULL DEFAULT 1,
       created_at   TEXT NOT NULL,
       updated_at   TEXT NOT NULL
     )`,
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS shared_foods_name ON shared_foods (name)`,
  ).run();
  ensured = true;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function keyFor(name: string, brand: string | null, barcode: string | null): string {
  if (barcode && barcode.trim()) return `bc:${barcode.trim()}`;
  return `nm:${norm(name)}|${brand ? norm(brand) : ''}`;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export async function handleSharedFoodSearch(req: Request, env: Env): Promise<Response> {
  await ensureTable(env);
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return json({ foods: [] });
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  // Token-AND over "name brand"; each token a LIKE with escaped wildcards.
  const clauses = tokens
    .map(() => `instr(lower(name || ' ' || coalesce(brand,'')), ?)`)
    .join(' AND ');
  const stmt = env.DB.prepare(
    `SELECT key, name, brand, off_barcode, kcal_100, protein_100, carbs_100,
            fat_100, fiber_100, sugar_100, sodium_100, serving_g, custom_units
       FROM shared_foods
      WHERE ${clauses}
      ORDER BY uses DESC, name ASC
      LIMIT 25`,
  ).bind(...tokens);
  const { results } = await stmt.all();
  return json({ foods: results ?? [] });
}

export async function handleSharedFoodContribute(
  req: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  await ensureTable(env);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.name !== 'string' || !b.name.trim()) {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const kcal = num(b.kcal_100);
  const protein = num(b.protein_100);
  const carbs = num(b.carbs_100);
  const fat = num(b.fat_100);
  if (kcal === null || protein === null || carbs === null || fat === null) {
    return json({ ok: false, error: 'invalid macros' }, 400);
  }
  const brand = typeof b.brand === 'string' && b.brand.trim() ? b.brand.trim() : null;
  const barcode =
    typeof b.off_barcode === 'string' && b.off_barcode.trim()
      ? b.off_barcode.trim()
      : null;
  const key = keyFor(b.name, brand, barcode);
  const now = new Date().toISOString();
  const units = typeof b.custom_units === 'string' ? b.custom_units : '[]';
  // First writer wins on macros; repeat contributions just bump `uses`.
  await env.DB.prepare(
    `INSERT INTO shared_foods
       (key, name, brand, off_barcode, kcal_100, protein_100, carbs_100,
        fat_100, fiber_100, sugar_100, sodium_100, serving_g, custom_units,
        contributor, uses, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
     ON CONFLICT(key) DO UPDATE SET uses = uses + 1, updated_at = excluded.updated_at`,
  )
    .bind(
      key,
      b.name.trim(),
      brand,
      barcode,
      kcal,
      protein,
      carbs,
      fat,
      num(b.fiber_100),
      num(b.sugar_100),
      num(b.sodium_100),
      num(b.serving_g),
      units,
      userId,
      now,
      now,
    )
    .run();
  return json({ ok: true });
}
