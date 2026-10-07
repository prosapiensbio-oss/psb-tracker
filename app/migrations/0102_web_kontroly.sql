-- Nočná kontrola webu: či sa dá dopyt vôbec odoslať.
--
-- Od 23. 9. do 7. 10. 2026 sa test postury nedal odoslať a nikto o tom nevedel:
-- prepínač posielal „ano", plugin čakal celú vetu, pole bolo povinné a chyba
-- sedela na skrytom poli. Dva týždne platenej reklamy viedli na web, kde jedna
-- z dvoch ciest k dopytu mlčky nefungovala.
--
-- Jeden riadok = jedna kontrola v jednom behu. História sa nemaže, aby sa dalo
-- povedať „odkedy to nefunguje" — presne to sa 7. 10. zisťovalo najťažšie.
CREATE TABLE IF NOT EXISTS web_kontroly (
  id          TEXT PRIMARY KEY,        -- beh|kluc
  beh         TEXT NOT NULL,           -- ISO čas behu, zoskupuje riadky
  kluc        TEXT NOT NULL,           -- 'formular:/test-postury/', 'dopyt-do-kokpitu'
  nazov       TEXT NOT NULL,
  stav        TEXT NOT NULL,           -- ok | varovanie | chyba
  detail      TEXT NOT NULL DEFAULT '',
  trvanie_ms  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_kontroly_beh ON web_kontroly (beh DESC);
CREATE INDEX IF NOT EXISTS idx_web_kontroly_kluc ON web_kontroly (kluc, beh DESC);
