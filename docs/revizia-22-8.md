# Revízia 22.–23. 8. 2026 — z Terezkinho prvého dňa v Kokpite

Terezka appku prvýkrát reálne používala 22. 8. a Jerry z toho priniesol
dvanásťbodový zoznam. Všetkých dvanásť je vybavených; pri overovaní čísel,
ktoré si vyžiadala („sedí to?"), vypadli štyri chyby v peniazoch.

## Chyby v peniazoch, ktoré našla jej otázka

| čo | ukazovalo | správne | prečo |
|---|---|---|---|
| Výdaje na reklamu 2026 | 13 882 Kč | **19 658 Kč** | čítalo sa z Metricoolu (len boostnuté kusy, júl = 0) namiesto Meta API |
| Cena za úvodný | 397 Kč | **562 Kč** | dôsledok predošlého |
| Cena za klienta (karta) | 496 Kč | **702 Kč** | dôsledok predošlého |
| Cena za klienta (lievik) | 349 Kč | **959 Kč** | navyše ročný priemer pod hlavičkou jedného mesiaca |
| Hodnota klienta (LTV) | 29 597 Kč | **35 808 Kč** | sčítavali sa ceny sedení, nulové pri balíčkoch (19 % sedení) |
| Referenčný motor — priniesli | 2 013 560 Kč | **2 233 691 Kč** | tá istá príčina |

Dve z nich ťahali proti sebe presne ten pomer, podľa ktorého sa rozhoduje
o septembrovom rozpočte: reklama vyzerala lacnejšia a klient chudobnejší.

Pravidlo zapísané v CLAUDE.md: **ceny sedení nie sú peniaze**, a **Metricool
nie je zdroj výdaja na reklamu**.

## Čo bolo overené a sedí

- Úvodných 2026: 35 (D1 = appka)
- Lievik júl: 6 dopytov, 5 úvodných, 5 nových klientov, 4 796 ÷ 5 = 959 Kč
- LTV kohorta: 97 klientov, 35 808 Kč (rovnaká definícia v SQL aj v appke)
- Dochádzka ručne dopočítaná pre štyroch klientov: Štigut 50 %, Hanus 78 %,
  Pečková 72 %, Jakubiček 89 % — appka ukazuje to isté na percento
- Segmenty 23/23/17 = 63, stavy 35+12+16 = 63, balíčky sa sčítajú na 63

## Regresie, ktoré som v ten deň spôsobil a opravil

1. Filter trénera nefiltroval platby → cena sedenia 2 173/2 272 Kč namiesto
   1 091 (celofiremná tržba delená sedeniami jedného trénera).
2. Zoskupenie v kalendári počítalo kľúč z rozpísaného poľa → po každom
   písmene vypadol kurzor.
3. „Ozvali sme sa" ukladalo na blur → Lenke Divinovej sa ticho zapísal čas
   z môjho testu. Vrátené; zápis teraz vyžaduje potvrdenie.

## Otvorené — čaká na Jerryho rozhodnutie

- **15 kariet ignoruje filter obdobia** z hlavičky. Časť oprávnene (segmenty
  a dochádzka sú stav, nie tok), ale nie je z ničoho poznať ktorá. Dá sa
  označiť, je to 15 kariet a trochu šumu navyše.
- **Sofia Resnerová nevstupuje do LTV** (59 sedení, 0 Kč — barter). Správne,
  jej hodiny sú vzdaná tržba. Ale „koľko by priniesla, keby platila" appka
  neukazuje nikde.

## Neoverené

Zrušené tréningy a náročnosť týždňov sa počítajú z ručných týždenných
zápisov, nie z databázy — proti D1 sa overiť nedajú.
