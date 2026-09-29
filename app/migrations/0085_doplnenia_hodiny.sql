-- KOĽKO HODÍN PRIDALO „DOPLNENIE ČLENSTVA"?
--
-- Jerry, 29. 9. 2026: „niekedy klientovi ostali tri, dostal 3 doplnenie
-- členstva, niekedy 1 a dostal 1. Dalo sa to na to, že keď skončila platnosť,
-- ale ostalo mu tam pár hodín, tak dostal doplnenie členstva podľa potreby —
-- preto je to doplnenie, aby to v PTminderi vychádzalo a dali sa reconcilovať
-- hodiny, aj keď klient nemal žiadny aktívny balík."
--
-- Čiže to NIE JE predaj. Je to spôsob, ako v PTminderi udržať pri živote
-- hodiny, ktoré klient už mal zaplatené. Koľko ich bolo, rozhodoval Jerry
-- prípad od prípadu a export to nenesie: v službách stojí 223× ten istý
-- riadok „Doplnenie členstva" s cenou 0 a bez počtu.
--
-- Vyrátať sa to nedá ani spätne — hodiny z členstva s viazanosťou na konci
-- platnosti PREPADAJÚ, ak sa Jerry nerozhodne inak, a práve to rozhodnutie
-- je tu zapísané. Preto sa Kokpit pýta a odpoveď si pamätá; bez nej v tom
-- období nepočíta dlh (radšej mlčať než klientovi poslať vymyslené číslo).
CREATE TABLE IF NOT EXISTS doplnenia_hodiny (
  klient  TEXT NOT NULL,
  den     TEXT NOT NULL,            -- deň služby „Doplnenie členstva"
  hodiny  REAL NOT NULL,            -- koľko hodín tým pribudlo (0 = žiadne)
  kto     TEXT,
  kedy    TEXT NOT NULL,
  PRIMARY KEY (klient, den)
);
