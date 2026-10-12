-- NÁVRAT K HOTOVÉMU POROVNANIU (Jerry, 12. 10. 2026: „chcem mať možnosť vrátiť
-- sa už aj k hotovému editu"). Stav editora (fotky, výrez, čiary, kresba,
-- štítok) uložený pri porovnaní — ZAŠIFROVANÝ ako popis. Fotky, ktoré neboli
-- z kartotéky (z počítača, snímky z videa), sú v R2 vedľa porovnania
-- pod `<kluc>-zdroj-<tok>`, aby sa dalo upraviť aj na inom zariadení.
ALTER TABLE klient_fotky ADD COLUMN edit_json TEXT;
