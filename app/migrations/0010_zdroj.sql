-- Odkiaľ sa klient o PSB dozvedel.
--
-- Anamnéza sa na to pýta od júna 2025 a má 47 odpovedí — ale ako voľný text
-- ("tabula", "Knapcok", "manzelkina sestra ma znamu Regina obrovska"), mimo
-- appky a bez spojenia s tržbami. Tu je to pevný zoznam, takže sa to konečne
-- dá spočítať: koľko klientov a koľko peňazí prišlo ktorým kanálom.
--
-- `zdroj_kto` je meno konkrétneho človeka pri referencii. Bez neho sa nedá
-- povedať, komu patrí odmena za doporučenie.
ALTER TABLE client_overrides ADD COLUMN zdroj TEXT NOT NULL DEFAULT '';
ALTER TABLE client_overrides ADD COLUMN zdroj_kto TEXT NOT NULL DEFAULT '';
