-- KARTA EMAIL VO WORKSPACE (Jerry, 12. 11. 2026) — schránka info@prosapiens.cz.
--
-- Kokpit si pamätá LEN hlavičky (kto, kedy, predmet) a stav práce; obsah
-- mailu sa načíta zo schránky až pri otvorení a do databázy nejde (Jerry
-- súhlasil: „nech si pamätá“ zoznam, celé maily nie). Výnimka je to, čo sme
-- odpísali my (`email_odoslane`) — je to náš text a konverzácia bez neho nedáva
-- zmysel.
--
-- id = "<UIDVALIDITY>:<UID>" — UID platí len v rámci jednej platnosti schránky.
CREATE TABLE IF NOT EXISTS email_spravy (
  id TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  validity TEXT NOT NULL,
  od_meno TEXT,
  od_mail TEXT,
  odpovedat_mail TEXT,
  komu TEXT,
  predmet TEXT,
  datum TEXT,
  -- klient | novy | prevadzka | ostatne
  kategoria TEXT NOT NULL DEFAULT 'ostatne',
  klient TEXT,
  dovod TEXT,
  -- nove | precitane | vybavene
  stav TEXT NOT NULL DEFAULT 'nove',
  precitane_at TEXT,
  vybavene_at TEXT,
  vybavil TEXT,
  odpovedane_at TEXT,
  nacitane_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_spravy_stav ON email_spravy (stav, datum);
CREATE INDEX IF NOT EXISTS email_spravy_od ON email_spravy (od_mail);

CREATE TABLE IF NOT EXISTS email_odoslane (
  id TEXT PRIMARY KEY,
  sprava_id TEXT,
  komu TEXT NOT NULL,
  klient TEXT,
  predmet TEXT,
  text TEXT,
  kto TEXT,
  kedy TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_odoslane_komu ON email_odoslane (komu);
