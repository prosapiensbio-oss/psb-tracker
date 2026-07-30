-- VZAS — the financial module. Additive only; nothing here touches the existing
-- Tracker tables. Every table is prefixed vzas_.
--
-- Design rules from the brief that the schema has to enforce:
--   * Payments are APPEND-ONLY facts. A reclassification never rewrites history —
--     it writes a new vzas_audit row and updates the current category in place.
--   * Aggregates (P&L totals, cumulative debt) are NEVER stored. They are always
--     recomputed from these rows, so a wrong number can't get baked in.
--   * A month can be locked; changing anything inside a locked month requires an
--     explicit unlock, which is itself logged.

-- One row per bank transaction (or manual cash / debt entry).
CREATE TABLE IF NOT EXISTS vzas_payments (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,          -- ISO date (YYYY-MM-DD)
  month         TEXT NOT NULL,          -- YYYY-MM, denormalised for fast grouping
  amount_czk    REAL NOT NULL,          -- negative = expense, positive = income
  counterparty  TEXT,                   -- protiúčet, e.g. "2325740014/3030"
  description   TEXT,                   -- merged Zpráva + Poznámka
  merchant      TEXT,                   -- extracted from "Nákup: MERCHANT, ..."
  vs            TEXT,                   -- variabilný symbol (1851 = card payment)
  source        TEXT NOT NULL,          -- 'fio' | 'manual'
  -- classification (current state; history lives in vzas_audit)
  category      TEXT,                   -- e.g. 'fixne.apps.ptminder'
  status        TEXT NOT NULL           -- 'pending' | 'confirmed' | 'ignored'
                  DEFAULT 'pending',
  confidence    REAL,                   -- 0..1 from rule/AI, null once confirmed by hand
  classified_by TEXT,                   -- 'rule' | 'ai' | 'manual'
  confirmed_by  TEXT,                   -- Jerry | Terezka | Filip
  confirmed_at  TEXT,
  note          TEXT,
  dedup_key     TEXT UNIQUE,            -- date|amount|counterparty|description
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vzas_payments_month ON vzas_payments (month);
CREATE INDEX IF NOT EXISTS idx_vzas_payments_status ON vzas_payments (status);

-- A payment can be split across categories. When rows exist here for a payment,
-- they replace its single `category` (their sum must equal the payment amount).
CREATE TABLE IF NOT EXISTS vzas_payment_splits (
  id         TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  category   TEXT NOT NULL,
  amount_czk REAL NOT NULL,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_vzas_splits_payment ON vzas_payment_splits (payment_id);

-- Learned classification rules. Matching is counterparty + text pattern, never
-- counterparty alone: the same account receives rent, salary and salina.
CREATE TABLE IF NOT EXISTS vzas_rules (
  id            TEXT PRIMARY KEY,
  counterparty  TEXT,                   -- optional exact match
  merchant      TEXT,                   -- optional exact match
  text_pattern  TEXT,                   -- optional substring/pattern on description
  category      TEXT NOT NULL,
  priority      INTEGER NOT NULL DEFAULT 100,  -- lower wins; counterparty+text = strongest
  hit_count     INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT
);

-- Append-only audit trail: every classification change and every unlock.
CREATE TABLE IF NOT EXISTS vzas_audit (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  actor       TEXT,                     -- Jerry | Terezka | Filip
  action      TEXT NOT NULL,            -- 'classify' | 'reclassify' | 'ignore' | 'split' | 'lock' | 'unlock' | 'manual_add'
  payment_id  TEXT,
  month       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_vzas_audit_payment ON vzas_audit (payment_id);
CREATE INDEX IF NOT EXISTS idx_vzas_audit_month ON vzas_audit (month);

-- Month close-out. Absence of a row = open month.
CREATE TABLE IF NOT EXISTS vzas_periods (
  month        TEXT PRIMARY KEY,        -- YYYY-MM
  locked       INTEGER NOT NULL DEFAULT 0,
  locked_by    TEXT,
  locked_at    TEXT,
  -- reconciliation: statement total vs sum of classified payments
  stmt_total   REAL,
  note         TEXT
);

-- Salary model parameters with validity, so a rate change doesn't rewrite history.
CREATE TABLE IF NOT EXISTS vzas_salary_params (
  id            TEXT PRIMARY KEY,
  person        TEXT NOT NULL,          -- 'jerry' | 'terezka'
  valid_from    TEXT NOT NULL,          -- YYYY-MM inclusive
  valid_to      TEXT,                   -- YYYY-MM inclusive, null = open ended
  fix_czk       REAL NOT NULL,
  hours_threshold REAL NOT NULL,
  hourly_rate   REAL NOT NULL,
  created_at    TEXT NOT NULL
);

-- Opening balances and other one-off constants (debt at start of tracking).
CREATE TABLE IF NOT EXISTS vzas_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT
);
