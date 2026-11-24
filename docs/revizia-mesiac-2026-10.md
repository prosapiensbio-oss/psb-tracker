# Mesačná revízia Kokpitu — október 2026

Spustená automaticky 24. 11. 2026 po uzávierke októbra (zamknutý 10. 11. 2026 z Workspace).
Kontrola appky podľa `app/src/lib/psb/kontrolnePrompty.ts` (peniaze, klienti, marketing,
Jarvis). Jerryho čísla sa neprepočítavali ani neprepisovali.

## Zhrnutie

**Dopad na peniaze:** žiadna chyba v októbrových tržbách. Platby za október
z knihy Kokpitu: 275 222 Kč (39 platieb). Z toho banka 167 300 Kč, bitcoin
63 036 Kč a hotovosť 44 886 Kč. Kód P&L ich berie rovnako. Žiadna duplicita,
žiadna platba bez klienta. Každý príjem z banky v októbri je priradený alebo
zaradený.
Jediná vec s korunami: **zostatok účtu v rezerve je z 1. 11. (61 563 Kč)**, hoci
banka sa importuje každú noc (nález 2).

**Musí rozhodnúť Jerry:**
1. Opraviť 12 odpovedí, ktoré ostali pod starým menom „Matej Prochadzka“
   (nález 1). Je to zásah do dát, preto len návrh.
2. Či má nočný import Fio prepisovať zostatok účtu (nález 2), alebo má zostatok
   ostať ručný.

**Opravené (bez nasadenia, ide len o testovací skript):** `scripts/naostro.sh`
a `scripts/naostro.ts`:
- skript nečítal dochádzku z kalendára od 1. 10.;
- simulovaná odpoveď v ňom nemala čas.

Dával tri falošné ✗ a falošného červeného „ducha“. Teraz prechádza celý.

**Nespravené:**
- Kód appky sa nemenil ani nenasadzoval: pracovný strom je špinavý od inej
  session (`App.tsx`, `filtrePohybov.ts`, `zoznam.md`, návrhy). Opravy 1 a 2
  ostávajú ako návrh v `docs/zoznam.md`.
- Naživo sa neklikalo. Obrazovka Peniaze → Zisky a Jarvisova odpoveď na tržby
  októbra sa neporovnali (tretia kópia pravdy); overený je len kód a databáza.
- Notifikácie „Platnosť končí“ (Krivdová, R. Matl, Pavlík) sa nedali overiť proti
  appke. Skript nečíta balíčky Kokpitu (`balicky`, doplnenia, prenosy), takže
  ich zostatok môže rátať inak ako appka.

## Nálezy

### 1. Premenovanie klienta zahodí jeho odpovede na notifikácie (chyba v kóde)

`/api/premenuj` (`app/src/routes/api/premenuj.ts`, zoznam `TABULKY`) prepíše
meno vo vyše 40 tabuľkách, ale nie v `anomaly_ack`. Tam je meno súčasťou kľúča
(`platnost|meno|deň`, `mute|gone|meno`, `narodeniny|meno|…`). Po premenovaní
sa každá odpoveď stratí a notifikácia sa vráti.

Dôkaz v D1 (Matej Prochadzka → Matěj Procházka, 15.–16. 11.):
- `SELECT count(*) FROM anomaly_ack WHERE instr('|'||anomaly_key||'|','|Matej Prochadzka|')>0`
  = **12 odpovedí** pod starým menom.
- `platnost|Matej Prochadzka|2026-11-10` = „1 h prepadlo“ (11. 11.). Notifikácia
  `platnost|Matěj Procházka|2026-11-10` je dnes znova otvorená (naostro, sekcia C).
  **Falošná notifikácia.**
- `odpoved-klienta|…|2026-11-07`: Jerry odpovedal 2× (10. 11. pod starým menom,
  16. 11. pod novým).
- `mute|gone|Matej Prochadzka` („nehlásiť“ z 14. 8.) už neplatí. Keď Matěj
  vynechá, „Nechodí“ sa ozve znova.

**Návrh opravy (kód):** v transakcii premenovania pridať
`UPDATE OR IGNORE anomaly_ack SET anomaly_key = substr(replace('|'||anomaly_key||'|', '|'||?2||'|', '|'||?1||'|'), 2, length(replace('|'||anomaly_key||'|', '|'||?2||'|', '|'||?1||'|')) - 2) WHERE instr('|'||anomaly_key||'|', '|'||?2||'|') > 0`.
`OR IGNORE` nechá na pokoji kľúč, ktorý pod novým menom už existuje. Pridať
test do `premenujTabulky.test.ts`.

**Návrh opravy (dáta, len so súhlasom):** ten istý UPDATE pre
„Matej Prochadzka“ → „Matěj Procházka“. Pri „Svetopluk Stoklasko“ je jedna
odpoveď (platnosť do 20. 9.), tá už nič neovplyvní.

