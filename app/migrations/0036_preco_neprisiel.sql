-- Prečo človek po úvodnom tréningu už neprišiel.
--
-- Pole pribudlo 13. 8. do typu aj do obrazovky, ale migrácia sa naň zabudla.
-- Jerry dôvody vypísal, appka na chvíľu ukázala „uložené" a odpoveď z API
-- znela `bad_field`. Text sa nemal kam uložiť a stratil sa — presne tá vec,
-- kvôli ktorej sa dôvod zapisuje v deň, keď je ešte v hlave.
ALTER TABLE client_overrides ADD COLUMN preco_neprisiel TEXT NOT NULL DEFAULT '';
