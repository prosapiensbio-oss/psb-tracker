-- Alternatívne úvodné vety k príspevku.
--
-- Claude Project ich navrhuje pri každom texte, ale nemali kde bývať —
-- skončili v konverzácii a pri statíve už neboli po ruke. Pritom práve tam sú
-- najcennejšie: prvá veta nesadne, skúsi sa druhá, tretia.
--
-- Jedna veta na riadok. Nie JSON: je to text, ktorý Jerry číta a prepisuje,
-- a štruktúra by mu v tom len prekážala.
ALTER TABLE mkt_napady ADD COLUMN uvodne_vety TEXT NOT NULL DEFAULT '';
