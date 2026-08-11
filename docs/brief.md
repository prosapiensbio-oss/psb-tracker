# Kokpit — čo to je, čo to robí a prečo to vzniklo

Interný nástroj ProSapiens Biomechanic. Beží na `kokpit.prosapiensbio.workers.dev`,
za heslom, používajú ho dvaja ľudia — Jerry a Terezka.

Tento dokument je pre človeka, ktorý appku nepozná: pre Terezku, pre účtovníčku,
pre programátora, čo do nej raz siahne, alebo pre Jerryho o rok, keď zabudne,
prečo je niečo urobené práve takto.

Stav k 11. 8. 2026.

---

## 1 · Prečo to vzniklo

Firma mala dáta na piatich miestach a odpoveď na jednoduchú otázku nikde.

- **PTminder** vedel, kto kedy trénoval a koľko zaplatil — ale nevedel nič o nákladoch.
- **Excel** viedol P&L a mzdy — ručne, s chybami, a vždy o mesiac pozadu.
- **Fio** malo pohyby na účte — bez kategórií.
- **Google Kalendár** vedel, čo sa chystá — a nikto to nespájal s peniazmi.
- **Metricool, GA4, Search Console** merali marketing — do prázdna, lebo sa
  nedalo povedať, či z toho boli klienti.

Otázky typu *„zarobili sme minulý mesiac?"*, *„komu dochádza balíček?"*,
*„oplatí sa reklama?"* sa dali zodpovedať len tak, že si človek sadol na hodinu
a poskladal to z piatich zdrojov. Väčšinou si nesadol.

**Kokpit je jedno miesto, kde tie zdroje sedia vedľa seba a čísla z nich sa
dajú porovnať.** Nie preto, aby existoval dashboard — ale preto, aby sa dalo
konať skôr, než sa problém prejaví v tržbách.

### Pravidlo, na ktorom stojí celý návrh

> **Číslo, ktoré nevedie k akcii, na obrazovke nemá čo robiť.**

Jerryho vlastný test. Preto z Kokpitu zmizli odchody klientov (kým ich uvidíš,
rozhodnutie, ktoré ich spôsobilo, je tri mesiace staré) a preto sa hodiny za
týždeň prestali počítať z minulého týždňa a začali z kalendára na tento —
s minulým týždňom sa už nedá spraviť nič.

---

## 2 · Odkiaľ berie dáta

| Zdroj | Čo z neho je | Ako sa dostane dnu |
|---|---|---|
| **PTminder** (4 CSV) | sedenia, platby, balíčky, služby | nahrávaš v Mesiac → Dáta |
| **Fio banka** | pohyby na účte | výpis CSV, kategorizuje sa v appke |
| **Google Kalendár** | čo sa chystá tento a budúci týždeň | tajná iCal adresa, sťahuje sa sám o 18:00 |
| **Metricool** | dosah a obsah na Instagrame | export CSV |
| **GA4 + Search Console** | web a vyhľadávanie | export CSV |
| **BTC evidencia** | platby klientov v bitcoine, rezerva | druhá appka, podpísaný odkaz |
| **Ručne** | hotovosť, dopyty, kampane, poznámky | + Zápis |

### Kto je zdroj pravdy

Toto je najdôležitejšie pravidlo celej appky a stojí za ním veľa opráv:

> **PTminder je účtovníctvo. Kalendár je predpoveď.**

Kalendár vidí dopredu a vidí aj to, čo sa stalo za posledné dni — ale zapisuje
sa až nedeľným exportom z PTmindera. Preto appka medzi dvoma exportmi počíta
„predbežne" (odtrénovaná hodina, ktorá ešte nie je v exporte, sa od balíčka
odčíta hneď) a keď export príde, prepíše ho skutočnosť. Zrušený tréning, ktorý
z kalendára zmažeš, sa vráti sám.

---

## 3 · Šesť obrazoviek

### Kokpit
Panel prístrojov — deväť čísel v dvoch pásmach: **Ako to ide** (bežiaci mesiac,
dá sa ešte ovplyvniť) a **Čo sa chystá**. Pod nimi register upozornení a
knižnica ~50 grafov, z ktorých je 14 zapnutých.

Farbu má len to, čo je mimo pásma. „Všetko v norme" je jeden riadok drobným
písmom, nie zelený pás — inak sa z farby stane tapeta a prestane fungovať.

### Kalendár
Týždenná mriežka ako v Google Kalendári, mapovanie mien na klientov a tri
kontroly: **Zmeny v kalendári** (čo zmizlo alebo sa presunulo), **Chýba
v PTminderi** (hodina prebehla, zápis po nej nie je — to je priamo
nevyfakturovaný peniaz) a **Balíčky**.

### Klienti
Tréningy (odrobené hodiny, analýza sedení) a Klienti (zoznam, 6M proces,
dopyty, referencie, fluktuácia a kohorty).

### Peniaze
Tržby (po mesiacoch, sedenia & cena, predikcia) · Zisky (P&L, cashflow) ·
Dlhy & výplaty · Nákupy.

### Marketing
Odkiaľ prišli klienti · Čo to stálo · Dosah a obsah · Algoritmus.

