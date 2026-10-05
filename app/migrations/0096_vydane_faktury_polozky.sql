-- ĎALŠIE POLOŽKY NA JEDNEJ FAKTÚRE — každá za iného klienta.
--
-- Jerry, 4. 10. 2026: „Dan a Monika platia na jednu faktúru. Jedna faktúra
-- za oboch, preto je to 15 580, ale v PTminderi/Kokpite sa zapíše každému
-- členstvo a platba za 7 790."
--
-- Hlavný riadok vo vydane_faktury zostáva prvou položkou (platiteľ, jeho
-- popis, počet a cena) a jeho celkom_czk je SÚČET VŠETKÝCH položiek. Tu sú
-- len tie ďalšie. Faktúra s jedinou položkou tu nemá nič — staré doklady
-- sa nemenia.
--
-- Položka nesie klienta, lebo podľa neho sa platba za faktúru rozdelí:
-- variabilný symbol povie „táto faktúra" a položky povedia „komu koľko".
CREATE TABLE IF NOT EXISTS vydane_faktury_polozky (
  id          TEXT PRIMARY KEY,
  faktura_id  TEXT NOT NULL,
  poradie     INTEGER NOT NULL DEFAULT 1,
  klient      TEXT NOT NULL,
  balicek_id  TEXT,
  popis       TEXT NOT NULL,
  ks          REAL NOT NULL DEFAULT 1,
  cena_czk    REAL NOT NULL,
  celkom_czk  REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vydane_faktury_polozky_faktura ON vydane_faktury_polozky (faktura_id);
