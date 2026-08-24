-- Kto na notifikáciu odpovedal.
--
-- Do 24. 8. 2026 sa autor nezapisoval a pri odpovedi sa nedalo zistiť, či ju
-- napísal Jerry alebo Terezka. Pri veciach ako „ja ju v kalendári nemám" alebo
-- „SMS poslaná" je to podstatné — hovoria o práci konkrétneho človeka.
--
-- Staré odpovede zostávajú bez autora ZÁMERNE. Dopísať k nim meno by bola
-- domnienka, a domnienka zapísaná ako fakt je horšia než prázdne pole.
ALTER TABLE anomaly_ack ADD COLUMN actor TEXT DEFAULT '';
