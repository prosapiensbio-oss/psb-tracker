# Kokpit — čo na ňom je a prečo

> Výsledok rozhovoru s Jerrym 10. 8. 2026 (krok 1 UX revízie: najprv ČO, potom AKO).
> Toto je zadanie pre prestavbu Kokpitu. Vzhľad rieši `design-system.md`;
> tento súbor rieši obsah a je nadradený — dizajn oblieka to, čo je tu.

## Pravidlo, ktorým sa rozhoduje

Jerry, doslova, o čísle „koľko mám tento týždeň voľných miest":

> „Čo mi je potom, koľko mám voľných miest, keď vlastne nie som schopný
> niekomu napísať, aby mi tie miesta naplnil. To by dávalo zmysel, keby máme
> 100 klientov, máme presne definované časy tréningov od 8–12, od 15–18,
> a teraz keď mi niekto vypadne, tak napísať nejakému klientovi, čo je na
> čakačke. Teraz v tejto fáze je toto celé irelevantné."

**Test pre každé číslo na Kokpite: viem s ním DNES niečo spraviť?** Nie „je to
zaujímavé", nie „je to dôležité číslo". Ak naň neexistuje akcia, patrí do
Výsledkov (mesačná uzávierka) alebo nikam. Číslo bez akcie je ozdoba a jeho
skutočná cena je, že sa vedľa neho prestanú čítať aj tie, na ktoré akcia je.

## Rozdelenie, ktoré z toho plynie

- **Vedúce** (Kokpit): dá sa nimi hýbať tento týždeň.
- **Zaostávajúce** (Výsledky): už sa stali, menia sa raz mesačne, slúžia na
  otázku „zabralo to, čo sme zmenili?".

Kľúčový fakt o rytme dát, ktorý appka doteraz ignorovala: **tržby sa
aktualizujú TÝŽDENNE** (import z PTmindera), **náklady RAZ MESAČNE** (Fio).
Preto smie byť tržba za bežiaci mesiac veľké živé číslo, ale zisk za bežiaci
mesiac neexistuje — a presne toto vyrobilo chybu z 9. 8., keď dlaždica Zisk
ukázala rozbehnutý august ako 34 155 Kč.

## Prístroje — nová zostava

| | prístroj | obsah |
|---|---|---|
| **veľké** | Tržby tento mesiac | čo už prišlo (živé z PTmindera) · čaká sa ešte ~X · spolu ~Y |
| | Odhad tržieb | ďalší mesiac, model obnov + kalendár |
| | Odmlčaní | 14+ dní bez tréningu a bez termínu v kalendári |
| | Hodiny / týždeň | tento týždeň vrátane objednaného |
| | Rezerva | runway + riadok „N klientov platí v BTC · X % tržieb" |
| | Klienti | aktívni · čistý rast / mes. · Ø noví / mes. (dnes tri čísla na dvoch miestach) |
| **malé** | Uzavretý mesiac | jeden riadok: „júl · zisk 133 465 · tržby 311 800 →" |

**Preč z Kokpitu:** Odchody (zaostávajúce, Jerry: „neviem, čo mám z toho, že
viem, koľko ľudí odchádza"), Dopyty za uzavretý mesiac (nahradené prílevom
v bežiacom mesiaci vo vnútri karty Marketing), voľné miesta (nikdy nevzniklo).

**Zostáva:** register „Vyžaduje akciu" a karta „Balíček dojde po objednaných
hodinách" — Jerry ju označil za jednu z najdôležitejších a zároveň pokrýva to,
čo by inak bola samostatná pripomienka na končiace členstvá.

## Grafy — z desiatich šesť

Každá karta: **graf na jednej strane, čísla na druhej** (Jerryho formulácia),
nie graf a pod ním tri riadky textu.

| karta | zlučuje |
|---|---|
| **Vyťaženie** | odrobené hodiny/týždeň · % v zdravej zóne · kapacita a vyťaženie · Ø cena sedenia |
| **Peniaze v čase** | mesačné tržby · tržby vs break-even · čísla zo Zdravia firmy |
| **Predikcia** | odhad tržieb, nákladov a zisku na ďalší mesiac |
| **Súhrn P&L** | náklady vs tržby |
| **Marketing** | lievik · dosah Instagramu |
| **Ekonomika klienta** | čo stojí úvodný tréning · LTV podľa zdroja |

Zvyšok zo 47 grafov zostáva v knižnici — dostupný, nezobrazený. Nič sa nemaže:
knižnica nič nestojí a raz za čas sa niečo zíde.

## Čísla k dátumu rozhovoru (na kontrolu po nasadení)

- Bitcoin: 10 klientov, 295 864 Kč celkovo, júl 129 837 Kč = **41,6 % tržieb**.
- Tento týždeň objednaných 43 h; ideál pre dvoch 58 h.
- August k 10. 8.: prišlo 36 965 Kč.
- Júl uzavretý: tržby 311 800 · náklady 178 335 · zisk 133 465 · break-even 189 270.
