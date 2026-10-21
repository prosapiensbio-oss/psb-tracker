-- Klient JEDNEJ udalosti, ktorého určil človek (Jerry, 21. 10. 2026).
--
-- Pravidlo mena (`kal_mapovanie`) platí na všetky udalosti s tým názvom.
-- Zmena klienta v okne udalosti tak prepísala pravidlo pre celý názov:
-- „Albert Matl“ sa od septembra pripisoval Richardovi Matlovi — Albertovi
-- 21 dní „bez tréningu“, Richardovi balíček z cudzích hodín. Udalosť
-- s klient_rucne = 1 nesie klienta, ktorého jej dal človek, a sťahovanie
-- kalendára ani pravidlo mena ho neprepíše (to isté ako typ_rucne).
ALTER TABLE kal_udalosti ADD COLUMN klient_rucne INTEGER NOT NULL DEFAULT 0;
