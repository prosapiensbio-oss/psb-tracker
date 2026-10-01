-- Zľava na úvodný tréning (Jerry, 1. 10. 2026).
--
-- „Niekedy sa môže stať, že chceme dať klientovi za úvodný tréning zľavu —
-- a vtedy by sa mala upraviť aj cena v tom odkaze." Cena teda nemôže byť
-- konštanta v kóde: patrí k odkazu, lebo odkaz patrí jednému človeku.
--
-- NULL = bežná cena (UVODNY.cenaCzk). Nula je platná hodnota — tréning
-- zadarmo je rozhodnutie, nie chýbajúci údaj, a stránka ho tak aj napíše.
ALTER TABLE uvodne_odkazy ADD COLUMN cena_czk INTEGER;
