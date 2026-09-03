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

Uzavreté 2. 8. 2026: **je to u oboch to isté, len inak zapísané.** Josef má
SPECIAL 3 s tromi hodinami, Janka má tie isté tri hodiny vedené ako „Doplnenie
členstva". Od ďalších mesiacov bude mať SPECIAL 3 aj Janka. Nie je to teda chyba
v dátach ani iné členstvo — netreba to opravovať ani na to upozorňovať.

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
| Sleva30 | 30 % | 16× | **Osobná výnimka pre Michala Knapčoka.** Nikoho iného sa netýka. |
| J40 | 40 % | 13× | **Jarek** — viď rozklad nižšie, nie je to celé zľava |
| Dar100 | 100 % | 7× | Tréning zadarmo pri niečom výnimočnom. Používa sa zriedka a nie je to podstatná položka. |
| DC15 | 15 % | 7× | **Dominika — prvá klientka PSB. 15 % navždy za prejavenú dôveru na začiatku.** Výnimočne ju dostal aj **Tomáš Krčmár** — poctivo chodí a zaplatil si rok dopredu. Kód teda nepatrí len Dominike. |
| FC20 | 20 % | 4× | **„Friends" — keď príde niekto známy.** |
| SC10 | 10 % | 1× | „Special" — jednorazové, netreba riešiť |

### Jarek (J40) — 40 % nie je zľava, je to 20 % + 20 %
Jarek má zľavu od začiatku, ale **od roku 2025 sa delí na polovicu**:
- **20 percentuálnych bodov je skutočná zľava**,
- **20 percentuálnych bodov sa odpočítava z jeho dlhu voči PSB.**

Prakticky teda **zaplatí 60 % ceny členstva** a jeho dlh sa pri každej platbe zníži
o ďalších 20 % ceny. Pri čítaní jeho platieb to nikdy nečítaj ako 40 % zľavu —
polovica z toho je splátka.

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

**Aj „osobný" kód môže dostať niekto iný.** DC15 nie je len Dominikin a Sleva30
síce vznikla pre Michala Knapčoka, ale pravidlo znie: kód hovorí, KOĽKO sa
zľavilo, nie KOMU patrí. Meno pri kóde ber ako pôvod, nie ako obmedzenie.

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

**V PTminderi sa storno neeviduje.** Keď klient nepríde alebo zruší na poslednú
chvíľu, zapíše sa to **ako keby tréning prebehol**. Dôsledok pre čítanie dát:
„odrobené hodiny" obsahujú aj neodchodené hodiny a vyťaženie je mierne
nadhodnotené. Tréningy sa dohadujú v Google kalendári; do PTmindera sa raz
týždenne prepíše finálny stav.

**Appka to však sleduje — od 31. 7. 2026.** Kalendár sa sťahuje každý večer a
rozdiel oproti predchádzajúcemu stiahnutiu sa ukladá: zrušené, posunuté aj
dopísané hodiny sú v **Kalendár → Zmeny v kalendári**, čo kalendár nezachytil
sa dopĺňa ručne tlačidlom *+ Zrušenie / náhrada*. V kontexte je to pod kľúčom
`kalendar`. Preto:

- „koľko sa mi tento týždeň zrušilo" **odpovedať sa dá** — z `kalendar.zmeny`;
- za mesiace **pred 31. 7. 2026 odpoveď neexistuje** a nie je to nula;
- nikdy netvrdiť, že appka zrušené tréningy nesleduje.

---

## 8. Ľudia

- **Matyáš Rozbořil** — zamestnanec celý rok 2025 a jan–mar 2026, tréner do
  augusta 2025 (84 sedení, 89 h). Skončil ako študent medicíny, nestíhal to
  popri škole. Povedal, že sa vráti; PSB je presvedčené, že sa nevráti.
- **Sofia** — **barter, NEPOČÍTA sa do tržieb.** Funguje ako bežná klientka: keď
  by mala „zaplatiť" členstvo, namiesto platby sa tá suma odpočíta z Jarkovho
  dlhu. Preto jej platba nechodí každý mesiac, ale v rytme členstiev — a preto je
  vo VZAS vedená hodnotou ČLENSTVA (7 790 Kč), nie hodnotou odchodených hodín.
  VZAS to má správne; hodnota jej sedení v Trackeri je len hodnota odvedenej
  práce, nie mechanizmus splácania.
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


