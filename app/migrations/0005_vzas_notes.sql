-- Monthly commentary. Numbers say what happened; these say why.
-- One row per month; `answers` holds the guided questions as JSON so the set of
-- questions can change later without a migration.
CREATE TABLE IF NOT EXISTS vzas_month_notes (
  month      TEXT PRIMARY KEY,   -- YYYY-MM
  note       TEXT,               -- free-form commentary
  answers    TEXT,               -- JSON: { "<question id>": "<answer>" }
  updated_by TEXT,
  updated_at TEXT
);
