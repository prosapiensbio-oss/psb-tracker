-- Vlastná evidencia platieb — tretia a posledná tretina odchodu od PTmindera.
--
-- Jerry, 22. 9. 2026: „platby by ťahal z výpisu banky a hotovosť stále zo
-- zošita, tam sa nič nemení."
--
-- `sposob`: 'banka' (riadok z Fio výpisu), 'hotovost' (prepísané zo zošita),
-- 'ine' (barter, BTC — čo sa nezmestí do prvých dvoch).
-- `fio_id` páruje platbu s konkrétnym riadkom výpisu, aby sa opakovaným
-- priradením nezdvojila.
CREATE TABLE IF NOT EXISTS platby (
  id          TEXT PRIMARY KEY,
  klient      TEXT NOT NULL,
  datum       TEXT NOT NULL,
  suma_czk    REAL NOT NULL,
  sposob      TEXT NOT NULL,
  fio_id      TEXT,
  poznamka    TEXT,
  zrusene_at  TEXT,
  created_at  TEXT NOT NULL,
  autor       TEXT
);
CREATE INDEX IF NOT EXISTS platby_klient ON platby (klient);
CREATE INDEX IF NOT EXISTS platby_datum ON platby (datum);
CREATE UNIQUE INDEX IF NOT EXISTS platby_fio ON platby (fio_id) WHERE fio_id IS NOT NULL;

-- Naučené priradenie textu z výpisu ku klientovi.
--
-- Rovnaký nápad ako `kal_mapovanie`: raz potvrdené, odvtedy to appka vie.
-- Vzor je normalizovaná protistrana („petra rupova"), nie celý text platby —
-- ten nesie aj číslo faktúry a mesiac a menil by sa každú platbu.
CREATE TABLE IF NOT EXISTS platba_mapovanie (
  vzor         TEXT PRIMARY KEY,
  klient       TEXT NOT NULL,
  potvrdene_at TEXT NOT NULL
);

-- Riadok výpisu, ktorý platba klienta NIE JE (nájom, vklad do bankomatu,
-- vrátenie). Bez tohto by sa tie isté riadky pýtali donekonečna — to je tá
-- istá lekcia ako pri karte „Nové názvy v kalendári".
CREATE TABLE IF NOT EXISTS platba_nie_klient (
  fio_id      TEXT PRIMARY KEY,
  dovod       TEXT,
  oznacene_at TEXT NOT NULL
);
