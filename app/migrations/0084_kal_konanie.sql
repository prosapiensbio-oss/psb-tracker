-- BOL TAM, ALEBO NIE?
--
-- Kokpit doteraz bral „udalosť zmizla z kalendára" ako „tréning sa nekonal".
-- Pri Vítězslavovi Papiežovi to spravilo −1 namiesto −2 a takých prípadov
-- bolo 29. 9. 2026 celkovo 49: tréning zmizol z kalendára až po tom, čo sa
-- mal konať, a v PTminderi zápis nemá.
--
-- Automaticky sa to preklopiť NEDÁ ani jedným smerom. Jerry, 29. 9. 2026:
-- „niekedy sa stáva, že mi v ten deň oznámia, že neprídu, a ja si to vymažem
-- až o pár dní." Zároveň `zmizla_at` nie je čas, kedy udalosť zmizla, ale
-- kedy sme si to všimli — snímka kalendára vyjde asi raz z troch pokusov,
-- takže zrušenie z ôsmej ráno môže byť zapísané ako „zmizlo o 18:00".
--
-- Preto sa Kokpit pýta a odpoveď si pamätá. Bez odpovede zostáva stav ako
-- doteraz (tréning sa nepočíta) — mlčanie nesmie klientovi pridať hodinu.
CREATE TABLE IF NOT EXISTS kal_konanie (
  uid        TEXT NOT NULL,            -- iCal UID, rovnako ako v kal_udalosti
  trener     TEXT NOT NULL,
  konal      INTEGER NOT NULL,         -- 1 = bol tam, 0 = neprišiel
  kto        TEXT,                     -- kto odpovedal
  kedy       TEXT NOT NULL,
  PRIMARY KEY (uid, trener)
);
