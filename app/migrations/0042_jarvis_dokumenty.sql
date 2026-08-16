-- Dokumenty priložené k Jarvisovým rozhovorom.
--
-- PREČO NIE PRIAMO V ROZHOVORE
--
-- Rozhovor sa ukladá po každej správe a nesie celú históriu. Keby v nej ležalo
-- 5 MB PDF zakódované do base64, prepisovalo by sa do databázy pri každej
-- ďalšej otázke — desiatky megabajtov za jednu debatu. Preto je dokument
-- vedľa a v rozhovore je len odkaz `psbdoc:<id>`.
--
-- PREČO NA ČASTI
--
-- D1 má strop okolo 1 MB na jednu hodnotu. Base64 z 5 MB súboru má ~6,7 MB,
-- takže sa do jedného riadku nezmestí. Kráti sa po ~700 000 znakoch a skladá
-- sa späť pri čítaní.
--
-- PREČO SA OBSAH PO 30 DŇOCH MAŽE
--
-- Jerry, 16. 8. 2026: „ja by som chcel buď aby to tam ostalo, alebo dať napr.
-- že po 30 dňoch sa to vymaže a ostane len názov." Dokument je pracovná
-- príloha k debate, nie archív — po mesiaci je debata dávno uzavretá, ale
-- vedieť, ČO tam viselo, má cenu stále. Preto zostáva meno a zmizne obsah.

CREATE TABLE IF NOT EXISTS jarvis_dokumenty (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL DEFAULT '',
  meno        TEXT NOT NULL,
  typ         TEXT NOT NULL,              -- application/pdf, text/plain…
  znakov      INTEGER NOT NULL DEFAULT 0, -- dĺžka base64, na odhad veľkosti
  vlozene_at  TEXT NOT NULL,
  zmazane_at  TEXT                        -- vyplnené = obsah už vypršal, meno zostáva
);

CREATE TABLE IF NOT EXISTS jarvis_dokument_casti (
  dok_id   TEXT NOT NULL,
  poradie  INTEGER NOT NULL,
  data     TEXT NOT NULL,
  PRIMARY KEY (dok_id, poradie)
);

CREATE INDEX IF NOT EXISTS idx_jarvis_dok_chat ON jarvis_dokumenty (chat_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_dok_vlozene ON jarvis_dokumenty (vlozene_at);