### Mesiac
Nahrávanie dát, mesačná uzávierka so šiestimi krokmi a zámok, audit zmien,
kontá, záloha, vzhľad. Plus Výsledky — kvartálne, mesačné, KPI, ciele, report.

### Jarvis
AI asistent v pravom dolnom rohu. Vidí všetky dáta, vie ich čítať aj zapisovať
(zaškrtnúť zmluvu, zaradiť platbu, zapísať záver z debaty). Po zamknutí mesiaca
navrhne mesačnú správu — **návrh na schválenie, nie automatický zápis**:
nesprávny fakt v zamknutom mesiaci je horší než žiadny.

---

## 4 · Pravidlá, ktoré nie sú zrejmé z kódu

Bez nich appka počíta nezmysly a nikto nevie prečo.

**Kotva dát.** Grafy končia posledným PLNÝM mesiacom, nie kalendárom. Keď
PTminder mešká, kalendárne „uzavretý" mesiac je v dátach prázdny — a nula by sa
čítala ako „nikto neprišiel" namiesto „nevieme". Toto je najčastejšia rodina
chýb v celej appke: *kód, ktorý predpokladá, že dáta siahajú tam, kam kalendár.*

**Break-even ráta s NÁROKOM trénerov**, nie s tým, čo si reálne vzali. Čo si
niekto vezme navyše, je pôžička, nie náklad.

**Ø cena sedenia = prijaté peniaze ÷ odtrénované sedenia**, vážene. Neráta sa
z ceny zapísanej pri sedení: pri 19 % sedení je nulová, lebo platba visí na
balíčku, a priemer z nej cenu podhodnotí o vyše dvesto korún.

**Bežiaci mesiac sa nikde nepriemeruje.** Desať dní augusta nie je mesiac.

**Zrušená BUDÚCA hodina sa hlási.** Nová rezervácia do budúcna je plán, ale
zrušenie je voľné okno a nezarobené peniaze — a čím skôr sa o ňom vie, tým
väčšia šanca ho zaplniť.

**FP Spain sú Jerryho osobné peniaze**, nie firemné školenie. Nikdy sa
neprehadzuje do nákladov firmy.

**Staré adresy sa nikdy nemažú, len presmerujú.** Odkaz z Jarvisa spred mesiaca
musí fungovať aj po prestavbe navigácie.

---

## 5 · Ako to beží

React 19 + TanStack Start na **Cloudflare Workers**, dáta v **D1** (SQLite),
26 tabuliek. Nasadenie: `git push` na GitHub → Workers Builds → za ~50 sekúnd
je to naživo. Cron Trigger sťahuje kalendár o 18:00.

Druhá appka — **BTC evidencia** (`btc.prosapiensbio.workers.dev`) — vedie
bitcoinovú knihu. Kokpit z nej ťahá rezervu a platby cez podpísaný odkaz.
Zámerne je to samostatná appka s vlastnou paletou.

Prevádzka stojí rádovo desiatky korún mesačne plus Anthropic API podľa použitia.

### Testy

`bun run test` v `app/` — 53 testov. **Nie sú písané na pokrytie**: každý
z nich je zápisom konkrétnej chyby, ktorá sa už raz stala a ktorú build ani
typecheck nechytili. Vždy, keď sa nájde chyba v počítaní, pribudne test.

### Komentáre

V doménovom kóde je vyše 4 000 riadkov komentárov a je to zámer. Nehovoria „táto
funkcia počíta priemer", ale *„takto to bolo zle, vyšlo z toho 3,3 % namiesto
8,0 %, a preto sa to teraz počíta takto"*. Je to zápis rozhodnutí priamo pri
mieste, kde platia — cennejší než samotný kód, lebo kód sa dá napísať znova,
ale dôvod nie.

---

## 6 · Čo appka zámerne NEROBÍ

- **Nezapisuje do PTmindera.** Číta z neho, nikdy doň nesiaha.
- **Nenahrádza účtovníctvo.** Je to prevádzkový prehľad, nie daňový doklad.
- **Nepočíta zisk z rozbehnutého mesiaca.** Tržby chodia priebežne, náklady raz
  za mesiac — živý zisk by bola vymyslenina.
- **Nerozhoduje za teba.** Register upozorní, Jarvis navrhne; potvrdzuje človek.

---

## 7 · Čo ešte nie je

- Automatické testy pokrývajú výpočty, nie obrazovky — tie sa overujú preklikom.
- Klientsky prístup (klient vidí svoje tempo) — nápad, nie plán.
- Mobilná appka s push notifikáciami — 3. fáza.
- Export uzávierky do PDF pre účtovníčku.

---

## Ak sa v tom niekto stratí

Každé číslo v appke má pri sebe **ⓘ** — a nie je to popisok, je to vysvetlenie,
odkiaľ číslo je a čo s ním. Keď nesedí, prvá otázka je vždy tá istá: *za aké
obdobie sa to počíta a z ktorého zdroja?* Väčšina „chýb", ktoré sme za tri
týždne našli, boli dve rôzne otázky s rovnakým názvom.
