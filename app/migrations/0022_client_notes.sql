-- Denník klienta.
--
-- Poznámka trénera bola jedno prepisovateľné pole — čo sa zmazalo, zmizlo.
-- Jerry to pomenoval presne: poznámky v čase nie sú smetisko, sú príbeh
-- klienta. „Marec: bolesť ramena ustúpila. Máj: začal behať. Júl: pauza,
-- sťahovanie" je história, ktorá sa nedá zrekonštruovať z ničoho iného.
--
-- Preto denník: zápisy sa PRIDÁVAJÚ, nikdy neprepisujú. Každý nesie dátum a
-- meno autora (kontá už existujú). Pôvodná poznámka trénera zostáva ako
-- „stála poznámka" na fakty, ktoré sa nemenia — kto za koho platí, na čo si
-- dať pozor. Udalosti patria sem.
CREATE TABLE IF NOT EXISTS client_notes (
  id          TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  note        TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT 'app',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_notes_meno ON client_notes (client_name, created_at DESC);
