-- Rozpis faktúr na položky.
--
-- Na jednom doklade z Alzy býva granule pre psa, prostěradlo domov a niečo do
-- štúdia — v banke z toho vidno jedinú sumu. Kým sa taká platba zaraďovala
-- celá, buď sa štúdiu pripísalo, čo mu nepatrí, alebo naopak.
CREATE TABLE IF NOT EXISTS faktura_polozky (
  id          TEXT PRIMARY KEY,
  faktura     TEXT NOT NULL,          -- číslo dokladu
  dodavatel   TEXT NOT NULL DEFAULT '',
  date        TEXT NOT NULL,          -- dátum vystavenia (ISO)
  nazov       TEXT NOT NULL,
  kod         TEXT NOT NULL DEFAULT '',
  ks          INTEGER NOT NULL DEFAULT 1,
  cena_czk    REAL NOT NULL,          -- s DPH
  category    TEXT NOT NULL DEFAULT '',
  dedup_key   TEXT,
  created_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_faktura_polozky_dedup ON faktura_polozky (dedup_key);
CREATE INDEX IF NOT EXISTS idx_faktura_polozky_datum ON faktura_polozky (date);
