-- Rýchlosť stránok z PageSpeed Insights.
--
-- PREČO SA TO MERIA A ČO Z TOHO PLYNIE
--
-- Kokpit vie, koľkokrát Google stránku ukázal, koľko ľudí kliklo a čo je na
-- stránke napísané. Nevie, či človek po kliknutí niečo uvidel skôr, než mu
-- došla trpezlivosť. Je to jediná vec z technického SEO, ktorá sa nedá
-- spočítať z textu — a WordPress s témou a pluginmi je presne ten prípad,
-- kde sa prejaví.
--
-- PREČO MOBIL A POČÍTAČ ZVLÁŠŤ
--
-- Sú to dve rôzne merania a spravidla dve rôzne čísla: Google testuje mobil
-- na simulovanom pomalom pripojení, počítač na rýchlom. Zlúčiť ich do jedného
-- riadku by znamenalo priemer dvoch nesúvisiacich vecí. Rozhoduje mobil —
-- indexuje sa podľa neho a chodí z neho väčšina ľudí.
--
-- PREČO SA UKLADÁ HISTÓRIA A NIE POSLEDNÝ STAV
--
-- Jediné, čo pri rýchlosti naozaj zaujíma, je či sa niečo zhoršilo po zmene
-- šablóny alebo pluginu. Jedna momentka to nepovie.

CREATE TABLE IF NOT EXISTS web_rychlost (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT NOT NULL,
  strategia     TEXT NOT NULL,             -- 'mobile' | 'desktop'
  merane_at     TEXT NOT NULL,

  vykon         INTEGER,                   -- 0–100, Lighthouse Performance
  seo           INTEGER,                   -- 0–100
  pristupnost   INTEGER,                   -- 0–100
  postupy       INTEGER,                   -- 0–100, Best Practices

  lcp_ms        INTEGER,                   -- kedy sa objaví najväčší prvok; nad 2500 ms je zle
  cls           REAL,                      -- ako veľmi obsah poskakuje; nad 0,1 je zle
  tbt_ms        INTEGER,                   -- ako dlho stránka nereaguje na klik
  fcp_ms        INTEGER,                   -- prvá farba na obrazovke

  prilezitosti  TEXT NOT NULL DEFAULT '',  -- JSON: [{nazov, usetriMs}] z Lighthouse
  chyba         TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_web_rychlost_url ON web_rychlost (url, strategia, merane_at);
