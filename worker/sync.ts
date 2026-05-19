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
  'fitbit_tokens',
  'pet',
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
    'goal_weight_kg',
    'eat_back_burned',
    'weekly_budget_enabled',
    'week_start_day',
    'weekly_budget_floor',
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
    'usda_data_type',
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
  meals: [
    'id',
    'user_id',
    'name',
    'notes',
    'servings',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
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
    'needs_profile',
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
  fitbit_tokens: [
    'user_id',
    'access_token',
    'refresh_token',
    'expires_at',
    'scope',
    'fitbit_user_id',
    'created_at',
    'updated_at',
  ],
  pet: [
    'user_id',
    'name',
    'breed',
    'coat',
    'wellbeing',
    'wellbeing_evaluated_date',
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
  fitbit_tokens: 'user_id',
  pet: 'user_id',
};

const UPDATED_AT_COLUMN: Record<TableName, string> = {
  profiles: 'updated_at',
  foods: 'updated_at',
  meals: 'updated_at',
  meal_items: 'meal_updated_at',
  diary_entries: 'updated_at',
  exercise_entries: 'updated_at',
  weight_log: 'updated_at',
  fitbit_tokens: 'updated_at',
  pet: 'updated_at',
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

/** Build (but don't run) the upsert statements for one table's pushed rows.
 *  handleSync collects these across all tables into a single atomic batch. */
function buildPushStatements(
  db: D1Database,
  table: TableName,
  rows: Row[],
): D1PreparedStatement[] {
  if (rows.length === 0) return [];
  const sql = buildUpsertSql(table);
  const cols = COLUMNS[table];
  const stmt = db.prepare(sql);
  return rows.map((row) => {
    if (table === 'meal_items' && !('meal_updated_at' in row)) {
      // Client meal_items don't carry meal_updated_at; the meal sync layer
      // fills it in before sending. Default to "now" if missing.
      row.meal_updated_at = new Date().toISOString();
    }
    return stmt.bind(...cols.map((c) => normaliseValue(row[c])));
  });
}

const PULL_PAGE = 2000;
const PULL_HARD_CAP = 100_000;

/** Pull every row with updated_at > since, paging within this call so a
 *  truncated result page can never advance the cursor past unpulled rows.
 *  Scoped to `userId`: meal_items have no user_id of their own, so they're
 *  scoped through their parent meal. */
async function pullSince(
  db: D1Database,
  table: TableName,
  since: string,
  userId: string,
): Promise<{ rows: Row[]; until: string }> {
  const updatedAt = UPDATED_AT_COLUMN[table];
  const cols = COLUMNS[table];
  const sql =
    table === 'meal_items'
      ? `SELECT ${cols.join(', ')} FROM meal_items WHERE ${updatedAt} > ? AND meal_id IN (SELECT id FROM meals WHERE user_id = ?) ORDER BY ${updatedAt} ASC LIMIT ${PULL_PAGE}`
      : `SELECT ${cols.join(', ')} FROM ${table} WHERE user_id = ? AND ${updatedAt} > ? ORDER BY ${updatedAt} ASC LIMIT ${PULL_PAGE}`;
  const all: Row[] = [];
  let cursor = since;
  for (;;) {
    const stmt = db.prepare(sql);
    const bound =
      table === 'meal_items'
        ? stmt.bind(cursor, userId)
        : stmt.bind(userId, cursor);
    const result = await bound.all<Row>();
    const page = result.results ?? [];
    all.push(...page);
    if (page.length < PULL_PAGE || all.length >= PULL_HARD_CAP) break;
    cursor = page[page.length - 1][updatedAt] as string;
  }
  const until = all.length
    ? (all[all.length - 1][updatedAt] as string)
    : since;
  return { rows: all, until };
}

export async function handleSync(
  req: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const body = (await req.json()) as SyncRequest;
  const since = body.since ?? {};
  const push = body.push ?? {};

  // Apply every pushed row across all tables in ONE atomic D1 batch, so a
  // mid-sync failure can't leave a partial apply. Pushes go in before the
  // pulls so the client's own writes round-trip back consistently. Every
  // pushed row's user_id is forced to the caller's account id — a client
  // can only ever write into its own dataset.
  const pushStatements: D1PreparedStatement[] = [];
  for (const table of TABLES) {
    if (table === 'meal_items') continue; // handled below with cleanup
    const rows = push[table];
    if (rows && Array.isArray(rows)) {
      const scoped = rows.map((r) => ({ ...r, user_id: userId }));
      pushStatements.push(...buildPushStatements(env.DB, table, scoped));
    }
  }
  // meal_items are a child collection: for every pushed meal, delete its
  // existing server items first, then insert the pushed set. A plain
  // upsert would leave removed ingredients orphaned and let an edited
  // meal accumulate every item it ever had. The delete is scoped to the
  // caller's meals so it can't touch another account's items.
  const pushedMeals = push.meals;
  if (Array.isArray(pushedMeals) && pushedMeals.length > 0) {
    const del = env.DB.prepare(
      'DELETE FROM meal_items WHERE meal_id = ? AND meal_id IN (SELECT id FROM meals WHERE user_id = ?)',
    );
    for (const m of pushedMeals) {
      const id = (m as Row).id;
      if (typeof id === 'string') pushStatements.push(del.bind(id, userId));
    }
  }
  const pushedItems = push.meal_items;
  if (Array.isArray(pushedItems) && pushedItems.length > 0) {
    pushStatements.push(
      ...buildPushStatements(env.DB, 'meal_items', pushedItems),
    );
  }
  if (pushStatements.length > 0) await env.DB.batch(pushStatements);

  // Then collect pulls.
  const pull: Partial<Record<TableName, Row[]>> = {};
  const until: Partial<Record<TableName, string>> = {};
  for (const table of TABLES) {
    const cursor = since[table] ?? EPOCH;
    const { rows, until: nextCursor } = await pullSince(
      env.DB,
      table,
      cursor,
      userId,
    );
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
