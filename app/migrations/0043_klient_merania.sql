-- Výsledky klientov — jedno číslo v čase.
--
-- PREČO TO VZNIKLO
--
-- Kokpit meral peniaze, dochádzku a dosah, ale NIKDY nemeral to, čo je
-- vlastne produkt. PSB predáva zmenu pohybu a zbavenie sa bolesti; z appky
-- sa nedalo zistiť, či ľudia, ktorí tu zostali rok, na tom sú lepšie.
-- Jerry, 17. 8. 2026: je to najväčšia diera v celej appke.
--
-- PREČO JEDNO ČÍSLO A NIE FOTKY
--
-- Fotky pred/po sú dôkaz, ale majú dve brány navyše: úložisko (do databázy sa
-- nezmestia) a súhlas klienta plus schválenie na fp.app. Kým sa to nevyrieši,
-- stojí meranie na mieste. Číslo od 0 do 10 nepotrebuje ani jedno — a odpovedá
-- na tú istú otázku: zlepšujú sa ľudia, ktorí u nás zostanú?
--
-- PREČO PRÁVE BOLESŤ
--
-- Je to jediná vec, ktorú klient vie povedať sám, hneď a bez vysvetľovania —
-- a je to zároveň dôvod, prečo prišiel. Stupnica 0–10 (0 = žiadna bolesť,
-- 10 = najhoršia predstaviteľná) je bežný nástroj, ktorý ľudia poznajú
-- z ordinácie, takže sa nemusí učiť.
--
-- PREČO SA NEPREPISUJE
--
-- Rovnako ako denník: každé meranie je vlastný riadok s dátumom. Príbeh „v
-- januári 7, v máji 3" je to, o čo ide; jedno prepisovateľné políčko by ho
-- zmazalo pri prvom zápise.

CREATE TABLE IF NOT EXISTS klient_merania (
  id          TEXT PRIMARY KEY,
  klient      TEXT NOT NULL,
  datum       TEXT NOT NULL,              -- YYYY-MM-DD
  bolest      INTEGER,                    -- 0–10, NULL = nemeralo sa
  poznamka    TEXT NOT NULL DEFAULT '',
  autor       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_merania_klient ON klient_merania (klient, datum);
