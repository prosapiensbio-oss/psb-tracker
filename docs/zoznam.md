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

**Veci s dátumom** (sem patrí všetko, čo sa nedá urobiť skôr, aby to
nezapadlo medzi úlohami bez termínu):

- **Jedno kliknutie od Jerryho (hneď)** — WP Fastest Cache → „Vymazat všechny
  cache paměti". Nové listovanie na webe (šípka, vykúkajúca ďalšia obrazovka)
  je nahraté a v zdrojovom CSS je, ale návštevníkom ide stará zlúčená kópia
  CSS. Z účtu „ProSapiens" sa nastavenia WPFC nedajú otvoriť („nemáte
  oprávnění"), z Jerryho účtu áno.
- **24. 11. 2026** — vyhodnotiť prvú obrazovku úvodnej stránky: koľko ľudí
  z POČÍTAČA prešlo z 1. na 2. obrazovku (pred zmenou 1 z 36) a koľko klikov
  má `cta_odkaz` na „Rezervovat úvodní trénink".

- [x] **2. 11. 2026** — overené v `automaty`: ranná dávka odišla o 05:30Z (4 odbery), automatické balíčky z plánovača o 04:15Z (0 nových), všetkých 17 automatov bez chyby.
- **6. 11. 2026** — prvá uzávierka po osobách: pripomienka má prísť Jerrymu aj Terezke zvlášť.
- **Keď sa to zopakuje** — karta „Informace po úvodní lekci" na stránke po úvodnom (/u/): nová klientka Terezke povedala, že ťuknutie nič neurobilo, 1× (hlásené 2. 11. 2026), telefón neznámy, na ostatné odkazy sa nesťažovala. V testovacom prehliadači sa chyba nezopakovala (na šírke telefónu aj v rámiku; nová karta tam bola blokovaná, videný len pokus o otvorenie), iPhone/Safari ani vstavaný prehliadač overené neboli. Podozrenie, nedokázané: `target="_blank"` vo vstavanom prehliadači telefónu. Jerry: nechať tak, pri ďalšom hlásení zistiť telefón a appku, z ktorej otvárala SMS.
- **Prvá platba cez odkaz** — bitcoinová faktúra z `/v/` sa zapisuje do `ln_faktury` až pri skutočnom otvorení klientom a Blink ju hlási ako zaplatenú (3. 11. 2026). Túto časť sme ešte nevideli na ostrej platbe: pri ďalšej BTC platbe cez odkaz over, že sa v kroku Platby ukáže s „Blink hlási zaplatenú faktúru“ a sumou z odkazu.
- [x] **10. 11. 2026** — hĺbka listovania na webe prečítaná; čísla a záver
  v „Zavreté" dole („Hĺbka listovania — odpoveď z dát").

---

## NAŠLO SA PRI PREHĽADE KONVERZÁCIÍ — 2. 11. 2026

Jerry 2. 11.: „na čo sme ešte zabudli?“ a potom odpovedal ku každej položke.

