-- Beh automatu — či vôbec prebehol a ako dopadol.
--
-- Jerry, 10. 10. 2026: „kontrolu si predstavujem ako kontrolu appky — či
-- všetko funguje, či je všetko správne prepojené." Pri hľadaní, z čoho ju
-- postaviť, vyšlo najavo, že z DESIATICH automatov si stav zapisujú DVA:
-- kalendár (`kal_snimky`) a pošta (`mail_stav`). Ostatných osem mohlo
-- mlčky nebežať týždne a nikto by sa to nedozvedel — presne ten druh tichej
-- diery, kvôli ktorej vznikla aj stráž veku synchronizácie kalendára.
--
-- Zapisuje sa KAŽDÝ pokus, nielen úspech. Chýbajúci riadok potom znamená
-- „nespustilo sa", čo je iná porucha než „spustilo sa a spadlo".
CREATE TABLE IF NOT EXISTS automaty (
  id        TEXT PRIMARY KEY,
  automat   TEXT NOT NULL,
  kedy      TEXT NOT NULL,
  ok        INTEGER NOT NULL,
  detail    TEXT,
  chyba     TEXT
);
CREATE INDEX IF NOT EXISTS automaty_kedy ON automaty(automat, kedy DESC);
