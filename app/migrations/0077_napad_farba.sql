-- Vlastná farba bubliny v myšlienkovej mape.
--
-- Jerry, 25. 9. 2026: „daj mi možnosť dávať farby tým bublinám."
--
-- Prázdne = bublina si farbu berie z vetvy, v ktorej visí (to je predvolený
-- stav). Vyplnené je ručné rozhodnutie a prebíja ju — rovnako ako pri
-- pozícii. Ukladá sa NÁZOV z krátkeho zoznamu (lib/psb/mapaNapadov.ts),
-- nie hex: zoznam sa dá zmeniť na jednom mieste a do stĺpca sa nedá dostať
-- ľubovoľný reťazec z formulára.
ALTER TABLE mkt_napady ADD COLUMN farba TEXT NOT NULL DEFAULT '';