**Otvorené**
- [ ] **Pošta vo Workspace (12. 11. 2026):** schránka info@ ako karta; Jerry súhlasí: pamätať hlavičky (obsah až pri otvorení), Terezka ju vidí, načítanie každé 2–3 h. Návrhy A/B/C v `navrhy-kokpitu/posta-workspace.html` (odporúčané B — roztriedená fronta), čaká na výber. Pred stavbou: Jerry rozšíri GEO ochranu schránky na Websupporte (mne bezpečnostné nastavenie meniť nesmiem).
- [x] *(11. 11. 2026 hotové: doplnenie 1 h od 10. 11. nahodené v profile, automatický 6h zrušil Kokpit sám, 11. 11. = 1 h, dlh 0; os už neukazuje „prepadlo“, ak je na ten deň doplnenie — 9f07282)* **Matej Procházka — hodiny po zmazanom tréningu 14. 10. (11. 11. 2026):** Jerry chce: 11. 11. = posledná 1 h balíčka zo 16. 9., nový 6h až ďalším tréningom. Priamy zápis do D1 mi Kokpit nepovolil; Jerry 11. 11. upresnil: 1 h neprepadla, je to DOPLNENIE. Spraví v profile (balíčky): + Nahodiť → Doplnenie členstva, 1 h, platí od 10. 11. 2026, 0 Kč — Kokpit sám zruší automatický 6h od 11. 11. a založí ho znova za doplnením. Ráno bolo zapísané „1 h prepadlo“ (ack platnost|Matej Prochadzka|2026-11-10) — po predĺžení sa už nepýta. **Príčina v kóde:** tréning zmazaný z Google až po vypadnutí z okna snímky (21 dní) ostane v Kokpite živý → appka si myslela, že balíček je minutý, a neohlásila končiacu platnosť s hodinou navyše. Oprava (kontrola starších udalostí pri sťahovaní) čaká na Jerryho áno.
- [ ] **Zmluvy 6M v Kokpite — naostro od 10. 11. 2026** (Workspace → Zmluvy, profil → zmluva, stránka /z/<token>). Jerry 10. 11. otestoval skúšobný mail aj podpis na telefóne: „funguje to, páči sa mi to“. Ostáva: (1) prvá ostrá zmluva s klientom; (2) ~~krátky odkaz~~ hotové 10. 11. — snippet 26 presmeruje aj /z/, SMS je jedna správa; náhľad ide priamo na Kokpit; (3) pravidlá sú česky — v DocuSeal boli slovensky, ak chce Jerry slovensky, nová verzia znenia; (4) 6 starých PDF z DocuSeal priradených podľa dátumu a podpisu — Jakub Gerich (20. 3.) Jerry potvrdil 10. 11.; (5) čl. 10.2 (súhlas s obchodnými sdeleniami) je v podmienkach napevno — pre mailer platí samostatné začiarknutie, zvážiť vyňatie; (6) Matovidlo a Eduard Košek v DocuSeal čakajú na podpis — poslať im zmluvu z Kokpitu.
- [x] *(Vyriešené 8. 11. 2026: report PTmindera z 1. 11. to potvrdil, platba 3. 8. označená ako vopred, Monika nič nedlhuje, 3 h. Pravidlo samé sa nemenilo — rovnaký prípad sa môže zopakovať u iných.)* **Monika Čechova — falošný dlh 7 790 Kč (8. 11. 2026):** platba 3. 8. zaplatila balíček od 2. 9. (30 dní vopred, medzi tým iný balíček nebol), pravidlo „zaplatený“ ju pre okno −14/−21 dní nevezme. Platba 6. 11. tak pokryje septembrový balíček a októbrový ostane dlhom (+ „3 h nad rámec“, SMS, QR na /v/). Možnosti: označiť platbu 3. 8. ako „vopred“ (zásah do dát), alebo rozšíriť pravidlo — to pred zmenou overiť snímkou pred/po nad všetkými klientmi.
- [x] *(Jerry 9. 11.: NIE — platby priraďuje on. Namiesto toho: platba priradená k faktúre patrí balíčku na faktúre a dlh zmizne, `viazane` v dlhKlienta.ts, nasadené 9. 11.)* **Platba s číslom našej faktúry sa nepriraďuje sama (8. 11. 2026, Crescere fortis / Monika Čechova 20261012):** prevod 6. 11. stiahnutý v noci 7. 11., priradený až ručne 8. 11. — dovtedy faktúra nezaplatená. Návrh: nočný sťah priradí sám, keď text nesie číslo JEDNEJ faktúry z Kokpitu, suma sedí do 2 % a faktúra nemá ďalšie položky. Čaká na Jerryho áno (pravidlo „Kokpit sa má pýtať“).
- [ ] **Faktúra na ďalší balíček — prvý ostrý beh, po tréningu Po 9. 11. 15:00 (Jan Kral):** faktúra 20261018 (6 990 Kč, FSH Devices) je vystavená a odoslaná 4. 11. Over, že vznikol 6h Předplatné od 9. 11., faktúra má priradený balíček a zo zoznamu zmizlo „čaká na prvý tréning“. Ak firma zaplatí skôr, faktúra sa má uhradiť hneď po priradení platby. Na telefóne tlačidlo ešte nikto nepozeral.
- [ ] **20. 11. 2026 — Azure Speech (jazyková appka):** účet jerrystranavsky@gmail.com, portál → Upgrade, plán „Basic – Zahrnuto“ (nie Vývojář $29). Stránku som Jerrymu otvoril, potvrdzuje a platí on.
- [ ] **Pluginy na webe (2. 11.):** Jerry zmazal Card Press (backdoor), Kirki, Klaviyo, Exclude Pages; všetkých 78 stránok po tom overených (200, bez odkazu na vypnuté pluginy, bez holých shortcodov). Zmazaných ďalších 8 neaktívnych; 85 adries webu znova overených 2. 11. popoludní (200, bez chýb PHP, formuláre aj meranie na mieste). Ostáva zmazať Pinterest a až potom WooCommerce (WordPress drží WooCommerce, kým je Pinterest na serveri). Potom 20 aktívnych aktualizovať po jednom. Nezmazať: Jetpack (obrázky cez i0.wp.com), Forminator, CF7, Easy Accordion (5 stránok), Real Testimonials, Simple Download Monitor, Code Snippets, Asset CleanUp.
- [ ] **UpdraftPlus (2. 11.):** posledná záloha 21. 10., ďalšia plánovaná 4. 11. o 9:30; v nastavení varovanie „nadbytečné mezery, môže poškodiť zálohy“ a v logu `popen failed`. Overiť, že záloha 4. 11. prešla a dá sa z nej obnoviť.
- [x] Gmail filter mazal výstrahy Wordfence: zrušený 2. 11. Filter na Google prihlásenia a Adobe Stock ostáva.
- [ ] **Výmena prístupov** (rozbor 1. 11.): vysvetlené Jerrymu 2. 11. Zmení heslá a kľúče, ktoré chodili cez prehliadač: `info@`, SMS, Meta, servisný účet Google, Metricool. MailerLite zrušený, Google Ads ruší účet.
- [x] *(9. 11. 2026: build po pushi spustí `scripts/straz-migracii.mjs` proti `migrations/aplikovane.txt`; chýbajúca migrácia build zastaví — overené falošným súborom.)* **Stráž migrácií pri automatickom nasadení po pushi**.
- [x] *(Jerry 9. 11.: vyriešené)* **Poistka ČPP (Suchý):** 2. 11. poslal vyjadrenie ČPP a čaká na Jerryho slovo. Jerry: „čakaj“, zatiaľ neodpovedať. ČPP: výluka na priestor nie je, do zmluvy to netreba, pri škode „individuálne“; na škodu na prenajatej nehnuteľnosti priamo neodpovedali.
- [ ] **Kasička:** korunový účet na vankúš rieši Jerry; Fintable má byť podľa Jerryho 10 €, nie 72 €.
- [ ] **Regina Obrovská: rozhovor v stredu 4. 11. o 9:30.** Otázky sú z 15. 10.; súhlas písomne.
- [ ] **Reel Natália „lopatka“:** Natália súhlasí (Jerry 2. 11.), reel je `~/Downloads/Test strih videa/Natalia_reel_lopatka.mp4`, ešte nenaplánovaný.
- [ ] **José/Guillermo:** 2 tréningy v mínuse, čaká sa na jeho odpoveď (Jerry 9. 11.: stále čaká).
- [ ] **Nový marketingový plán:** starý z 3. 10. sa nenašiel, Jerry: „ideme ďalej a vytvoríme nový“.
- [ ] **Dátumy narodenia:** odkaz hotový (Workspace → Anamnézy), posiela Jerry. Bez čísla: Klára Malíčková, Petr Baťa, Romana Prochádzková.
- [x] Radek Baláž: vrátenie opravené na −15 500 (2. 11., Jerry: „urob to ty“).
- [ ] Neoverené naostro: večerné čítanie pošty, prihlásenie po zrušení spoločného hesla. Zvyšok auditu webu z 18. 10.: cookie lišta pre nového návštevníka, formulár klávesnicou, nenačítané obrázky.
- [ ] Investičná appka: odložená, „keď Budúcnosť stabilne drží 15 %“. Len evidencia, nestavať.
- [ ] Drobnosti: „Treba urobiť“ dvakrát v Analýze Kasičky; `updated_at` na myšlienkovej mape; máj v Ahsokinom priemere; Irina Dyldina DYNAMIKA bez počtu hodín.

