-- Dopyty pre platenú reklamu: kampaň, kontakt, rýchlosť odpovede, dôvod straty.
--
-- Prečo to celé: 12. 8. 2026 malo všetkých 37 dopytov od januára stav „nový" —
-- ani jeden sa nikdy neposunul. Dvanásť z nich netrénovalo a nikto nevie prečo.
-- Kým sa reklama nezapne, je to nepríjemné; keď sa zapne, je to slepota práve
-- v mieste, kde sa míňajú peniaze.
--
-- `kampan` a `utm` sú jediné miesto, kde prežije informácia „z ktorej reklamy
-- tento človek prišiel". Existuje len v adrese v momente kliknutia — keď ju
-- formulár nezachytí, je nenávratne preč a spojenie výdavok → klient sa už
-- spätne nedá zostaviť.
--
-- `odpovedane_at` je tam preto, že v službách je rýchlosť odpovede najsilnejšia
-- páka na konverziu — silnejšia než cena aj než text reklamy. Nemeria sa.
ALTER TABLE leads ADD COLUMN email         TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN telefon       TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN kampan        TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN utm           TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN stranka       TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN odpovedane_at TEXT;
ALTER TABLE leads ADD COLUMN dovod         TEXT NOT NULL DEFAULT '';
