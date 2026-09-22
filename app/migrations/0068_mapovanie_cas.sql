-- Mapovanie mena z kalendára smie závisieť od ČASU.
--
-- 22. 9. 2026: v kalendári stojí „Marketa" a v štúdiu sú dve — Resnerová
-- (vždy 8:30) a Lozias (11:00, 14:00, 17:00, 18:00). Mapovanie malo kľúč
-- (nazov, trener), takže jedno meno mohlo patriť len jednej z nich: šesť
-- tréningov Resnerovej sa pripísalo Lozias, ktorá ich tým mala navyše —
-- aj s pokazeným zostatkom balíčka a tempom.
--
-- Prázdny `cas` = mapovanie platí pre všetky časy (tak ako doteraz). Presný
-- čas vyhráva nad prázdnym.
--
-- SQLite nevie zmeniť primárny kľúč, preto sa tabuľka prestavia.
CREATE TABLE kal_mapovanie_nove (
  nazov        TEXT NOT NULL,
  trener       TEXT NOT NULL,
  cas          TEXT NOT NULL DEFAULT '',   -- 'HH:MM' alebo '' pre všetky časy
  klient       TEXT,
  typ          TEXT NOT NULL,
  potvrdene_at TEXT NOT NULL,
  PRIMARY KEY (nazov, trener, cas)
);
INSERT INTO kal_mapovanie_nove (nazov, trener, cas, klient, typ, potvrdene_at)
  SELECT nazov, trener, '', klient, typ, potvrdene_at FROM kal_mapovanie;
DROP TABLE kal_mapovanie;
ALTER TABLE kal_mapovanie_nove RENAME TO kal_mapovanie;
