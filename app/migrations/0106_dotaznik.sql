-- Anonymný dotazník o ProSapiens (Jerry, 6. 10. 2026 — varianta B; stavané 9. 10.).
--
-- Osobný odkaz je len na to, aby sa dalo odpovedať RAZ. Odpovede ležia
-- v samostatnej tabuľke BEZ tokenu, bez klienta a bez času (len deň) —
-- spojiť odpoveď s človekom sa nedá ani v databáze.
CREATE TABLE IF NOT EXISTS dotaznik_kola (
  id TEXT PRIMARY KEY,
  nazov TEXT NOT NULL,
  created_at TEXT NOT NULL,
  uzavrete_at TEXT
);
CREATE TABLE IF NOT EXISTS dotaznik_odkazy (
  token TEXT PRIMARY KEY,
  kolo TEXT NOT NULL,
  klient TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- Bez času použitia: čas by sa dal spárovať s dňom odpovede.
  pouzity INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kolo, klient)
);
CREATE TABLE IF NOT EXISTS dotaznik_odpovede (
  id TEXT PRIMARY KEY,
  kolo TEXT NOT NULL,
  den TEXT NOT NULL,
  odpovede_json TEXT NOT NULL
);
