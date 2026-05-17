-- D1 (SQLite) schema. Mirrors the Dexie tables 1:1 so rows round-trip
-- through the sync endpoint without any field transforms beyond JSON-
-- stringifying the array/object columns.
--
-- All boolean fields are 0/1 INTEGER per SQLite convention.
-- All timestamps are ISO 8601 strings (TEXT).
-- All JSON columns (custom_units) are TEXT containing JSON.
-- "deleted_at" doubles as soft-delete tombstone — sync propagates it.

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
  units             TEXT    NOT NULL,
  theme             TEXT    NOT NULL,
  plan              TEXT    NOT NULL,
  fitbit_connected  INTEGER NOT NULL,
  onboarded         INTEGER NOT NULL,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);

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
  serving_g       REAL,
  custom_units    TEXT NOT NULL,  -- JSON [{label, grams}]
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS foods_updated_at ON foods (updated_at);

CREATE TABLE IF NOT EXISTS meals (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS meals_updated_at ON meals (updated_at);

CREATE TABLE IF NOT EXISTS meal_items (
  id        TEXT PRIMARY KEY,
  meal_id   TEXT NOT NULL,
  food_id   TEXT NOT NULL,
  qty       REAL NOT NULL,
  unit      TEXT NOT NULL,
  -- meal_items don't have their own updated_at — they're rewritten as a
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
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);
CREATE INDEX IF NOT EXISTS diary_entries_date ON diary_entries (date);
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
