-- CELKOVÝ POČET LEKCIÍ KLIENTA (Jerry, 19. 10. 2026: „pod dobu spolupráce
-- pridať celkový počet lekcií, ktoré mal"). Kokpit má sedenia od 3. 1. 2025;
-- staršie lekcie sú len v archíve PTmindera (export sedení od 1/2022).
-- Do Kokpitu nejde report, len súhrn na klienta: počet lekcií pred 3. 1. 2025
-- a deň prvého tréningu (presnejší začiatok spolupráce než registrácia).
ALTER TABLE ptminder_klienti ADD COLUMN lekcie_pred INTEGER;
ALTER TABLE ptminder_klienti ADD COLUMN prvy_trening TEXT;