---

## 11. Peniaze: kde je zdroj pravdy

**PTminder je zdroj pravdy o príjmoch.** Nie banka. Cez bankový účet totiž
neprejde bitcoin, hotovosť ani barter — banka teda nikdy neuvidí všetky tržby a
**nesmie sa použiť ako zdroj pravdy o hotovosti**.

**Fio slúži hlavne na VÝDAVKY.** Príchodzie platby sa v ňom sledujú nanajvýš ako
kontrola, nie ako zdroj. Pri importe z toho plynie:
- výdavky z Fio → kategórie P&L (toto je hlavný úžitok importu),
- príjmy z Fio → len krížová kontrola proti PTminderu,
- rozdiel medzi bankou a PTminderom **nie je chyba** — je to BTC + hotovosť +
  barter. Má sa vyčísliť, nie odstraňovať.

**Jedna platba môže byť rozdelená medzi bitcoin a inú cestu.** Lukáš Kríž
zaplatil na dvakrát a v bitcoine bola len časť. Keď je teda v PTminderi vyššia
suma než v BTC appke, nie je to nezrovnalosť — zvyšok prišiel inak. Vážny je len
opačný smer: v bitcoine prišlo viac, než je zapísané.

**Bitcoinové platby majú vlastnú evidenciu.** Každá platba klienta v BTC je
zapísaná v appke prosapiens-btc ako `income` s menom klienta, sumou v satoshi a
CZK hodnotou v čase platby. To je jediná úplná evidencia BTC príjmov a dá sa
použiť na krížovú kontrolu proti PTminderu.

## 11b. Nezaplatené poplatky — čo to je a odkiaľ to je

V kontexte je pole `nezaplatene` (počet, suma, položky). Je to **doslovný
obsah exportu PTminder → Finances → Transactions**, druhá sekcia súboru.

**Ako sa to číta:** v PTminderi sa poplatok po zaplatení **zmaže**. Čo teda
v zozname stojí, to je otvorené — netreba a nedá sa to párovať s platbami
v `payments`. Neexistuje „poplatok, ktorý už je uhradený, ale ešte tam visí".

**Kde to Jerry vidí:** Kokpit → dole pod „Končí platnosť členstva", nadpis
„Nezaplatené (N) · suma". Zoznam sa filtruje prepínačom trénera, celková
suma tiež — takže Jerryho číslo a číslo v kontexte (všetci tréneri) sa
legitímne líšia.

**Čerstvosť je jediná pasca.** Zoznam je zrkadlo POSLEDNÉHO importu
Transactions, nie živý stav. Keď niekto zaplatí dnes, zmizne až po ďalšom
nahratí súboru. Preto sa nikdy netvrdí „X dlhuje" ako o dnešku — správne je
„v poslednom exporte z <dátum> stálo otvorených N poplatkov".

**Balíček bez platby nie je nezrovnalosť** — viď oddiel 12c.

## 12. Storno a predplatené hodiny

**Storno neznamená stratené peniaze.** Klient má balíček predplatený vopred, takže
peniaze prišli skôr — pri storne sa len odčerpá hodina. Storno teda **neskresľuje
tržby**; skresľuje **odrobené hodiny a vyťaženie trénera**, lebo sa zapíše ako
odchodený tréning, hoci nikto necvičil. Zatiaľ sa nikde neeviduje a Jerry
premýšľa, ako to zapisovať.

**Predplatenosť je zároveň signál na predikciu.** Keď v júli príde platba za dva
mesiace, tie hodiny sa odchodia v auguste a septembri — nezaplatené hodiny v
balíčkoch sú teda pomerne spoľahlivý odhad budúcej práce aj budúcich tržieb.


---

## 12b. Platba môže kryť aj spätný mesiac

PSB je benevolentné a nechá klienta bežať mesiac pozadu. Platba preto NEZNAMENÁ
automaticky, že si klient kúpil hodiny dopredu — môže vyrovnávať dlžobu.

