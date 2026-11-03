-- Plán marketingu a myšlienková mapa pre každý účet zvlášť (Jerry, 3. 11. 2026:
-- „rozduplikuj na všetky profily"). Prázdny profil = ProSapiens, tak ostanú všetky
-- doterajšie záznamy. Ostatné účty majú id profilu zo Strižne.
ALTER TABLE mkt_plany ADD COLUMN profil TEXT NOT NULL DEFAULT '';
ALTER TABLE mkt_mapy ADD COLUMN profil TEXT NOT NULL DEFAULT '';
