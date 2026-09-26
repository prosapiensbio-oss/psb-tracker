# Zoznam — čo je rozrobené a čo čaká

**Prečo je to v súbore a nie v chate.** 25. 9. 2026 som Jerrymu vypísal, čo
zostáva, a zoznam som poskladal len z tej jednej konverzácie. Vypadla z neho
myšlienková mapa na plánovanie, ktorú si vypýtal 7. 9., NDA pri fotkách a šesť
dôvodov odchodu — všetko veci staršie než okno, v ktorom som práve bol.
Jerry: „v tvojom zozname mi napr. chýba aj, sme riešili myšlienkovú mapu pri
tvorbe marketingových plánov." Mal pravdu a príčina je jednoduchá: zoznam žil
v správach, a tie sa strácajú.

**Pravidlo:** keď niečo Jerry odloží alebo keď mu niečo sľúbim na neskôr,
patrí to SEM v tom istom ťahu. Hotová vec sa z hornej časti maže a jednou
vetou dopíše do „Zavreté" dolu — aby sa už nikdy neotvárala odznova.

Stav k **26. 9. 2026**.

---

## 1 · Čaká na Jerryho slovo

| Vec | Odkedy | Otázka |
|---|---|---|
| 17 potvrdení mien z kalendára (Terezka) | 25. 9. | zlúčiť do jedného riadku registra, alebo nechať po jednom? |
| 9 falošných zrušení („zmizol tréning", ktorý sa nezmizol) | 25. 9. | označiť ako vysvetlené, alebo prejde sám? |
| Dovolenka Anny Kadličkovej a Jakuba Kaňovského zapísaná k 7. 10. | 25. 9. | patrí k 30. 9.; tlačidlo „Vrátiť späť" už existuje |
| Odskok augusta: zisk 18 072 → −26 154 Kč za pár hodín | 25. 9. | mám zistiť, odkiaľ ten rozdiel 44 226 Kč prišiel? |
| reCAPTCHA na /uvodni-trenink/ (1 084 kB) | 21. 9. | vymeniť za honeypot? bez toho sa LCP pod 7 s nedostane |
| Instagram feed v pätičke (~200 kB, celý web) | 21. 9. | odstrániť? |

## 2 · Prijaté, nezačaté

- **Dávkové potvrdzovanie bankových platieb** (Jerry, 25. 9.). Z 238 príjmov
  od 1/2026 je priradených 113. Pri poslednom meraní malo 74 nepriradených
  jednoznačný návrh — zoznam s odškrtávaním a jedným potvrdením z toho robí
  prácu na večer, nie na mesiac. Dnes sa potvrdzuje po jednom.

- **Anamnéza klienta v Kokpite** (Jerry, 26. 9.). Argument je jeho: „ak už
  máme citlivé dáta o meraniach klientov, spravme v Kokpite aj anamnézu a tým
  pádom tu bude všetko." Tabuľka `klient_merania` už dnes drží telesné
  merania, takže sa tým nezvyšuje kategória údajov — len prestane byť pravda
  o klientovi roztrhaná medzi appku a papier. Rozsah dohodnúť; pri zdravotných
  údajoch platí „len to, čo sa naozaj používa pri tréningu".

- **Fakturácia v Kokpite** (Jerry, 26. 9.). Rozhovor je v konverzácii z 26. 9.,
  fakty: 84 faktúr od 2023, z toho 37 za rok 2026 (347 079 Kč), číselná rada
  `RRRRNNNN`, posledná 20260038. Dnes v iDokladi. Faktúra má vzniknúť pri
  balíčku, niesť QR platbu a odísť mailom.

- **Grafy na vlastných dátach, nie na reportoch** (Jerry, 26. 9.). Meradlo
  beží v Prechode („Vlastné dáta proti exportu", dvojitý výpočet za posledné
  tri mesiace). Stav k 26. 9. — august, jediný uzavretý mesiac:
  tréningy 186/183, hodiny 186/183, klienti 54/54 sedia; **peniaze
  199 036 / 83 940 nie**. Chýbajú DVE veci, obe známe:
  (a) staré názvy v kalendári nie sú namapované (júl −21 tréningov pri 32
  nezaradených), (b) z bankových príjmov je priradená polovica — august 32
  príjmov za 180 817 Kč, priradených 16. Banka teda peniaze má, len nevie,
  komu patria. Cieľ:
  dochádzka a tréningy z Google kalendára, peniaze z Fia a vlastných platieb;
  export z PTmindera beží súbežne a porovnáva sa. Prvý krok hotový —
  doplnenie histórie z iCalu a mesačné porovnanie v Prechode. Merané 26. 9.:
  august sedí (183 / 186), staršie mesiace chýbajú takmer presne toľko, koľko
  je v nich NEZARADENÝCH udalostí (marec −72 pri 72 nezaradených). Ďalší krok
  je teda hromadné mapovanie starých názvov, nie ďalšie sťahovanie. Potom to
  isté pre peniaze a až nakoniec prepnutie grafov.

## 2b · Myšlienková mapa — čo z rešerše zostalo nepostavené

Traja agenti (tester, kontrolór, kritik) prešli mapu 25. 9. 2026 a porovnali
ju s MindMeisterom, MindMupom, Coggle, Freeplane, XMindom a Mirom. Chyby sú
opravené; toto sú mechaniky, ktoré tie nástroje majú a my vedome zatiaľ nie,
zoradené podľa toho, koľko práce Jerrymu ušetria:

1. **↑/↓ skok na súrodenca a ⌘↑/⌘↓ preradenie** — dnes sa klávesnicou dá ísť
   len dopredu; späť na štvrtý nápad len myšou. Preradenie je jediný spôsob,
   ako z výsypu spraviť poradie bez prepisovania. `poradie` v databáze už je.
2. **Osnova ako druhý POHĽAD na tie isté riadky** (XMind Outliner) — dnes
   vieme len jednosmerný text. Písanie dvadsiatich viet je v zozname
   rýchlejšie a celý mesiac sa dá prečítať naraz.
3. **Viacnásobný výber v „Vysyp a usporiadaj"** — priradiť fázu dvadsiatim
   nápadom je dnes dvadsať mierení na malé tlačidlo.
4. **Hľadanie (⌘F)** — odkedy je máp viac, „napísal som to už?" nemá odpoveď.

Vedome NEROBIŤ (z tej istej rešerše): ukladané pozície a voľné ťahanie,
prepojenia medzi vetvami, ikony a priority, prezentačný režim, zdieľanie,
AI dopĺňanie mapy, šablóny. Každá z nich je rozhodnutie urobené namiesto
napísania ďalšieho nápadu — a pri jednom človeku s jedným cieľom nič nerieši.

Menšie, zatiaľ neopravené: Enter vloží súrodenca až za nasledujúceho (poradie
sa neprečíslováva), server neoveruje, že `rodic` existuje, a `vetvaUzla`
s `viditelny` sa pri každom vykreslení počítajú odznova (pri 200 nápadoch
~12 ms na znak; dnes desiatky, takže neviditeľné).

~~**Vlastné vetvy.**~~ Hotové 25. 9. 2026 (migrácia 0078): zoznam vetiev
žije v `mkt_mapy.vetvy`, nová sa píše v ponuke pri kmeni, na obvode vetvy sa
dá premenovať, prefarbiť, prehodiť na druhú stranu a zmazať. Zmazanie nápady
nemaže — padnú do odkladiska.

## 3 · Blokované niečím mimo Kokpitu

- **NDA pri fotkách pred/po** (od 8. 9.) — kým nie sú skontrolované súhlasy
  klientov, ktorých fotky sa už niekde použili, nemá zmysel stavať úložisko.
  Je to jediná zostávajúca cesta, ako dokázať výsledok obrazom (meranie
  bolesti Jerry 24. 9. zrušil natrvalo — pozri „Zavreté").
- **Google Ads „Basic"** — žiadosť podaná 14. 8. 2026, stále bez verdiktu.
  Dovtedy sa objem hľadania merať nedá a do appky sa odhady nepíšu.

## 4 · Odložené do vypnutia PTmindera

- Na karte klienta nahradiť „zaplatil podľa PTmindera" **dvoma číslami vedľa
  seba** — Kokpit a export. Podrobne aj s dôvodom v `CLAUDE.md`, sekcia
  „Súbežný chod potrebuje meradlo".

- **Vytiahnuť z PTmindera maily a telefóny** a pripojiť ich k profilom
  klientov (Jerry, 26. 9.). Bez nich sa faktúra ani pripomienka nedá poslať
  z Kokpitu — dnes je v appke 9 mailov (a tie sú z dopytov, nie od klientov)
  a v iDokladi 8 z 35 kontaktov. Odísť z PTmindera bez tohto kroku by
  znamenalo stratiť jediné miesto, kde tie kontakty sú.

## 5 · Fronty, ktoré appka meria a nikto ich neznižuje

Toto nie sú úlohy pre Kokpit, je to práca, na ktorú Kokpit ukazuje. Čísla
k 25. 9. 2026:

| | koľko |
|---|---|
| bankové príjmy bez priradenia | ~125 z 238 (priradených 113) |
| dopyty bez dôvodu, prečo sa z nich nestal klient | 46 |
| dopyty bez času prvej odpovede | 46 |
| nevysvetlené zmeny v kalendári | 36 |
| závery po termíne overenia | 13 z 18 otvorených |
| šesť konkrétnych dôvodov odchodu — Andrea Čonkova, Vojta Bartoň, Viera Adamkova, Josef Žiška, Jiri Kubik, Denisa Chmelarova | 6, všetky prázdne od 15. 9. |

## 6 · Nový web (téma psb-spready, nahraná neaktívna)

Z posledného kola kontroly (17.–18. 9.) zostalo:

- tablet na šírku 1024×768 — pretekanie pod spodnú lištu na viacerých
  stránkach (Domov, Úvodný tréning, Vzdelávanie, Služby, Online, Test),
- tablet na výšku 820×1180 — 22 obrazoviek vyplnených pod 55 %,
- „Kariéra → Koho hledáme" pri výške 600 px — druhá obrazovka na 33 %,
- v článkoch je zeleného zvýraznenia priveľa (74 zvýraznení dlhších než osem
  slov na 15 článkoch; pravidlo boli 2–4 krátke spojenia).

---

## Zavreté (aby sa neotvárali odznova)

- **Meranie bolesti** — Jerry 24. 9. 2026 zrušil natrvalo. Neponúkať.
- **Peniaze bez pohybov z banky** a **Marketing zoradený ako cesta** —
  skúšané v bete 24.–25. 9., Jerry oboje zamietol („len si zmenil názvy
  kategórií"). Namiesto nich vznikli Prehľady.
- **Myšlienková mapa na plánovanie marketingu** — postavená 25. 9. 2026
  (Marketing → Plán a čo vyrobiť). Uzly sú riadky v `mkt_napady`, nie druhý
  zoznam; tri vetvy (dva lieviky + odkladisko), klávesnica Tab/Enter,
  rozloženie sa počíta, výstup je text pre Jarvisa.
- **Matyáš záskok** — skončil 20. 9. 2026.
- **Ambiguózne meno v kalendári sa nemá auto-priradiť** — hotové 22. 9.
  (kal_mapovanie.cas + vedome).
- **Dve klientky „Marketa"** — tým istým zásahom.
