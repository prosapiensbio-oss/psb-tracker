-- Obrázky priložené k nápadu.
--
-- Vlastná tabuľka, NIE stĺpec v `mkt_napady`. Obrázok je ako `data:` URI
-- desiatky až stovky kilobajtov a plánovač si ťahá dvesto nápadov naraz —
-- v riadku by nafúkol každú odpoveď, aj keď o obrázok vôbec nejde. Takto sa
-- načíta len vtedy, keď ho niekto naozaj otvorí.
--
-- Dva druhy, oba k tomu istému nápadu:
--   titulka    — fotka do titulky príspevku
--   inspiracia — snímka cudzieho príspevku, ktorú rozoberá Jarvis. Vznikla
--                z núdze: Instagram vracia cloudflarovým adresám HTTP 429,
--                takže metadáta sa stiahnuť nedajú a snímka je jediná cesta.
CREATE TABLE IF NOT EXISTS napad_obrazky (
  napad_id   TEXT NOT NULL,
  druh       TEXT NOT NULL,
  data_uri   TEXT NOT NULL,
  sirka      INTEGER NOT NULL DEFAULT 0,
  vyska      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (napad_id, druh)
);
