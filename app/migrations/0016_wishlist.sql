-- Nákupný zoznam náradia.
--
-- Doteraz žil v Exceli vedľa VZAS a v appke po ňom zostala len veta v cieli
-- „Doplnenie vybavenia" — ~17 000 Kč bez toho, aby sa dalo pozrieť, z čoho to
-- číslo vzniklo a čo z toho je už kúpené. Tým pádom sa suma nikdy neaktualizovala.
--
-- Zámerne to nie je náklad ani P&L riadok: kým sa vec nekúpi, nie je to výdavok,
-- je to plán. Do peňazí vstúpi až cez banku ako každý iný výdavok. Tu ide len o
-- to, čo chceme, koľko to stojí a čo z toho už máme.
CREATE TABLE IF NOT EXISTS wishlist (
  id         TEXT PRIMARY KEY,
  nazov      TEXT NOT NULL,
  cena       REAL NOT NULL DEFAULT 0,   -- Kč, odhad alebo reálna cena z e-shopu
  link       TEXT NOT NULL DEFAULT '',
  kupene     INTEGER NOT NULL DEFAULT 0,
  kupene_at  TEXT,
  poznamka   TEXT NOT NULL DEFAULT '',
  poradie    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Položky z cieľa „Doplnenie vybavenia" (Tyč, kettlebell, mace, medicinbal,
-- závažia) — mená áno, ceny nie. Vymyslená cena by sa tvárila ako fakt a
-- súčet dole by klamal; nech si ich Jerry doplní z e-shopu spolu s linkom.
INSERT OR IGNORE INTO wishlist (id, nazov, cena, link, kupene, poradie, created_at) VALUES
  ('seed-tyc',        'Tyč',        0, '', 0, 1, '2026-08-03'),
  ('seed-kettlebell', 'Kettlebell', 0, '', 0, 2, '2026-08-03'),
  ('seed-mace',       'Mace',       0, '', 0, 3, '2026-08-03'),
  ('seed-medicinbal', 'Medicinbal', 0, '', 0, 4, '2026-08-03'),
  ('seed-zavazia',    'Závažia',    0, '', 0, 5, '2026-08-03');
