# AKO FUNGUJÚ ALGORITMY (stav k 3. 8. 2026)

Tento dokument je **datovaný a zastaráva**. Platformy menia váhy signálov
priebežne a to, čo tu stojí, je pravda k dátumu vyššie — nie navždy. Appka
sleduje oficiálne kanály a keď sa niečo ohlási, povie o tom; raz za pol roka
sa má tento súbor prejsť celý.

Dôležité zarámovanie skôr, než sa niekto začne riadiť signálmi: PSB priviedol
Instagram za 18 mesiacov **5 klientov**, referencie **26**. Algoritmus je preto
nástroj na to, aby sa obsah dostal k ľuďom, nie cieľ sám o sebe. Optimalizovať
na dosah a stratiť pritom dôvod, prečo o vás ľudia hovoria, je zlý obchod.

---

## 1. INSTAGRAM

**Nie je jeden algoritmus.** Instagram beží na štyroch samostatných
ranking systémoch — Feed, Reels, Stories, Explore — a každý váži signály inak.
Preto nemá zmysel veta „Instagram teraz tlačí X"; má zmysel len „v Reels teraz
váži X".

### Tri signály, ktoré Adam Mosseri potvrdil ako najdôležitejšie

**1. Watch time (čas sledovania)** — najsilnejší signál. Rozhoduje sa v prvých
**3 sekundách**: či divák zostal, alebo odišiel. Toto je presne to, čo meria
stĺpec `% View rate (+3 secs)` v Metricool exporte — v appke ho vidno pri
každom reeli.

**2. Sends per reach (poslania v DM na dosah)** — najsilnejší signál pre
dosah k ľuďom, ktorí PSB **nesledujú**. Mosseri hovorí o zhruba **3–5× vyššej
váhe než lajk**. Toto je algoritmická podoba toho, čo Berger v *Contagious*
volá sociálna mena: obsah, ktorý niekto pošle kamarátovi, lebo tým o sebe
niečo povie.

**3. Likes per reach (lajky na dosah)** — váži hlavne pri **existujúcich**
sledovateľoch. Váha lajkov medziročne klesá.

### Čo z toho vyplýva pre PSB konkrétne

- Reels PSB majú **view rate 48 %** pri priemere okolo 30 % — hook funguje
  nadpriemerne. Problém nie je v tom, či ľudia vydržia pozerať.
- Priemerný reel má **405 videní** oproti benchmarku 580 pre účty s 1–5 tis.
  sledovateľmi — dosah je pod priemerom.
- Zdieľaní je **0,7 na reel**. Keďže sends sú najsilnejší signál pre nových
  ľudí, toto je jediné číslo, ktorého zdvihnutie by dosah reálne pohlo.

### Čo sa NEOPLATÍ

Engagement bait („napíš ÁNO do komentárov"), zmazať a znova nahrať príspevok,
kupované interakcie. Instagram tieto vzory rozpoznáva a distribúciu znižuje.

---

## 2. FACEBOOK

Facebook má pre PSB **82 810 impresií mesačne oproti instagramovým 137 200** —
teda zhruba tretinu celého dosahu — a robí sa naň 57 príspevkov mesačne.
Napriek tomu bol dlho mimo pozornosti.

Meta pre Feed dokumentuje ranking ako sled krokov: inventár (čo je k
dispozícii) → signály (kto to zverejnil, typ obsahu, vek príspevku, väzba na
diváka) → predikcie (aká je pravdepodobnosť, že s tým človek niečo spraví) →
skóre. Kľúčové je slovo **predikcia**: systém odhaduje pravdepodobnosť
zmysluplnej interakcie, nie kvalitu obsahu.

Prakticky: rovnaký obsah sa na Facebooku a Instagrame nespráva rovnako a
kopírovať jedno do druhého bez úpravy znamená plytvať jedným z nich.

---

## 3. WEB / GOOGLE (najstabilnejší a pre PSB najhodnotnejší kanál)

Search Console za júl: **252 klikov z 8 513 zobrazení**, a rad klikov rastie
stabilne z ~110 mesačne v lete 2025.

Google svoje zmeny **zverejňuje oficiálne** a s odstupom — na rozdiel od
sociálnych sietí. Jadrové aktualizácie (core updates) sa ohlasujú vopred a
majú vlastnú stránku s históriou.

Čo platí dlhodobo a nemení sa s každou aktualizáciou:
- Obsah, ktorý odpovedá na konkrétnu otázku, poráža obsah o téme všeobecne.
  (Presne to je *They Ask, You Answer* — a PSB to už robí: `/dychani/` má
  463 zobrazení za mesiac, najviac z celého webu.)
- Značkové vyhľadávanie („prosapiens" — 12 klikov v júli) je najčistejší
  signál rastúcej známosti a Google ho nevie pokaziť aktualizáciou.
- Článok pracuje roky, reel dva dni.

---

## 4. OSTATNÉ SIETE

**TikTok** — 144 sledovateľov, ale **5 591 videní za 6 príspevkov** (Ø 932 na
príspevok, teda viac než instagramový reel). Algoritmus TikToku je najmenej
závislý od počtu sledovateľov: distribuuje podľa dokončenia videa a opakovaného
pozretia. Pre PSB je to najlacnejší experiment s najväčším potenciálom.

**Threads** — 255 sledovateľov, zobrazenia profilu **+589 %**. Threads
uprednostňuje odpovede a konverzáciu pred publikovaním. Jeden príspevok
mesačne je pod hranicou, kde sa dá čokoľvek merať.

**YouTube** — 62 odberateľov, 3 videá, 65 videní. Ranking stojí na
watch time a click-through rate náhľadu. Pri tomto objeme zatiaľ nemá zmysel
optimalizovať; má zmysel iba rozhodnúť, či kanál žije alebo nie.

**LinkedIn** — 2 sledovatelia, 1 impresia. Kanál neexistuje. Buď sa ním niekto
začne zaoberať, alebo sa má prestať vykazovať.

---

## 5. ODKIAĽ SA TO DÁ SLEDOVAŤ (oficiálne zdroje)

Appka tieto kanály číta sama (Marketing → Algoritmus → Skontrolovať zmeny):

| zdroj | čo prináša | strojovo čitateľné |
|---|---|---|
| Google Search Central Blog | jadrové aktualizácie, zmeny v hodnotení | **áno** (Atom) |
| Meta Newsroom | ohlásenia pre Facebook aj Instagram | **áno** (RSS) |
| Facebook Developers Blog | zmeny v API a distribúcii | **áno** (RSS) |
| TikTok Newsroom | ohlásenia TikToku | **áno** (RSS) |
| YouTube Official Blog | zmeny v odporúčaniach | **áno** (RSS) |

**Čo strojovo čitateľné NIE JE — a je to najdôležitejší zdroj:** Adam Mosseri
oznamuje zmeny Instagramu vo videách na svojom profile a na Threads. Instagram
oficiálny RSS feed nemá (`about.instagram.com/blog/rss.xml` vracia HTML, nie
feed). Toto sa automatizovať nedá a je to dôvod, prečo appka pripomína ručnú
polročnú kontrolu, nie prečo by ju nepripomínala.

Ďalej mimo automatiky: Meta Transparency Center (dokumentácia hodnotenia pre
Feed, Reels, Stories a Explore) — mení sa zriedka, ale keď áno, je to dôležité.
