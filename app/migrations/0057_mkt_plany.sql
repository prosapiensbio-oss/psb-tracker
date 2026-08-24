-- Marketingový plán — obal, ktorý spája cieľ, obdobie, metriky, obsah a rozpočet.
--
-- PREČO ĎALŠIA TABUĽKA, KEĎ CIELE UŽ EXISTUJÚ
--
-- V appke už sú: ciele (vzas_settings.ciele), KPI s cieľovými hodnotami,
-- kampane s rozpočtom, mapa cyklu s obsahom a závery Jarvisa. Chýbala vec,
-- ktorá ich drží POKOPE NA OBDOBIE: „od septembra do decembra chceme X,
-- meriame to Y, robíme pre to Z a stojí to W". Bez toho sa dá odpovedať
-- na „ako nám ide", ale nie na „ide nám to podľa plánu".
--
-- Metriky sa NEZAKLADAJÚ znova — plán si vyberá z tých, ktoré appka už
-- počíta (dopyty, konverzia, cena za dopyt, úvodné). Vlastná definícia
-- metriky by znamenala dve čísla o tej istej veci.
CREATE TABLE IF NOT EXISTS mkt_plany (
  id           TEXT PRIMARY KEY,
  nazov        TEXT NOT NULL DEFAULT '',
  od           TEXT NOT NULL DEFAULT '',   -- RRRR-MM vrátane
  do_          TEXT NOT NULL DEFAULT '',   -- RRRR-MM vrátane
  ciel         TEXT NOT NULL DEFAULT '',   -- čo chceme dosiahnuť
  preco        TEXT NOT NULL DEFAULT '',   -- prečo práve toto
  metriky      TEXT NOT NULL DEFAULT '',   -- JSON [{kluc, cielova}]
  pristup      TEXT NOT NULL DEFAULT '',   -- čo pre to urobíme a prečo taký obsah
  rozpocet     INTEGER NOT NULL DEFAULT 0, -- na reklamu za celé obdobie, Kč
  stav         TEXT NOT NULL DEFAULT 'navrh', -- navrh | bezi | vyhodnoteny
  vyhodnotenie TEXT NOT NULL DEFAULT '',   -- ako to dopadlo, dopĺňa sa na konci
  autor        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT ''
);

-- Obsahový slot patrí do plánu. Prázdne = mimo plánu, čo je bežný stav.
ALTER TABLE mkt_napady ADD COLUMN plan_id TEXT DEFAULT '';
