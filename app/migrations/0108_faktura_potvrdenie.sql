-- Potvrdený doklad zmizne z uzávierky (Jerry, 10. 10. 2026).
--
-- „Ja chcem mať potvrdenie a tým, že to potvrdím, sa to zapíše a schová, aby
-- som mal uzávierku pekne čistú — podobne ako zápisy z účtu."
--
-- Kategórie sa zapisujú hneď pri kliku a tak to zostáva; potvrdenie nie je
-- o zápise, ale o tom, že doklad je VYBAVENÝ a nemá zaberať miesto. Preto
-- stačí časová pečiatka a kto ju dal — dá sa aj vrátiť.
ALTER TABLE faktura_polozky ADD COLUMN potvrdene_at TEXT;
ALTER TABLE faktura_polozky ADD COLUMN potvrdil TEXT;
CREATE INDEX IF NOT EXISTS faktura_polozky_potvrdene ON faktura_polozky(potvrdene_at);
