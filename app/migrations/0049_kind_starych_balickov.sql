-- Staré riadky balíčkov nemajú určený pohľad (`kind`) a kontrola úplnosti
-- importu ich preto vynecháva — nevie, do ktorého exportu patria.
--
-- Zisťovanie z 19. 8. 2026: všetkých 47 takých riadkov nesie len dva názvy,
-- „Doplnenie členstva" (45×) a „ČLENSTVÍ ONE" (2×). Rovnaké názvy s vyplneným
-- `kind` majú v databáze bez výnimky `package` (8× Doplnenie členstva,
-- ČLENSTVÍ JEDNA, ČLENSTVÍ SILIVER) — sú to hodiny dokúpené k paušálu, nie
-- členstvo samotné. Doplnenie je preto odvodenie z dát, nie odhad.
--
-- Podmienka na názov je zámerná poistka: keby v starej vrstve ležalo ešte
-- niečo iné, nech to zostane nezaradené radšej, než by dostalo zlý pohľad.
UPDATE packages
   SET kind = 'package'
 WHERE kind = ''
   AND (package_name LIKE '%oplnenie členstva%' OR package_name LIKE '%LENSTVÍ%');
