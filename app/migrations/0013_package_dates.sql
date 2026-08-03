-- Platnosť balíčka a členstva.
--
-- Export "Packages & Memberships" má v pohľade na členstvá stĺpce, ktoré sme
-- doteraz zahadzovali: kedy bol balíček pridaný a hlavne DO KEDY platí
-- ("30 Jun 2026 - 24 Aug 2026"). Bez nich musel model platnosť hádať z názvu
-- balíčka a z dátumu poslednej platby; s nimi ju netreba hádať vôbec.
--
-- payment_czk je cena, ktorú klient za tento konkrétny balíček zaplatil — nie
-- cenníková. Nesie v sebe jeho zľavy, takže je to lepší odhad ďalšej platby
-- než cenník.
ALTER TABLE packages ADD COLUMN added TEXT NOT NULL DEFAULT '';
ALTER TABLE packages ADD COLUMN valid_from TEXT NOT NULL DEFAULT '';
ALTER TABLE packages ADD COLUMN valid_to TEXT NOT NULL DEFAULT '';
ALTER TABLE packages ADD COLUMN payment_czk REAL;
ALTER TABLE packages ADD COLUMN kind TEXT NOT NULL DEFAULT '';
