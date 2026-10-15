-- ZÁZNAM OTVORENIA STRÁNKY „KALENDÁŘ DO MOBILU" (Jerry, 15. 10. 2026).
-- Michal Knapčok dostal odkaz 14. 10., kalendár si nestiahol ani raz a nedalo
-- sa zistiť prečo — či stránku vôbec otvoril a z čoho. Android Google
-- Kalendár odkaz na odber ticho zahodí, takže „otvoril z Androidu, nestiahol"
-- je presne ten stav, ktorý treba vidieť v profile.
ALTER TABLE klient_kalendar ADD COLUMN otvorene_at TEXT;
ALTER TABLE klient_kalendar ADD COLUMN otvorene_pocet INTEGER NOT NULL DEFAULT 0;
ALTER TABLE klient_kalendar ADD COLUMN otvorene_platforma TEXT;