### 2. Zostatok účtu v rezerve sa nočným importom neobnovuje (chyba v kóde / medzera)

`vzas_settings.fio_zostatok` = `{"suma":61563,"datum":"2026-11-01"}`. Posledný
import pohybov je z 24. 11. 04:10Z (`automaty.fio-banka` ok). Nočná akcia
`auto` v `app/src/routes/api/fio.ts:199` dostane od banky celú odpoveď aj so
zostatkom. Zapíše však len pohyby. Zostatok zapisuje iba tlačidlo (`akcia:
"zostatok"`, :359). Dlaždica Rezerva preto stojí na čísle starom 23 dní.
Kontrolný prompt to hlási ako chybu: „dátum na dlaždici je starší než posledný
import“.

**Návrh:** v `auto` volať `zostatokZOdpovede(json)` a pri neprázdnej hodnote
zapísať `fio_zostatok` s dátumom `doDna`. Test do `fioApi.test.ts` už má
vzorovú odpoveď.

### 3. Hĺbkový test notifikácií hlásil chyby, ktoré appka nemá (opravené v skripte)

`./scripts/naostro.sh` skončil s „ZLYHANÍ: 3“, všetky pri `duch|Tomaš Dvořak`.
Mal dve príčiny:
- **Simulovaná odpoveď bez `ackedAt`.** Epizóda ticha (`platneOd` = posledný
  tréning) brala odpoveď s prázdnym časom ako staršiu než tréning. Odloženie
  „neplatilo“ len v teste.
- **Skript nepoužíval dochádzku z kalendára** (`spojDochadzku`, od `KOKPIT_OD`).
  Čítal len export PTmindera (končí 16. 10.) a 21 dní kalendára. Tréning
  Tomáša Dvořáka 20. 10. preto nevidel. Hlásil 69 dní (červená), appka
  hovorí 35 (oranžová).

Oprava: `sAckom` dopĺňa čas, skript sťahuje `kal_dochadzka` tým istým dopytom
ako `loadData` a dochádzku skladá cez `sedeniaZKalendara` + `spojDochadzku`.
Bod 9 berie kľúč, ktorý nie je epizódou ticha. Tá sa po odpovedi vôbec
nevyrobí, takže ju nie je s čím porovnať. Opakovaný beh: **VŠETKO PREŠLO**.

## Prejdené bez nálezu

- **Tržby 10/2026:** `platby` 275 222 Kč, P&L berie `data.payments` od `peniaze_kokpit_od`
  = 2026-10 (`spojPlatby` → `monthlyFinance().cash`). Archív PTmindera za október
  (141 555 Kč, export do 20. 10.) sa nepripočíta.
- **Spoločné prevody:** 8 pohybov z Fio rozdelených na dvoch klientov. Súčet
  platieb = suma v banke pri všetkých.
- **DK Consulting zaplatila faktúru 20261007 dvakrát** (26. a 27. 10., 2 × 15 580 Kč,
  dve rôzne ID pohybu). Jerry druhú 28. 10. vedome zapísal ako platbu vopred
  (`platby.vopred = 1`). Vysvetlené, nie je to nález.
- **Príjmy z banky v októbri:** 31 pohybov. Všetky sú priradené klientovi alebo
  zaradené ako výplata/príjem iné (2× zaradené ako výplata Jerry — 11 000 a 979 Kč, 114 Kč od D. Križovej ako príjem iné).
- **Nočné automaty:** 20 automatov, 7 dní, 0 zlyhaní (`automaty`).
- **Notifikácie dnes:** 8 otvorených, nikto nedostal tú istú otázku dvakrát,
  žiadna nie je bez adresáta. Falošná je preukázateľne 1 (Procházka, nález 1).
  Tri o platnosti sú neoverené (pozri Nespravené).
- **Jarvis — `SCHEMA_DB` proti D1:** žiadny stĺpec, ktorý by v DB nebol. Chýbajú
  väčšinou technické stĺpce (`updated_at`, `dedup_key`, heslá). Vecne by sa
  hodilo doplniť `klient_merania.bolest` a tabuľky `platba_mapovanie` /
  `platba_nie_klient` (kto za koho platí, čo nie je klient). Zaradené do zoznamu
  ako drobnosť.
- **Vek dát:** Fio 24. 11., kalendár 24. 11., Metricool 24. 11., dopyty 24. 11.,
  GA4/GSC 10. 11. (mesačne). `web_stranky.nacitane_at` 12. 11. je v poriadku:
  zapisuje sa len pri zmene stránky a beh `text-webu` je dnes ok.
- **Jerryho poznámky k októbru** (`vzas_month_notes`): „zabudli sme na Jarkovu
  splátku“. Proces, nie appka; od 30. 10. ju stráži Platby mesiaca. V novembri
  je odkliknutá (`platba-mesiaca|splatka-jarek|2026-11`).
