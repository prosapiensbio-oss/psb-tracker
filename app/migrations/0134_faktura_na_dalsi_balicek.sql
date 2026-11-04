-- Faktúra na balíček, ktorý ešte nevznikol (Jerry, 4. 11. 2026, Jan Kral).
-- Balíček vzniká prvým tréningom, faktúra ide von skôr. Kým má
-- na_dalsi_balicek = 1 a balicek_id prázdne, čaká: prvý balíček klienta si ju
-- pri vzniku priradí a založí sa podľa dalsi_nazov a dalsi_hodiny.
ALTER TABLE vydane_faktury ADD COLUMN na_dalsi_balicek INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vydane_faktury ADD COLUMN dalsi_nazov TEXT;
ALTER TABLE vydane_faktury ADD COLUMN dalsi_hodiny REAL;