Príklad: Jakub Kaňovský zaplatil 1. 7. 2026 za seba aj za Annu Kadličkovú
24 928 Kč (2 členstvá × 2 mesiace, prvá BTC platba −20 %). Bol to **jeden
mesiac dozadu a jeden dopredu** — z dvanástich zaplatených hodín na osobu bola
polovica už odchodená a dopredu zostalo šesť.

**Dôsledok pre každý výpočet:** koľko hodín klientovi zostáva, sa dá zistiť LEN
zo zostatku v exporte balíčkov, nikdy z výšky platby. Výška platby hovorí, koľko
zaplatil, nie koľko má pred sebou.

## 12c. Platba a balíček sa nemusia stretnúť — ani jeden smer NIE JE chyba

Klient občas zaplatí hneď po poslednom tréningu zo starého balíčka, ale nové
členstvo sa mu v PTminderi **ešte nezaloží**. Dôvod je vecný: členstvo má
platiť **od prvého tréningu nového cyklu** a ten ešte nie je dohodnutý.
Zakladať ho skôr by znamenalo, že platnosť začne bežať naprázdno a klientovi
budú prepadávať hodiny, kým sa dohodne termín (viď oddiel 3).

**Ako to vyzerá v dátach:** platba v `payments` je, v `packages` má klient
starý riadok s nulou alebo jednotkou, prípadne v novom exporte vôbec nie je.

**Príklad, na ktorom sa to potvrdilo:** Panagiotis Tsiolis zaplatil 26. 8.
2026 dvadsaťjedentisíc stopäťdesiat korún, naposledy trénoval 20. 8. a
v exporte balíčkov z 29. 8. mu zostáva jednotka zo starého „Doplnenia
členstva". Jerry, 29. 8. 2026: *„zaplatené má, ale ešte nie sme dohodnutí na
prvý tréning z nového členstva."*

**Preto sa to NEHLÁSI ako nezrovnalosť.** Ani pri mesačnej kontrole peňazí,
ani pri kontrole balíčkov. Falošný poplach je chyba rovnakej váhy ako
zmeškaná. Jediné, čo je na tom naozaj hodné pozornosti, je **čas**: keď od
platby ubehnú týždne a stále nie je dohodnutý termín, to už nie je účtovný
stav, ale nedohodnutý klient — a to je otázka pre Jerryho, nie pre appku.

**A platí to aj naopak: balíček bez platby tiež NIE JE chyba.** Nový balíček
sa v PTminderi nahodí hneď, klient z neho začne čerpať a platba príde neskôr —
preto je ten istý človek v Kokpite naraz v „Balíček dojde…" aj
v „Nezaplatené". Jerry, 31. 8. 2026: *„my im v ptminder nahodíme nový balík,
ale ešte nezaplatili, čerpajú z neho, je nezaplatený."*

Sú to teda dva legitímne stavy, nie protiklady:

| stav | ako vyzerá | prečo |
| --- | --- | --- |
| zaplatené, bez balíčka | platba je, členstvo nie | čaká sa na deň, keď sa klient vráti — členstvo má bežať od prvého tréningu (Tsiolis) |
| balíček bez platby | členstvo beží, poplatok otvorený | balíček sa nahodí hneď, aby mohol trénovať; faktúra dobehne |

**Ani jeden sa nehlási.** Hodný pozornosti je len čas: pri prvom to je dlho
nedohodnutý termín, pri druhom dlho neuhradený poplatok — a na ten druhý je
priamo karta „Nezaplatené" (oddiel o poplatkoch, zdroj PTminder Transactions).

## 13. Mesačná uzávierka — kedy sú dáta úplné

Tréningy a platby sa do PTmindera nedopĺňajú v reálnom čase. **Uzávierka mesiaca
je prvý víkend nasledujúceho mesiaca**; ak 1. deň padne na piatok alebo víkend,
uzávierka je až ten ďalší víkend.

Dôsledok pri čítaní čísel: **posledný týždeň a hlavne prvé dni mesiaca sú vždy
neúplné.** Keď v dátach niečo chýba tesne pred uzávierkou, prvá hypotéza nie je
„klient neplatil" ani „chyba", ale „ešte to nie je zapísané". Nikdy z posledných
dní nerob závery o poklese tržieb ani o odchode klienta.

