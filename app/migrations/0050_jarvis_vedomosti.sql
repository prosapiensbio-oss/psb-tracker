-- Trvalé vedomosti pre Jarvisa — rešerše, príručky, poznatky zvonku.
--
-- PREČO NIE `jarvis_dokumenty`
--
-- Tie sú prílohy k JEDNEJ debate a ich obsah sa po 30 dňoch zmaže (migrácia
-- 0042, aby sa 5 MB PDF neprepisovalo do histórie pri každej správe). Rešerš
-- o tom, od koho sa učiť reklamu, má platiť rok — nie mesiac.
--
-- PREČO MÁ `platne_do`
--
-- Jerry, 19. 8. 2026: „takéto veci sa často menia, nemohol by byť nejaký
-- sledovač, ktorý by to raz za pol roka alebo raz za 3 mesiace aktualizoval?"
-- Vedomosť zvonku má dobu spotreby: benchmarky zastarajú, Meta premenuje
-- úrovne prístupu, odporúčané rozpočty sa hýbu. Bez dátumu by sa z rešerše
-- ticho stala povera. Keď dátum prejde, ozve sa register.
CREATE TABLE IF NOT EXISTS jarvis_vedomosti (
  id          TEXT PRIMARY KEY,
  nazov       TEXT NOT NULL,
  -- Na čo to je — jedna veta do zoznamu aj do Jarvisovho kontextu.
  o_com       TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL,
  -- Odkiaľ to je. Bez zdroja sa nedá overiť ani zopakovať.
  zdroj       TEXT NOT NULL DEFAULT '',
  -- Ako často sa má obnovovať. 0 = netreba (trvalé pravidlo).
  obnovovat_po_dnoch INTEGER NOT NULL DEFAULT 180,
  overene_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vedomosti_overene ON jarvis_vedomosti(overene_at);
