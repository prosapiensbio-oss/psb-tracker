-- Surové marketingové exporty.
--
-- Metricool, GA4 a Search Console sa zatiaľ do obrazoviek nekreslia — Marketing
-- beží na jednorazovom exporte spracovanom ručne. Ale hrozba nie je zobrazenie,
-- je to STRATA: v novembri Metricoolu prepadnú staršie príspevky a čo sa
-- nestiahne dovtedy, už nezískame.
--
-- Preto sa súbor uloží tak, ako prišiel. Spracovanie sa dá dorobiť kedykoľvek,
-- stiahnuť dáta spätne sa nedá. Dedup je podľa obsahu, takže ten istý export
-- nahratý dvakrát nič nezduplikuje.
CREATE TABLE IF NOT EXISTS raw_uploads (
  id          TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,
  kind        TEXT NOT NULL,      -- metricool | ga4 | gsc
  content     TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  dedup_key   TEXT UNIQUE,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_kind ON raw_uploads (kind);
