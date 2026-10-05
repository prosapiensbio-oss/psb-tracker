-- KARTOTÉKA FOTIEK DRŽANIA TELA (5. 10. 2026)
--
-- Časť C návrhu anamnézy: fotky z úvodného tréningu (a každého ďalšieho
-- fotenia) a poznámka k nim. Obrázky NIE SÚ v databáze — ležia v R2
-- (väzba STORAGE) zašifrované tým istým kľúčom ako anamnéza
-- (ANAMNEZA_KLUC). Tu je len to, čo treba na zoznam a porovnanie.

CREATE TABLE IF NOT EXISTS klient_fotky (
  id TEXT PRIMARY KEY,
  klient TEXT NOT NULL,
  -- deň fotenia (RRRR-MM-DD, pražský) — fotky jedného dňa sú jedno fotenie
  den TEXT NOT NULL,
  -- bok | predok | zadok | ine
  pohlad TEXT NOT NULL DEFAULT 'ine',
  -- kľúč objektu v R2
  kluc TEXT NOT NULL,
  sirka INTEGER,
  vyska INTEGER,
  bajty INTEGER,
  -- odkiaľ je súhlas: 'anamneza' (klient ho odklikol vo formulári)
  -- alebo 'osobne' (tréner potvrdil, že súhlasil na mieste)
  suhlas TEXT NOT NULL,
  kto TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS klient_fotky_klient ON klient_fotky (klient, den);

-- Poznámka k foteniu — jedna na klienta a deň. Text je zašifrovaný
-- (v1:…): je to popis tela, rovnaká kategória ako anamnéza.
CREATE TABLE IF NOT EXISTS klient_fotky_poznamky (
  klient TEXT NOT NULL,
  den TEXT NOT NULL,
  text TEXT NOT NULL,
  kto TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (klient, den)
);
