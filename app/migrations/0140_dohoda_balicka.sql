-- Dočasná dohoda o balíčku pri klientovi (Jerry, 15. 11. 2026, Eva Doležalová:
-- „bude platiť tieto 2 mesiace len 4 h za 4 660 Kč, potom pokračujeme ďalej").
-- JSON { hodiny, cena, do, poznamka }. Automat podľa nej zakladá balíčky, ktoré
-- začnú najneskôr v deň `do`; potom sa vráti na cenník sám.
ALTER TABLE client_overrides ADD COLUMN dohoda_balicka TEXT;
