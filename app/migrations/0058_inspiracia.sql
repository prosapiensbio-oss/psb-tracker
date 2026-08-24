-- Odkaz na cudzí príspevok, ktorý nápad inšpiroval.
--
-- PREČO NIE DO EXISTUJÚCEHO `odkaz`
--
-- Ten drží adresu HOTOVÉHO PSB príspevku a uzatvára kruh nápad → obsah.
-- Cudzí reel je opačný koniec toho istého kruhu: vstup, nie výstup. V jednom
-- stĺpci by sa nedalo rozoznať, či adresa vedie na náš príspevok alebo na
-- cudzí — a pri otázke „fungujú témy z inšpirácie lepšie?" by to bolo jedno
-- a to isté číslo.
ALTER TABLE mkt_napady ADD COLUMN inspiracia TEXT DEFAULT '';
