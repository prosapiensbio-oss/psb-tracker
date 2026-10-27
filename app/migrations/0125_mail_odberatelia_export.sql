-- MAILOVÝ ZOZNAM PRED ZRUŠENÍM MAILERLITE (Jerry, 27. 10. 2026: „vedel by si
-- to niekde do Kokpitu uložiť a pripraviť stavbu maileru niekedy v budúcnosti?").
--
-- Odberatelia v Kokpite UŽ BOLI (`mail_odberatelia`, 616 riadkov stiahnutých
-- cez API MailerLite 13. 8. 2026) — druhá tabuľka na to isté by bola presne
-- tá chyba, pred ktorou varuje pravidlo „jedna definícia na jednom mieste".
-- Preto sa dopĺňajú stĺpce, ktoré doterajší sťah nemal a ktoré sú v CSV
-- exporte z 27. 10.:
--
--   odhlaseny_at + dovod — KEDY a PREČO sa človek odhlásil. Po zrušení účtu
--     sa to nedá zistiť odnikiaľ inde a je to jediná vec, ktorá chráni pred
--     tým, aby mu raz niekto napísal znova.
--   telefon, firma, krajina — čo o ňom MailerLite vedel navyše.
--   odoslanych/otvoreni/klikov — správanie konkrétneho človeka (doteraz boli
--     len súčty za kampaň), takže sa dá povedať, kto zoznam naozaj číta.
--   klient — meno z Kokpitu, keď sa mail podarí spárovať. Bez neho sa nedá
--     povedať, koľko z adresátov sú naozaj klienti.
DROP TABLE IF EXISTS mail_kontakty;
ALTER TABLE mail_odberatelia ADD COLUMN odhlaseny_at TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_odberatelia ADD COLUMN dovod TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_odberatelia ADD COLUMN telefon TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_odberatelia ADD COLUMN firma TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_odberatelia ADD COLUMN krajina TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_odberatelia ADD COLUMN odoslanych INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail_odberatelia ADD COLUMN otvoreni INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail_odberatelia ADD COLUMN klikov INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail_odberatelia ADD COLUMN klient TEXT;
CREATE INDEX IF NOT EXISTS mail_odberatelia_klient ON mail_odberatelia (klient);
