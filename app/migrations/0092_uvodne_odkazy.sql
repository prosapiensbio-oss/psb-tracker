-- Stránka za odkazom v SMS — pred úvodným a po ňom.
--
-- Jerry, 1. 10. 2026: šesť SMS pred úvodným nie je SMS, je to webová
-- stránka poslaná po kúskoch. Namiesto nej chodí jedna veta a odkaz;
-- za odkazom je termín, adresa, čo si vziať, video, cenník a potvrdenie
-- jedným klepnutím.
--
-- Token je náhodný a na dvojicu klient + druh je JEDEN, takže opakované
-- vyrobenie odkazu nevyrobí druhú adresu. Zmazaním riadku odkaz zhasne.
CREATE TABLE IF NOT EXISTS uvodne_odkazy (
  token             TEXT PRIMARY KEY,
  klient            TEXT NOT NULL,
  -- „pred" = pred úvodným, „po" = po ňom. Dve stránky, jeden mechanizmus.
  druh              TEXT NOT NULL,
  trener            TEXT NOT NULL,
  -- Termín v čase vyrobenia odkazu. Stránka sa primárne pýta kalendára —
  -- keď sa hodina presunie, odkaz má ukázať NOVÝ čas, nie ten z včerajška.
  -- Toto je záchranná sieť pre prípad, že sa udalosť v kalendári nenájde.
  kedy              TEXT,
  vytvorene         TEXT NOT NULL,
  otvorene          INTEGER NOT NULL DEFAULT 0,
  posledne_otvorene TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uvodne_odkazy_klient ON uvodne_odkazy (klient, druh);
