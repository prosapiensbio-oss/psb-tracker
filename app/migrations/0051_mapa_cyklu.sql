-- Mapa nákupného cyklu — plánovanie obsahu v čase a vo fázach.
--
-- PREČO TO NIE JE NOVÁ TABUĽKA
--
-- Nápad bez mesiaca je zásobník, nápad s mesiacom a fázou je slot v pláne.
-- Je to tá istá vec v dvoch stavoch života, nie dve veci. Druhá tabuľka by
-- znamenala dva zoznamy, ktoré sa rozídu — a Jerry by musel vedieť, do
-- ktorého sa práve pozerá.
--
-- faza: 1 nevie o probléme, 2 tuší problém, 3 hľadá riešenie,
--       4 vyberá dodávateľa, 5 rozhodnutý. 0/NULL = nezaradené.
ALTER TABLE mkt_napady ADD COLUMN faza INTEGER DEFAULT 0;
ALTER TABLE mkt_napady ADD COLUMN planovane_na TEXT DEFAULT '';
ALTER TABLE mkt_napady ADD COLUMN kto TEXT DEFAULT '';
ALTER TABLE mkt_napady ADD COLUMN koncept TEXT DEFAULT '';

-- História: do ktorej fázy padol už zverejnený príspevok.
ALTER TABLE ig_prispevky ADD COLUMN faza INTEGER DEFAULT 0;