**Vybavené 2. 11. (neotvárať)**
- Postupné čerpanie: s Terezkou dohodnuté. Strážca: november limit 46 487, od decembra nárok podľa tempa, strop zálohy zrušený.
- Staré zálohy `psb-zaloha-*` sú v Koši. Gmail: PTminder už nejde do koša, od ptminder.com hviezdička + dôležité.
- Jarek −10 000 sedí, z tých peňazí hneď zaplatil Markétu (9 400); riadky ostávajú.
- Reedog, Klára (craft-line), zásielka LT069964211UA: Jerry vybavil.
- Okno „započítať hodinu“ a Terezkin pohľad na iPhone: Jerry: irelevantné, neoverovať.

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
8. [x] Zrušené 5. 11. 2026 (Jerry: Terezka bude pracovať s tým, čo vyrobí, neriadime sa podľa nej). Terezka prejde jeden reel celým kruhom už nie je podmienka.
9. [x] Upload do Higgsfieldu (SSL pri PUT) – opravované 3× (eba67c2, 741b0fe, dfa9b7b). Overené 31. 10. v dátach: po poslednej chybe prešli 3 naplánovania vrátane repostu Filipa 174 MB (28. 10.) a dvoch hotových videí Ahsoky (27. 10., 4. 11.).
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
9q. [ ] Prvé ostré skúšky (26. 10.): ~~hotové video Ahsoky → titulka + naplánovať v Metricoole~~ (prešlo: 27. 10. a 4. 11.); AI titulka Ahsoky (Higgsfield, kredity); prvý presun ťahaním v Kalendári po oprave twitterData; Príbeh z klipov na ďalšom priečinku (#22, #28–32).
9r. [x] Push na GitHub (28. 10.): Príbeh z klipov, palety profilov, fotky/videá v infografikách a 4 psie štýly Ahsoky (Vodítko, Mapa, Štartové číslo, Pamlsky) – main a1cbbe6.
9s. [ ] Naostro overiť: karusel s fotkou/videom do Metricoolu, grafika od Clauda/Higgsfieldu v štýloch Ahsoky.

**C2 · Strižňa – kritika 31. 10. 2026 (Jerry: „rob to v poradí, ako navrhuješ, sprav všetko“)**
Pravidlo „najprv kruh s Terezkou“ zrušené 5. 11. 2026.
10a. [x] (31. 10., strizna 258a9d5) Zdravie Strižne – pruh hore, keď je Claude odhlásený / Metricool / Higgsfield nedostupný / joby padajú na pozadí.
10b. [x] (31. 10., strizna 712120c) Brief príspevku „O čom to je“ – jeden zdroj faktov pre caption, nápady, text titulky, karusel.
10c. [x] (31. 10., strizna 712120c) Výsledky späť do písania – 5 najlepších háčikov účtu v briefe.
10d. [x] (31. 10., strizna 06ec25e) Profily bez tichého PSB – čo profilu chýba, viditeľná náhrada, feed a Jarvis podľa profilu.
10e. [x] (31. 10., strizna ca6d87b) Obal ako jeden krok v Zverejniť (snímka · karta v štýle účtu · AI), predvolený podľa profilu.
10f. [x] (31. 10., strizna 8cf9003 – rozšírený Prehľad, nie nová obrazovka) Jeden zoznam príspevkov so stavom + „+ Nový príspevok“ s výberom druhu.
10g. [x] (31. 10., strizna d04199f, f0394fa, dace52f – téma už bola od 20. 10., teraz s kontrolou čitateľnosti; editor podľa účtu strihu) Dizajn: farby appky podľa aktívneho profilu; obrazovka hotového videa v užšom okne.
10h. [x] (31. 10., strizna 9888c08 – zápis v docs/test-terezka.md) Kruh nanečisto (Claude ako Terezka na kópii dát) – opraviť, čo padne; potom bod 8 so skutočnou Terezkou.

10i. [x] (31. 10.) Pri kontrole kritiky dorobené: audit editora (Inšpektor na plnú výšku, strizna 732caec), editor pod pruhmi, scenár karty podľa účtu + háčiky účtu, hashtagy podľa účtu, Jarvis bez fáz štúdia pre osobné účty.
10j. [ ] Naživo po prihlásení Clauda (`~/.local/bin/claude` → /login): Napísať, ✦ text titulky, scenár osobnej karty, prvý strih, feed iného účtu.
- **10k** [ ] *(9. 11.: Jerry nahral naostro RG bar 2026-11-06/r7 dávkou s Claudom; kritika → opravy a50d537.)* Montáž cvikov (1. 11. 2026): nahratie „jedno video“ z 3+ klipov bez reči strihá hneď Claude (aj podľa hudby), kontrola kamery, veta „O čom to je“, druhé kolo kontroly, texty + slovo za telom + zvuky. Overené na kópii. Ostáva: Jerry nahrá naostro a posúdi; kontrola po rendri zatiaľ nie je; hudba z Instagramu sa nedá vypočuť – test katalógu Metricoolu čaká na povolenie (createScheduledPost blokuje auto mode).
- **10l** [ ] Terezka: dva profily a jej písma vo videu hotové (2. 11. 2026), video s krkom je na FP účte. Ostáva: Terezka skontroluje texty („Proč postroj na hlavě?“, „Krk ve flexi, tělo ve výpadu“, „Functioneck + regen.trainer“, „Víc: FP Evidence a 10 Week Course“) a popis, zverejnenie cez Zverejniť.
- **10m** [ ] Terezkin projekt prečítaný celý a prepísaný do manuálov oboch účtov (2. 11. 2026, strizna 9132ad4, 34450e2). Jerry rozhodol: captiony tykať, `#functionalpatternssk` len keď chce, jazyk FP účtu podľa potreby. Ostáva: Terezka si manuály prejde v Profiloch a škrtne, čo jej nesedí. Manuál je snímka: nové rozhovory v Projecte Strižňa ani Jarvis nevidia.
- **10n** [ ] Jerryho projekt JerrySocialneSiete prečítaný celý a prepísaný do manuálov @philipjerry a @filip_stranavsky (2. 11. 2026, strizna 34450e2, 0155108). Jerry rozhodol: skúšobná doba FP podľa neho beží, klientske pred/po na FP účet nie; v Brne pred nasťahovaním trikrát, raz prespali. Filip má paletu Carbon z palettes.md (čierna #161616, oceľová #5A7D9B) namiesto tmavomodrej. Ostáva: Jerry si pozrie štýly Filipa v Strižni; oprava na philipjerry.cz: Bitcoin „ktorý nám dal iný klient“ a časová os 2005–2012 (znenie v rozhovore 2. 11.).
- **10o** [ ] Kritik hotového strihu montáže cvikov (2. 11. 2026, strizna): grcanica sa prestrihá nanovo, najviac 3 pohľady. Kalibrácia: na videu 2026-11-02 r1 trafil zábery 2 a 3, Terezkin krk nechal celý. Ostáva: Jerry posúdi prvé video po kritikovi; kritik nevidí pohyb, len snímky, a pozerá len montáže z 3+ klipov.
- **10p** [ ] API Metricoolu a hudba z Instagramu v Strižni (2. 11. 2026). Advanced 15 zaplatený a token vložený na Jerryho Macu 3. 11.; hľadanie cez Strižňu a ukážky overené na profiloch PSB, Jerry, Ahsoka, Filip, tereza-fp. Ostáva: token na Terezkinom Macu (na každom zvlášť) a prvý reel so skladbou naostro, hlavne Filip a tereza_zatkova, kde katalóg pre chýbajúci Facebook berie značku PSB.
- **10r** [ ] Strižňa číta výsledky, kalendár, feed a najlepšie časy cez API, bez Clauda (3. 11. 2026). Bez tokenu alebo pri zlyhaní ide stará cesta. Overené na kópii dát; ostáva: prvé ostré stiahnutie so zápisom do kariet v Kokpite. Cez Claude ostáva: plánovanie, presun, Jarvis, konkurenti, zistiSiete.
- **10s** [ ] Návrhy skladieb a trendy v Strižni (3. 11. 2026): kategórie s ukážkou a výberom, denný rebríček Instagramu overený v katalógu účtu. Dnes je v katalógu 0 z 50 trendov, firemný katalóg ich neponúka. Ostáva: Jerry sa pozrie; prvý reel so skladbou z katalógu naostro. Otvorené: skúška trendovej skladby mimo katalógu na osobnom účte, len na Jerryho rozhodnutie (práva, API metadáta vráti aj pre nedostupnú).
- **10t** [ ] Návrh: „Fungovalo u nás" pri hudbe, skladba reelu ↔ jeho výsledky. Má zmysel až po 5 až 10 reeloch so skladbou z katalógu; dnes dáta nie sú.
- **10x** [ ] Rozbor Strižne 3. 11. 2026: report https://claude.ai/artifact/7KwX7YazLfWW4QX4K6Cjzr, návrhy plochy A/B/C https://claude.ai/artifact/3235YSTcWsEuoyRj5MK9sx, podklady ~/Downloads/philipjerry-web/navrhy-strizne/podklady/. Opravy chýb a redundancií v main od 4. 11. (9e290a5, päť kôl s nezávislou kontrolou). Ostáva z opráv: drobné kópie R3 (jeCislo, jeText, noveId, r2, r3, jeObj, norm, zaokr) a R6 (Plagát/Zápisník, stopa.json) (vetvy ms-* a zj-* sú zlúčené, urobiť po prvej ostrej dávke, aby sa nemiešali s prípadnými chybami zlúčenia); konektor pri čítaní ostáva, kým sa nepotvrdí token na Terezkinom Macu (na ten sa odtiaľto nedá pozrieť); mazanie celého dňa neoveruje termíny karuselov (len neistý plán); karusel, mem a infografika idú od 3. 11. s kľúčom cez API, koncept fotky a karuselu overený 4. 11. a zmazaný, prvý skutočne zverejnený ešte treba pozrieť na Instagrame; príspevok presunutý v Metricoole o viac než 5 min môže byť v Kalendári dvakrát, ak nemá id. Naživo overiť: otázky pri mazaní, „Príspevok tam je“, ostré plánovanie memu, karuselu a infografiky cez API, Zrušiť pri 4K a Claude.
- **10z** [ ] Strižňa: zjednodušenie a plocha sú v main od 5. 11. 2026 (418750d, na GitHube). Plocha je návrh „B + dnes“: kroky nad strihom, Rozhodnutia vpravo, Zladiť klipy úplne dole vo Farbách, časová os bez zmeny (stlmenie stôp z návrhu nie je). Rozhodnuté 5. 11.: hromadné Schváliť nie (po jednom), aktívne slovo pri PSB vypnuté, Jedno video s rolami zo Surových klipov preč, texty len v Strižni (Zadanie pre Project preč), Čo hovorí Kokpit len odkaz. Čaká na Jerryho: ↻ Aktualizovať a prvá ostrá dávka so skutočným Claudom a plánovaním. *(9. 11.: dávka so skutočným Claudom prebehla (r5–r7 dňa 6. 11.); ostré plánovanie z dávky neoverené.)* Úprava z Terezkinho Macu (súbor strizna-uprava.txt) porovnať s novou cestou.
- **10a2** [ ] Štýly účtov (5. 11. 2026): výskum `reports/Štýly grafík pre účty.md` v philipjerry-web, návrhy https://claude.ai/artifact/8e9tCsRL1MXWtfXuw5iAA6 (zdroj navrhy-strizne/styly/). 6 účtov po 3 návrhoch. 3. kolo 6. 11. (index.html, staré kolo1/kolo2.html): PSB balík 10 druhov na 3 situáciách, Ahsoka celé spektrum bez obojku, Jerry C v novej palete baklažán #2E2231 / kosť #EFEAE4 / #B392AC / #6E4A6B a písmo Newsreader, Filip odznova (rám štúdie, graf, karta tvrdenia). Čaká na Jerryho Sedí/Prerobiť. Ostáva potom: hodnoty do kódu (písmo a karta podľa účtu, `shared/strihUctu.ts`), podklady podľa výberu (ťahy pera len PSB, vlastné zvuky, krátke zoznamy skladieb, Filipova veta). Zvuky v návrhoch sú syntéza v prehliadači, nie finálne.
- **10a5** [ ] Predstava sa plní (6. 11. 2026, strizna main dedbbc5): otočenie, výzva z predstavy, chýbajúci text hlásený, skupina Tvoja predstava v Rozhodnutiach. Ostáva na Jerrym: Aktualizovať a pri 2026-11-06/r1 ✦ Claude → Prvý strih nanovo; v nahrávke je len prvá veta, zvyšok textu treba dotočiť. Pole pokyny zatiaľ len pri hovoriacej hlave, nie pri montáži.
- **10a6** [ ] Strih na úrovni profesionála (6. 11. 2026): rozbor archívu /Volumes/LaCie/1 Instagram v philipjerry-web research_notes/Instagram archív/ (psb.md, klienti.md, jerry_filip_karusely.md). Strižňa už má −14 LUFS, strih ticha, stíšenie hudby pod rečou, kontrolu háčika a výzvy. Hotové (1) šablóna Klientsky príbeh, strizna main po 49ef54a (✦ Claude → Šablóna → Klientsky príbeh; ostrým rozhovorom zatiaľ neprešla, fotky pred/po treba pomenovať „pred“ a „po“). Chýba: (1-pôvodne) šablóna klientskeho príbehu: oblúk problém, zlom, výsledok z celého prepisu, najsilnejšia veta ako prvá, tréning cez celý obraz pod rečou, menovka, pred a po raz na celú obrazovku, séria 1/3, výzva; (2) kontrola pred exportom: čierne miesta, koncová karta nad 1 s, jazyk titulkov podľa reči a účtu, pomlčky; (3) hudba pod rečou hlbšie (dnes 12 dB, rozbor radí 20 až 24) a ticho pred vetou zlomu; (4) karusely: rôzne kostry, telo aspoň 36 px, do 35 slov na snímku, kontrola číslovania; (5) kontrola záberu pri importe (protisvetlo, kamera zdola, nápis na tričku); (6) Filip: tvrdenie alebo priznanie, ukážka, štúdia v texte. Na Jerrym: ukladať surové zábery, natáčať zboku, mikrofón na klope, súhlas rodiča pri dvoch Stories 2025 s dieťaťom.
- **10a7** [ ] Predstava ovláda appku (6. 11. 2026, strizna main c09ab17): „otoč to video“ bez smeru, titulky, hudba z knižnice podľa nálady a hlasitosti, grafiky; text z Naudiho prepisov alebo z popisov záberov do hooku a captionu; montáž cvikov má texty predvolene. Ostáva na Jerrym: Aktualizovať, potom r1 Prvý strih nanovo. Nevie: PDF prepisy, hľadanie v prepisoch je len podľa slov.
- **10a6** [ ] Orientácia a výpoveď videí (6. 11. 2026, strizna main 49ef54a): hovoriaca hlava natočená nabok sa otočí sama (meranie na celom snímku), cvik nabok len návrh v Kamery › Poloha, záber na šírku posuvný výrez za človekom; montáž cvikov má texty vždy (druhá session, c09ab17), predstava zapína titulky, hudbu a otočenie. Ostáva: Jerry Aktualizovať a r1 Prvý strih nanovo; skutočný záber na šírku ešte neoverený (v dňoch žiadny nebol); montáž nemá riadky orientácie v Rozhodnutiach. *(9. 11. a50d537: cvik nabok sa otáča sám pri jasnom meraní, príbeh klipov dáva otočenie do Rozhodnutí. Strihy dňa 6. 11. Jerry zmazal 9. 11. 18:03, „r1 nanovo“ odpadá, overí sa na ďalšom strihu.)*
- **10a8** [ ] *(Fáza 2 HOTOVÁ 9. 11., strizna main eb0e35a: sady grafík podľa účtu v Rozhodnutiach → Réžia → „Sada grafík účtu“, karty sa vyhýbajú hlave podľa pózy; Filip celý v commite fc24b69, revert ho vráti. Ukážky ~/Desktop/Strizna-ukazky/sady. Nepreniesené: obal Ahsoky s vyskočením (maska nevie psa), zdroj pri čísle a pojem PSB (strih nemá text), diel série mimo príbehu, Filipov „Můj pohled“ (repost). Čaká: Jerry pozrie na telefóne, potvrdí Filipa.)* Réžie a sady grafík do Strižne (9. 11. 2026). Jerry vybral z vyrenderovaných návrhov B Telo ako mapa, D Dokument a F Rytmus slov (~/Downloads/psb-strih/kolo5, out/popis.md). Čo musí platiť: viac réžií, vzhľad podľa účtu, výber podľa záberu, na účte sa réžia neopakuje po sebe, varianty vnútri réžie. Fáza 1 HOTOVÁ 9. 11. (strizna main 789011f, na GitHube): réžie v Rozhodnutiach → karta Réžia, výber podľa záberu, pamäť videí, varianty, maska Apple Vision; D má pri Filipovi a Ahsoke svetlé karty, hook 84 px. Overené testami a skúšobnými rendermi B (Jerry), D a F (Filip) na kópii 2. 11.; PSB vzhľad len testami (deň mal klientku). Ostáva po fáze 1: Jerry pozrie na telefóne prvý ostrý strih; slovo za telom ešte s maskou MediaPipe; Prestrihanie V pohybe réžiu neobnoví; zvuky k zastaveniu a spomalenie chýbajú; popisy na tele sa nedajú ručne upraviť. Fáza 2 = sady grafík z HTML náhľadov navrhy-strizne/styly: PSB 4. kolo bez uhlov, Ahsoka 3. kolo bez obojku, Jerry 4. kolo (grafit/papier/šalvia, denník), Filip 4. kolo (svetlé karty, česky, nepotvrdené). Jerryho kliknutia Sedí/Prerobiť stále chýbajú (localStorage), treba Skopírovať hodnotenie.
- **10a9** [ ] Kritika videí 9. 11. a opravy (strizna main a50d537): cvik nabok sa otočí sám pri jasnom meraní (v ľahu vráti Rozhodnutie), réžia F začína záberom a nerozseká montáž, réžia D nedá výzvu na úvod a pri reči nemá úvodnú kartu. Ukážky pred/po ~/Desktop/Strizna-ukazky/kritika. Čaká na Jerryho: ⌘Q a znova otvoriť Strižňu (beží od 15:01, pred opravou). Neopravené z kritiky: podpis na konci veľkými písmenami, mriežka F úzka, caption „kmeň a konáre“ nesedí k videu.
- **10a12** [ ] ↻ Prestrihať nanovo (10. 11. 2026, strizna main 00b0d37): karta strihu v Produkčnom dni + ✦ Claude ▾ v editore; nový strih z tých istých klipov vedľa pôvodného, predstava predvyplnená. Overené v prehliadači na kópii (bez Clauda). Čaká: Jerry ⌘Q a prvé ostré prestrihanie so skutočným Claudom.
- **10a11** [ ] Kritika 2. kola 9. 11. (strizna main 65fc904): Rytmus slov po novom (montáž celá, vety na doby cez obraz, koniec s celou vetou a nápisom účtu malými), texty montáže = jedna myšlienka celými vetami (+ kontrola textyBezHlavy), popisy na tele bez slov z popisu záberu. Ukážky ~/Desktop/Strizna-ukazky/kritika (Filip-tycka-po-oprave, RG-bar-2-po-oprave). Čaká na Jerryho: ⌘Q, pri oboch strihoch Príbeh znova (texty sú ešte staré, písané pred opravou) a posúdiť, či texty už držia spolu. Neoverené: nové zadanie textov so skutočným Claudom. Podpis nad hookom (podpisVidea) je stále verzálkami; zmenené len v réžiách.
- **10a10** [ ] *(Hľadanie HOTOVÉ 9. 11., strizna main 0803378: náradie + doslovné frázy, poradie podľa počtu zmienok; pre vetu o RG bare 3 streamy namiesto 0. Ostáva: Jerry ⌘Q, potom pri RG bare Príbeh znova a pozrieť, či text naozaj stojí na Naudiho myšlienke.)* Naudiho streamy (9. 11.): Strižňa má 77 prepisov (~/Strizna/zdroje/naudi-1, naudi-2), ale hľadanie pozná len pojmy tela (POJMY v shared/zdrojPredstavy.ts). „RG bar“ je v prepisoch ~80-krát, appka našla 0 a do zadania napísala „prepis nie je“. Treba: hľadať aj doslovné slová a náradie z predstavy (RG bar, RG bell, Leverage King, Vector Trainer).
- **10a7** [ ] Edits a preklik (9. 11. 2026, strizna main a9044bb): Zverejniť → Otvoriť v Edits (projekt 9:16 s videom, zverejní Jerry); príbeh s poľom Preklik na web ide do Metricoolu ručne (autoPublish false, notifikácia v appke Metricool). Ostáva: prvý ostrý príbeh s odkazom overiť v telefóne (príde notifikácia? je odkaz na skopírovanie?); čip Vyšlo pri ručnom príbehu klame; hudba cez Edits nefunguje a netreba ju.
- **10a8** [ ] Spotreba Clauda v Strižni (10. 11. 2026, strizna main 6b7e7e5): karta videa, opis raz, Sonnet len na opis záberov, ľahké volania bez nástrojov, dávka opisov po 6. Ostáva: pri prvom ostrom popise banky pozrieť ~/Strizna/spotreba-claude.jsonl (kolá, tokeny) a či sa opisy nepomiešali; neskôr odľahčiť konektorové úlohy (overiť na Najlepší čas) a skúsiť krátke --system-prompt na opisoch.
- **10a13** [ ] Tréning Strižne na dvojiciach surové → hotové (10. 11. 2026): `npx tsx scripts/trening.ts` v strizna, dáta ~/Strizna-trening, reporty ~/Strizna-trening/reporty. Hotové v strizna main 53343c6: značka PSB záver A (predvolený) / B na výber, panáčik dole celý čas, hudba v každom PSB strihu (−22 dB pod rečou), záver PSB nahrádza kartu réžie D/F; karta pred/po z Kokpitu (editor fotiek, karta IG 4:5) celá v rámčeku; klient-rozhovor = odpoveď na jednu otázku, reč len zo záberu do kamery (strih naslepo po oprave: Natália 39,6 s vs 38,7 s, Danielka 45 s vs 59 s). Strih naslepo spolu 7 volaní Clauda. Ostáva: odborník do kamery: Jerry bez titulkov (Strižňa ich dáva, čaká Jerryho odpoveď), pauzy tesnejšie (Jerry 2,9× zhustenie, Strižňa 1,2×), zábery mimo surových 13 %; meranie tréningu nepozná novú kartu PSB a tréningová knižnica hudby je prázdna (hudba v porovnaní „nie“ je artefakt); záver 2,4 s vs Jerryho 1,5 s – doladiť podľa Jerryho.
- **10a14** [ ] Hooky cvičiacich videí (11. 11. 2026): v strizna main dfd02a9. Úvodný záber: rozbor na pozadí (engine/hook_kandidati.py, server/hooky.ts), panel Rozhodnutia → Úvodný záber, prvý strih začne A, voľby do <koreň>/hooky-vyber.jsonl; žiadna farebná karta na snímke 0 (shared/prvaSnimka.ts). Váhy podľa Jerryho výberu 11. 11. (top-1 5→7 z 8, merané na tých istých dátach). Ostáva: prvý ostrý deň, po ~30 voľbách z hooky-vyber.jsonl prepočítať váhy; slabiny: dotyk trénera z 2D, otočenie klipov v ľahu (Jarek 180°), falošná ruka pri tvári pri gardě s činkou, rozbor ~reálny čas.
- **10a15** [ ] Kontroly Strižne padajú pod záťažou (11. 11.): vitest raz 7 testov v 1 súbore, strážca strih-opravy-k2 / mapa / kalendar / vlozky; pri opakovaní prejdú. Nájsť časovanie a spraviť ich odolné.
- **10a3** [ ] Výzva (5. 11., strizna main 82c222c): pevný Test postúry preč, výzva z karty v Pláne alebo z briefu, inak otázka v Zverejniť a Bez výzvy. Otvorené: motor ešte robí CTA z reči, keď Jerry „test postúry“ povie; Textár PSB v Kokpite ho stále odporúča pre fázu 2. Ostrý prvý strih s výzvou z plánu neoverený.
- **10a4** [ ] Vzhľad videí pre Terezku (Jerry 5. 11.: navrhne si sama, základné veci len on). Plán hotový, ~9 dní, menšia verzia ~5; čaká na Jerryho tri odpovede (memy a infografiky áno/nie, môže Jerry prepísať jej vzhľad, zvuky a čiernobiely záber jej alebo jeho) a na /navrhy obrazovky.
- **10y** [ ] Strižňa, menej strojovosti + konkurencia + Higgsfield (4. 11. 2026, strizna main f50b435, na GitHube, v appke beží od 4. 11. 22:00). Tri kolá kontroly; opravy po 3. kole overené v kóde a testami, nie ďalšou nezávislou kontrolou. Ostáva na Jerrym: (a) pozrieť a vypočuť ukážky naslepo na telefóne, ~/Desktop/Strizna-ukazky/menej-stroja; (b) kľúč z console.higgsfield.ai *(je v ~/.Strizna-tajne od 5. 11.)* a zostatok API, potom jeden obrázok a jedno video naostro (Nano Banana Pro v API nie je, ide Soul V2; kredity predplatného zrejme neplatia); (c) voľba aktívneho slova v štýle psb (nové strihy teraz bez neho); (d) 30 ťahov pera, vlastné zvuky, krátke zoznamy skladieb, Filipova veta k repostom, Terezkine hodnoty účtu. Vedome nepostavené: nápady 11 až 15 z konkurencia.md. Dávka dňa: druhá session vo vetve zj-davka, ešte nie v main.
- **10q** [ ] Strižňa: pravý panel stále vedľa náhľadu (nie cez výšku osi), os na celú šírku, + Pridať a Claude v hlavičke, Šablóna len v Claude, zoznam skladieb zbalený (3. 11. 2026, strizna 132fb00). Ostáva: Jerry si to pozrie po Aktualizovať.
- **10r** [ ] API Metricoolu v Kokpite (3. 11. 2026). Hotové: miesto na kľúč (Upload → Napojenia), nočné čísla cez API s MCP ako zálohou (október sedí 43/43 príspevkov, 50/50 metrík), Konkurenti v Marketingu. Kľúč je v Kokpite od 3. 11. Ostáva: (b) po prvej noci „cez API" zrušiť MCP a ručné CSV a PDF z Metricoolu v Upload, (c) po prvom ostrom reeli cez API preniesť aj karusel, infografiku a mem. Nápady z rozboru čakajú na výber: recenzie Google do notifikácií, správy a komentáre z IG ako zdroj dopytov, sledovatelia z Brna, hľadané slová z Google profilu.
- **10s** [x] Roly Kokpit a Strižňa (3. 11. 2026, CLAUDE.md a SPEC): titulka a rozpis záberov preč z Kokpitu, rozpis záberov na karte v Strižni, texty karty v Kokpite len na čítanie, konkurenti zo Strižne do Kokpitu.
- **10t** [x] Čo publikovať do Strižne (3. 11. 2026, Jerry: „presuň všetko“). Mapa nápadov, plán marketingu každého profilu a zadanie pre Project sú v Strižni; Kokpit ukazuje plán na čítanie s tlačidlom Otvoriť v Strižni, drží marketingový plán ProSapiens a návrhy z dát posiela tlačidlom Poslať do Strižne.
- **10u** [ ] Konkurenti v Metricoole (3. 11. 2026): je tam len holystic.training. Jerry pridá miestnych silových a fyzio trénerov a zahraničných FP trénerov, potom ich Kokpit rozdelí na dve skupiny: kto nám berie klientov a od koho sa učíme.
- **10w** [ ] *(Jerry 9. 11.: „Otvoriť v Strižni“ funguje — dvere overené.)* Strižňa: dvere z Kokpitu (`strizna://karta`, `plan`, `mapa`) sú napísané a appka ich od 4. 11. 11:02 pozná, kliknutie z Kokpitu ešte neoverené. Karta Ahsoky ležiaca v hlavnej mape a karty osobných účtov založené cez „+ Nový príspevok“ sa neukážu v mape žiadneho účtu; nepresúval som ich, je to zápis do dát.
- **10v** [ ] Správy z Instagramu ako zdroj dopytov (3. 11. 2026): API správy číta (25 rozhovorov), Kokpit ich zatiaľ len spočítal, nič nečítal ani neukladá. Čaká na Jerryho rozhodnutie, či smie text čítať bez uloženia, kvôli súkromiu ľudí, ktorí píšu.

**D · Obsah — nové nástroje, až po Strižni 1.0**
12. [x] Analyzátor IG videa (hotové 19. 10., #/analyzator; YouTube/IG sťahovanie viď SPEC „yt-dlp je zamrznutý“) (háčik, strihy, popis) + popisy konkurentov z Metricoolu.
14. [x] Osobné profily — nahradené 19.–20. 10.: profily sú v Strižni (prepínač účtov, značky Metricoolu, farby) – Jerry to tak chcel (Jerry 13. 10.; otvorené otázky v sekcii 2).

**E · Keď bude čas / keď sa niečo ukáže**
15. [ ] Pocitovka – overené 9. 11.: 1 odpoveď (7. 11.), predtým 0.
16. [x] Prezentácia reportu – hotové 20. 10. 2026: telefón na výšku má vlastné rozloženie (720×1280, jeden stĺpec), „🖨 Tlačiť / PDF“ dá každý slajd na vlastnú stranu 16:9. Overené mimo appky na ukážkovom reporte; na skutočnom Jerryho telefóne ešte nie.
17. [ ] Anonymný dotazník aj bývalým klientom. Jerry 9. 11.: najprv doladiť v Kokpite, potom dať pár ľuďom vyskúšať, rozoslať začiatkom roka 2027. Dnes 0 rozoslaných odkazov.
18. [x] Objem hľadania z Google Ads – hotové 20. 10. 2026: Marketing → Vyhľadávanie → „Čo ľudia hľadajú na Googli“ (Česko / Brno, 12 mesiacov, záujem rok proti roku, podobné výrazy, „+ Nápad“). Google počíta hľadanie pod jedným tvarom slova („bolest zad“ 0, „bolesti zad“ 2 400) – nula sa ukazuje ako „skús iný tvar“.
19. [x] Zrušené tréningy z Google Calendar – hotové už od augusta 2026 (snímky kalendára → karta „Zrušené a presunuté“, „Bol tam, alebo nie?“, presuny podľa prvy_raz); položka bola len nevyškrtnutá (overené 20. 10.).
20. [ ] NDA pri fotkách pred/po — blokované kontrolou súhlasov.
21. [x] (bezpredmetné: dvojité zobrazenie v profile odstránené 28.–29. 10.) Po vypnutí PTmindera: karta klienta dve čísla vedľa seba.

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
4. [x] *(1. 11. 2026: predplatné zrušené; posledné reporty v `~/Downloads/PTminder archív 2026-11-01/`, platby od 3. 10. sedia s Kokpitom po vysvetlených rozdieloch; do D1 sa nenalievajú, od 1. 10. platí Kokpit. Client List a opravené sedenia doplnené večer, spolu 11 súborov; zostáva zrušiť predplatné.)* **Uzávierka októbra (zač. novembra)** — ak sedí, Jerry PTminder zruší.
       **Jerry 27. 10. 2026: „PTminder zrušíme budúci týždeň.“** Čiže v týždni
       2.–8. 11., po uzávierke októbra. Posledná platba 2 287 Kč odišla 2. 10.;
       ďalšia by prišla 2. 11., takže zrušiť ideálne PRED druhým. Archív rokov
       2022–2024 aj posledný úplný export sú stiahnuté (19. 10.), takže po
       zrušení sa nestráca nič — ale skontrolovať to pred kliknutím.
5. [x] **Inventúra „vymazať PTminder" (Jerry 28. 10. 2026)** — kde všade je,
       čo by sa rozbilo. Záver: nástroj (import, porovnania, texty) sa odstrániť
       dá; DÁTA NIE — sú to jediné záznamy pred 1. 10. (P&L júl–sep, mzdové
       hodiny júl–sep, história klientov, LTV, kohorty; tabuľky čítané bez
       poistky → ich zmazanie zhodí celý Kokpit).
       **Krok 1 hotový 28. 10. (fc2611f):** cena tréningu z `balicky.hodiny_spolu`
       (0126), mená cez `znamiKlienti` (anamnézy, faktúry, override, IG),
       notifikácia `ptrozpor|` vypnutá, `data|` a `novy|` prepísané, Jarvisova
       príručka + SCHEMA_DB: od 1. 10. pravda Kokpit, PTminder = archív.
6. [x] **Hotové 28.–29. 10. 2026** (a449d44, 67f8496, 313ba8b): import a tlačidlá
       PTmindera, krok uzávierky, prepínač peňazí, porovnávania, dvojité
       zobrazenie v profile, „Vymazať všetky dáta" (+ /api/reset), kotva
       „Zostatok podľa PTmindera", texty na obrazovkách aj u Jarvisa. Prechod →
       záložka „Evidencia". Snímka čísel pred/po nad kópiou D1: 0 rozdielov.
       Ostáva: nahrať posledný októbrový export (cez Clauda), zrušiť predplatné
       pred 2. 11.; náklad PTminder vo výsledovke ostáva (bude 0).
       Pôvodný plán bodu: odstrániť import PTminder súborov
       (Údaje, plocha vo Workspace, „Naliať/Doplniť z PTmindera" — `detectCSVType`
       a `ingest` zdieľajú aj iDoklad/Metricool/GA4/GSC/anamnézy, tie ostanú),
       krok uzávierky „PTminder", prepínač „vrátiť peniaze na PTminder",
       `mimokal|`, BTC „sedí s PTminderom", texty „podľa PTmindera" (~30 miest),
       mŕtvy kód (`KalendarHistoria`, `dvojmo`, `porovnaj-mesiace`,
       `sessionsPtminder`, `paymentsPtminder`), P&L náklad „PTminder" (fixný
       → ukončiť). V appke pomenovať tabuľky ako „archív do 30. 9. 2026".
7. [ ] **Dáta PTmindera NEMAZAŤ** (krok 4). Ak ich raz preč, najprv preniesť do
       vlastných tabuliek (P&L júl–sep, mzdové hodiny, história sedení, prvý
       tréning, história členstiev) — samostatná väčšia práca.

## PREZENTÁCIA UZÁVIERKY — Jerry vybral A (12. 11. 2026), skúša sa v bete

Jerry: opakuje sa (6 otázok a potom to isté znovu), chýbajú výdavky (najväčšie, neštandardné), rozšíriť o vyťaženosť, rezervu a súhrn metrík. Návrhy A–C v `navrhy-kokpitu/prezentacia-uzavierky.html` na októbrových číslach; odporúčané B (jedna obrazovka 12 metrík + detail len oranžového a červeného). Pribudne rozbor výdavkov po kategóriách proti priemeru 6 mesiacov. **V bete od 12. 11.:** `postavPrezentaciuA` (prehľad → práca → vyťaženosť → peniaze → výdavky → rezerva → nie zelené → zelené spolu → max 3 „Urob"), `vydavkyReportu.ts`. Rezerva v bete ukazuje menej (beta nemá BTC). Po potvrdení: v `Prezentacia.tsx` zrušiť `jeBeta()` vetvu a starý `postavPrezentaciu`, riadok z `SKUSA_SA` preč. **Opravené naostro:** report radil ozvať sa Radkovi Balážovi „bez obnovy", hoci 13. 10. ukončil spoluprácu a dostal vrátenie 15 500 Kč — ukončený klient do toho zoznamu nepatrí; opraviť spolu s prezentáciou.

## VLASTNÝ MAILER — zadanie na neskôr (Jerry, 27. 10. 2026)

**Nasadené 5. 11. 2026:** migrácia 0135 aplikovaná, kód v ostrom aj v bete, obrazovka Marketing → Mailer naostro od 7. 11. 2026 (`MailerKroky.tsx`, `mailer.server.ts`). Jerry vybral: vzhľad A, témy ok, 1 mail mesačne, súhlas ako slobodné začiarknutie + darček, nezaškrtnutý newsletter v anamnéze = nepísať, `news.prosapiens.cz`, klientka je nepodstatná, o prvom maile sa rozhodne, keď to bude stáť. **Overené 6. 11. 2026 skúšobnými mailmi:** doména, webhook, meranie (`links.news`), vzhľad A cez celú šírku, odosielateľ ProSapiens Biomechanic, klik, odhlásenie, odpoveď (aj z Gmail adresy bez bodky) a jej čítanie v ostrom Kokpite. **Čaká:** 1. výber darčeka, potvrdzovací mail a znenie políčka; 3. skúšobný mail a overenie obrazovky na ostrých dátach; 4. web: políčko v `js/formulare.js`, volanie `/api/mail-prihlaska`. **Overené 9. 11. 2026: na webe ešte nie je** (živý `formulare.js` endpoint nevolá, `mail_darcek` je prázdny, v `mail_odberatelia` 0 prihlásení z webu). Poradie: Jerry vyberie darček → znenie políčka → políčko na web (súhlas Jerryho, živý WordPress).

**Opravené 7. 11. 2026 v `Mail.tsx`:** karta „Pribúdajú odberatelia?" hlási „pribúdajú", hoci posledné prihlásenie je z 3. 9. 2025 (rad končí posledným prihlásením, nie dneškom); „Stav zoznamu" tvrdí, že Kokpit odosielanie nemá postavené.

**Rozhodnuté 4. 11. 2026:** návrhy Kokpitu ako vstup + štyri kroky, odoslanie len po kliknutí, označenie a odhlásenie navrchu mailu, špeciálna adresa mimo info@, odpovede sa nesmú tváriť ako dopyty. **Čaká na výber** v `navrhy-kokpitu/mailer-temy-vzhlad.html`: vzhľad mailu A–C, 5 druhov a 24 tém, 1 mail mesačne na začiatok, presné vety pre 11 formulárov a test postury (riziko súhlasu odoslaním vysvetlené), názov adresy, anamnéza, klientka, prvý mail.

**Návrhy 4. 11. 2026 čakajú na Jerryho výber:** `navrhy-kokpitu/mailer.html` (analýza konkurencie, návrhy A–D, skupiny, 12 upozornení, 7 rozhodnutí). Odporúčané C + kroky z A, najviac 1–2 maily mesačne, brzda 14 dní, odosielanie len po kliknutí. **Prvé treba doplniť políčko súhlasu** do formulárov na dokumenty a test postury: dokumenty nemajú žiadnu vetu o súhlase, test len „za účelem kontaktování“, takže nové kontakty sa zatiaľ nedajú osloviť. Nič z toho ešte nie je postavené.

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
  odpovedali. (8. 10.: zatiaľ 0 odpovedí v `klient_merania`; 9. 11.: 1 odpoveď zo 7. 11.) Keď to bude pár ľudí, nie je to dôkaz, že sa nezlepšujú, ale
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
- [x] *(Jerry 27. 10. 2026: „zmazal som oba pluginy aj tie dva účty“; na živom WP neoverené.)* **Dva staré administrátorské účty** — Nika Pastorová
  (pastorova@emglare.com) a Admin Systedo (admin@systedo.cz). Administrátori sú
  stále traja.
- [x] *(Jerry 1. 11. 2026: zmazané; `/wp-content/plugins/revslider/readme.txt` aj `js_composer` vracajú 404.)* **Zmazať Slider Revolution a WPBakery** — od 26. 10. vypnuté, ale
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

**Cache sa maže uložením stránky, nie tlačidlom.** 27. 10. 2026 ohlásilo
tlačidlo „Vymazat všechny cache" vo WP Fastest Cache úspech DVAKRÁT a súbor
sa nezmenil — web ďalej servíroval starý titulok a popis. Zabralo až uloženie
tej jednej stránky vo WordPresse. Pozná sa to podľa komentára na konci každej
stránky (`WP Fastest Cache file was created … on <dátum>`): keď sa ten čas po
premazaní nezmení, cache stojí, nech plugin tvrdí čokoľvek.

---

### Kontrola merania webu — 27. 10. 2026

**Merania chodia.** Za 28 dní (29. 9. – 26. 10.) je `obrazovka` najčastejšia
udalosť na webe: 1 550 udalostí od 183 z 399 používateľov. Idú aj
`cta_formular` (15), `formular_start` (10), `formular_zlyhal` (15 od 3 ľudí),
`formular_odoslany` (7), `formular_oprava` (1), `video_start` (9),
`test_krok` (4), `odchod` (2), `klik_telefon` (1). `klik_mail` ani raz.

**Most na formuláre je v poriadku** — overené naživo na /kontakt/: `formulare.js`
sa načíta, `gtag` beží, formulár má `data-form` a `focusin` naozaj vyvolá
`formular_start`. Varovanie nočnej kontroly („0 začatých formulárov za 7 dní")
je teda pravdivé, ale nie je to porucha: za sedem dní prišli 4 kliky na odkaz
pri 139 návštevách a nikto do formulára nenapísal.

**Diera, ktorá sa tým našla:** udalosť `obrazovka` nesie `cislo`, `celkom`
a `nazov`, ale ani jeden nebol zaregistrovaný ako vlastný rozmer. Meranie od
11. 10. teda vedelo povedať len „koľkí aspoň raz listovali", nie „kam
dolistovali" — čiže práve to, kvôli čomu vzniklo. Doplnené 27. 10.
(Hlbka obrazovky / Nazov obrazovky / Obrazoviek celkom). **GA4 nedopočítava
spätne**, takže odpoveď bude až z dát od 27. 10.

- [x] **10. 11. 2026 — hĺbka listovania prečítaná.** Čísla a záver sú
  v sekcii „Zavreté" dole („Hĺbka listovania — odpoveď z dát").

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
- [ ] **Odovzdať appku Terezke na úpravy** – čaká na ňu (Jerry 1. 11. 2026): zatiaľ nemá GitHub ani Claude Code.
  Keď pošle meno z GitHubu: súkromný repozitár, automatické nasadzovanie z `main` ako pri Kokpite, lokálne
  skúšanie bez ostrého KV, návod pre jej Clauda (košík je skutočný). Kľúč od Cloudflare NEDÁVAŤ — má prístup aj ku Kokpitu a BTC.

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

## Prvá obrazovka úvodnej stránky — nasadené 10. 11. 2026

Rozpad hĺbky listovania podľa zariadenia ukázal, že to nie je obsahom:
na telefóne listuje väčšina (5 · 6 · 4 · 5 …), na POČÍTAČI z 36 ľudí
pokračoval jeden. Počítač mal jediné vodítko — nápis „Posouvejte" veľký
152 × 19 px v pravom dolnom rohu nad fotkou — a koliesko myši posunie len
asi tretinu obrazovky (prichytí sa, až keď je bližšie než 22 %).

Nasadené naživo (téma `psb-spready`, zmenené v repe aj cez Editor šablón):

1. **Klik na „Rezervovat úvodní trénink" sa meria** — udalosť `cta_odkaz`
   (`formulare.js`). Dovtedy sa nemeral nikde: `cta_formular` chytá len kotvu
   na formulár na tej istej stránke, `odchod` len cudzie weby. Bez toho sa
   nedalo povedať, či ľudia odišli, alebo klikli ďalej.
2. **Šípka vpravo v strede výšky s názvom ďalšej obrazovky** („Vzorec →"),
   klikateľná, len na počítači (telefón má svoju veľkú šípku dole).
3. **Vykúkajúca ďalšia obrazovka** — prvá obrazovka je na počítači o 72 px
   užšia, takže vpravo vidno, že niečo pokračuje.
4. **Najsilnejšia veta je na prvej obrazovke** („Bolest je místo. Příčina je
   vzorec.") a vedľa hlavného tlačidla stojí druhé, tichšie: „Jak to funguje →",
   ktoré posunie ďalej namiesto odchodu. Z druhej obrazovky sa veta vypustila,
   aby sa dve obrazovky za sebou neopakovali.

Čo ešte nie je hotové: WPFC drží starú zlúčenú kópiu CSS (viď „Veci s dátumom"
hore) a výsledok sa dá merať až o dva týždne.

---

## Zavreté (aby sa neotvárali odznova)

### Hĺbka listovania — odpoveď z dát (10. 11. 2026)

Dva týždne od registrácie rozmerov (27. 10. – 9. 11. 2026), čítané novou
akciou `hlbka` v `/api/google` — len číta: rozpad podľa stránky a čísla
obrazovky plus návštevnosť tej stránky ako menovateľ.

**Úvodná stránka: zo 41 ľudí, čo videli prvú obrazovku, listovalo ďalej 7.**
Krivka 41 · 7 · 6 · 6 · 3 · 3 · 2 · 2 · 3 · 1 — po prvom švihnutí ubudne 83 %,
ale kto švihne raz, dolistuje ďaleko: šiesti na „Jak to funguje", traja na
„Ceny", jeden na koniec.

**Články sa čítajú celé.** /rib-flare/ má 14 obrazoviek a krivku
1 · 5 · 5 · 6 · 4 · 3 · 3 · 3 · 3 · 3 · 1 · 1 · 1 · 1; /anterior-pelvic-tilt/
13 obrazoviek a polovica ľudí je ešte na desiatej.

**/uvodni-trenink/: zo 17 ľudí sa 4 dostali na obrazovku s rezerváciou**
(10 · 6 · 6 · 2 · 2 · 4 · 4 · 1 · 1).

**/sluzby/ má krivku 2 · 5 · 11 · 5 · 3** — na tretej obrazovke je viac ľudí
než na prvej, lebo sa tam chodí odkazom na `#cenik`. Nie je to chyba merania,
je to dôkaz, že kotva funguje.

**Záver k debate „je na webe veľa textu":** dĺžka problém nie je. Úzke hrdlo
je PRVÁ OBRAZOVKA úvodnej stránky — štyria z piatich po nej neprejdú ďalej.

**Čo čísla nehovoria:** GA4 nemeria každého (súhlas s cookies, blokovače).
V tom istom okne zapísal Kokpit viac dopytov než GA4 odoslaných formulárov —
na POČTY platí Kokpit, GA4 je na TVAR cesty.

- **PTminder vrátil €90,97** (overené 3. 11. 2026 v Gmaile: refund #3050-9287 a dobropis k faktúre 295B0AC8-0059, celkom 0 €). Účet sa deaktivuje 1. 12., dáta vymažú 3 mesiace po zrušení; archív je v `~/Downloads/PTminder archív 2026-11-01/`.
- **Mail s návrhmi tričiek odoslaný** (overené 3. 11. 2026 v odoslanej pošte: 2. 11. na podpora@proukrajinu.org, „Návrhy na trička — zadarmo, ak sa vám hodia", 12 príloh z PRE-FOND).
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

- **1. 11. 2026, rozbor a veľká oprava:** 9 balíkov nasadených (verzia 2277), podrobne v CLAUDE.md „Rozbor a veľká oprava“.
