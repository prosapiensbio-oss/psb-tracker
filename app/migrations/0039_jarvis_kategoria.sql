-- Zameranie rozhovoru do databázy.
--
-- PREČO TO TU CHÝBALO
--
-- 14. 8. 2026 vzniklo zameranie rozhovoru (marketing / peniaze / klienti) a ja
-- som ho uložil do localStorage, ale nie sem. Po načítaní stránky sa rozhovory
-- čítajú z databázy, kde príznak nebol — takže všetky spadli do „Všetko“
-- a z priečinkov zmizli. Jerry to opísal ako „ked spravim refresh stranky tak
-- konverzácia zmizne“ a mal pravdu do slova.
--
-- Je to presne prvý krok checklistu z CLAUDE.md (stĺpec + migrácia), ktorý som
-- napísal dva dni predtým po tej istej triede chyby pri dôvodoch strát.
-- Napísať pravidlo nestačí, treba ho prejsť.
--
-- Prázdna hodnota znamená „bez zamerania“, teda voľná debata — nie chýbajúci
-- údaj. Staré rozhovory teda ostanú tam, kde vždy boli.

ALTER TABLE jarvis_chats ADD COLUMN kategoria TEXT NOT NULL DEFAULT '';
