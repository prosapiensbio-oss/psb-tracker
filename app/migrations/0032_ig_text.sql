-- Text príspevku a jeho zaradenie.
--
-- Graph API vracia `caption` a doteraz sa zahadzoval — ukladali sa len čísla.
-- Bez textu sa nedá povedať, ČÍM ten príspevok začínal, a analýza obsahu
-- v Marketingu preto stála na 114 ručne zatriedených kusoch z jari, ktoré sa
-- samy neaktualizujú.
--
-- `kategoria` je zaradenie podľa hooku (lib/psb/hook.ts). Ukladá sa vypočítané,
-- nie počítané pri každom pohľade: pravidlá sa časom zmenia a bude sa dať
-- povedať, čo appka tvrdila vtedy — a hlavne sa dá ručne prepísať, keď sa
-- pomýli.
ALTER TABLE ig_prispevky ADD COLUMN text TEXT NOT NULL DEFAULT '';
ALTER TABLE ig_prispevky ADD COLUMN kategoria TEXT NOT NULL DEFAULT '';
