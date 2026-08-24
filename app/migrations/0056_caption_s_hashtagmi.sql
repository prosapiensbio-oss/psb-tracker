-- Caption a hashtagy do JEDNÉHO poľa.
--
-- Rozdelil som ich na dve polia, lebo sa menia nezávisle. Bola to chyba
-- z pohľadu toho, ako sa to používa: do Metricoolu ide caption AJ s hashtagmi
-- ako jeden blok, jedným cmd+C. Dve polia znamenali dve kopírovania a ručné
-- zlepenie pri každom príspevku.
--
-- Hashtagy sa prilepia na koniec captionu po prázdnom riadku. Stĺpec hashtagy
-- zostáva prázdny a nepoužitý — nemažem ho, aby migrácia nemohla stratiť dáta;
-- appka doňho už nepíše ani z neho nečíta.
UPDATE mkt_napady
   SET hotovy_text = CASE
         WHEN trim(COALESCE(hotovy_text, '')) = '' THEN trim(hashtagy)
         ELSE trim(hotovy_text) || char(10) || char(10) || trim(hashtagy)
       END,
       hashtagy = ''
 WHERE trim(COALESCE(hashtagy, '')) <> '';
