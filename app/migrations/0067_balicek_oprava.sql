-- Ručná oprava zostatku balíčka.
--
-- PTminder vyváža offline členstvá ako „0 left from 0", takže appka zostatok
-- dopočítava z odtrénovaných hodín (21. 9. 2026). Dopočet je presný na ±1
-- hodinu: keď sa dve členstvá prekrývajú — Jerry: „minie 18 hodín skôr než za
-- 6 mesiacov, takže má akoby dve, na jednom 0 a na druhom 5" — z exportu sa
-- nedá zistiť, ktorému z nich PTminder hodinu v deň prekryvu strhol.
--
-- Preto kotva: Jerry raz zapíše, koľko hodín PTminder ukazuje a ku ktorému
-- dňu. Odvtedy appka odpočítava odtrénované hodiny od TEJTO hodnoty, nie od
-- počtu v názve balíčka.
ALTER TABLE client_overrides ADD COLUMN balicek_zostatok INTEGER;
ALTER TABLE client_overrides ADD COLUMN balicek_k_datumu TEXT NOT NULL DEFAULT '';
