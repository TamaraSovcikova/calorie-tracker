/**
 * Bidirectional sync handler.
 *
 * Wire format (JSON):
 *
 *   POST /api/sync
 *   {
 *     "since": { "<table>": "<iso-timestamp>", ... },
 *     "push":  { "<table>": [ ...rows ], ... }
 *   }
 *
 * For each table the server:
 *   1. Upserts every row from `push` (last-write-wins by updated_at — if the
 *      stored row's updated_at is greater than the incoming, we keep ours).
 *   2. Returns every row with updated_at > since[table] (including server-
 *      side rows the client hasn't seen, AND rows just upserted from the
 *      same client — that's intentional, gives the client a chance to
 *      reconcile its cursor).
 *
 *   Response:
 *   {
 *     "pull":  { "<table>": [ ...rows ], ... },
 *     "until": { "<table>": "<iso-timestamp>", ... }
 *   }
 */

import type { Env } from './index';

type Row = Record<string, unknown>;

interface SyncRequest {
  since?: Partial<Record<TableName, string>>;
  push?: Partial<Record<TableName, Row[]>>;
}

const TABLES = [
  'profiles',
  'foods',
  'meals',
  'meal_items',
  'diary_entries',
  'exercise_entries',
  'weight_log',
] as const;
type TableName = (typeof TABLES)[number];

// Column lists must match worker/schema.sql exactly. Order matters for
// the parameterised UPSERT below.
const COLUMNS: Record<TableName, string[]> = {
  profiles: [
    'user_id',
    'name',
    'sex',
    'dob',
    'height_cm',
    'weight_kg',
    'activity_level',
    'kcal_target',
    'protein_g',
    'carbs_g',
    'fat_g',
    'primary_macro',
    'eat_back_burned',
    'units',
    'theme',
    'plan',
    'fitbit_connected',
    'onboarded',
    'created_at',
    'updated_at',
  ],
  foods: [
    'id',
    'user_id',
    'source',
    'off_barcode',
    'name',
    'brand',
    'kcal_100',
    'protein_100',
    'carbs_100',
    'fat_100',
    'serving_g',
    'custom_units',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  meals: ['id', 'user_id', 'name', 'notes', 'created_at', 'updated_at', 'deleted_at'],
  meal_items: ['id', 'meal_id', 'food_id', 'qty', 'unit', 'meal_updated_at'],
  diary_entries: [
    'id',
    'user_id',
    'date',
    'section',
    'kind',
    'food_id',
    'meal_id',
    'qty',
    'unit',
    'portion_multiplier',
    'kcal',
    'protein',
    'carbs',
    'fat',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  exercise_entries: [
    'id',
    'user_id',
    'date',
    'source',
    'name',
    'duration_min',
    'kcal_burned',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  weight_log: [
    'id',
    'user_id',
    'date',
    'weight_kg',
    'note',
    'created_at',
    'updated_at',
  ],
};

const PRIMARY_KEY: Record<TableName, string> = {
  profiles: 'user_id',
  foods: 'id',
  meals: 'id',
  meal_items: 'id',
  diary_entries: 'id',
  exercise_entries: 'id',
  weight_log: 'id',
};

const UPDATED_AT_COLUMN: Record<TableName, string> = {
  profiles: 'updated_at',
  foods: 'updated_at',
  meals: 'updated_at',
  meal_items: 'meal_updated_at',
  diary_entries: 'updated_at',
  exercise_entries: 'updated_at',
  weight_log: 'updated_at',
};

const EPOCH = '1970-01-01T00:00:00.000Z';

function normaliseValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
    return JSON.stringify(v);
  }
  return v;
}

function buildUpsertSql(table: TableName): string {
  const cols = COLUMNS[table];
  const pk = PRIMARY_KEY[table];
  const updatedAt = UPDATED_AT_COLUMN[table];
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols
    .filter((c) => c !== pk)
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  // Last-write-wins: only overwrite when incoming updated_at is newer.
  return `
    INSERT INTO ${table} (${cols.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(${pk}) DO UPDATE SET ${updates}
    WHERE excluded.${updatedAt} > ${table}.${updatedAt}
  `;
}

async function applyPush(
  db: D1Database,
  table: TableName,
  rows: Row[],
): Promise<void> {
  if (rows.length === 0) return;
  const sql = buildUpsertSql(table);
  const cols = COLUMNS[table];
  const stmt = db.prepare(sql);
  const batched = rows.map((row) => {
    if (table === 'meal_items' && !('meal_updated_at' in row)) {
      // Client-side meal_items don't carry meal_updated_at; the meal sync
      // layer fills it in before sending. Default to "now" if missing.
      row.meal_updated_at = new Date().toISOString();
    }
    return stmt.bind(...cols.map((c) => normaliseValue(row[c])));
  });
  await db.batch(batched);
}

async function pullSince(
  db: D1Database,
  table: TableName,
  since: string,
): Promise<{ rows: Row[]; until: string }> {
  const updatedAt = UPDATED_AT_COLUMN[table];
  const cols = COLUMNS[table];
  const sql = `SELECT ${cols.join(', ')} FROM ${table} WHERE ${updatedAt} > ? ORDER BY ${updatedAt} ASC`;
  const result = await db.prepare(sql).bind(since).all<Row>();
  const rows = result.results ?? [];
  const until = rows.length
    ? (rows[rows.length - 1][updatedAt] as string)
    : since;
  return { rows, until };
}

export async function handleSync(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as SyncRequest;
  const since = body.since ?? {};
  const push = body.push ?? {};

  // Apply pushes first so the same client's writes are reflected in the pull.
  for (const table of TABLES) {
    const rows = push[table];
    if (rows && Array.isArray(rows)) {
      await applyPush(env.DB, table, rows);
    }
  }

  // Then collect pulls.
  const pull: Partial<Record<TableName, Row[]>> = {};
  const until: Partial<Record<TableName, string>> = {};
  for (const table of TABLES) {
    const cursor = since[table] ?? EPOCH;
    const { rows, until: nextCursor } = await pullSince(env.DB, table, cursor);
    pull[table] = rows;
    until[table] = nextCursor;
  }

  return new Response(JSON.stringify({ pull, until }), {
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
