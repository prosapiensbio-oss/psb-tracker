-- Viac myšlienkových máp, nie jedna.
--
-- Jerry, 25. 9. 2026: „daj mi aj možnosť tvoriť si viac takých máp, teda
-- nejaký zoznam, keby chcem viac nápadov preberať."
--
-- Mapa je len OBAL: zoznam nápadov, ktoré patria k sebe. Nápady zostávajú
-- v `mkt_napady`, takže karta Nápady, plánovanie do mesiacov aj Jarvis
-- fungujú ďalej bez zmeny — mapa im len dáva miesto, kde sa premýšľa.
CREATE TABLE IF NOT EXISTS mkt_mapy (
  id         TEXT PRIMARY KEY,
  nazov      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT '',
  poradie    INTEGER NOT NULL DEFAULT 0
);

-- Prvá mapa existuje vždy. Bez nej by po zmazaní poslednej nebolo kam písať
-- a obrazovka by ukázala prázdno bez vysvetlenia.
INSERT OR IGNORE INTO mkt_mapy (id, nazov, created_at, poradie)
VALUES ('m-hlavna', 'Obsah', '2026-09-25', 0);

ALTER TABLE mkt_napady ADD COLUMN mapa_id TEXT NOT NULL DEFAULT 'm-hlavna';
UPDATE mkt_napady SET mapa_id = 'm-hlavna' WHERE TRIM(COALESCE(mapa_id, '')) = '';
