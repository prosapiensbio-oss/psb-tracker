-- Text stránok webu.
--
-- PREČO TO TU DOTERAZ NEBOLO A PREČO TO TERAZ TREBA
--
-- Kokpit vedel o webe len čísla: kto prišel (GA4) a na čo hľadal (Search
-- Console). Nevedel, čo na tých stránkach STOJÍ. Preto sa dalo povedať „táto
-- stránka má 15 777 zobrazení a 97 klikov" a nedalo sa povedať, čo s tým —
-- chýbajúca polovica nikdy neboli dáta, ale text.
--
-- Po spojení s `gsc_strany` (rovnaký tvar adresy, plná s lomkou na konci) sa
-- z toho stane veta s akciou: „…a tu je jej titulok, prepíšme ho."
--
-- PREČO TEXT A NIE HTML
--
-- Web je WordPress. Raw HTML je z väčšiny značky, skripty a šablóna; CSS
-- o obsahu nehovorí nič. Do kontextu Jarvisa patrí to, čo číta človek —
-- inak by šum vytlačil Jerryho čísla, ktoré sú cennejšie.

CREATE TABLE IF NOT EXISTS web_stranky (
  url          TEXT PRIMARY KEY,   -- plná adresa vrátane lomky, ako v gsc_strany
  typ          TEXT NOT NULL DEFAULT '',   -- 'stranka' | 'clanok'
  titulok      TEXT NOT NULL DEFAULT '',   -- <title>, teda to, čo vidí človek vo výsledkoch
  meta_popis   TEXT NOT NULL DEFAULT '',   -- meta description, druhý riadok vo výsledkoch
  h1           TEXT NOT NULL DEFAULT '',
  text         TEXT NOT NULL DEFAULT '',   -- čitateľný text, bez značiek
  znakov       INTEGER NOT NULL DEFAULT 0,
  zmenene      TEXT,                       -- lastmod zo sitemapy
  nacitane_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_web_stranky_typ ON web_stranky (typ);
