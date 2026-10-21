-- KTO PLATÍ ZA KOHO (Jerry, 21. 10. 2026: „Jakub Kaňovský platí aj za
-- Kadličkovú v BTC — ako mu pošlem odkaz s QR?").
-- Dvojice sa dovtedy dali odvodiť len zo SPÄTNE rozdelených prevodov; QR
-- a lightningová faktúra idú klientovi PRED platbou a musia sedieť napoprvé.
-- Mená oddelené zvislicou; prázdno = platí len za seba.
ALTER TABLE client_overrides ADD COLUMN plati_za TEXT;
