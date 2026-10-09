-- Návrhy z mesačného reportu a či sa splnili (Jerry 8. 10. 2026: štvrtá
-- otázka kvartálneho reportu „splnili sme, čo report navrhol?").
-- `navrh` je snímka vety „Urob:" v čase zamknutia mesiaca — neskorší
-- prepočet by mohol navrhnúť niečo iné, než Jerry vtedy čítal.
CREATE TABLE IF NOT EXISTS report_akcie (
  mesiac TEXT NOT NULL,
  otazka TEXT NOT NULL,
  navrh TEXT NOT NULL,
  stav TEXT,
  stav_at TEXT,
  kto TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (mesiac, otazka)
);
