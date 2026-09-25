-- Vydané faktúry a fakturačné údaje klienta.
--
-- Jerry, 26. 9. 2026: faktúra má vzniknúť pri balíčku („pohľadávka vzniká
-- vytvorením balíčka"), niesť QR platbu a odísť mailom. Doteraz v iDokladi:
-- 84 faktúr od 2023, z toho 37 za rok 2026.
--
-- POZOR NA MENÁ: `faktura_polozky` sú faktúry, ktoré CHODIA od dodávateľov
-- (rozpis nákupov do P&L). Tieto sú opačným smerom, preto `vydane_faktury`.
--
-- PREČO ODTLAČOK ODBERATEĽA V KAŽDOM RIADKU: faktúra je doklad o tom, čo bolo
-- vystavené. Keď si klient o rok zmení adresu alebo firmu, stará faktúra musí
-- ďalej ukazovať to, čo na nej naozaj bolo vytlačené. Odkaz do tabuľky
-- fakturačných údajov by minulosť prepisoval.
CREATE TABLE IF NOT EXISTS klient_fakturacia (
  klient        TEXT PRIMARY KEY,
  stat          TEXT NOT NULL DEFAULT 'Česká republika',
  firma         TEXT NOT NULL DEFAULT '',
  ico           TEXT NOT NULL DEFAULT '',
  dic           TEXT NOT NULL DEFAULT '',
  ulica         TEXT NOT NULL DEFAULT '',
  psc           TEXT NOT NULL DEFAULT '',
  mesto         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  dalsie_maily  TEXT NOT NULL DEFAULT '',
  telefon       TEXT NOT NULL DEFAULT '',
  web           TEXT NOT NULL DEFAULT '',
  os_titul      TEXT NOT NULL DEFAULT '',
  os_meno       TEXT NOT NULL DEFAULT '',
  os_priezvisko TEXT NOT NULL DEFAULT '',
  os_mobil      TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vydane_faktury (
  id            TEXT PRIMARY KEY,
  -- RRRR1NNN — rok, jednotka ako značka „vystavené v Kokpite", poradie.
  -- Nikdy sa nesmie prekrývať s radou z iDokladu (RRRR0NNN).
  cislo         TEXT NOT NULL UNIQUE,
  klient        TEXT NOT NULL,
  balicek_id    TEXT,
  vystavene     TEXT NOT NULL,
  splatnost     TEXT NOT NULL,
  popis         TEXT NOT NULL,
  ks            REAL NOT NULL DEFAULT 1,
  cena_czk      REAL NOT NULL,
  celkom_czk    REAL NOT NULL,
  odb_firma     TEXT NOT NULL DEFAULT '',
  odb_ico       TEXT NOT NULL DEFAULT '',
  odb_dic       TEXT NOT NULL DEFAULT '',
  odb_ulica     TEXT NOT NULL DEFAULT '',
  odb_psc       TEXT NOT NULL DEFAULT '',
  odb_mesto     TEXT NOT NULL DEFAULT '',
  odb_stat      TEXT NOT NULL DEFAULT '',
  odb_email     TEXT NOT NULL DEFAULT '',
  poznamka      TEXT NOT NULL DEFAULT '',
  odoslane_at   TEXT,
  odoslane_komu TEXT NOT NULL DEFAULT '',
  uhradene_at   TEXT,
  platba_id     TEXT,
  -- Faktúra sa NEMAŽE. Chybná sa stornuje a číslo v rade zostane obsadené,
  -- inak by v číslovaní vznikla diera, ktorú nikto nevie vysvetliť.
  storno_at     TEXT,
  storno_dovod  TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  autor         TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_vydane_faktury_klient ON vydane_faktury (klient);
