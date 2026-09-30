-- Pocitovka sa pýta na TO, S ČÍM KLIENT PRIŠIEL.
--
-- Jerry, 30. 9. 2026: „v anamnéze môže človek zakliknúť, ak ho niečo bolí,
-- preto by mala byť tá správa personalizovaná a človek by mohol zaškrtávať
-- stále tie svoje problémy, ktoré mal na počiatku."
--
-- Jedno číslo „bolesť" to nevie: klient má v anamnéze krk 7 a koleno 3 a po
-- troch mesiacoch sa jedno zlepší a druhé nie. Preto pole oblastí v tom
-- istom tvare, aký má anamnéza — `[{"oblast":"krk","sila":7}]` — a tá istá
-- stupnica 0–10, aby prvá hodnota z anamnézy bola priamo porovnateľná.
ALTER TABLE klient_merania ADD COLUMN oblasti_json TEXT;

-- `pohyb` sa pýtal „ako ĽAHKO ti išli bežné veci" (viac = lepšie) a to bola
-- jediná otázka, ktorá išla opačným smerom než zvyšok. Jerry, 30. 9. 2026:
-- „pokiaľ bude vedľa 1 napísané najlepšie a vedľa 10 najhoršie, každý to
-- pochopí." Otázka sa preto obrátila na ŤAŽKOSŤ a s ňou aj meno stĺpca —
-- v celej pocitovke je odteraz nižšie číslo lepšie.
ALTER TABLE klient_merania RENAME COLUMN pohyb TO tazkost;

-- Skúšobný zápis z overovania (AATest, 30. 9. 2026). Je to moje testovacie
-- dáta a jeho `tazkost` by sa po otočení otázky čítalo naopak.
DELETE FROM klient_merania WHERE klient = 'AATest Testový';
