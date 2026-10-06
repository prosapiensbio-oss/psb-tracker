-- KARTOTÉKA + EDITOR (6. 10. 2026)
--
-- Jerry: „napoj editor na kartotéku klienta, nech sa to ukladá." Do
-- klient_fotky pribudnú dva nové druhy (stĺpec pohlad): 'porovnanie'
-- (poskladané predtým/potom z editora fotiek) a 'video' (strihnutý
-- a spomalený klip z editora videa). Video nie je JPEG — preto typ.
--
-- typ: MIME súboru v R2 (pred zašifrovaním). NULL = image/jpeg (všetko,
-- čo vzniklo pred touto migráciou, sú fotky zmenšené v prehliadači na JPEG).
ALTER TABLE klient_fotky ADD COLUMN typ TEXT;
