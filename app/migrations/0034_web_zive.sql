-- Stránky z GA4 a zariadenia zo Search Console.
--
-- Do 13. 8. boli obidve v kóde napísané natvrdo: rebríček článkov aj podiel
-- mobilu boli snímka z jari 2025, ktorú import nikdy neprepísal. Vyzerali živo
-- a neboli. Odteraz ich plní sťahovanie z API rovnako ako zvyšok.
--
-- Obidve sú SNÍMKA za obdobie, nie časový rad — preto nemajú mesiac a nový
-- sťah ich prepíše celé. Priemerná pozícia ani podiel zariadení sa cez dve
-- obdobia sčítať nedajú.
CREATE TABLE IF NOT EXISTS ga4_strany (
  url        TEXT PRIMARY KEY,
  zobrazenia INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gsc_zariadenia (
  zariadenie TEXT PRIMARY KEY,   -- Mobil | Stolný počítač | Tablet
  kliky      INTEGER NOT NULL DEFAULT 0,
  zobrazenia INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
