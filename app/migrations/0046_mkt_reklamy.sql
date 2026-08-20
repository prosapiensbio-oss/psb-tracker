-- Metriky na úrovni REKLAMY, nie kampane.
--
-- Kampaň povie, koľko to stálo. Reklama povie PREČO: či video vôbec zastavilo
-- palec (hook rate), či ľudia vydržali (hold rate), či klikli (CTR) a koľko
-- ráz to ten istý človek videl (frekvencia). Rešerš z 19. 8. 2026: pod 25 %
-- hook rate je problém v kreatíve, nie v nákupe médií — a to sa z kampaňových
-- čísel nedá zistiť.
CREATE TABLE IF NOT EXISTS mkt_reklamy (
  id           TEXT NOT NULL,
  mesiac       TEXT NOT NULL,
  nazov        TEXT NOT NULL DEFAULT '',
  kampan       TEXT NOT NULL DEFAULT '',
  sada         TEXT NOT NULL DEFAULT '',
  spend        REAL NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  clicks       INTEGER NOT NULL DEFAULT 0,
  ctr          REAL NOT NULL DEFAULT 0,
  cpm          REAL NOT NULL DEFAULT 0,
  frekvencia   REAL NOT NULL DEFAULT 0,
  videnia3s    INTEGER NOT NULL DEFAULT 0,
  thruplay     INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (id, mesiac)
);
