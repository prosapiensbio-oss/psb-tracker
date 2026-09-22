-- Vlastná evidencia balíčkov a členstiev — súbežne s PTminderom.
--
-- Jerry, 22. 9. 2026: nechať obe evidencie bežať vedľa seba a PTminder
-- vypnúť, keď sa prestanú rozchádzať. Dochádzku už kalendár unesie (296
-- sedení, 1 rozdiel); toto je druhá polovica: koľko komu zostáva hodín.
--
-- `hodiny` NULL = paušál bez limitu (GOLD/SILVER/DIAMOND/ONE) — tam sa
-- zostatok nepočíta a nikdy nedôjde. Nula hodín a "neobmedzene" sa nesmú
-- zliať, presne ako pri exporte 0/0.
--
-- `platnost_do` NULL = bez konca.
-- `zdroj` 'ptminder' = naliate z exportu pri štarte, 'rucne' = zapísané v Kokpite.
-- `ptminder_id` páruje riadok s exportom, aby sa opakovaným naliatím nezdvojil.
CREATE TABLE IF NOT EXISTS balicky (
  id            TEXT PRIMARY KEY,
  klient        TEXT NOT NULL,
  nazov         TEXT NOT NULL,
  hodiny        INTEGER,
  platnost_od   TEXT NOT NULL,
  platnost_do   TEXT,
  cena_czk      REAL,
  zdroj         TEXT NOT NULL DEFAULT 'rucne',
  ptminder_id   TEXT,
  poznamka      TEXT,
  zrusene_at    TEXT,
  created_at    TEXT NOT NULL,
  autor         TEXT
);
CREATE INDEX IF NOT EXISTS balicky_klient ON balicky (klient);
CREATE UNIQUE INDEX IF NOT EXISTS balicky_ptminder ON balicky (ptminder_id) WHERE ptminder_id IS NOT NULL;
