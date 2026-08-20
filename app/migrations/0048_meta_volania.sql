-- Koľko volaní appka do Marketing API spraví a koľko z nich zlyhá.
--
-- Meta pustí aplikáciu na Full Access (a teda na tvorbu kreatív) až keď má
-- 500+ volaní za 15 dní a chybovosť pod 15 %. Bez počítadla sa o to nedá
-- požiadať inak než odhadom — 19. 8. 2026.
--
-- Ukladá sa SÚČET za deň, nie jednotlivé volania: na otázku „sme už tam?"
-- to stačí a nevzniká z toho denník, ktorý nikto nečíta.
CREATE TABLE IF NOT EXISTS meta_volania (
  den     TEXT NOT NULL,
  volani  INTEGER NOT NULL DEFAULT 0,
  chyb    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (den)
);
