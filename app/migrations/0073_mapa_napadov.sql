-- Myšlienková mapa nápadov.
--
-- Jerry, 7. 9. 2026 a znovu 25. 9.: „jednoduchá myšlienková mapa, ktorá by sa
-- potom previedla do textu, ktorý by som mohol s Jarvisom prehodnotiť."
--
-- NIE JE TO DRUHÁ TABUĽKA NÁPADOV. Mapa je POHĽAD na `mkt_napady` — listy
-- stromu sú tie isté riadky, ktoré vidí karta Nápady a ktoré sa plánujú do
-- mesiacov. Druhý zoznam by znamenal dve pravdy o tom, čo sa chystá písať.
--
-- `rodic`  — id nadradeného nápadu; prázdne = visí priamo na vetve
-- `vetva`  — len pri koreňových: uvodny | kniha | nezaradene (lib/psb/mapaNapadov.ts)
-- `poradie`— poradie medzi súrodencami
-- `zbalene`— zbalená vetva sa nekreslí (mapa so štyridsiatimi nápadmi sa inak nečíta)
ALTER TABLE mkt_napady ADD COLUMN rodic TEXT NOT NULL DEFAULT '';
ALTER TABLE mkt_napady ADD COLUMN vetva TEXT NOT NULL DEFAULT '';
ALTER TABLE mkt_napady ADD COLUMN poradie INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_napady ADD COLUMN zbalene INTEGER NOT NULL DEFAULT 0;

-- Doterajšie nápady nikam nepatria, kým ich niekto nezaradí — a to je pravda,
-- nie chýbajúci údaj. Vetva „nezaradene" je v mape plnohodnotná tretia vetva
-- práve preto, aby existovalo miesto, kam nápad padne bez rozhodovania.
UPDATE mkt_napady SET vetva = 'nezaradene' WHERE vetva = '' AND rodic = '';
