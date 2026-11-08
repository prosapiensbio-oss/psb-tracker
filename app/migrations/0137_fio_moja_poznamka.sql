-- Vlastná poznámka k pohybu z banky (Jerry, 8. 11. 2026: „pri potvrdzovaní
-- platieb by som chcel mať možnosť priradiť poznámku, aby som to mohol vidieť
-- vo VZAS"). Oddelene od `note`: to je text z banky a prepísať ho znamená
-- stratiť, kto a za čo platil.
ALTER TABLE fio_transactions ADD COLUMN moja_poznamka TEXT;
