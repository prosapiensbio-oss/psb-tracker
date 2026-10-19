-- KLIENTI Z CLIENT LIST PTMINDERA (Jerry, 19. 10. 2026: „je tam viacero
-- klientov, ktorí sú starší ako r. 2025, napr. dátum prvého tréningu").
-- Kokpit má sedenia od 3. 1. 2025; odkedy je človek klientom, vie len
-- PTminder (registrácia, vytvorenie). Zrkadlo exportu, jeden riadok na meno,
-- import ho prepíše — nič sa z neho nepočíta okrem začiatku spolupráce.
CREATE TABLE IF NOT EXISTS ptminder_klienti (
  meno         TEXT PRIMARY KEY,
  email        TEXT,
  telefon      TEXT,
  stav         TEXT,
  trener       TEXT,
  narodeniny   TEXT,
  vytvoreny    TEXT,
  registracia  TEXT,
  neaktivny_od TEXT,
  importovane  TEXT NOT NULL
);
