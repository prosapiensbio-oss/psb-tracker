-- ROZROBENÉ A SNÍMKY NA SERVERI (Jerry, 12. 10. 2026: „prečo fotky, ktoré
-- upravím v PC, nie sú potom v iPade… súhlasím, ukladaj to na server").
-- Doteraz boli len v IndexedDB prehliadača. Každý tréner má svoje (kto).
-- Stav editora je ZAŠIFROVANÝ; obrázky sú v R2 zašifrované pod editor/….
CREATE TABLE IF NOT EXISTS editor_navrhy (
  id TEXT PRIMARY KEY,
  kto TEXT NOT NULL,
  klient TEXT,
  stav TEXT NOT NULL,
  ma_nahlad INTEGER NOT NULL DEFAULT 0,
  vytvorene_at TEXT NOT NULL,
  upravene_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS editor_navrhy_kto ON editor_navrhy (kto, upravene_at);

-- Snímky z editora videa (zásobník pre editor fotiek).
CREATE TABLE IF NOT EXISTS editor_snimky (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kto TEXT NOT NULL,
  den TEXT,
  cas REAL,
  zdroj TEXT,
  oznacenie TEXT,
  kluc TEXT NOT NULL,
  vytvorene_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS editor_snimky_kto ON editor_snimky (kto, id);
