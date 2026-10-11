-- Stav príspevku zo Strižne (Mac appka na výrobu obsahu, 11. 10. 2026).
--
-- Strižňa je samostatná appka napojená na Kokpit ako BTC kniha: celý príspevok
-- (nápad → plán → príprava → natočené → postprodukcia → naplánované → výsledky)
-- sa robí v nej, ale spoločný záznam ostáva tu, aby ho videl mobil („+ Zápis“),
-- Terezka aj Jarvis. Do stĺpca píše len Strižňa: JSON s typom (reel/príbeh/
-- karusel/post/infografika), krokom, odkazmi na strih a infografiky, plánom
-- v Metricoole a výsledkami. Prázdny reťazec = nápad, na ktorom Strižňa ešte
-- nerobila.
ALTER TABLE mkt_napady ADD COLUMN strizna TEXT NOT NULL DEFAULT '';
