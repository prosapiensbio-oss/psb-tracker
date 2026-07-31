-- Enquiries (dopyty) — the top of the funnel PTminder never sees. It only ever
-- records someone once they book an úvodný tréning, so people who write and
-- then go quiet are invisible, and there is no way to tell a marketing problem
-- (few enquiries) from a sales one (enquiries that don't convert).
CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,      -- ISO date the enquiry arrived
  name       TEXT,               -- optional: many IG messages are anonymous
  source     TEXT NOT NULL,      -- referencia | mail | web | google | instagram | ine
  referrer   TEXT,               -- when source = referencia: which existing client sent them
  status     TEXT NOT NULL       -- novy | neodpisal | uvodny | prisiel | klient
               DEFAULT 'novy',
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_date ON leads (date);
