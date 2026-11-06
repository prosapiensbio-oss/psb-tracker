-- Odkaz na prehľad klienta pre INÉHO človeka (Jerry, 6. 11. 2026: „ako si
-- vyberám príjemcu, tak tam nie Ahoj Richard, ale Ahoj Katarina, posielam ti
-- prehľad za Richarda"). Krátka adresa na webe zahadzuje všetko za tokenom,
-- preto má príjemca vlastný token. Stránka je tá istá, len oslovuje jeho
-- a nepýta sa ho na pocity klienta. `prijemca` = meno z výberu, '' = „Jiné".
-- Vlastná tabuľka: klient_odkazy má UNIQUE(klient) a jej riadok patrí klientovi.
CREATE TABLE IF NOT EXISTS klient_odkazy_pre (
  token TEXT PRIMARY KEY,
  klient TEXT NOT NULL,
  prijemca TEXT NOT NULL DEFAULT '',
  vytvorene TEXT NOT NULL,
  otvorene INTEGER NOT NULL DEFAULT 0,
  posledne_otvorene TEXT,
  UNIQUE (klient, prijemca)
);
