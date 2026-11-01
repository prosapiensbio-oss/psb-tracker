-- Osobný súhlas s fotkami je súhlas KLIENTA, nie jednej fotky (Jerry, 1. 11. 2026).
-- Dovtedy žil len ako značka pri novo nahratej fotke a zaškrtávacie políčko sa po
-- obnovení stránky vrátilo prázdne. Kto už má fotku so značkou „osobne", ten súhlas
-- dal a tréner ho potvrdil — prevezme sa so svojím prvým dňom a menom toho, kto ho
-- vtedy potvrdil (stav 1. 11. 2026: 3 klienti, 32 fotiek).
CREATE TABLE IF NOT EXISTS klient_fotky_suhlas (
  klient TEXT PRIMARY KEY,
  kto TEXT,
  kedy TEXT NOT NULL
);
INSERT OR IGNORE INTO klient_fotky_suhlas (klient, kto, kedy)
  SELECT klient, kto, MIN(created_at) FROM klient_fotky WHERE suhlas = 'osobne' GROUP BY klient;
