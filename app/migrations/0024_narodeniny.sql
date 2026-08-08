-- Dátum narodenia klienta.
--
-- PTminder ho v exporte nemá, takže sa dopĺňa ručne — a práve preto je to
-- override, nie stĺpec v `sessions`: import ho nesmie prepísať.
--
-- Ukladá sa ako celý dátum (YYYY-MM-DD), aj keď na pripomienku stačí deň
-- a mesiac. Rok je zadarmo a raz sa zíde: „Lukáš má o týždeň štyridsiatku"
-- je iná správa než „Lukáš má narodeniny".
ALTER TABLE client_overrides ADD COLUMN narodeniny TEXT NOT NULL DEFAULT '';
