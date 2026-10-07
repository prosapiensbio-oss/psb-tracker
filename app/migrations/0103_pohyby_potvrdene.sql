-- Potvrdenie výdavku v uzávierke (Jerry, 7. 10. 2026: „postav tú oranžovú
-- fajku a potvrdiť všetko"). Kategória, ktorú dal Kokpit sám (pravidlo,
-- Jarvis), je len návrh, kým ju Jerry nepotvrdí; čo zaradí ručne, je
-- potvrdené hneď. Krok Fio je hotový, až keď sú potvrdené všetky výdavky
-- mesiaca.
ALTER TABLE fio_transactions ADD COLUMN potvrdene_at TEXT;
ALTER TABLE fio_transactions ADD COLUMN potvrdil TEXT;

-- História pred septembrom 2026 je preklikaná a uzavretá — za potvrdenú sa
-- berie celá. September a október si Jerry prejde v novej uzávierke.
UPDATE fio_transactions SET potvrdene_at = '2026-10-07T00:00:00Z', potvrdil = 'história'
 WHERE date < '2026-09-01' AND potvrdene_at IS NULL;
