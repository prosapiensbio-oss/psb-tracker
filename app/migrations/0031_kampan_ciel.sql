-- Cieľ kampane a surové akcie z Mety.
--
-- Prvé stiahnutie 19 mesiacov ukázalo, prečo samotné číslo „výsledky" klame:
-- Meta vracia pod `actions` desiatky typov naraz — zobrazenie stránky,
-- prehratie videa aj odoslaný formulár. Keď sa z nich vyrobí jedno číslo,
-- už sa nedá spätne zistiť, čo v ňom je, a mesiac s dvetisíc „výsledkami"
-- vyzerá ako úspech, hoci to boli prehratia videa.
--
-- Preto sa surová odpoveď ukladá celá. Číslo `vysledky` je len výklad; keď
-- sa výklad ukáže ako zlý, opraví sa bez ďalšieho ťahania z API.
--
-- `ciel` je objective kampane (OUTCOME_AWARENESS, OUTCOME_LEADS…). Odpovedá
-- na otázku, na ktorú sa dovtedy nedalo odpovedať: optimalizovala tá kampaň
-- vôbec niekedy na dopyt, alebo len na dosah?
ALTER TABLE mkt_kampane ADD COLUMN ciel TEXT NOT NULL DEFAULT '';
ALTER TABLE mkt_kampane ADD COLUMN akcie TEXT NOT NULL DEFAULT '';
