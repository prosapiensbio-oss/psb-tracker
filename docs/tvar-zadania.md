# Tvar zadania pre Claude Project

> **Prečo pevný tvar.** Project nevidí Kokpit — nemá dáta, nepozná klienta,
> nevie, čo appka práve ukazuje. Všetko, čo potrebuje, mu musí prísť v jednom
> bloku. Kým bol tvar voľný, každé zadanie začínalo odznova vysvetľovaním, kto
> je PSB, a na polovicu vecí sa zabudlo.
>
> Kánon (kto sme, tón, jazyk, FP mantinely) má Project **natrvalo** ako znalosť
> — do zadania sa už neopakuje. Zadanie nesie len to, čo je pre TENTO text nové.

---

## Kostra

```
TÉMA
  Jednou vetou, čo sa má napísať.

PREČO PRÁVE TOTO
  Dôvod z dát. Jedna veta.

ČÍSLA, NA KTORÝCH TO STOJÍ
  Konkrétne hodnoty aj s tým, odkiaľ sú a k akému dátumu platia.
  Bez toho Project nemá ako rozlíšiť fakt od dojmu.

PUBLIKUM A SYMPTÓM
  Komu to hovoríme a čo ten človek cíti alebo si myslí.
  Nie „cieľová skupina 30–45" — to je v kánone. Sem patrí konkrétny stav.

FORMÁT A DĹŽKA
  Reel / carousel / článok / titulok a meta popis / e-mail. Rozsah v znakoch
  alebo vetách.

JAZYK
  Čeština. (Uvádza sa zámerne pri každom zadaní, aj keď je to v kánone.)

ČO NESMIE ZAZNIEŤ
  Konkrétne pre túto tému — nad rámec stáleho indexu konfliktov.

HOTOVÉ VETY, KTORÉ SA DAJÚ POUŽIŤ
  Citácie klientov, vety z webu, formulácie, ktoré už fungujú. Nepovinné,
  ale to najcennejšie, čo sa dá pridať.

ČO CHCEM SPÄŤ
  Napr. „dve verzie titulku a meta popisu, pri každej jedna veta prečo."
```

---

## Príklad — vyplnené

```
TÉMA
  Nová stránka na tému „subokcipitální svaly".

PREČO PRÁVE TOTO
  Google nás na tento dopyt ukazuje na 2,3. mieste, ale stránku o tom web
  nemá — pozíciu máme zadarmo a chýba obsah, ktorý by ju uniesol.

ČÍSLA, NA KTORÝCH TO STOJÍ
  Search Console, stiahnuté 17. 8. 2026: 849 zobrazení, 10 klikov,
  priemerná pozícia 2,3. Slovo sa dnes na webe mihne len v článkoch
  /superficial-back-line/ a /superficial-front-line/, ktoré sú o niečom inom.

PUBLIKUM A SYMPTÓM
  Človek so sedavou prácou, ktorého bolí zátylok a hlava, a ktorý si to
  vygoogloval po tom, čo mu masáž pomohla na dva dni.

FORMÁT A DĹŽKA
  Stránka na web, 700–1 000 slov, plus titulok do 60 znakov a meta popis
  do 155 znakov.

JAZYK
  Čeština.

ČO NESMIE ZAZNIEŤ
  Žiadny návod na cvičenie ani cueing. Žiadny sľub, že bolesť zmizne.

HOTOVÉ VETY, KTORÉ SA DAJÚ POUŽIŤ
  Rámec, ktorý na webe funguje: „pracujeme s celým tělem, ne jen s místem
  bolesti" (2,7 % prokliku oproti 0,6 % pri anatomických stránkach).

ČO CHCEM SPÄŤ
  Text stránky, dve varianty titulku a meta popisu, pri každej jedna veta
  prečo.
```

---

## Čo sa do zadania NEPÍŠE

- **Kto je PSB, tón hlasu, FP pravidlá, index konfliktov** — to má Project
  natrvalo v kánone. Opakovať to znamená míňať miesto a riskovať, že sa obe
  kópie časom rozídu.
- **Čísla bez dátumu a zdroja.** Údaj bez toho, odkiaľ je, sa o mesiac nedá
  overiť ani opraviť.
- **Meno klienta, zdravotný detail, čokoľvek citlivé** — do zadania nepatrí nič,
  čo by sa nemalo objaviť vo verejnom texte.

---

## Postup — ako to sprevádzkovať v Claude Project

**Raz, pri nastavení:**

1. V claude.ai otvor Project, ktorý píše texty pre PSB.
2. Do **Project knowledge** nahraj `docs/kanon-psb.md`. To je ten stály originál
   — kto je PSB, tón, čeština, FP mantinely, index konfliktov.
3. Do **Project instructions** napíš tri vety:
   - *„Řiď se souborem kanon-psb.md v knowledge. Je nadřazený všemu ostatnímu."*
   - *„Všechny texty pro klienty piš česky."*
   - *„Zadání chodí v pevném tvaru: TÉMA, PREČO PRÁVE TOTO, ČÍSLA, PUBLIKUM
     A SYMPTÓM, FORMÁT A DĹŽKA, JAZYK, ČO NESMIE ZAZNIEŤ, HOTOVÉ VETY, ČO CHCEM
     SPÄŤ. Odpověz jen na to, co je v poli ČO CHCEM SPÄŤ."*

**Pri každom texte:**

1. V Kokpite → Marketing → **Čo publikovať** → karta **Čo publikovať ďalej** klikni
   pri návrhu na **Zadanie →**. Prepne ťa to do Jarvisovho okna a ten zadanie
   vyrobí v tomto tvare — aj s overením, či čísla naozaj sedia.
2. Zadanie skopíruj (tlačidlo **kopírovať** pod odpoveďou) a vlož do Projectu.
3. Text, ktorý Project vráti, **vlož späť Jarvisovi** a nechaj ho skontrolovať
   čísla, jazyk a mantinely. Project nevidí dáta; Jarvis áno. Presne takto sa
   17. 8. odhalilo, že číslo v návrhu patrí vyhľadávaciemu výrazu, nie stránke,
   a že meta popis je po slovensky.
4. Publikuj a nápad označ v Kokpite ako **použitý**.

**Keď sa pravidlo zmení:** oprav `docs/kanon-psb.md` a nahraj ho do Projectu
znova. To je celý dôvod, prečo je kánon jeden súbor a nie dva zoznamy.

---

## Kruh sa uzatvára v Kokpite

Keď z textu vznikne príspevok, patrí to späť: v Marketing → Čo publikovať sa
nápad označí ako **použitý** a vloží sa odkaz na hotový príspevok (18. 8. 2026
pribudlo pole naň). Bez toho Kokpit nikdy nezistí, či témy z dát
fungujú lepšie než témy z hlavy — a karta „Čo publikovať ďalej" zostane vierou,
nie meraním.
