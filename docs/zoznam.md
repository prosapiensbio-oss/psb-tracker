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

Stav k **27. 10. 2026** (overené v D1: ponuku termínov si klienti vybrali už 3× — Prochádzka, Kaňovský, Pavlík; pocitovka 0 odpovedí; anonymný dotazník 0 kôl).

---

## PORADIE OD 13. 10. 2026 (Jerry: „napíš celý zoznam a poradie“)

Staré poradie z 5. 10. je celé hotové (nižšie). Toto je všetko, čo je
otvorené, zoradené podľa toho, čo sa dá stratiť, čo je lacné a čo na čom stojí.

**A · Kým beží PTminder (po vypnutí sú dáta preč)**
1. [x] Export rokov pred 2025 → archív. (19. 10. 2026: Jerry stiahol všetky reporty — sedenia od 1/2022, predaje od 8/2022, platby 2023 a 2024, balíčky, transakcie, Client List. Uložené v `~/Downloads/PTminder archív 2026-10-19/`; do Kokpitu sa NEZARAĎUJÚ (Jerry: „nebudeme tieto reporty zaraďovať do Kokpitu“). Z nich prezentácia porovnania rokov: https://claude.ai/artifact/7onH5VTCJwxkrSJCWkt2EX. Platby za 2022 v exporte nie sú.)
2. [x] Maily a telefóny klientov z PTmindera k profilom — sekcia 4. (19. 10. 2026: Client List naliaty — 234 klientov, súčasní mali kontakty už skoro všetci; pribudli staré kontakty a dátumy registrácie → „klient od“ a „spolupracujeme“ v profile.)

**B · Čaká len na Jerryho slovo (minúty)**
3. [x] Poslať FP mail (Jerry 20. 10.: hotovo) (`docs/fp-otazka.md`, 2 otázky — NDA a overovací odkaz; otázka o reakčných videách zrušená 13. 10.).
4. [x] Prvé tri vyhodnotenia v Dozore reklám. (Jerry 20. 10.: hotovo) (Cieľová cena za dopyt ODLOŽENÁ — Jerry 15. 10. 2026: „sme radi, že nám príde akýkoľvek dopyt, ladíme reklamy a necháme to na neskôr.“)
5. [x] Vyskúšať na telefóne: (Jerry 20. 10.: hotovo) kalendár v mobile, gestá v kalendári, push z ponuky termínov.
6. [x] Miřejovský 752 a októbrové príjmy z banky priradiť → potom prepínač peňazí na Kokpit. (Overené 19. 10.: peniaze z Kokpitu zapnuté od 10/2026.)
7. [x] FIO_TOKEN do bety (jeden príkaz). (Overené 19. 10.: secret v kokpit-beta je.)

**C · Strižňa 1.0 (hranica v sekcii 2) — Jerry: na zajtra, 14. 10. 2026**
8. [ ] Terezka prejde jeden reel celým kruhom; opraviť, čo padne.
9. [ ] Upload do Higgsfieldu (SSL pri PUT) – opravované 3× (eba67c2, 741b0fe, dfa9b7b); nechať otvorené, kým ďalšie veľké nahratie neprejde.
9b. [ ] Overiť naživo: nahratie 1–2 GB z iPhonu, mikrofón v Electrone, klávesy a ⌘± na reálnej klávesnici.
9c. [x] Staré projekty so zastaraným renderom – 20. 10. 2026 Strižňa hlási 0 zastaraných (GET /api/zastarane), nie je čo prerenderovať.
9f. [x] Ďalšie profily v Strižni – hotové 19. 10. 2026 (Jerry: „priprav Strižňu pre tie ďalšie naše profily“): PSB,
    @philipjerry, @filip_stranavsky, @ahsoka.the.whippet vo vlastných značkách Metricoolu, Terezka ručne; farby grafík,
    tón Clauda, výber účtu pri nahrávaní. Commit c14f3d2 v strizna.
9j. [x] Prepínač profilov – každý účet autonómny, hotové 19. 10. 2026 (Jerry: „prepínač profilov na úvodnej stránke…
    každý profil je autonómny“). Prehľad + ľavé menu; Produkčný deň, reposty, memy, infografiky (aj Jarvis), karty,
    kalendár a výsledky z Metricoolu pre každú značku zvlášť. Commity de7464a, 0a15b29, 29de5c6, b3b5670 v strizna.
    Ostáva len PSB: feed z Metricoolu; Jarvis pri inom účte vidí karty a výsledky PSB.
9m. [x] Okno príspevku v Kalendári (Jerry 20. 10.: hotovo) (19. 10. 2026, commit 54a3ea8 v strizna) naostro: prvá zmena textu/titulky cez Metricool
    (updateScheduledPost s novou titulkou je neoverený) a prvá kópia strihu na iný účet.
9l. [x] Prepínač profilov naostro: (Jerry 20. 10.: hotovo) prvé stiahnutie výsledkov @philipjerry / @filip_stranavsky / @ahsoka (Metricool, nikdy
    neoverené) a prvý mem/infografika plánovaná do inej značky.
9k. [x] (jazyk Ahsoky sk + textár profilov 25. 10.; Filip má paletu) Skontrolovať u Jerryho: tón a farby profilov (Filip nemá v skilloch paletu – má farby štúdia bez loga; jazyk Ahsoky nenastavený).
9g. [x] ✦ AI záber: (Jerry 20. 10.: hotovo) prvé skutočné generovanie (Higgsfield, 2 / 6,25 kreditu) – zatiaľ overený len prompt; klik je Jerryho.
9h. [x] Presúvať video ťahaním medzi stopami Video 3 / Video 4 – hotové 19. 10. (strizna daf12d9, BRoll.stopa; overené 20. 10. v kóde).
9i. [x] Nestabilné testy pod záťažou – vyhľadávač opravený 19. 10. (a38ac82), synchronizácia 20. 10. (ea2a68f); dve sady naraz prešli.
9k. [x] Kľúčové snímky farieb ◆ na časovej osi + prechod plynulo / lineárne / skok – hotové 19. 10. (strizna daf12d9; overené 20. 10. v kóde).
9l. [x] Kľúčové snímky polohy aj pre B-roll / kameru B – na osi sú ◆ pri kamere B aj vrstvách (overené 20. 10. v kóde).
9m. [x] Kalendár: presun príspevku ťahaním na iný deň – hotové 19. 10. (kalendarPresun.ts; overené 20. 10. v kóde).
9n. [ ] Terezka: `~/.local/bin/claude` → `/login`, potom znova spracovať jej dni a prejsť test (`docs/test-terezka.md`).
9o. [x] (hotové 22.–23. 10.: Cvičenie v pohybe, podpisové prvky, 10 prechodov) Strih cvičebných videí je mdlý (Jerry 22. 10.): diagnóza (strih vs. natočenie), výskum techník (strih v pohybe medzi uhlami, rytmus, zrýchlenie/spomalenie, detail) a štýl „Cvičenie v pohybe“ v Strižni; skúšobné zábery v ~/Downloads/filip_stranavsky fp insta.
9p. [x] (hotové 23. 10.; YouTube sťahuje cez ~/bin/yt-dlp) Strižňa – Vložky (Jerry 23. 10.): filmové reakcie (obraz, hlas ide ďalej) aj hlášky so zvukom, CZ/SK klasiky aj Hollywood; banka vložiek, hľadanie scén na YouTube cez titulky, návrhy z prepisu. Vzor: @nadacia_zastavmekorupciu (vložka každé 3–4 s, Poirot ako vizuálny vtip).
9q. [ ] Prvé ostré skúšky (26. 10.): hotové video #24 Ahsoky → titulka + naplánovať v Metricoole; AI titulka Ahsoky (Higgsfield, kredity); prvý presun ťahaním v Kalendári po oprave twitterData; Príbeh z klipov na ďalšom priečinku (#22, #28–32).
9r. [ ] Push na GitHub: chýba len Príbeh z klipov (6 commitov, zvyšok už na GitHube je) – čaká na Jerryho „pushni“.

**D · Obsah — nové nástroje, až po Strižni 1.0**
12. [x] Analyzátor IG videa (hotové 19. 10., #/analyzator; YouTube/IG sťahovanie viď SPEC „yt-dlp je zamrznutý“) (háčik, strihy, popis) + popisy konkurentov z Metricoolu.
14. [x] Osobné profily — nahradené 19.–20. 10.: profily sú v Strižni (prepínač účtov, značky Metricoolu, farby) – Jerry to tak chcel (Jerry 13. 10.; otvorené otázky v sekcii 2).

**E · Keď bude čas / keď sa niečo ukáže**
15. [ ] Pocitovka – ~30. 10. pozrieť počet odpovedí.
16. [x] Prezentácia reportu – hotové 20. 10. 2026: telefón na výšku má vlastné rozloženie (720×1280, jeden stĺpec), „🖨 Tlačiť / PDF“ dá každý slajd na vlastnú stranu 16:9. Overené mimo appky na ukážkovom reporte; na skutočnom Jerryho telefóne ešte nie.
17. [ ] Anonymný dotazník aj bývalým klientom.
18. [x] Objem hľadania z Google Ads – hotové 20. 10. 2026: Marketing → Vyhľadávanie → „Čo ľudia hľadajú na Googli“ (Česko / Brno, 12 mesiacov, záujem rok proti roku, podobné výrazy, „+ Nápad“). Google počíta hľadanie pod jedným tvarom slova („bolest zad“ 0, „bolesti zad“ 2 400) – nula sa ukazuje ako „skús iný tvar“.
19. [x] Zrušené tréningy z Google Calendar – hotové už od augusta 2026 (snímky kalendára → karta „Zrušené a presunuté“, „Bol tam, alebo nie?“, presuny podľa prvy_raz); položka bola len nevyškrtnutá (overené 20. 10.).
20. [ ] NDA pri fotkách pred/po — blokované kontrolou súhlasov.
21. [ ] Po vypnutí PTmindera: karta klienta dve čísla vedľa seba (sekcia 4).

**F · Fronty (práca, nie stavba)** — sekcia 5: 6 dôvodov odchodu, závery po
termíne, čas prvej odpovede, zmeny v kalendári.

## VYPNUTIE PTMINDERA (Jerry, 15. 10. 2026: „áno, súhlasím")

Tento týždeň je posledný týždeň zápisu do PTmindera; účet sa ruší až po
uzávierke októbra (prvý mesiac s peniazmi z Kokpitu — keby niečo nesedelo,
je kde pozrieť).

1. [x] **Do ne 18. 10.** — posledný týždeň zápisu do PTmindera.
       [x] 9 otvorených poplatkov z PTmindera prejdených 15. 10.: 7 má balíček
       v Kokpite, Dominika a Gerich nie sú dlhom (zaplatené / kredit vopred),
       Monika Schonwalderová stojí len na poplatku z PTmindera (7 790, 9. 10.)
       — platba 27. 9. 7 790 v Kokpite pravdepodobne patrí jej, rozhodne Jerry.
       Pri tom sa našla chyba: Gažova BTC platba z 11. 10. sa položila na májové
       členstvo zaplatené v PTminderi (oprava v `dlhyKlientov`, nasadená 15. 10.;
       ostáva 411 Kč = rozdiel kurzu BTC, rozhodne Jerry).
2. [x] **Po 19. 10.** — Jerry: posledný úplný export (všetky reporty ako doteraz) — stiahnuté 19. 10., v archíve; do Kokpitu ešte nenaliate (Packages/Sessions/Payments za október treba nahrať cez Upload, ak má október sedieť)
       + archív rokov 2022–2024 (zo starých rokov sa nič nepočíta, len uložiť).
3. [x] **Týždeň od 19. 10.** — Claude:
       - [x] 6M z balíčkov v Kokpite (předplatné) — hotové 15. 10. (tá istá
         množina 12+ klientov ako zo snímky; `sixMClientSet`);
       - [x] vypnúť porovnania s PTminderom — **naostro 20. 10. 2026**: preč
         „Vydrží kalendár sám?", „Chýba v PTminderi", mesiace kalendár vs export
         (Prechod), rozdiel hodín v Balíčkoch, mesačné porovnanie tržieb
         v Platbách, rozpory v Zdraví Kokpitu, blok v Jarvisovom kontexte;
         server ich už nepočíta. Poistka `zaplateneVPtminderi` bez zmeny.
       - [x] zostatok na karte bez zálohy „z PTmindera" — **naostro 20. 10.
         2026** (`ZOSTATOK_BEZ_PTMINDERA_NAOSTRO = true`). Jerry o oboch
         Stoklasových: „nechaj ich odtrénovať" → Svetoplukovi aj Kateřine
         zapísané doplnenie 2 h do Kokpitu (Svetopluk 1 h zostáva, Kateřina
         0 — 6. a 20. 10.). Snímka pred/po: mení sa len „0 z N" → „0 z 0"
         u 22 neaktívnych a Kláry Holubovej (pauza); notifikácia bezbalicka|
         nesvieti nikomu. Notifikácia „tréning nie je v PTminderi" vypnutá.
         „Vybavené" pri notifikácii s možnosťami sa odteraz pýta ako
         (doplnenie / prepadnutie / presun) — 1. 10. holé vybavené nechalo
         Stoklasových hodiny bez rozhodnutia.
       - [x] **21. 10. 2026 — peniaze**: poistka PTmindera len pre balíčky spred
         1. 10.; poplatky PTmindera od 1. 10. dlh nerobia; rozpory → notifikácia
         `ptrozpor|` (Veronika, Natália, Iva, Monika); barter Sofie nie je dlh.
       - [x] **Audit 21. 10. 2026 — čo ešte stojí na PTminderi** (Jerry: „sú ešte
         nejaké veci, ktoré by mali byť, ale nie sú?"). **Body 1–5 hotové
         21. 10. 2026** (os bez predajov PTmindera od 1. 10.; mená do párovania
         aj z kalendára a balíčkov; barter z balíčkov Kokpitu; report bez
         dvojitých platieb; 6M = počet předplatných, v procese kto mal
         předplatné do 62 dní). **6 a 7 hotové 21. 10.** („Prečo neprišiel"
         vidí balíčky PTmindera aj Kokpitu, úvodný nie; „Jedno meno" berie
         `znamiKlienti`; „Bol tam?" nepýta, keď je v ten deň iná živá udalosť
         klienta). Pribudla stráž: doplnenie, prenesené hodiny ani 0 Kč
         automaticky nevzniknú (`smieVzniknutAutomaticky`). **8 a 9 hotové 22. 10.** (počet nákupov od 1. 10. z balíčkov Kokpitu, doplnenie sa neráta; karta „Balíček dojde" má „Teraz" namiesto „PTminder" a bez výzvy na import; mesačná kontrola bez PTmindera; krok PTminder v uzávierke len do októbra; „banka a Kokpit" od mesiaca s peniazmi z Kokpitu). Audit je celý zavretý.
         1. Os času berie predaje z PTmindera (`services`) aj po 1. 10. — Monikin
            predaj 9. 10. stál ako „nezaplatený balíček", takže Kokpit nezaložil
            vlastný a mala −2 h bez balíčka. Predaje PTmindera od 1. 10. na os nepúšťať.
         2. Párovanie bankových platieb pozná mená len zo `sessions` PTmindera
            (`api/platby.ts` ~226) — klient s prvým tréningom po 19. 10. sa
            platbe nikdy nenavrhne. Brať aj kalendár a `balicky`.
         3. Sofiin barter (App.tsx ~1029, compute.ts ~3169) číta len snímku
            `packages` — nový balíček z Kokpitu Jarkov dlh nezníži.
         4. Mesačný report „hodnota klienta / obnova" (App.tsx ~2571) sčíta
            `data.payments` + `platbyKokpit` → od 10/2026 dvakrát.
         5. 6M: začiatok (compute.ts ~753) zo `services`/platby 6 990, nie
            z balíčka v Kokpite; príslušnosť (compute.ts ~203) z „S viazanostou"
            navždy.
         6. „Prečo neprišiel znova" (compute.ts ~4586) hľadá v `packages` pole,
            ktoré tam nie je, a balíčky Kokpitu nevidí.
         7. „Jedno meno, viac klientov" (api/kalendar.ts ~396) a „Bol tam, alebo
            nie?" (~355, `NOT EXISTS FROM sessions` = vždy pravda) stoja na
            `sessions` PTmindera.
         8. Istota obnovy `serviceCount` (compute.ts ~372) zamrznutá.
         9. Staré výzvy na nahratie exportov: rituals.ts ~100, karta „Balíček
            dojde" („Podľa reportu z…"), krok „PTminder (kým beží súbežne)"
            vo Workspace, register banka vs. tržby píše „PTminder".
       - [x] **Veronika: offline tréning počas online balíčka = samostatná 1 h
         za 1 450 Kč** (Jerry 21. 10.) — hotové 21. 10. (`samostatnaOfflineHodina`,
         a6965e9): online = slovo „online" v názve udalosti; pravidlo len pre
         klienta, ktorý si 1h offline už raz kúpil (Veronika, Marcela), nie
         Lucia. Overené 22. 10. simuláciou 27. 10. nad ostrými dátami: návrh
         „1h Balíček 1 450" na 27. 10., po založení offline tréning kryje 1h
         a online balíček sa nemíňa.
4. [ ] **Uzávierka októbra (zač. novembra)** — ak sedí, Jerry PTminder zruší.
       **Jerry 27. 10. 2026: „PTminder zrušíme budúci týždeň.“** Čiže v týždni
       2.–8. 11., po uzávierke októbra. Posledná platba 2 287 Kč odišla 2. 10.;
       ďalšia by prišla 2. 11., takže zrušiť ideálne PRED druhým. Archív rokov
       2022–2024 aj posledný úplný export sú stiahnuté (19. 10.), takže po
       zrušení sa nestráca nič — ale skontrolovať to pred kliknutím.

## VLASTNÝ MAILER — zadanie na neskôr (Jerry, 27. 10. 2026)

Jerry: „MailerLite — nedala by sa podobná aplikácia postaviť?" a „vedel by si
to niekde do Kokpitu uložiť a pripraviť stavbu maileru niekedy v budúcnosti?"

**Hotové 27. 10. 2026 (záloha):** CSV export z MailerLite je naliaty do
`mail_odberatelia` (migrácia 0125) — 616 kontaktov, 561 aktívnych, 43
odhlásených s dátumom a dôvodom, 12 nedoručiteľných; 160 aktívnych spárovaných
s klientmi Kokpitu, 307 z nich aspoň raz otvorilo mail. Súbory ležia aj
v `~/Downloads/MailerLite export 2026-10-27/`. Obrazovka: Marketing → Mailer,
karta „Stav zoznamu". **Druhá tabuľka sa nezakladala** — odberatelia v Kokpite
už boli od 13. 8. 2026, doplnili sa len chýbajúce stĺpce.

**Čo zostáva postaviť, keď bude čo poslať.** Ľahká polovica (2–3 dni): výber
adresátov, editor textu, naplánovanie, štatistika otvorení a klikov,
odhlasovacia stránka. Kokpit na to má skoro všetko — MIME (`mime.ts`), SMTP,
plánovač, audit, R2 na obrázky a hlavne segmenty, aké MailerLite nikdy mať
nebude („dochodený balíček", „neprišiel po úvodnom", „nechodil 60 dní").

**Ťažká polovica je doručiteľnosť a tá sa prácou nekúpi.** Z nej plynú
rozhodnutia, ktoré treba spraviť SKÔR než prvý mail:

1. **Neposielať cez websupportové SMTP.** Tou istou cestou chodia faktúry
   a odpovede klientom; jedna kampaň označená ako spam zhodí doručovanie
   dokladov. Navyše má schránka GEO ochranu, ktorá Workers odmieta podľa
   dátového centra (pozri „Nesprávne heslo znamenalo nesprávnu KRAJINU").
2. **Odosielať cez API:** Amazon SES (0,10 USD / 1 000 mailov) alebo Resend
   (3 000 mailov mesačne zadarmo). Pri 561 adresátoch a štyroch mailoch
   mesačne je to pár korún namiesto 515 Kč.
3. **Vlastná poddoména** (`news.prosapiens.cz`) s vlastným SPF, DKIM a DMARC,
   aby reputácia hlavnej domény zostala oddelená.
4. **Odhlásenie je zákon, nie funkcia:** odkaz v päte, hlavička
   `List-Unsubscribe` s jednoklikom (RFC 8058) a stránka, ktorá odhlásenie
   zapíše do `mail_odberatelia.status`. Tých 43 odhlásených z exportu je
   východzí stav — komu sa písať nesmie.
5. **Bounce a sťažnosti sa musia spracovať**, inak reputácia klesne sama:
   webhook od SES/Resend → `status = 'bounced'`, dve tvrdé zlyhania = koniec.
6. **Rozbeh:** nová doména nesmie prvý deň poslať 561 mailov. Prvé kampane po
   50–100 adresátoch, najprv tým, čo otvárajú.

**Čo appka o tom zozname vie povedať už dnes:** číta ho 55 % aktívnych, 160
z nich sú klienti a od septembra 2025 nepribudol ani jeden nový odberateľ —
formuláre na webe do mailingu nič neposielajú. **Kým to platí, je stavba
maileru druhá vec v poradí; prvá je formulár, ktorý zbiera.**

## PORADIE PRÁCE (Jerry, 5. 10. 2026: „ideme rad za radom")

Platby z banky si Jerry potvrdzuje sám. Moje kroky v tomto poradí — pri
každom: overiť nad kópiou ostrej DB pred aj po, testy, až potom nasadiť.

1. [x] **Jedno pravidlo „zaplatený"** — hotové 5. 10. 2026 (`zaplatene.ts`,
       `data.dlhy`, `data.bezHodin`); overené pred/po nad ostrou DB a
       nezávislou kontrolou subagenta. Mŕtvy kód (`dlhKlienta()`,
       `hodinyBezBalicka.ts`) uprataný v bode 4.
2. [x] **Deň podľa Prahy, nie UTC** — hotové 5. 10. 2026 (~150 miest v 76
       súboroch, `lib/psb/cas.ts`); dve nezávislé kontroly subagentom, testy
       aj v `TZ=UTC`. Zostatok (len prehliadač, neškodí): `vzas.ts` mesiace pri
       načítaní modulu, `nextMonthKeys` (31. + `setMonth`), `Kalendar.tsx`
       `Date.parse(zaciatok)` v prehliadači.
3. [x] **Platby z Kokpitu na osi času klienta a v maili s históriou** —
       hotové 5. 10. 2026 (`zlucPlatby`, `data.platbyKokpit`).
       Platby len v Kokpite vyriešené 5. 10. 2026 s Jerrym: 56 000 Kč (zošit
       „Jarek“) patrí Jaroslavovi Broskvovi, nie Heinrichovi. Jerry 6. 10.:
       priniesol 56 000, 1 400 mu vrátili o pár dní (nebolo vydať) — platba
       opravená na 54 600 = PTminder. Vrátenie 1 400 (28. 6.) Jerry: ignorovať; Heinrich 24. 9. = 7 790 (Terka
       poslala 5 390, 2 400 si nechala); Miřejovský 752 zrušené; Dvořák 1 100
       za tréning 16. 9. platí (mama), balíček 6 h je preventívny a nezaplatený.
       Opravené v kóde: pravidlo platiteľa sa učí len z priezviska, zápis zo
       zošita sa ukladá ako hotovosť. Tri rizikové staršie pravidlá zmazané (Jerry 5. 10.: „preto je dôležité, aby sa Kokpit dopytoval“); ponechané 4 so skráteným priezviskom
       alebo preklepom (katerina/veronika stokla, zdenek l, matej prochazka).
4. [x] **Drobnosti v kóde** — hotové 5. 10. 2026. Profil len s objednaným
       úvodným má `lastSession` prázdne (nie budúci dátum). `mimoExportu`
       počíta len tréningy, ktoré už začali (jediný nenulový prípad bol
       Richardov dnešný tréning o 18:00). SMS bez stavu stránky QR nesľubuje.
       Mŕtvy kód preč. Kontrolór profilov dostáva tie isté vstupy ako
       `loadData` (dlh, dni bez hodín, platby z Kokpitu, história) — rozdiel
       „Janka odkaz 5 h · karta 2 h" bol jeho, nie appky.
5. [x] **Myšlienková mapa** — hotové 5. 10. 2026: ↑↓ a ⌘↑↓, Osnova, hromadný
       výber s číslicou 1–5, ⌘F naprieč mapami, Enter vkladá hneď za
       a koncept sa ukladá bez čakania (sekcia 2b).
6. [x] **Web na tablete** — naostro 5. 10. 2026 (style.css + js/app.js cez
       Editor šablón, Jerry povolil; WP Fastest Cache vymazaná, overené na
       webe). Zelené zvýraznenia už boli v poriadku.
7. [x] **Kartotéka fotiek** — naostro 5. 10. 2026 (panel anamnézy → Fotky
       držania tela). R2 zapnuté (Jerry odsúhlasil, 0 $), bucket
       `kokpit-fotky`, väzba STORAGE. Overené na vymyslenom klientovi:
       nahratie, šifra v R2 aj D1, poznámka, pohľad, zmazanie, audit.
       „Profil trénera na webe" bola zastaraná položka — vyriešené už 3. 10.
       (stránky /jerry/ a /terezia/ existujú, odkaz z /u/ vedie na profil
       toho, kto úvodný vedie; `ODKAZY.profilTrenera` v uvodnaStranka.ts).

Rozhodnutia z 6. 10. sú zapracované (prenos mínusu, online/offline,
Čechová/Gažo/Kalva-Martinek-Vaško) — viď 2c.


## 0a · Workspace po krokoch — naostro od 5. 10. 2026

- [x] ~~**Navádzač kariet ako 3D kolotoč**~~ — postavené 6. 10. 2026 (koleso,
  potom valec A z ukážky `navrhy-kokpitu/kolotoc-kariet.html`) a v ten istý
  deň VRÁTENÉ na pôvodný rad (Jerry: „v mojej predstave to vyzeralo lepšie
  ako v skutočnosti"). Hneď nato Jerry: „sprav to tak, že to ide dokola —
  vedľa Klienta je 1 · Kalendár" → rovný rad DOKOLA (`poradieKolesa`) je
  naostro; 3D valec nie. Rovný rad „dokola" Jerry hneď odmietol („to je
  stále posúvanie pásu zľava doprava") a z náčrtov `navrhy-kokpitu/nekonecny-rad.html`
  vybral 1 · NEKONEČNÝ RAD (`NekonecnyRad.tsx`): názvy sa opakujú cez celú
  šírku, kraj neexistuje. Pôvodne (Jerry, 6. 10. 2026: „ako výber áut
  v Need for Speed"). Kolotoč v rade (`poradieKolesa`) Jerryho ideu netrafil;
  ukážka mimo Kokpitu: `navrhy-kokpitu/kolotoc-kariet.html` — A valec,
  B obežná dráha, C bubon. Čaká na výber, potom do Workspace.

Jerry: štyri kroky týždňa, každý jedna karta (Kalendár · SMS · Platby ·
Balíčky). Postavené v bete; pravidlá v CLAUDE.md „Workspace po krokoch".

- [x] **Naostro od 5. 10. 2026** (Jerry: „postav to v Kokpite") — Workspace má
      tri kroky, SMS len z kroku 2, dashboard s nezaplatenými navrchu.
- [x] **Automatické zakladanie balíčka prvým tréningom** — od 4. 10. 2026
      beží samo pri otvorení appky (aj naostro, spoločná DB). Prvý beh: 0 balíčkov.
- [x] Dopyty, Uzávierka (aj Terezkina), Mesačné kontroly, peniaze/faktúry
      podľa trénera, vyťaženosť, navádzač kariet, hromadná SMS — naostro 5. 10.
- [x] Duplicity mimo Workspace odstránené (Kalendár, Upload, Tréningy,
      + Zápis); duplikovať tréning a presun na iného trénera v kalendári.
- [x] **FIO_TOKEN v bete** — Jerry ho nahral 13. 10. 2026 (nový token z Fia; ostrý Kokpit má pôvodný). Overené `wrangler secret list`.
      Jerry: `npx wrangler secret put FIO_TOKEN --name kokpit-beta`.
- [x] **Banka stiahnutá** (overené 5. 10. 2026: pohyby do 4. 10.). Pravidlo
      „nezaplatený balíček = mínus" stojí na spárovanej banke — sťahovať priebežne.
- [x] **Opravy platieb z dávky 28. 9.** — 5. 10. 2026 (Jerry odklepol): Dan →
      Monika 12. 3.; 15 580 rozdelené na Dana a Moniku 15. 5. a 26. 7.;
      Dyldina → Muselova; Nový → Šnirychová; Knapčok → Hrdinová; pravidlo
      „hrdina michal" zmazané. Každá má záznam `platba-oprava` vo `vzas_audit`.
- [x] **11. 7. 7 011 ostáva u Kateřiny Matlovej** — Jerry 5. 10.: platila za
      seba, −10 % za odporúčanie Richarda (Richard dostane −10 % za Alberta).
- [x] **AATest zmazaný** (5. 10. 2026) — platba, 3 balíčky, udalosť,
      override a fakturačný kontakt; v audite ostal záznam `test-zmazany`.

## 0 · Odchod z PTmindera — od 1. 10. 2026 je Kokpit pravda

Rozhodnuté 29. 9. 2026. PTminder je odvtedy kontrola.

- [x] **Dochádzka z kalendára** — nasadené, zapne sa 1. 10. (`sedeniaZKalendara.ts`).
- [x] **Hodiny: karta z balíčkov v Kokpite** — nasadené, zapne sa 1. 10.
  (`zostatokKokpitu.ts`). Simulácia po naliatí: 76/86 rovnako, rozdiely
  vysvetlené (prekryv 18 h — Kokpit presnejší; Marcela — Kokpit sčíta obe).
- [x] **„Doplniť nové z PTmindera"** — spravené 1. 10. 2026 (Jerry: „tak mi
  tie balíčky doplň ty"). Pridaných 9, preskočených 35. Pavlík 0 → 5 h,
  Pečková 0 → 15 h — tí dvaja mali na karte zlú NULU, nie záložné číslo
  z PTmindera, lebo im starý balíček ešte platil a bol vyčerpaný.
  Baláž 16 → 15 h, Kalmusov augustový riadok sa nezapočítal (po platnosti).
  **Na pozretie:** Robin Martinek dostal 8 h pri balíčku s názvom „OFF - 6h".
  Nie je to chyba appky — export PTmindera hovorí `na_obdobie = 8` a číslo
  z exportu má prednosť pred názvom (prenesené hodiny). Jitka má v tom istom
  tvare 6, takže to nie je plošné. Posúdiť vie len ten, kto balíček predal.
- [x] 3 minuté doplnenia 1 h (Petra Bambúšková, Tsiolis, Jitka) — ukončené k 29. 9.
- [x] Janka Šnirychová „SPECIAL 3" je v poriadku — berú ho obaja Šnirychovci.
- [x] **Peniaze z banky a zošita** — overené 8. 10. 2026: prepínač je zapnutý, `platby_od` = 2026-10. (Platby z Kokpitu
  na osi času a v maili sú od 5. 10. 2026 — `zlucPlatby`.)
- [x] **Os času a „dnes"** — 6. 10. 2026: profil, os pri karte aj mínus
  v zozname dlžníkov berú len tréningy, ktoré už začali (`terazPraha`), ako karta.

## 0c · Anamnéza v Kokpite (Jerry, 30. 9. 2026)

Presťahovaná z Google Forms. Návrh, podľa ktorého sa stavala:
https://claude.ai/artifact/UUaYYV3UrvrKMahcLmFeAL

- [x] **Klientska časť** `/a/<token>` — tri otázky, vetvenie podľa „Co vás
  k nám přivádí", oblasti so stupnicou ku každej, červené vlajky, súhlasy
  blokujúce odoslanie. Overené naostro na AATestovi.
- [x] **Zápis trénera** na karte klienta (záložka anamnéza), predvyplnený
  z odpovedí klienta, testu postury a Dopytov.
- [x] **Šifrovanie** zdravotných odpovedí (`ANAMNEZA_KLUC`); súhlas
  zámerne nešifrovaný.
- [x] **Karta Anamnéza v kope** + „+ Zápis → Nový klient" už nevedie do
  Google Forms, ale na ňu.
- [~] **Editor formulára** — Jerry 30. 9. zrušil („editor nechaj tak").
  Tabuľka `anamneza_formular` zostáva pripravená, keby sa to vrátilo.
- [x] **Kartotéka fotiek** — naostro 5. 10. 2026 (R2 zapnuté, overené).
- [x] **Import 56 starých anamnéz** k existujúcim klientom aj s pôvodným
  dátumom (Jerry odklepol 30. 9.) — hotové 30. 9., 53 priradených.
- [x] **Doimportované všetky anamnézy** — 1. 10. 2026 aj posledné tri
  (Anna Kadličkova, Miroslava Michalikova, Robin Martinek).
- [x] Skúšobné dáta AATestu zmazané (1. 10. 2026): anamnéza, oba odkazy
  `/u/`, odkaz `/v/` aj hodnotenia v `klient_merania`.
- [x] **Odkaz /u/ v potvrdzovacej notifikácii Terezky** — hotové 1. 10. 2026.
- [x] **Krátka adresa pre odkazy v SMS** — hotové 1. 10. 2026, správa má
  153 znakov = jedna SMS. Platí pre `/u/` aj `/v/` (výpis hodín a končiace
  členstvo). Presmerovanie je WP snippet id 26 — keby niekto raz čistil
  snippety, bez neho prestanú chodiť odkazy v SMS.
- [x] **Spam vo filtri dopytov opravený** (1. 10. 2026). Prešiel na
  BODKOČIARKE: predmet „Re;mezinárodní pošta#…" a filter na odpovede hľadal
  len dvojbodku. Odteraz sa berie každý bežný oddeľovač a slová sa hľadajú na
  hranici slova („termin" v „determinado" už dopyt nerobí). Riadok zmazaný.
- [x] **Po úvodnom: to isté tlačidlo** v notifikácii „SMS po úvodnom"
  (1. 10. 2026) — tá istá obsluha, len `druh: "po"`, bez ceny a telefón
  z fakturačných kontaktov.
- [x] **Stránka za odkazom prepísaná** (1. 10. 2026) — česká, svetlá, so
  sadzbou zo živého webu; os času končí pri poslednom balíčku (Markétin
  výpis mal na telefóne 7 487 px), celá história chodí mailom na vyžiadanie
  cez tlačidlo na stránke, a pri dlhu je na nej QR na platbu. Dlh sa počíta
  z otvorených poplatkov PTmindera, nie len z balíčkov v Kokpite.
- [x] **SMS k nezaplatenej platbe** (1. 10. 2026) — tlačidlo je na dlaždici
  „Nezaplatené" na dashboarde. Text napísal Jerry a nie je to upomienka:
  „tady máš přehled hodin a QR na platbu za balíček z 9. 9.: …". O tom, či
  klient zaplatil, mlčí — appka to vedieť nemôže. Sumu nesie QR, nie text.
- [x] **Karta „Hodiny bez balíčka"** (2. 10. 2026) — kto trénoval nad rámec
  a nový balíček si nekúpil. Na ostrých dátach 10 ľudí, 39 h. Doteraz boli
  neviditeľní: karta „Balíček dojde" stojí na objednaných termínoch, takže
  kto dochodil a nič si nedohodol, v nej nie je. Ráta sa len od posledného
  známeho balíčka (PTminder ich vyváža až od marca 2026) a len 90 dní
  dozadu.
- [x] **Profil trenéra na webe** — vyriešené 3. 10. 2026: stránky /jerry/
  a /terezia/ existujú (predtým som ich hľadal pod zlou adresou).
  (Skúšobné hodnotenia v `klient_merania` už zmazané sú — tabuľka je prázdna.)
- [ ] **Pocitovka beží od 30. 9. 2026** — o mesiac sa pozrieť, koľkí klienti
  odpovedali. (8. 10.: zatiaľ 0 odpovedí v `klient_merania`.) Keď to bude pár ľudí, nie je to dôkaz, že sa nezlepšujú, ale
  že sa nepýtame dosť nahlas; vtedy zvážiť pripomenutie v SMS po treťom
  tréningu.

## 0b · Ostatné otvorené z 29. 9.

- [x] Nedeľná pripomienka — zrušená (Jerry: stačí karta „Balíček dojde" na dashboarde).
- [x] Tréningy v kalendári, ktoré v PTminderi nie sú — **pred 1. 10. je PTminder
  pravda**, čo v ňom nie je, sa nekonalo (Jerry, 29. 9.). 38 sporných uzavretých
  ako „neprišiel"; 5 z Jerryho kalendára (jan.–jún) sa nezapisuje.
- [x] Dan Kouřil 9. 7. (7 790 Kč) — zmazaný, platil len členstvo od 2. 7.
- [x] ~~**SMS od „ProSapiens"**~~ — Jerry 6. 10. 2026: nebude to robiť. Zrušené.
- [x] Import služieb nahrádza obdobie súboru (6. 10. 2026) — rovnaké poistky
  ako tréningy (`nahradenieObdobia`): len dni a tréneri zo súboru, uzamknutý
  mesiac nie, pri veľkom mazaní nič. Nanečisto na exporte z 3. 10.: 0 zmien.
- [x] Export Sessions s 28.–29. 9. — overené 8. 10. 2026: v sessions je 28. 9. 8 tréningov, 29. 9. 10.
- [x] **Nahadzovanie tréningov do Google kalendára z Kokpitu** — hotové 29. 9.
  (servisný účet kokpit-kalendar@evident-catcher-510117-k6.iam.gserviceaccount.com,
  secret GCAL_SA_KLUC; stôl klienta → všetko → „+ Nahodiť tréning do kalendára").
  Overené naostro: AATest 30. 9. 10:00 je v Google aj v kal_udalosti.
- [x] **Terezkin kalendár je zdieľaný** — presun tréningu Terezke funguje (5. 10. 2026).
- [x] Súbor kľúča evident-catcher-…json — 6. 10. 2026 už na disku nie je
  (ani v koši); secret GCAL_SA_KLUC vo workeri je.
- [x] Zrušenie tréningu z Kokpitu — tlačidlo „Vymazať" s potvrdením je v okne udalosti v Kalendári.

## 1 · Čaká na Jerryho slovo

- **Odkaz s fotkami pre klienta — NAOSTRO od 12. 10. 2026.** `/f/<token>` (podoba A, olivová; `lib/psb/fotkyStranka.ts`, route `f.$token.tsx`, migrácia 0113). Profil → fotky → krúžkom označiť porovnania z editora → „Poslať klientovi" (správa, voliteľné čísla, „čo ďalej") → odkaz + SMS tlačidlom. Odpoveď klienta → register trénerovi (`fotkyOdkazy.ts`) + push bez obsahu + denník (odkial „fotky") + sekcia „Poslané klientovi". Krátky odkaz prosapiens.cz/f/ zapnutý 12. 10. (snippet 26 so súhlasom). Editor od 12. 10.: šípka, lupa, jemné zväčšenie, návrat k hotovému porovnaniu (✎ upraviť, migrácia 0114). **Otvorené:** (1) lupa a kreslenie overené len simulovaným dotykom, nie na iPade; (2) ~~„Na čem budeme pracovat dál"~~ rozhodnuté 13. 10.: pýta sa až tesne pred vytvorením odkazu (krok „Ďalej →", dá sa preskočiť); v ten deň pribudol aj nadpis „N týdnů práce" s rozsahom dní a „tvůj trenér · poslal"; (3) prvé ostré poslanie: Vaškovi poslané a otvorené 13. 10. Oslovenie „Ahoj Martin" bez 5. pádu Jerry 13. 10. schválil („úplne v pohode, netreba"). Editor 13. 10.: touchpad a dva prsty = plocha, veľkosť fotky len za rohy — na skutočnom iPade neoverené.

- **Dozor reklám — NAOSTRO od 10. 10. 2026.** Notifikácia z dôvodu, s číslami a návrhom (`lib/psb/reklamaDozor.ts`, testy; `/api/meta` akcie `dozor`, `rozhodni-kampan`, `dozor-nastavenie`; plánovač 4:20 UTC; migrácia 0109). Tlačidlá Nechať · Vypnúť · Zmeniť rozpočet (potvrdenie so sumou na mesiac, strop 2 000 Kč/deň a 3×) · počet DM pri interakciách · Prompt pre Clauda; karta Marketing → Náklady → Dozor reklám. **Čaká na Jerryho (overené naživo 27. 10. o 8:20):**
- [ ] **Dva staré administrátorské účty STÁLE SÚ** — Nika Pastorová
  (pastorova@emglare.com) a Admin Systedo (admin@systedo.cz). Administrátori sú
  stále traja.
- [ ] **Zmazať Slider Revolution a WPBakery** — od 26. 10. vypnuté, ale
  nainštalované, a Wordfence ich 27. 10. označil ako ZRANITEĽNÉ. Keďže na
  hostingu nie je ani jeden FTP účet, je to najpravdepodobnejšia cesta, ktorou
  sa 19. 10. dostal dnu backdoor.
- [ ] **Dvojfázové overenie: 0 z 5.** Pribudol jeden prístupový kľúč (passkey),
  čo je rovnocenná náhrada, ale len pre jeden účet.

**Odpadlo, nerobiť:**
- ~~Zmeniť heslo k FTP~~ — **žiadny FTP účet neexistuje** (Websupport, FTP účty:
  0 z 0). Je tam len dočasné webFTP. Zároveň to vylučuje FTP ako cestu dnu.
- ~~Odpovedať Radke Kovaříkovej~~ — **Jerry odpovedal 19. 10. o 16:23**
  („Re: uvodni trenink", v odoslanej pošte info@).
- ~~Zapnúť OPcache~~ — **už je zapnutý.** Overené 27. 10. priamo v nastavení
  webu (Websupport → Pokročilá konfigurácia → Web → „…" → Nastavenia PHP):
  **Opcache (PHP 5.4+): Povolené (Predvolené)**. Hlásenie „Cache opkódů:
  Deaktivováno" v Zdraví webu je nesprávna detekcia WordPressu pri PHP-FPM,
  nie skutočný stav. **Moje tvrdenie, že preto je nekešovaná stránka pomalá,
  bolo nesprávne** — príčina tých ~1,4 s je inde a zatiaľ nie je zistená
  (WordPress s 35 aktívnymi pluginmi toľko bežne trvá).
  Pri tej istej kontrole vidno, že `display_errors` je na hostingu **Povolené**;
  vypína to až snippet 29 vo WordPresse (viď [[chyby-php-do-stranky]]) — keby
  ten niekto vypol, chyby PHP sa začnú vypisovať do stránok.

**Poznámka k postupu:** skriptované volania na prosapiens.cz znova narazili na
firewall webu (Access Forbidden). Návštevníkov sa to netýka, ale overovať sa
odteraz má prehliadačom, nie dávkou `curl`.

---

## 7 · Rohlík asistent (nákup pre Terezku, mimo Kokpitu)

Samostatná appka `~/Downloads/rohlik-asistent`, naostro https://rohlik.prosapiensbio.workers.dev,
verzia 2 od 24. 10. 2026 (podrobnosti v README v jej repe).

- [ ] **Claude kľúč pre „Napíš vlastnými slovami“** – ODLOŽENÉ (Jerry 24. 10. 2026: „zatiaľ nie, nechaj
  Workers AI“). Teraz to robí Llama na Workers AI a vyberá slabšie (na „guláš“ dala cesnakovú pastu namiesto
  cesnaku). Keď áno: `cd ~/Downloads/rohlik-asistent && npx wrangler secret put ANTHROPIC_API_KEY`,
  appka prejde na Clauda sama.
- [ ] **Poslať Rohlíku žiadosť o povolenie adresy** – text je v appke v Nastaveniach („Žiadosť pre Rohlík“).
  Kým ju nepovolia, prihlásenie ide cez kopírovanie adresy `localhost/callback?code=…` (90 dní platí).
- [ ] **Prvý ostrý nákup s novou verziou** – naostro po prihlásení ešte nikto neprešiel; lokálne overené na
  Terezkiných dátach, košík skúšaný jedným banánom (vrátený).
- [ ] **Pripomienka do telefónu** – overiť na Terezkinom telefóne (appka na ploche → Nastavenia → Povoliť
  → Poslať skúšobnú).

---

## 8 · Výplatný model A (Jerry, 26. 10. 2026)

Dohodnuté (report: https://claude.ai/artifact/CHyFa8XsxXEgdvEj6fjJWa):
- Nárok = 27 000 + (hodiny − 60) × 850 **+ hodiny navyše × 450 Kč, najviac 40 h mesačne** (z týždennej únavy, `<osoba>_hours`).
- Výplata vždy **3. v mesiaci za predošlý uzavretý mesiac**; počas mesiaca len záloha (návrh do 20 000), 3. sa odpočíta.
- **Minulé mesiace sa neprepočítavajú** — dlh ostáva, ako je (−162 985 k 30. 9.); pravidlo platí dopredu.
- Rezerva firmy 5 % 3. a 18. — HOTOVÉ v Kokpite (`rezervaOdlozenie.ts`).
- Osobne začína **10 %** (≈ 4 100 Kč) trvalým príkazom 3. do Budúcnosti (Jerry 26. 10.).

Otvorené:
1. [x] Model A platí od októbra 2026 (Jerry 26. 10.). Prechod na výplatu 3. postupne: strop zálohy november 30 000, december 20 000, január 10 000, od februára len 3. (bez spoločných).
2. [x] **Terezka súhlasila 26. 10. 2026** (návrh https://claude.ai/artifact/MWqnqj9ywpZ7cui3zNqvt6, plán https://claude.ai/artifact/1c6RhnigeXFG3ha2Kb4rBN). Stratový mesiac = hodiny navyše ako dlh firmy voči nim, vyplatené zo zisku neskôr, zvyšok v decembri; spoločný strop hodín navyše 25 000 Kč mesačne (oba body podľa návrhu — potvrdiť, ak Terezka odpovedala inak).
3. [x] Hodina navyše = len práca pre PSB, to, čo sa zapíše pri týždennej únave (Jerry 26. 10.).
4. [x] Kokpit: nárok s hodinami navyše od októbra 2026 (strop 40 h, spolu 25 000), strážca stráži zálohy od 11/2026, veta pri kladnom dlhu opravená — nasadené 27. 10. 2026 (commit 7429164).
5. [x] Rezervný účet PSB = Fio 2503222384/2010 (Jerry 27. 10.); prevody naň Kokpit spozná sám, zatvoria pripomienku 5 % a počítajú sa do rezervy firmy.
6. [ ] **December 2026 pri uzávierke roka: rozhovor o odpustení časti dlhu** (Jerry −162 985, Terezka +7 809 k 30. 9.; zapísané hodiny navyše 27. 7.–30. 9. = 116 h × 450 = 52 290 Kč ako podklad).

## Zavreté (aby sa neotvárali odznova)

- **Strižňa – body 10, 11, 13 z poradia 13. 10. hotové:** vyhľadávač tém na reakčné videá (obrazovka Reakcie),
  šablóna reakčného videa / repost, memy s bankou šablón (14. 10.). Overené v kóde 19. 10. 2026.
- **Strižňa 15.–18. 10. 2026 (z rozhovoru, aby sa neponúkali znova):** pripomienky v appke, Vrstvy β (Video 1/2/3…,
  od 16. 10. Video 4+ pri prekrytí), 9 štýlov titulkov, štúdiový zvuk (DeepFilterNet), vloženie videa do strihu,
  ✦ AI záber, „zvýš zvuk a uprav celé nanovo“ v príkaze Claudovi, Zverejniť príbeh hneď, po nahratí rovno do strižne,
  nahrávanie navrchu Produkčného dňa, farby/poloha menia označené video.

- **r6 farby celého videa a C0019 bez zvuku — NECHAŤ TAK (Jerry 19. 10. 2026: „vymaž a nech to tak“).**
  r6 ostáva s farbami na celom videu, C0019 ostáva cvik v r3. Neponúkať znova.

- **Strižňa na iPhone a Mac mini ako server — OPUSTENÉ 13. 10. 2026**
  (Jerry: „tento nápad opúšťame“). Strižňa beží na Macoch (Jerry, Terezka);
  z telefónu ide video cez Kokpit → Nahrať do Strižne. Neotvárať, kým to
  nepovie Jerry sám.

- **Potvrdenia mien z kalendára** (6. 10. 2026) — 17 z 25. 9. už vybavených;
  nové celé mená, ktoré sedia na jediného klienta, sa odvtedy priradia samy
  (`klientPodlaCelehoMena`, Jerry: istá zhoda smie ísť sama). Karta „Nové
  názvy" z 18 na 7 — ostali prezývky, preklepy a ne-tréningy.
- **Staré hlásenia zrušení** (6. 10. 2026) — 6 otvorených z 9 (Markéta 31. 8.,
  Ivi 2. 9., Natália 3. 9., Janka 6. 9. a 30. 9., Lucka 25. 9.) označených ako
  vysvetlené; PTminder tréning v ten deň nemá — boli to presuny alebo
  zrušenia, ktoré appka vtedy nespárovala, nie falošné hlásenia.
- **Dovolenka Kadličkovej/Kaňovského k 7. 10.** — Jerry: nie je dôležité, nechať.

- **Kotva `#cenik` na webe** — opravené 6. 10. 2026. Na menšom telefóne
  (390×664) sa kapitola Ceník delí a jej prvá obrazovka je „Co je součástí
  vašeho balíčku"; kotva bola na kapitole, preto pristála vedľa cien. Teraz je
  na prvej cene (`<li id="cenik">` — zoznam sa pri delení kopíruje bez id,
  položka sa presúva aj s ním). Overené na 5 rozmeroch, nahraté cez Editor
  šablón (`parts/sluzby.html`), prototyp aj téma v repe opravené.

- **„Odskok augusta" 18 072 → −26 154 Kč** (vyšetrené 6. 10. 2026) — mesiac sa
  nezmenil. Ranné číslo bolo z BETY, ktorá nemá kľúč k bitcoinovej appke,
  a bez knihy P&L nevidí faktúry zaplatené bitcoinom: polovica iPhonu 17
  (11 495), činky a plyo box (7 014), odvápňovač (299) a výplaty z tých istých
  nákupov (25 419). Ostrý Kokpit (−26 154) má pravdu; beta dnes stále ukazuje
  18 072. Nad Peniazmi odteraz svieti upozornenie, keď sa kniha nenačíta.

- **Luky Kríž má vlastný profil** (3. 10. 2026). Nie je to preklep mena —
  je to SYN Lukáša Kríža. Udalosť „Luky Kriz" v kalendári bola namapovaná
  na otca, takže otcovi sa pripisoval synov tréning a syn v appke nebol.
  Premapované na „Luky Križ" (vedome = 1). Otec má teraz posledný tréning
  3. 4. 2026, syn balíček zo 7 790 Kč a jeden tréning z 28. 9.

### Notifikácie „konal sa tréning?" — opravené 1. 10. 2026

Bolo ich 695, z toho 650 z roku 2024: kontrola strážila len horný koniec
pokrytia exportu, spodný nie. Doplnená spodná hranica + vek nálezu 31 dní.
Po nasadení ich je v registri nula — staršie boli falošné, septembrové sú
vysvetlené ručnými zrušeniami (138 zapísaných) alebo odklepnuté.

**Dátum spotreby:** kontrola vznikla, keď bol pravdou PTminder. Jerry 1. 10.
najprv povedal „vypni to", potom to vzal späť — do PTmindera bude zapisovať
ďalej, lebo je to teraz kontrola. Zostáva teda zapnutá.

### Nová notifikácia: tréning, ktorý nie je v Google kalendári (1. 10. 2026)

Jerry: „všetko by malo byť v Google kalendári." Od 1. 10. je kalendár pravda
o dochádzke, takže toto je ten nebezpečný smer — sedenie, o ktorom zdroj
pravdy nevie, po odchode z PTmindera zmizne. Appka to vedela len v karte
„Vydrží kalendár sám?".

Na obrazovke sú teraz dve položky: **Lenka Prinosilova (17. 9.)** a
**AATest Testový** (15., 22., 29. 9.).

**Pre Jerryho:** AATest je stále v PTminderi a chodí do exportu — kým ho tam
nezmažeš, bude z neho notifikácia. Zmazať riadky v Kokpite nestačí, najbližší
export ich vráti.

### Nepoužívané skripty a štýly preč — 169 kB (1. 10. 2026)

Pristávacia stránka ťahala ~215 kB JavaScriptu a ~90 kB štýlov. Po odrátaní
toho, čo naozaj treba, zostávalo zhruba **169 kB na každom načítaní každej
stránky za funkcie, ktoré na webe nie sú nikde**. Robí to snippet 28, kópia
v `philipjerry-web/navrhy-webu/snippety/28-nepouzivane-assety.php`.

Overené stiahnutím **všetkých 78 stránok** a hľadaním vykresleného obsahu
(nie značiek `<script>`, tie tam sú vždy): galéria/lightbox 0×, Twitter 0×,
ikony sociálnych sietí 0×, Instagram feed 0×, Simple Download Monitor 0×.
Protokol MFR sa doručuje formulárom, nie cez SDM.

| čo | koľko |
|---|---|
| `tld.min.js` (PixelYourSite) | 40 kB |
| Responsive Lightbox (5 skriptov + 2 štýly) | ~20 kB |
| ikony sociálnych sietí (5 sád ikon!) | 28 kB |
| Instagram feed — štýly | 8 kB |
| Simple Download Monitor | 5 kB |
| Twitter feed | 4 kB |
| **JavaScript spolu** | **215 → 89 kB** |
| **štýly spolu** | **90 → 47 kB** |

**`tld.min.js` nestačilo vyhodiť.** Je to kompletný zoznam koncoviek celého
internetu (141 kB kódu) kvôli jedinému volaniu `tldjs.getDomain()`, ktorým
PixelYourSite zisťuje doménu pre svoje cookie. Keby chýbal, PYS má záložnú
vetvu, ktorá vráti `www.prosapiens.cz` namiesto `prosapiens.cz` — iná doména
pre cookie, teda tichá zmena v meraní reklamy. Preto trojriadková náhrada,
ktorá vracia presne to, čo vracal zoznam.

**jQuery (35 kB) ZOSTÁVA.** Závisí od neho PixelYourSite (81 volaní — reklamy
a Meta CAPI) aj cookie lišta. Nie je za čo ich vymeniť.

Overené po zmene: pixel **3288091694795887** sa načíta, CAPI endpoint
`/wp-json/pys-facebook/v1/event` odpovedá, `gtag` aj `dataLayerPYS` bežia,
formulár aj reCAPTCHA fungujú. `tldjs.getDomain()` vracia `prosapiens.cz`.

**Instagram feed — plugin deaktivovaný 1. 10. 2026 (Jerryho rozhodnutie).**
Feed sa nevykresľoval na žiadnej zo 78 stránok a boli na to DVA nezávislé
dôvody: nová téma `psb-spready` neregistruje ani jednu widget oblasť (v
administrácii sa *Vzhled → Widgety* ani neotvorí), takže widget zo starej
pätičky nemal kam ísť; a zdroj mal odobratú autorizáciu („An account admin
has deauthorized the Smash Balloon app"). Shortcode `[instagram-feed feed=2]`
je vedený ako použitý na 3 miestach, ale téma spúšťa shortcody len
v článkoch a v skrytých formulároch, nie na obrazovkových stránkach.
Sedemdňová lehota na zmazanie dát sa týkala keše príspevkov pre feed, ktorý
nikde nebežal.
Nastavenia oboch feedov zostávajú uložené, keby sa to malo vrátiť — vtedy to
ale treba postaviť ako obrazovku v téme, nie ako widget.
**Riadky `sbi_styles` a `sbi-tokens-local` som zo snippetu 28 vyhodil:**
odpojený štýl vypnutého pluginu by po jeho opätovnom zapnutí ticho rozbil
vzhľad feedu.

Spolu za 1. 10. 2026 ubudlo z prvého načítania **~577 kB**: reCAPTCHA 353,
písmo 55, JavaScript 126, štýly 43.

### Písmo Agrandir — 124 → 69 kB, naživo od 1. 10. 2026

`fonts/agrandir.woff2` **nebol woff2** — bol to premenovaný TrueType: 303 kB
na disku, 124–141 kB po drôte (server ho gzipoval). Skutočný WOFF2 z neho
spravil 106 kB; vybratie osi `ital` ďalších 37 kB. Výsledok **69 kB**.

Os `ital` používalo jediné pravidlo `.book em` — a `.book` je na živom webe
len na `/o-nas/`, kde nie je ani jeden `<em>`. Stála 38 kB na každom načítaní
a nevykreslila nič. Kurzíva je odteraz samostatný súbor **14 kB**, ktorý sa
sťahuje len tam, kde kurzíva naozaj je. Overené v Jerryho Chrome:
`/uvodni-trenink/` ťahá len 69 kB, `/biotensegrita/` (8 kurzív v citáciách)
69 + 14 kB — a tie citácie majú odteraz skutočnú italiku namiesto falošnej
šikmej.

Osi `wght` aj `wdth` zostali celé, takže všetkých 25 `font-variation-settings`
v téme platí ďalej. Šírky textu pri 11 nastaveniach, ktoré téma používa, sedia
**do znaku** (fontTools) aj **na pol pixela** (prehliadač). Podmnožinu znakov
som NEROBIL — ušetrila by 5 kB a stála by 57 glyfov.

**Kde súbory ležia:** `/wp-content/uploads/2026/10/agrandir-var.woff2`
a `agrandir-italic.woff2`, nie v priečinku témy. Binárny súbor sa cez Editor
šablón nahrať nedá a celá téma má 20 MB kvôli obrázkom. Nahrávanie písiem do
knižnice médií povoľuje nový **snippet 27**; WordPress ho inak odmieta.
Kópie sú aj v repe v `navrhy-webu/tema/psb-spready/fonts/` — keď sa téma raz
bude nahrávať ako celok, dajú sa cesty vrátiť na `fonts/…`.

Pred nahratím som porovnal celú tému s repom: 10 PHP, 78 JSON, 81 HTML,
`style.css`, oba JS a 31 obrázkov — **všetko sedelo na bajt**, takže v živej
téme nebola žiadna úprava, ktorá by v repe chýbala.

**Vedľajší nález:** tri ozdobné prázdne `<i>` (pásiky priebehu) dedili kurzívu
z prehliadača a to by stačilo na stiahnutie italiky aj tam, kde žiadna nie je.
Rieši to `.bar .line i,.bar .hint i,.mprog i,.swipehint i{font-style:normal}`.

Zostáva: **LCP pod 7 s to samo nedostane.** Po reCAPTCHe aj písme ubudlo
z kritickej cesty ~408 kB; ďalšie na rade je `tld.min.js` z PixelYourSite
(40 kB) a jQuery (31 kB).

### reCAPTCHA na webe — odložená za prvý dotyk (1. 10. 2026)

Otázka bola „vymeniť za honeypot?" a odpoveď je, že netreba: reCAPTCHA
zostáva, len sa prestala naťahovať pred vykreslením. Zmerané na
`/uvodni-trenink/`: z prvého načítania ubralo **353 kB zo 782 kB** (45 %)
a bola to najväčšia jediná vec na stránke — viac než všetky skripty,
obrázky aj písma dohromady. Robí to snippet 24 v Code Snippets, kópia kódu
je v `philipjerry-web/navrhy-webu/snippety/24-recaptcha-odlozene.php`.

Odkladá sa LEN Google `api.js`. Modul Contact Form 7 má celý kód v
`DOMContentLoaded`, takže odložený sa nespustí vôbec — token by nebol,
CF7 by každý dopyt vyhodnotil ako spam a dopyty by ticho mizli bez mailu
aj bez zápisu do Kokpitu. Presne túto chybu mala prvá verzia snippetu
z 21. 9. a kvôli tomu bol vypnutý.

Overené naživo odoslaním testovacieho dopytu cez formulár na
`/uvodni-trenink/`: token 2 233 znakov, web presmeroval na Poděkování, lead
dorazil do `leads` celý (testovací záznam zmazaný). To isté overené na
`/test-postury/` (iný formulár, cf7:5111). Pasca na botov (`psb-web`,
snippet 16) beží ďalej nezávisle.

Čo z toho zostáva otvorené: **LCP pod 7 s to samo nedostane.** Prvé
načítanie je teraz 429 kB a najťažšie v ňom je naše písmo
`agrandir.woff2` (124 kB), potom `tld.min.js` z PixelYourSite (40 kB),
`style.css` (37 kB), `app.js` (37 kB), jQuery (31 kB).


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
