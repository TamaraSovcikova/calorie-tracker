-- D1 (SQLite) schema. Mirrors the Dexie tables 1:1 so rows round-trip
-- through the sync endpoint without any field transforms beyond JSON-
-- stringifying the array/object columns.
--
-- All boolean fields are 0/1 INTEGER per SQLite convention.
-- All timestamps are ISO 8601 strings (TEXT).
-- All JSON columns (custom_units) are TEXT containing JSON.
-- "deleted_at" doubles as soft-delete tombstone - sync propagates it.

CREATE TABLE IF NOT EXISTS profiles (
  user_id           TEXT PRIMARY KEY,
  name              TEXT,
  sex               TEXT,
  dob               TEXT,
  height_cm         REAL,
  weight_kg         REAL,
  activity_level    TEXT,
  kcal_target       REAL    NOT NULL,
  protein_g         REAL    NOT NULL,
  carbs_g           REAL    NOT NULL,
  fat_g             REAL    NOT NULL,
  primary_macro     TEXT    NOT NULL,
  goal_weight_kg    REAL,
  eat_back_burned   INTEGER NOT NULL,
  weekly_budget_enabled INTEGER,  -- NULL = off (pre-feature rows)
  budget_mode           TEXT,     -- 'off'|'warn'|'adjust'; NULL = read the boolean above
  week_start_day        INTEGER,  -- 0=Sun..6=Sat; NULL = Monday
  weekly_budget_floor   INTEGER,  -- NULL = off (legacy; superseded by budget_max_daily_trim)
  budget_carryover_start TEXT,    -- YYYY-MM-DD; NULL = carry-over off
  budget_max_daily_trim REAL,     -- kcal; NULL/0 = no limit on the daily trim
  budget_warn_catchup   REAL,     -- kcal/day taken off the target in 'warn' mode while over; NULL/0 = off
  untracked_dates       TEXT,     -- JSON array of YYYY-MM-DD; NULL = none
  budget_period         TEXT,     -- 'week'|'month'; NULL = week
  budget_carryover_enabled INTEGER, -- legacy on/off; superseded by budget_carryover_start
  budget_carryover_cap  REAL,     -- kcal; NULL/0 = uncapped carry-over
  diet_pauses           TEXT,     -- JSON [{id,start,end?,kcal,note?}]; NULL = none
  custom_meal_categories TEXT,    -- JSON array of lowercase tokens; NULL = none
  units             TEXT    NOT NULL,
  theme             TEXT    NOT NULL,
  plan              TEXT    NOT NULL,
  fitbit_connected  INTEGER NOT NULL,
  onboarded         INTEGER NOT NULL,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);

-- Migration for databases created before the weekly-budget columns. Run
-- once on an existing D1; "duplicate column" on re-run is expected/benign.
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE profiles ADD COLUMN weekly_budget_enabled INTEGER"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE profiles ADD COLUMN week_start_day INTEGER"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE profiles ADD COLUMN weekly_budget_floor INTEGER"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE profiles ADD COLUMN untracked_dates TEXT"
--
-- Budget-mode rework (mode picker, dated carry-over window, daily trim cap):
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE profiles ADD COLUMN budget_mode TEXT"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE profiles ADD COLUMN budget_carryover_start TEXT"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE profiles ADD COLUMN budget_max_daily_trim REAL"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE profiles ADD COLUMN budget_warn_catchup REAL"
--
-- Diet pause (dated maintenance windows; the daily goal becomes a function
-- of the date rather than a constant):
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE profiles ADD COLUMN diet_pauses TEXT"

-- Calorie reservations: room set aside for one day, funded by trimming the
-- goal of the days around it. The funding window is derived at read time
-- from date + fund_mode + spread_days + created_date, never stored.
CREATE TABLE IF NOT EXISTS reservations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  date          TEXT NOT NULL,  -- the day being funded, YYYY-MM-DD
  kcal          REAL NOT NULL,
  label         TEXT NOT NULL,
  fund_mode     TEXT NOT NULL,  -- 'before' | 'after' | 'split'
  spread_days   INTEGER NOT NULL,
  created_date  TEXT NOT NULL,  -- local date; earliest day it may fund from
  food_id       TEXT,
  meal_id       TEXT,
  qty           REAL,
  unit          TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX IF NOT EXISTS reservations_updated_at ON reservations (updated_at);
CREATE INDEX IF NOT EXISTS reservations_user_date ON reservations (user_id, date);