Príklad z 2. 8. 2026: v BTC appke boli Krčmárove platby za 75 425 Kč z 23.–24. 7.,
v PTminderi po nich nebola stopa. Nebola to nezrovnalosť — len ešte nebola
uzávierka.

## 14. Kontrolné zdroje verzus zdroj pravdy

Pri prijatých platbách je zdrojom pravdy **PTminder**. Bankový účet aj BTC appka
slúžia iba na **kontrolu** — overia, že to, čo je v PTminderi, sa naozaj stalo,
a ukážu prípady, kde niečo chýba alebo nesedí kurzom. Nikdy z nich nepočítaj
tržby.

---

## 15. Týždenné hodnotenie je NÁROČNOSŤ, nie energia

Jerry aj Terezka si raz týždenne zapisujú jedno číslo 1–10. Znamená, **aký ťažký
bol týždeň**: 1 = super ľahký, 10 = super ťažký. Je to rovnaká logika ako RPE,
ktoré ako tréneri používajú denne.

**Nízke číslo je dobré.** Zdravé pásmo je 1–6; mesačný priemer nad 8 je varovanie
pred vyhorením, aj keď sa zatiaľ nič nedeje na výkone.

⚠ Do 3. 8. 2026 to appka čítala OPAČNE („1 = na dne, 10 = plná sila", zelené
pásmo 6–10) a posuvník nemal štítok. Existujúce zápisy sú správne podľa Jerryho
modelu — Jerry 4 („tento týždeň bol pohoda") a Terezka 3 („stabilný") sú ľahké
týždne, nie vyhorenie. Historické dáta sa nemenili, menil sa výklad.

Vypĺňa **každý svoje** — nie jeden za oboch.

## 16. Rituály, na ktoré sa appka viaže

- **Víkend (piatok alebo nedeľa)** — týždenný zápis: náročnosť, iné hodiny,
  zrušené/presunuté tréningy.
- **Raz mesačne** — mesačné výsledky a poznámka k mesiacu.
- **Raz kvartálne** — kvartálne výsledky.

Pripomienky sa majú viazať na tieto tri okamihy, nie na vymyslený deň. Appka je
nová a zapisovanie je pre PSB úplne nový zvyk — Jerry ho chce nechať bežať a po
pár mesiacoch vyhodnotiť, či dáva zmysel.

## 17. Kto appku používa

**Obaja majú plný prístup a vidia všetko** vrátane VZAS, výplat a dlhov.

- **Jerry** — celý prehľad, financie, marketing, úpravy.
- **Terezka** — dopyty (má prvý kontakt s klientom v 99,9 % prípadov, takže
  lievik je jej vstup), vlastná náročnosť týždňa, pauzy a duchovia pri svojich
  klientoch, poznámky ku klientom.

Prihlásenie je oddelené, aby audit vedel povedať aj KTO, nielen čo a kedy.

## 18. Kam chodia dopyty

Instagram DM · **mail cez formulár na webe (najčastejšie)** · občas priamy
telefonát · občas na osobné Instagram účty Jerryho alebo Terezky.

## 19. Reklamné účty — kampane vznikajú len na jednom

Reklama sa robí **výhradne v účte `172897726151288` (ProSapiens Biomechanic)**.
Je to ten účet, ktorý Kokpit číta, a ten prepojený s Instagramom aj Facebookom.
Zadal to Jerry 19. 8. 2026 a appka to má natvrdo: kartu *Pripraviť kampaň*
nejde presmerovať inam ani prepísaním nastavenia.

Existuje aj druhý, **osobný účet `3356679857899572`**. Kokpit ho NESLEDUJE.
Viseli v ňom dve kampane z 29. 1. 2023 (boostnuté príspevky z Instagramu,
`LINK_CLICKS` a `MESSAGES`, po 100 Kč/deň), zapnuté a nedoručujúce kvôli
chybe v reklame — teda neminuli nič. Keď sa niekto pýta na výdavky za
reklamu, čísla z tohto účtu v appke NIE SÚ; keď má pocit, že niečo chýba,
prvá otázka je, či to nevzniklo tam.
