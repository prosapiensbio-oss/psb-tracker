-- POPIS K FOTKE (Jerry, 12. 10. 2026: „keď si tú fotku urobím, napísať k nej
-- nejaký popis"). Jeden text na fotku — hlavne na porovnanie z editora, ktoré
-- pôjde klientovi. ZAŠIFROVANÝ ako poznámky k foteniu („v1:…").
ALTER TABLE klient_fotky ADD COLUMN popis TEXT;
