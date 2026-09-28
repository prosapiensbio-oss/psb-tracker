-- JEDEN PREVOD SMIE PATRIŤ VIACERÝM KLIENTOM.
--
-- Pôvodný index `platby_fio` bol UNIQUE nad samotným `fio_id`, takže bankový
-- pohyb mohol mať práve jednu platbu. Strážil správnu vec — ten istý príjem
-- sa nesmie započítať dvakrát — ale zakazoval aj rozdelenie: „15 580 DK
-- Consulting" sú dva balíčky po 7 790 (Dan Kouřil a Monika Schonwalderová) a
-- zápis dvoch dielov na ten istý pohyb spadol na porušení indexu. Navonok to
-- vyzeralo, že sa neudialo nič (Jerry, 28. 9. 2026).
--
-- Zmysel stráže zostáva, len sa presnejšie pomenuje: dvakrát sa nesmie
-- započítať pohyb TOMU ISTÉMU klientovi. Rozdelenie medzi rôznych klientov je
-- legitímne a súčet dielov si proti sume pohybu stráži API.
DROP INDEX IF EXISTS platby_fio;

CREATE UNIQUE INDEX IF NOT EXISTS platby_fio_klient
  ON platby (fio_id, klient) WHERE fio_id IS NOT NULL;
