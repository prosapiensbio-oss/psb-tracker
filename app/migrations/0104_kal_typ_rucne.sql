-- Druh udalosti, ktorý nastavil človek — sťahovanie ho nesmie prepísať.
--
-- Jerry, 7. 10. 2026: „v jeho tréningoch sa nedá prerobiť 'tréning 17:00 ·
-- Terezka' na úvodný tréning, chýba mi možnosť kliknúť na to a upraviť
-- kategóriu." Druh sa inak určuje z názvu udalosti a z naučeného mapovania,
-- a každé ďalšie stiahnutie kalendára ho prepíše nanovo. Táto značka hovorí
-- „tu rozhodol človek" a sťahovanie taký riadok obíde.
ALTER TABLE kal_udalosti ADD COLUMN typ_rucne INTEGER;
