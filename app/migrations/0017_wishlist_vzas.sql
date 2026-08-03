-- Nákupný zoznam z VZAS — skutočné položky namiesto piatich holých názvov.
--
-- Excel má dve skupiny s vlastnými medzisúčtami (Vybavenie 17 016 Kč, Kurzy
-- 58 400 Kč, spolu 75 416 Kč), takže tabuľka dostáva kategóriu. Bez nej by sa
-- kurz za 31 600 Kč sčítaval s kotúčom za 394 Kč do jedného čísla, ktoré
-- nehovorí nič — a Jerry by v appke nenašiel súčty, na ktoré je zvyknutý.
ALTER TABLE wishlist ADD COLUMN kategoria TEXT NOT NULL DEFAULT 'Vybavenie';

-- Seed položky (tyč, kettlebell, mace, medicinbal, závažia) boli len mená z
-- cieľa, kým sme nemali Excel. Mažú sa iba ak sa ich nikto nedotkol — cena 0 a
-- nezaškrtnuté. Keby si medzitým niektorú vyplnil, zostane.
DELETE FROM wishlist
 WHERE id IN ('seed-tyc','seed-kettlebell','seed-mace','seed-medicinbal','seed-zavazia')
   AND cena = 0 AND kupene = 0;

-- Ceny a odkazy sú z Excelu 1:1. Názvy tiež — vrátane „Medicimbal" a
-- „Kettlbel". Zámerne: je to Jerryho zoznam a keď v ňom bude hľadať „Kettlbel",
-- má ho tam nájsť tak, ako si ho napísal. Upravené je len veľké začiatočné
-- písmeno a odseknuté medzery na konci, aby riadky vyzerali rovnako.
--
-- Stĺpec „stav" (zelená/červená) sa neprenáša — nevieme, či znamená „kúpené"
-- alebo prioritu, a zaškrtnúť položku ako kúpenú naslepo by pokazilo súčet
-- „ešte treba". Všetko ide dnu ako nekúpené, čo sedí so súčtom 17 016 Kč,
-- ktorý v Exceli obsahuje všetkých 12 položiek.
INSERT OR IGNORE INTO wishlist (id, nazov, cena, link, kupene, poznamka, poradie, kategoria, created_at) VALUES
  ('vzas-stojan',     'Stojan na kotúče',    1799, 'https://www.alza.cz/sport/stojan-na-zavazi-marbo-mh-s206-d7487949.htm', 0, '', 1,  'Vybavenie', '2026-08-03'),
  ('vzas-kotuc10',    'Kotúč 10kg',           785, 'https://www.alza.cz/sport/fitnessline-kotouc-olympijsky-pogumovany-50-mm-10-kg-d6966101.htm', 0, '', 2,  'Vybavenie', '2026-08-03'),
  ('vzas-kotuc5',     'Kotúč 5kg',            394, 'https://www.alza.cz/sport/fitnessline-kotouc-olympijsky-pogumovany-50-mm-5-kg-d6966094.htm', 0, '', 3,  'Vybavenie', '2026-08-03'),
  ('vzas-medicinbal', 'Medicimbal 4kg tvrdy', 699, 'https://www.alza.cz/sport/medicinalni-mic-master-synthetik?dq=7562633', 0, '', 4,  'Vybavenie', '2026-08-03'),
  ('vzas-rgbell3',    'RG bell 3kg',         1050, 'https://functionalpatterns.com/products/rg-bell-bundle', 0, '', 5,  'Vybavenie', '2026-08-03'),
  ('vzas-rgbell9',    'RG bell 9kg',         1775, 'https://functionalpatterns.com/products/rg-bell-bundle?variant=51837865460084', 0, '', 6,  'Vybavenie', '2026-08-03'),
  ('vzas-segzavazia', 'Segmentové zavažia',   999, 'https://www.alza.cz/sport/sharp-shape-magneticke-zavazi-2-1-kg-d13191247.htm', 0, '', 7,  'Vybavenie', '2026-08-03'),
  ('vzas-osa',        'Olympijská tyč',      2291, 'https://www.alza.cz/sport/fitnessline-olympijska-osa-1820-50-mm-d12370929.htm', 0, '', 8,  'Vybavenie', '2026-08-03'),
  ('vzas-paramace',   'ParaMace',            4385, 'https://the-paraball.com/products/paramace', 0, '', 9,  'Vybavenie', '2026-08-03'),
  ('vzas-kettlebell', 'Kettlbel 6kg',         539, 'https://www.alza.cz/sport/stormred-neoprene-kettlebell-6-kg-d7001628.htm', 0, '', 10, 'Vybavenie', '2026-08-03'),
  ('vzas-kotuc15',    'Kotúč 15kg',          1170, 'https://www.alza.cz/sport/fitnessline-kotouc-olympijsky-pogumovany-50-mm-15-kg-d6966098.htm', 0, '', 11, 'Vybavenie', '2026-08-03'),
  ('vzas-hexa12',     'Hexa 12kg',           1130, 'https://www.alza.cz/sport/sharp-shape-hex-12-kg-d5294087.htm', 0, '', 12, 'Vybavenie', '2026-08-03'),
  -- Parabar je v Exceli až pod súčtami, takže do 17 016 Kč nevstupuje. Tu už
  -- áno — v appke nie je „pod čiarou", buď to chceme, alebo to na zozname nemá čo robiť.
  ('vzas-parabar',    'Parabar',             5850, 'https://functionalpatterns.com/products/parabar', 0, 'V Exceli bol pod súčtami, tu sa už ráta.', 13, 'Vybavenie', '2026-08-03'),
  ('vzas-nubound',    'Nubound',            26800, '', 0, '', 20, 'Kurzy', '2026-08-03'),
  ('vzas-pdtr',       'PDT-R',              31600, 'https://resetfyzio.cz/produkt/p-dtr-prague-foundation-module-1-2026-edition/', 0, '', 21, 'Kurzy', '2026-08-03');
