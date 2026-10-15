-- OTÁZKA „JAKÝ MÁTE TELEFON?" NA STRÁNKE KALENDÁRA (Jerry, 15. 10. 2026:
-- „bude tam otázka, aký máš telefón, iPhone, Android, a keď klikne na
-- Android, ukáže sa toto"). Čo klient zvolil, sa zapíše — profil tak vie
-- povedať „zvolil Android, kalendár si nestiahol".
ALTER TABLE klient_kalendar ADD COLUMN zvoleny_telefon TEXT;
