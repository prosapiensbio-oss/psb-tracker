# AKO PSB FUNGUJE — cenník, členstvá, zľavy, prevádzka

Zapísané 2. 8. 2026 podľa Jerryho odpovedí a screenshotov z PTmindera. Toto sú
PRAVIDLÁ, nie dáta. Dáta sa dajú spočítať, pravidlá sa dajú len opýtať — a keď
chýbajú, z čísel vznikajú príbehy, ktoré nie sú pravdivé. Ak sa niektoré z nich
zmení, patrí to sem, nie do odpovede.

---

## 1. Aktuálny cenník (PTminder, platný pre všetkých klientov od jan 2026)

### Offline
| členstvo | cena | obdobie | sedení | aktívnych |
|---|---|---|---|---|
| OFF – 6h BEZ viazanosti | 7 790 Kč | 8 týždňov | 6 | 12 |
| OFF – 6h S viazanostou | 6 990 Kč | mesiac | 6 / mesiac | 8 |
| OFF – 1 hodina offline | 1 450 Kč | 4 týždne | 1 | 2 |
| OFF – 8 hodín offline | 9 400 Kč | 8 týždňov | 8 | 5 |
| OFF – 18 hodín offline | 21 150 Kč | 6 mesiacov | 18 | 7 |

### Online
| členstvo | cena | obdobie | sedení |
|---|---|---|---|
| ON – 6h BEZ viazanosti | 6 590 Kč | 8 týždňov | 6 |
| ON – 6h S viazanostou | 5 640 Kč | 4 týždne | 6 |
| ON – 1 hodina online | 1 390 Kč | 4 týždne | 1 |
| TC – 1 hodina | 750 Kč | 4 týždne | 1 |
| TC – 4 hodiny | 1 790 Kč | 8 týždňov | 4 |
| TC – 4 hodiny + call | 2 490 Kč | 8 týždňov | 4 |

### Špeciálne šablóny
| názov | cena | sedení | poznámka |
|---|---|---|---|
| ONE YEAR | 90 870 Kč | 78 | 1 klient |
| SPECIAL 3 | 3 990 Kč | 3 | výnimka pre Šnyrychovcov, viď nižšie |
| Doplnenie členstva | 0 Kč | 4 | benevolencia, viď bod 3 |

**Úvodný tréning** sa ráta do tržieb. Cena sa zmenila od **septembra 2025**
(900 → 1 100 Kč).

---

## 2. História cenníka — prečo staršie platby nesedia s dnešným cenníkom

Toto je najčastejší dôvod, prečo suma v `payments` nezodpovedá žiadnej dnešnej
položke. **Nikdy z toho nerob záver, že je to chyba alebo zľava.**

- **Pred 2025:** 6 h ≈ 6 850 Kč, 8 h ≈ 8 200 Kč, 12 h ≈ 10 920 Kč
  (Jerry si presné čísla nepamätá — ber ako orientačné).
- **Marec 2025:** skúška menších členstiev pre NOVÝCH klientov — 3 h / 3 990,
  5 h / 5 990, 10 h / 10 990 Kč. Hypotéza bola, že staré ceny sú príliš veľká
  vstupná bariéra. **Nezabralo** — nepocítili nárast počtu klientov.
  Starí klienti spred marca 2025 zostali na pôvodných cenách.
- **September 2025:** prechod na dnešné členstvá pre nových klientov. Starí
  zostali na svojich cenách do konca roka — takže v H2 2025 bežali súbežne
  tri cenníky (starý 6/8/12 h, marcový 3/5/10 h, nový).
- **Január 2026:** všetci klienti prešli na dnešné členstvá. Odvtedy je cenník
  jednotný.

**Výnimka: Josef Šnyrych a Janka Šnyrychová** majú SPECIAL 3 (3 h / 3 990 Kč).
Chodia dlho, dnes už menej často, tak im PSB spravilo výnimku.
⚠ **Janka to má v PTminderi zapísané zle** — pri jej číslach s tým rátaj.

---

## 3. Platnosť členstiev a prepadávanie hodín

- **S viazanosťou:** platnosť 1 mesiac. Do ďalšieho mesiaca sa dajú preniesť
  **max. 2 hodiny** — vtedy sa vytvorí balík na 8 hodín s mesačným zámkom.
  Čo sa nestihne, prepadá.
- **BEZ viazanosti:** platnosť 2 mesiace. Čo sa nestihne, prepadá.
- **V praxi je PSB benevolentné** — namiesto prepadnutia často dajú
  „Doplnenie členstva".
- **Duch:** keď sa klient neozve **pol roka**, hodiny prepadli definitívne.

### Čo je „Doplnenie členstva" (má ho ~40 % klientov)
Členstvá sú časovo obmedzené. Keď klient termín pretiahne, PSB mu hodiny nezoberie
— ale PTminder do vypršaného balíčka už nedovolí zapisovať. „Doplnenie členstva"
je preto **technická nádoba za 0 Kč na dochodenie hodín z balíčka, ktorý už
vypršal**. Nie je to produkt ani zľava a **nesmie sa čítať ako „klient bez
balíčka" ani ako tržba 0**.

---

## 4. Zľavy — úplný zoznam z PTmindera

PSB má presne tieto kódy. **Iné neexistujú** a rodinná ani partnerská zľava
NEEXISTUJE (napriek tomu, že v klientele je veľa dvojíc a súrodencov).

