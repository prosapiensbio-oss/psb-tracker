-- Nezaplatené poplatky z PTminderu (Finances → Transactions).
--
-- V PTminderi sa poplatok po zaplatení ZMAŽE — eviduje sa len to, čo je
-- otvorené (Jerry, 31. 8. 2026). Poplatok, ktorý v exporte je, je teda
-- nezaplatený; netreba ho s ničím párovať. Preto sa tabuľka pri každom
-- importe celá prepíše: export JE aktuálny stav, nie prírastok.
CREATE TABLE IF NOT EXISTS poplatky (
  id TEXT PRIMARY KEY,
  datum TEXT NOT NULL,
  client_name TEXT NOT NULL,
  popis TEXT,
  suma_czk REAL NOT NULL,
  dedup_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_poplatky_klient ON poplatky (client_name);
CREATE INDEX IF NOT EXISTS idx_poplatky_datum ON poplatky (datum);
