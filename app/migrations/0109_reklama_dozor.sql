-- Dozor nad reklamou (10. 10. 2026) — viď lib/psb/reklamaDozor.ts.
--
-- Kampane z 8. 9. sa mali vyhodnotiť okolo 21. 9. a nepripomenulo to nič.
-- `mkt_kampane` má len mesačné súčty a nevie povedať „koľko odišlo od
-- posledného rozhodnutia" ani „od posledného dopytu". Preto dni a rozhodnutia.

-- Bežiace kampane a čo s nimi nie je v poriadku. Snímka — prepisuje ju
-- denný dozor (/api/meta akcia "dozor"). Riadok `ucet` = reklamný účet.
CREATE TABLE IF NOT EXISTS reklama_dozor (
  kampan_id      TEXT PRIMARY KEY,
  nazov          TEXT NOT NULL DEFAULT '',
  ciel           TEXT NOT NULL DEFAULT '',
  stav           TEXT NOT NULL DEFAULT '',
  zaciatok       TEXT NOT NULL DEFAULT '',
  denny_rozpocet INTEGER,
  sady           TEXT NOT NULL DEFAULT '[]',
  problemy       TEXT NOT NULL DEFAULT '[]',
  updated_at     TEXT NOT NULL
);

-- Výdavok po dňoch — kniha, nie snímka: rozhodnutie aj „bez dopytu" sa
-- počíta od konkrétneho dňa.
CREATE TABLE IF NOT EXISTS reklama_dni (
  kampan_id  TEXT NOT NULL,
  den        TEXT NOT NULL,
  spend      REAL NOT NULL DEFAULT 0,
  kliky      INTEGER NOT NULL DEFAULT 0,
  na_stranke INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kampan_id, den)
);

-- Rozhodnutia z notifikácie: nechať / vypnúť / zmeniť rozpočet. Čísla, na
-- ktorých rozhodnutie stálo, idú s ním — o mesiac sa inak nedá povedať prečo.
CREATE TABLE IF NOT EXISTS reklama_vyhodnotenia (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kampan_id     TEXT NOT NULL,
  kedy          TEXT NOT NULL,
  rozhodnutie   TEXT NOT NULL,
  minute_kc     REAL,
  dopyty        INTEGER,
  dm            INTEGER,
  rozpocet_pred INTEGER,
  rozpocet_po   INTEGER,
  poznamka      TEXT NOT NULL DEFAULT '',
  kto           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_reklama_vyhodnotenia_kampan ON reklama_vyhodnotenia (kampan_id, kedy);