| kód | zľava | uplatnená | čo to je |
|---|---|---|---|
| BTC10 | 10 % | 53× | Bitcoin, klienti spred 2025 — doživotne |
| BTC5 | 5 % | 16× | Bitcoin, každá ďalšia platba po prvej |
| BTC20 | 20 % | 4× | Bitcoin, prvá platba nového BTC klienta |
| RF10 | 10 % | 16× | **Odmena za doporučenie** |
| Sleva30 | 30 % | 16× | ⚠ nevysvetlené |
| J40 | 40 % | 13× | Jarek |
| Dar100 | 100 % | 7× | tréning zadarmo (dar) |
| DC15 | 15 % | 7× | „Dominika" — ⚠ nevysvetlené |
| FC20 | 20 % | 4× | „Friends" — ⚠ nevysvetlené |
| SC10 | 10 % | 1× | „Special" — ⚠ nevysvetlené |

### Bitcoinové pravidlo (overené proti platbám do koruny)
- Klient, ktorý chodil **pred 1. 1. 2025** → **doživotne −10 %** z každej BTC platby.
- Klient, ktorý začal platiť BTC **po 1. 1. 2025** → **−20 % z prvej** platby,
  **−5 % z každej ďalšej**.

Príklady: Jan Kalmus 10 920 → 9 828 (−10 %) opakovane; Peter Gažo prvá 8 792
(10 990 −20 %), ďalšie 10 440,50 (−5 %); Matej Procházka prvá 6 232
(7 790 −20 %), ďalšie 7 400,50 (−5 %).

### Dôležité pre analýzu
**Dôvod zľavy PTminder pozná — my ho neimportujeme.** Kódy sú v PTminderi,
v našom CSV exporte nie. Preto sa z výšky platby dôvod uhádnuť NEDÁ a nikdy
sa o to nepokúšaj: 9 828 Kč je u Jana Kalmusa bitcoin, nie odmena za
doporučenie. Kým sa kód neimportuje, pri každej nižšej sume povedz, že dôvod
nie je v dátach.

**Referral funguje.** RF10 bol uplatnený **16×** — odmena za doporučenie sa
reálne dáva. Nikdy netvrď opak.

---

## 5. Bitcoin ako rezerva (nie ako cashflow)

BTC platby sa evidujú **v CZK** — v PTminderi aj vo VZAS, v hodnote v deň
platby. Zhodnotenie sa do tržieb NEPREPOČÍTAVA: aj keby BTC vyletel, v CZK
tržbách sa to neobjaví. Skutočný stav rezervy sleduje samostatná appka
(prosapiens-btc) a Tracker ho ukazuje v rezervách.

Zámer: **peniaze od BTC klientov firma na prevádzku nepotrebuje.** Nájom a
náklady pokryjú ne-BTC klienti; BTC sa iba pridáva do rezervy a berie sa z nej
výplata, keď treba. Preto sa BTC časť nesmie čítať ako chýbajúca hotovosť.

---

## 6. Sedenia za 0 Kč (623 z 3 260, ~19 %)

Nie je to chyba. Sú to:
- hodiny dochodené cez „Doplnenie členstva",
- **odmena za doporučenie daná ako tréning zadarmo** namiesto 10 % zľavy,
- tréning zadarmo pre klientov, ktorí s niečím pomohli (napr. hovorili na video),
- narodeninový tréning zadarmo pre dlhodobých klientov, keď majú v ten deň lekciu.

---

## 7. Zrušené tréningy a neúčasť

**Storno sa nikde neeviduje.** Keď klient nepríde alebo zruší na poslednú
chvíľu, zapíše sa to **ako keby tréning prebehol**. Dôsledok pre čítanie dát:
„odrobené hodiny" obsahujú aj neodchodené hodiny a vyťaženie je mierne
nadhodnotené. Tréningy sa dohadujú v Google kalendári; do PTmindera sa raz
týždenne prepíše finálny stav.

---

## 8. Ľudia

- **Matyáš Rozbořil** — zamestnanec celý rok 2025 a jan–mar 2026, tréner do
  augusta 2025 (84 sedení, 89 h). Skončil ako študent medicíny, nestíhal to
  popri škole. Povedal, že sa vráti; PSB je presvedčené, že sa nevráti.
- **Sofia** — **barter, NEPOČÍTA sa do tržieb.** Odpočítava sa z Jarkovho dlhu.
- **Jarek** — zatiaľ **pôžička**. Keby vznikla s.r.o., bol by to 10 % podiel.
  Účtuje sa ako náklad.
- **Prideľovanie nových klientov:** prvý kontakt a úvodný telefonát má v 99,9 %
  **Terezka**. Tréner sa určí podľa preferencie klienta (muž/žena) a podľa toho,
  kto potrebuje nových klientov.

---

## 9. Kapacita

Dvaja tréneri, každý má naraz jedného klienta. **Priestor by uniesol ešte dvoch
trénerov** — úzke hrdlo teda nie je miestnosť, ale ľudia.

---

## 10. Dlhá neprítomnosť klienta — ako sa to má riešiť

Keď klient dlho nemal lekciu, appka **nemá hádať dôvod**. Má sa opýtať. Jerry
alebo Terezka klientovi napíšu a podľa odpovede sa stav upraví v Tracker →
Klienti: **Pauza** (dovolenka, zranenie, operácia) alebo **Neaktívny**. Dôvod
patrí do poznámky trénera.

Preto je signál „Je toto duch?" formulovaný ako otázka s tlačidlami
**Áno, duch / Pauza** — nie ako tvrdenie.
