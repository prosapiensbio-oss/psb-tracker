-- Priemerný čas sledovania reelu (Metricool „Avg Watch Time", milisekundy).
--
-- Jediné pole v celom exporte, ktoré hovorí o RETENCII. Uloženie povie, že sa
-- príspevok páčil; watch time povie, ako dlho ho človek vydržal. Pri reklame je
-- to dôležitejšie — reklama nepotrebuje uloženie, potrebuje udržať pozornosť.
--
-- Pri postoch a stories ostáva 0: Metricool ho pre ne nevydáva.
ALTER TABLE mkt_prispevky ADD COLUMN watch_time INTEGER NOT NULL DEFAULT 0;
