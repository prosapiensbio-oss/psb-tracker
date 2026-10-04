-- História balíčkov a členstiev z PTmindera (Jerry, 4. 10. 2026).
--
-- „Neriaď sa podľa názvu, ale podľa hodín z PTmindera." Lukáš Hanus mal
-- v júli členstvo „OFF - 6h S viazanostou" s ÔSMIMI hodinami (8 per month);
-- appka ho poznala len z knihy predajov (`services`), kde je jediný údaj
-- názov, a počítala šesť. Z toho vznikol vymyslený deficit −2, ktorý sa
-- valil cez august až do septembra a v zozname svietilo −3 namiesto −1.
--
-- Report „Packages & Memberships" vie viac, ale `packages` drží len SNÍMKU
-- stavu Active a import ju po klientoch nahrádza. Stav Finished (553 balíčkov
-- a 634 členstiev) preto žije tu, vedľa — ako zrkadlo, nie ako náhrada.
-- Appka z neho berie skutočné hodiny a koniec platnosti minulých období.
CREATE TABLE IF NOT EXISTS ptminder_historia (
  id TEXT PRIMARY KEY,
  klient TEXT NOT NULL,
  nazov TEXT NOT NULL,
  druh TEXT NOT NULL,           -- membership | package
  stav TEXT,                    -- active | expired (stĺpec Status v exporte)
  hodiny INTEGER,               -- membership: N z „N per month"; package: celkom z „X left from N"
  zostatok INTEGER,             -- package: X z „X left from N"
  od TEXT,                      -- začiatok obdobia (membership)
  do TEXT,                      -- koniec obdobia (membership)
  pridane TEXT,                 -- Added
  platba REAL,
  dedup_key TEXT NOT NULL UNIQUE,
  importovane TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ptminder_historia_klient ON ptminder_historia (klient);
