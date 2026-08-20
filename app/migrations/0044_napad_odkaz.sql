-- Kruh nápad → príspevok sa uzatvára odkazom.
--
-- PREČO
--
-- Nápad sa dá označiť ako „použitý", ale appka nevie, ČO z neho vzniklo.
-- Bez toho sa nikdy nezistí, či témy zachytené pri tréningu fungujú lepšie
-- než témy vymyslené za stolom — a to je jediný dôvod, prečo sa nápady
-- vôbec zapisujú. Jerry, 18. 8. 2026: „uzavrieť kruh."
--
-- Adresa, nie cudzí kľúč: príspevok môže skončiť na Instagrame, na webe
-- alebo v maili a appka ich drží v troch rôznych tabuľkách. URL je jediné,
-- čo majú spoločné — a dá sa na ňu kliknúť.
--
-- `pouzite_at` je deň, keď to vyšlo. Bez neho sa nedá povedať, za ako dlho
-- sa nápad premení na obsah; to je vlastná otázka a odpoveď na ňu rozhoduje,
-- či má zmysel zbierať ich do zásoby.
ALTER TABLE mkt_napady ADD COLUMN odkaz TEXT NOT NULL DEFAULT '';
ALTER TABLE mkt_napady ADD COLUMN pouzite_at TEXT NOT NULL DEFAULT '';
