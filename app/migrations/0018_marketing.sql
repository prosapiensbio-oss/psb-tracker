-- Marketingové príspevky z Metricoolu.
--
-- Doteraz sa exporty ukladali surovo do raw_uploads a obrazovka Marketing bežala
-- na číslach prepísaných ručne do kódu. Fungovalo to, ale znamenalo to, že
-- appka o marketingu vie presne toľko, koľko som do nej raz prepísal — a každý
-- ďalší mesiac by musel niekto prepísať znova.
--
-- Termín, nie pohodlie: Metricoolu prepadávajú staršie príspevky (november),
-- takže čo sa nestiahne a nenahrá, už nebude odkiaľ vziať.
--
-- Jeden riadok = jeden príspevok. Mesačné súčty sa počítajú z neho, nie naopak:
-- keď sa raz uloží agregát, už sa z neho nedá zistiť, ktorý reel to ťahal.
CREATE TABLE IF NOT EXISTS mkt_prispevky (
  id         TEXT PRIMARY KEY,      -- Metricool Id, pri stories URL príspevku
  druh       TEXT NOT NULL,         -- 'reel' | 'post' | 'story'
  datum      TEXT NOT NULL,         -- ISO deň
  mesiac     TEXT NOT NULL,         -- "YYYY-MM"
  url        TEXT NOT NULL DEFAULT '',
  hook       TEXT NOT NULL DEFAULT '',   -- prvá veta / titulok
  views      INTEGER NOT NULL DEFAULT 0,
  dosah      INTEGER NOT NULL DEFAULT 0,
  ulozenia   INTEGER NOT NULL DEFAULT 0,
  zdielania  INTEGER NOT NULL DEFAULT 0,
  komentare  INTEGER NOT NULL DEFAULT 0,
  lajky      INTEGER NOT NULL DEFAULT 0,
  spend      REAL    NOT NULL DEFAULT 0,
  view_rate  REAL    NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mkt_mesiac ON mkt_prispevky (mesiac);
