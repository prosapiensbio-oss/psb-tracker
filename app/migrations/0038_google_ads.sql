-- Google Ads: výkon vlastných kampaní a skutočné dopyty, na ktoré reklama vyskočila.
--
-- PREČO TRI TABUĽKY A NIE JEDNA
--
-- Mesiace sa nepočítajú zvlášť — derivujú sa z kampaní (jedna definícia na
-- jednom mieste). Preto tu mesačná tabuľka nie je: `gads_kampane` je zdroj a
-- súčet za mesiac vzniká pri čítaní. Keby tu ležali oba, prvý rozdiel medzi
-- nimi by nikto nevysvetlil.
--
-- `gads_dopyty` je oddelene, lebo je to iná vec: nie čo sme kúpili, ale čo
-- ľudia naozaj napísali do Googlu. Pri rozhodovaní, či má platené hľadanie pre
-- PSB zmysel, je to cennejší riadok než akýkoľvek odhad objemu.

CREATE TABLE IF NOT EXISTS gads_kampane (
  id           TEXT PRIMARY KEY,   -- campaign_id + '|' + mesiac
  campaign_id  TEXT NOT NULL,
  nazov        TEXT NOT NULL DEFAULT '',
  typ          TEXT NOT NULL DEFAULT '',   -- SEARCH, DISPLAY, PERFORMANCE_MAX…
  stav         TEXT NOT NULL DEFAULT '',   -- ENABLED, PAUSED, REMOVED
  mesiac       TEXT NOT NULL,              -- 'YYYY-MM'
  naklad       REAL NOT NULL DEFAULT 0,    -- v mene účtu, už nie v mikrách
  kliky        INTEGER NOT NULL DEFAULT 0,
  zobrazenia   INTEGER NOT NULL DEFAULT 0,
  konverzie    REAL NOT NULL DEFAULT 0,
  updated_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_gads_kampane_mesiac ON gads_kampane (mesiac);

CREATE TABLE IF NOT EXISTS gads_dopyty (
  id           TEXT PRIMARY KEY,   -- mesiac + '|' + dopyt
  mesiac       TEXT NOT NULL,
  dopyt        TEXT NOT NULL,
  kliky        INTEGER NOT NULL DEFAULT 0,
  zobrazenia   INTEGER NOT NULL DEFAULT 0,
  naklad       REAL NOT NULL DEFAULT 0,
  konverzie    REAL NOT NULL DEFAULT 0,
  updated_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_gads_dopyty_mesiac ON gads_dopyty (mesiac);

-- Účty pod manažérskym účtom. Objavujú sa cez API, nevypisuje ich človek —
-- ID účtu opísané z hlavy bolo pri Mete zdrojom hodinového hľadania chyby.
CREATE TABLE IF NOT EXISTS gads_ucty (
  id          TEXT PRIMARY KEY,   -- customer ID bez pomlčiek
  nazov       TEXT NOT NULL DEFAULT '',
  valuta      TEXT NOT NULL DEFAULT '',
  je_manager  INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT
);
