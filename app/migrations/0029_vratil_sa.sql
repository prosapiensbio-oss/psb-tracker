-- Klient, ktorý sa vrátil po dlhšej pauze — dátum jeho PRVÉHO úvodného.
--
-- Kateřina Stoklásková: úvodný 14. 11. 2022, vrátila sa 19. 2. 2026. Dáta
-- z PTmindera siahajú do januára 2025, takže appka ju vidí ako nového klienta.
-- V bežných číslach je to jedno, ale od septembra sa podľa počtu nových
-- klientov meria, čo priniesla reklama — a návrat po pauze reklama nepriniesla.
--
-- Prázdne = appka rozhoduje sama podľa prvého sedenia v dátach.
ALTER TABLE client_overrides ADD COLUMN prvy_kontakt TEXT NOT NULL DEFAULT '';
