-- PSB Tracker schema. Additive only (shared live D1). Bound as env.DB.
-- Raw normalized rows from the 4 PTminder CSV reports + manual overrides.

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  date            TEXT NOT NULL,          -- ISO date of the session
  time            TEXT,                   -- start time, e.g. "10:00am"
  client_name     TEXT NOT NULL,
  session_trainer TEXT,                   -- who actually trained (capacity)
  session_name    TEXT,                   -- raw name from CSV
  session_type    TEXT,                   -- OFFLINE / ONLINE / TRUECOACH / UVODNE
  duration_min    INTEGER,                -- 60 or 90
  price_czk       REAL,                   -- CZK0 = free (counts to sessions, not earnings)
  dedup_key       TEXT UNIQUE             -- date|time|client|session_trainer
);

CREATE TABLE IF NOT EXISTS services (
  id                  TEXT PRIMARY KEY,
  date                TEXT NOT NULL,      -- sale date
  client_name         TEXT NOT NULL,
  service_type        TEXT,              -- Package / Membership
  service_description TEXT,
  price_czk           REAL,
  is_6m               INTEGER,           -- 1 if description contains "S viazanostou"
  trainer             TEXT,
  dedup_key           TEXT UNIQUE        -- date|client|description
);

CREATE TABLE IF NOT EXISTS payments (
  id             TEXT PRIMARY KEY,
  date           TEXT NOT NULL,
  client_name    TEXT,
  amount_czk     REAL,
  payment_method TEXT,                   -- bank / cash / other
  dedup_key      TEXT UNIQUE             -- date|client|amount
);

-- Packages is a snapshot report: replaced wholesale on each upload.
CREATE TABLE IF NOT EXISTS packages (
  id                 TEXT PRIMARY KEY,
  client_name        TEXT NOT NULL,
  client_status      TEXT,               -- Active Client / Inactive Client
  package_name       TEXT,
  sessions_remaining INTEGER,
  sessions_total     INTEGER
);

-- Manual, upload-proof overrides keyed by client name. Never overwritten by CSV.
CREATE TABLE IF NOT EXISTS client_overrides (
  name              TEXT PRIMARY KEY,
  status            TEXT,                -- manual status override or NULL (auto)
  special_rate      INTEGER,            -- 1 = special rate
  special_rate_note TEXT,
  trainer_note      TEXT,
  contract_signed   INTEGER,            -- 6M contract checkbox
  primary_trainer   TEXT,               -- manual primary-trainer override
  updated_at        TEXT
);

-- Acknowledged / resolved anomalies (persistent register). key = anomaly id.
CREATE TABLE IF NOT EXISTS anomaly_ack (
  anomaly_key TEXT PRIMARY KEY,
  note        TEXT,
  acked_at    TEXT
);

CREATE TABLE IF NOT EXISTS upload_log (
  id       TEXT PRIMARY KEY,
  date     TEXT,
  filename TEXT,
  type     TEXT,
  added    INTEGER,
  skipped  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(client_name);
CREATE INDEX IF NOT EXISTS idx_sessions_date   ON sessions(date);
CREATE INDEX IF NOT EXISTS idx_services_client ON services(client_name);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_name);
