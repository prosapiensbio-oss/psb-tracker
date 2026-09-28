-- VYDANÉ FAKTÚRY Z IDOKLADU — číslo faktúry ako variabilný symbol.
--
-- Jerry, 28. 9. 2026: „vidím, že tie ťažko identifikovateľné platby sú
-- faktúry — vedel by si to porovnať ešte s faktúrami?"
--
-- V texte prevodu stojí „20260037 MGR. FILIP STRANAVSKY" — číslo dokladu
-- a meno PRÍJEMCU, nie odosielateľa. Meno klienta tam nie je vôbec, takže
-- príjem zostával bez návrhu. iDoklad pritom vie, na koho je faktúra
-- vystavená (FSH Devices s.r.o. → Jan Kral cez `fakturacne_kontakty`).
--
-- Je to iná tabuľka než `vydane_faktury` (doklady vystavené v Kokpite od
-- 26. 9. 2026): tamtie appka tvorí, tieto len číta z exportu. Miešať ich do
-- jednej by znamenalo, že import z iDokladu prepíše Kokpitom vystavený
-- doklad alebo naopak.
CREATE TABLE IF NOT EXISTS idoklad_faktury (
  cislo      TEXT PRIMARY KEY,
  nazov      TEXT NOT NULL DEFAULT '',
  popis      TEXT NOT NULL DEFAULT '',
  suma_czk   REAL NOT NULL DEFAULT 0,
  vystaveno  TEXT NOT NULL DEFAULT '',
  splatnost  TEXT NOT NULL DEFAULT '',
  stav       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idoklad_faktury_nazov ON idoklad_faktury (nazov);
