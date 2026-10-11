-- PONUKA TERMÍNOV V ROZMEDZÍ (11. 10. 2026)
--
-- Jerry: „voľné termíny dať v časovom rozmedzí — nastavím si, že mám čas
-- odvtedy dovtedy, a človek si len vyberie, kedy by v tom rozmedzí mohol
-- byť. Teraz je to nastavené na jednu hodinu."
--
-- Ponúknutý čas (ponuky_terminov_casy) môže byť dlhší než tréning; klient si
-- v ňom vyberie začiatok. Tu je ten začiatok — pražský čas bez pásma ako
-- kal_udalosti.zaciatok. NULL = starý tvar, vybraný je celý ponúknutý čas.
ALTER TABLE ponuky_terminov ADD COLUMN vybrany_zaciatok TEXT;
