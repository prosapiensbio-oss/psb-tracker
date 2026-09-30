-- Tri otázky na stupnici 1–10, ktoré si klepne KLIENT SÁM.
--
-- Meranie bolesti Jerry 24. 9. 2026 zrušil a dôvod bol jediný: robota navyše
-- pri každom tréningu. 30. 9. 2026 to otvoril znova z druhej strany — „aby to
-- robil ten klient sám". Tým dôvod padol: appka sa nepýta trénera, pýta sa
-- klienta na stránke, na ktorú aj tak klikne z SMS.
--
-- Tabuľka `klient_merania` z migrácie 0043 zostáva (je prázdna, nič sa
-- neprepisuje) a dostáva dva ďalšie stĺpce a značku, KTO odpovedal. Bez nej
-- by sa po roku nedalo povedať, či číslo povedal klient alebo tréner — a to
-- sú dve rôzne veci.
ALTER TABLE klient_merania ADD COLUMN pohyb INTEGER;
ALTER TABLE klient_merania ADD COLUMN posun INTEGER;
ALTER TABLE klient_merania ADD COLUMN zdroj TEXT NOT NULL DEFAULT 'trener';

-- Jeden zápis na klienta, deň a zdroj: klient si to vie rozmyslieť a klepnúť
-- znova. Oprava má prepísať odpoveď, nie pridať druhú vedľa nej.
CREATE UNIQUE INDEX IF NOT EXISTS idx_merania_den ON klient_merania (klient, datum, zdroj);
