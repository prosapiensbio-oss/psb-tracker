-- Mesačné čísla za VŠETKY kanály, nie len Instagram.
--
-- Appka doteraz poznala Instagram (CSV z Metricoolu), web (GA4) a vyhľadávanie
-- (Search Console). Facebook, TikTok, Threads, LinkedIn, YouTube, Meta Ads a
-- Google Business v nej neboli vôbec — pritom Facebook má viac impresií než
-- Instagram a Meta Ads míňajú reálne peniaze.
--
-- Prečo takto všeobecne (kanál + metrika + hodnota) a nie stĺpec na každú
-- metriku: každá platforma meria niečo iné a Metricool to medzi verziami mení.
-- Tabuľka so štyridsiatimi stĺpcami by pri prvej zmene potrebovala migráciu;
-- takto pribudne riadok. Cena je, že sa v nej nedá počítať priemer naprieč
-- metrikami — čo aj tak nedáva zmysel (followers a CPC nemajú spoločnú jednotku).
CREATE TABLE IF NOT EXISTS kanaly_mesiace (
  mesiac     TEXT NOT NULL,          -- "YYYY-MM"
  kanal      TEXT NOT NULL,          -- Instagram | Facebook | TikTok | Threads | LinkedIn | YouTube | Meta Ads | Web | Google Business | Konkurencia
  metrika    TEXT NOT NULL,          -- Followers | Impressions | Interactions | Posts | Spent …
  hodnota    REAL NOT NULL DEFAULT 0,
  zmena      REAL,                   -- % oproti predošlému mesiacu, NULL = nevie sa
  poznamka   TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mesiac, kanal, metrika)
);

CREATE INDEX IF NOT EXISTS idx_kanaly_mesiac ON kanaly_mesiace (mesiac);
