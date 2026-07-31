-- Weekly self-report per trainer. Energy is a short-cycle thing: asked monthly
-- it just measures the last week you remember, so it is captured beside the
-- weekly hours it has to be read against, and the monthly view averages it.
-- `data` is JSON: { "<person>_score": "7", "<person>_hours": "12", "<person>_note": "…" }
CREATE TABLE IF NOT EXISTS vzas_week_notes (
  week       TEXT PRIMARY KEY,   -- ISO date of that week's Monday (YYYY-MM-DD)
  data       TEXT,
  updated_at TEXT
);
