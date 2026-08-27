-- Uloženie titulky k príspevku.
--
-- Bez toho sa nastavenie stratí zavretím okna: Jerry si vyberie skladbu,
-- doladí posuny, stiahne PNG — a keď sa k tomu o týždeň vráti, začína odznova.
--
-- Ukladá sa JSON: skladba, režim, štítok, nadpis, podnadpis a ručné úpravy.
-- FOTKA SA NEUKLADÁ. Je to súbor z Jerryho počítača a ako `data:` URI by
-- nafúkla každú odpoveď plánovača o stovky kilobajtov, aj keď o titulku
-- vôbec nejde.
ALTER TABLE mkt_napady ADD COLUMN titulka TEXT NOT NULL DEFAULT '';
