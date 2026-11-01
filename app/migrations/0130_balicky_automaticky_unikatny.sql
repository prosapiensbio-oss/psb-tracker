-- Automatický balíček len raz na klienta a deň začiatku.
--
-- `automaticky` v /api/balicky je kontrola + zápis bez transakcie a volajú ho
-- dve zariadenia aj plánovač (riziko z rozboru Kokpitu, 1. 11. 2026). Index
-- platí len pre ŽIVÉ riadky, takže pravidlo „zrušený balíček vznikne znova"
-- sa nemení: zrušený (zrusene_at) sa do indexu nepočíta.
--
-- Pred migráciou overené na ostrých dátach 1. 11. 2026: žiadna dvojica živých
-- balíčkov s rovnakým klientom a dňom začiatku, 0 duplicít v balicky_presun.
-- Kód je tolerantný aj bez indexu (ON CONFLICT DO NOTHING bez cieľa).
CREATE UNIQUE INDEX IF NOT EXISTS balicky_automaticky_jeden
  ON balicky (klient, platnost_od)
  WHERE zrusene_at IS NULL AND poznamka LIKE 'automaticky%';

-- Prenos hodín, ktorý zapísal automat (autor = 'kokpit'), z jedného konca
-- platnosti len raz. Ručný presun (autor = tréner) sa nestráži — ten má
-- vlastnú kontrolu a človek môže presúvať po častiach.
CREATE UNIQUE INDEX IF NOT EXISTS balicky_presun_automat_jeden
  ON balicky_presun (klient, z_platnosti_do)
  WHERE autor = 'kokpit';
