-- Lead magnet nie je dopyt.
--
-- Jerry, 24. 9. 2026: „keď má lead magnet, to nie je úplne dopyt, ktorý
-- potrebujem evidovať — evidujme hlavne tie, ktoré sú o úvodnom."
--
-- Ľudmila Juskovecová si 22. 9. stiahla protokol o myofasciálnom uvoľňovaní.
-- Je to e-mail do zoznamu, nie človek, ktorý sa pýta na tréning — a pritom
-- sedela v dopytoch vedľa Petra Baťu, ktorý napísal, že ho bolí chrbát.
-- Dve rôzne veci v jednom počte skazia každé číslo, ktoré z neho vychádza:
-- cenu za dopyt, konverziu aj lievik.
--
-- 'dopyt'  = pýta sa na úvodný tréning (predvolené, tak to bolo doteraz)
-- 'magnet' = stiahol lead magnet, do počtu dopytov sa NERÁTA
ALTER TABLE leads ADD COLUMN druh TEXT NOT NULL DEFAULT 'dopyt';

-- Jediný existujúci magnet — rozpoznaný podľa poznámky, ktorú píše formulár.
UPDATE leads SET druh = 'magnet' WHERE note LIKE 'LEAD MAGNET%';