CREATE TABLE IF NOT EXISTS foods (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  source          TEXT NOT NULL,
  usda_data_type  TEXT,  -- 'foundation' | 'sr_legacy' | 'survey' | 'branded' for source='usda'
  off_barcode     TEXT,
  name            TEXT NOT NULL,
  brand           TEXT,
  kcal_100        REAL NOT NULL,
  protein_100     REAL NOT NULL,
  carbs_100       REAL NOT NULL,
  fat_100         REAL NOT NULL,
  fiber_100       REAL,           -- g per 100g
  sugar_100       REAL,           -- g per 100g
  sodium_100      REAL,           -- mg per 100g
  serving_g       REAL,
  custom_units    TEXT NOT NULL,  -- JSON [{label, grams}]
  favorite        INTEGER,        -- 1 = user-starred; NULL = not (pre-feature)
  image_url       TEXT,           -- product thumbnail URL, when available
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS foods_updated_at ON foods (updated_at);

-- Migrations for databases created before these foods columns existed.
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE foods ADD COLUMN favorite INTEGER"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE foods ADD COLUMN image_url TEXT"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE foods ADD COLUMN fiber_100 REAL"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE foods ADD COLUMN sugar_100 REAL"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE foods ADD COLUMN sodium_100 REAL"

CREATE TABLE IF NOT EXISTS meals (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  notes       TEXT,
  servings    INTEGER,  -- portions the batch makes; NULL = 1 (pre-feature rows)
  image_url   TEXT,     -- user meal photo as a downscaled JPEG data URL; NULL = none
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS meals_updated_at ON meals (updated_at);

-- Migration for databases created before the `servings` column existed.
-- Safe to run once on an existing D1; errors with "duplicate column" if
-- re-run (the column already exists) - that error is expected and benign.
--   wrangler d1 execute <db> --remote \
--     --command "ALTER TABLE meals ADD COLUMN servings INTEGER"
-- Migration for databases created before the `image_url` column existed:
--   wrangler d1 execute <db> --remote \
--     --command "ALTER TABLE meals ADD COLUMN image_url TEXT"

CREATE TABLE IF NOT EXISTS meal_items (
  id        TEXT PRIMARY KEY,
  meal_id   TEXT NOT NULL,
  food_id   TEXT NOT NULL,
  qty       REAL NOT NULL,
  unit      TEXT NOT NULL,
  -- meal_items don't have their own updated_at - they're rewritten as a
  -- batch when the meal is saved. We piggy-back the meal's updated_at by
  -- joining on meal_id at sync time.
  meal_updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meal_items_meal ON meal_items (meal_id);
CREATE INDEX IF NOT EXISTS meal_items_updated_at ON meal_items (meal_updated_at);

CREATE TABLE IF NOT EXISTS diary_entries (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  date                TEXT NOT NULL,
  section             TEXT NOT NULL,
  kind                TEXT NOT NULL,
  food_id             TEXT,
  meal_id             TEXT,
  qty                 REAL NOT NULL,
  unit                TEXT NOT NULL,
  portion_multiplier  REAL,
  kcal                REAL NOT NULL,
  protein             REAL NOT NULL,
  carbs               REAL NOT NULL,
  fat                 REAL NOT NULL,
  fiber               REAL,
  sugar               REAL,
  sodium              REAL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);
CREATE INDEX IF NOT EXISTS diary_entries_date ON diary_entries (date);

-- Migration for databases created before the diary micronutrient columns.
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE diary_entries ADD COLUMN fiber REAL"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE diary_entries ADD COLUMN sugar REAL"
--   wrangler d1 execute <db> --remote --command \
--     "ALTER TABLE diary_entries ADD COLUMN sodium REAL"
CREATE INDEX IF NOT EXISTS diary_entries_updated_at ON diary_entries (updated_at);

CREATE TABLE IF NOT EXISTS exercise_entries (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  date          TEXT NOT NULL,
  source        TEXT NOT NULL,
  name          TEXT NOT NULL,
  duration_min  REAL,
  kcal_burned   REAL NOT NULL,
  needs_profile INTEGER,  -- 1 when a Fitbit row has no calorie estimate
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX IF NOT EXISTS exercise_entries_date ON exercise_entries (date);
CREATE INDEX IF NOT EXISTS exercise_entries_updated_at ON exercise_entries (updated_at);

CREATE TABLE IF NOT EXISTS weight_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  date        TEXT NOT NULL,
  weight_kg   REAL NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS weight_log_user_date ON weight_log (user_id, date);
CREATE INDEX IF NOT EXISTS weight_log_updated_at ON weight_log (updated_at);

CREATE TABLE IF NOT EXISTS pet (
  user_id                   TEXT PRIMARY KEY,
  name                      TEXT    NOT NULL,
  breed                     TEXT,
  coat                      TEXT,
  wellbeing                 REAL    NOT NULL,
  wellbeing_evaluated_date  TEXT    NOT NULL,
  created_at                TEXT    NOT NULL,
  updated_at                TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS pet_updated_at ON pet (updated_at);

-- Per-user fixed-window rate-limit counters for the AI endpoints. Not
-- user data, not synced; old buckets are swept opportunistically.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket      TEXT PRIMARY KEY,  -- "<key>:<window-start-epoch>"
  count       INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL   -- epoch seconds
);

-- Server-side cache of AI-generated food facts. NOT user-scoped and NOT
-- synced - a fact about "kiwi" is generic knowledge shared by everyone,
-- so each food's fact is generated by Workers AI exactly once, ever.
CREATE TABLE IF NOT EXISTS food_facts (
  key         TEXT PRIMARY KEY,  -- normalised (lowercased) food name
  name        TEXT NOT NULL,
  fact        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fitbit_tokens (
  user_id         TEXT PRIMARY KEY,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  scope           TEXT NOT NULL,
  fitbit_user_id  TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fitbit_tokens_updated_at ON fitbit_tokens (updated_at);
