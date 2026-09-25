-- Vlastné miesto bubliny na ploche.
--
-- Jerry, 25. 9. 2026: „daj tam aj možnosť pohybovať všetkými bublinami, keď
-- ju chytím za okraj; obsah daj na stred pracovnej plochy a z nej môžu do
-- všetkých smerov vyrastať ďalšie bubliny."
--
-- Doteraz sa rozloženie LEN počítalo. Zostáva to tak: prázdne `pos_x`/`pos_y`
-- znamená „nechaj to na appku" a to je predvolený stav každého nového uzla.
-- Číslo v nich je ručné rozhodnutie a prebíja výpočet — presne ako v
-- MindMeisteri, kde sa auto-layout dá pre jednotlivú tému vypnúť.
--
-- Súradnice sú v plátne mapy, nie na obrazovke: nemenia sa priblížením ani
-- posunutím plochy, takže mapa vyzerá rovnako na notebooku aj na monitore.
ALTER TABLE mkt_napady ADD COLUMN pos_x REAL;
ALTER TABLE mkt_napady ADD COLUMN pos_y REAL;
