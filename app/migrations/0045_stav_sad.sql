-- Stav sady reklám pri kampani.
--
-- 19. 8. 2026: na účte je 37 zo 62 kampaní na úrovni KAMPANE zapnutých,
-- ale nebeží ani jedna — ich sady dobehli. Stĺpec `stav` (stav kampane)
-- teda odpovedá na inú otázku než tú, ktorú si človek nad zoznamom kladie:
-- „beží to?". Doručovanie sa riadi sadami, tak sa ukladajú aj tie.
ALTER TABLE mkt_kampane ADD COLUMN stav_sad TEXT NOT NULL DEFAULT '';
