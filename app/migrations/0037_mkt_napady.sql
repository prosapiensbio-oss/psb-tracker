-- Marketingové nápady — surové vety, z ktorých sa raz stane obsah.
--
-- PREČO VLASTNÁ TABUĽKA
--
-- Nápad nie je značka do grafu (tá hovorí, čo sa stalo) ani záver z debaty
-- (ten má termín overenia). Je to polotovar: veta, ktorú Jerry zachytí počas
-- tréningu a ktorá o mesiac nikomu nič nepovie, ak sa nezapíše hneď.
--
-- Najcennejší druh je otázka klienta. Je to jazyk, ktorým ľudia o svojom tele
-- naozaj hovoria — a ten sa vymyslieť nedá.
--
-- `stav` nie je životný cyklus úlohy, je to len triedenie: čo ešte čaká, čo sa
-- už použilo a čo sme zavrhli. Zavrhnuté sa NEMAŽE — vedieť, že sa téma už raz
-- zamietla a prečo, je cennejšie než prázdny zoznam.
CREATE TABLE IF NOT EXISTS mkt_napady (
  id         TEXT PRIMARY KEY,
  datum      TEXT NOT NULL,           -- ISO deň, kedy nápad vznikol
  text       TEXT NOT NULL,
  -- odkiaľ sa vzal: otazka_klienta | vlastny | jarvis | ine
  zdroj      TEXT NOT NULL DEFAULT 'vlastny',
  stav       TEXT NOT NULL DEFAULT 'novy',   -- novy | pouzity | zamietnuty
  -- Verdikt: prečo sa použil alebo prečo nie. Píše Jerry aj Jarvis.
  poznamka   TEXT NOT NULL DEFAULT '',
  autor      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mkt_napady_stav ON mkt_napady (stav, datum);
