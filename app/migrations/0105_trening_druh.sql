-- Druh tréningu, ktorý určil človek — pre KAŽDÝ tréning, nielen pre ten
-- z kalendára.
--
-- Jerry, 8. 10. 2026: „vždy by mala byť možnosť zmeniť to z úvodného na
-- normálny alebo z normálneho na úvodný. Petr Baťa má teraz normálny tréning
-- a chcel by som to zmeniť na úvodný — alebo Luky Kríž nemal úvodný a začal
-- rovno tréningom."
--
-- Prepínač na udalosti v kalendári (`kal_udalosti.typ_rucne`) na to nestačí:
-- sedenie z exportu PTmindera žiadnu udalosť nemá a prepnúť sa nedalo. Toto
-- je rozhodnutie o DNI klienta a platí na oba zdroje.
CREATE TABLE IF NOT EXISTS trening_druh (
  klient TEXT NOT NULL,
  den    TEXT NOT NULL,
  druh   TEXT NOT NULL,          -- 'uvodny' | 'trening'
  kto    TEXT NOT NULL DEFAULT '',
  kedy   TEXT NOT NULL,
  PRIMARY KEY (klient, den)
);
