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

Stav k **5. 10. 2026**.

---

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
- [ ] **FIO_TOKEN v bete** (8. 10.: stále chýba, beta má len PSB_SESSION_SECRET) — bez neho „Stiahnuť príjmy z Fio" v bete nejde.
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

- **Septembrové faktúry z Alzy čakajú na Jerryho (9. 10. 2026).** Raz už zapísané boli (10 dokladov, 42 položiek, 13 572 Kč, prečítané z PDF v Downloads tým istým parserom ako v appke), ale **9. 10. ich Jerry nechal zmazať** — „chcem začať od začiatku, aby som to videl“ (audit `faktury-zmazane`). V databáze tak ostal len august (80 položiek) a júl (30). Do P&L nevstúpi ani koruna, kým ich Jerry nenahrá a nerozdelí; rozdelenie je jeho rozhodnutie (väčšina sú psie veci a súkromné nákupy). Appka vtedy sama navrhla len tri: Plyo box 1 899 Kč → `variabilne.prevadzka2.pomocky`, čistič uší a maškrty pre psa → `spolocne.Ahsoka`, Glycine + nôž Victorinox → `spolocne.Doplnky` / `spolocne.Iné`. Zvyšok (AirPods 5 509, termoska 1 838, pleťové veci, misky, vitamíny) sa roztriedi v karte Alza. Náhľad nahratých dokladov sa už nekreslí, keď nie je čo zapisovať (prázdna karta „0 doklady, 0 položiek“ bola zbytočná), a drží sa v `localStorage` pod kľúčom `psb-alza-caka`, takže odchod zo stránky rozrobené triedenie nezhodí.

- ~~Mobilné ovládanie~~ — **C NAOSTRO od 9. 10. 2026** (Jerry po skúške A/C v bete: „vyhráva C"): na každom telefóne (≤ 640 px) tenký riadok hore (≡ Viac · ‹ · názov · hľadanie) a lišta dole Dnes · Workspace · + · Kalendár · Jarvis; Firma, Marketing, Prechod, Upload, Bitcoin a odhlásenie vo Viac. Workspace bez bočných šípok, podzáložky v jednom posuvnom rade, bez plávajúceho Jarvisa. Počítač a iPad bez zmeny. Kód `MobilNavigacia.tsx`, `useMobilRozlozenie.ts`.


- ~~Tri veci z 9. 10. 2026~~ — **HOTOVÉ 9. 10.**: (1) mesačné kontroly sú krok uzávierky a podmienka zámku (karta Mesačné kontroly zrušená, `kontrolyMesiaca(mk)`, kľúče `zapis|kontrola-*-RRRR-MM` ostali); (2) hodiny: Tréningy „Posledný mesiac" boli posledných 31 dní → teraz „Minulý mesiac" = celý kalendárny mesiac, karta sa volá Mzdové hodiny (bez úvodných), report má riadok Mzdové hodiny; (3) platby bitcoinom bez dokladu majú tlačidlo „Súkromné — nie je náklad PSB" (ručný pár `sukromne` v `btc_parovanie`). (4) **krok uzávierky „Alza a nákupy bitcoinom"** (Jerry: „samostatná súčasť mesačnej uzávierky, kde nahrám faktúry z Alzy, Kokpit ich spáruje s BTC platbami a ja rozdelím položky — náklad, výplata, Ahsoka"): nahratie PDF, faktúry mesiaca s kategóriou meniteľnou aj po zápise (`/api/faktury` akcia `kategoria`, zamknutý mesiac nie), platby bitcoinom mesiaca bez faktúry so „Súkromné"; hotový pri 0/0. Čaká na Jerryho: september — 8 platieb bitcoinom bez faktúry, faktúry za september v Kokpite nie sú; „Oprava zostatku Muun na 0" 23 527 Kč označiť ako súkromné.


- **Metriky z výskumu kníh — postavené 8.–9. 10. 2026** (Jerry: „postav to, strop Jerry 120 Terezka 120"; 9. 10. „pokračuj s reportom"): obnova balíčkov, retencia 6 mes., prežitie 100 dní, hodnota klienta, koncentrácia, vyťaženie voči stropu, rezerva, predplatené hodiny, dlhy, Profit First, odporúčatelia. 9. 10. doplnené: **lievik z `krokyZa`** (noví klienti = jeKlient ako v Marketingu; rozpis „z úvodného / rovno na balíček" — úvodný je produkt, nie každý prvý tréning, viď test v MarketingLievik), **konverzia dopytov** zDopytu/dopyty (september 1 zo 7 = 14 %, predtým chybne 57 %), **noví klienti podľa zdroja + cena za klienta** (len pri reklame; september 0 z reklamy, 2 bez zapísaného zdroja — Dominika Križová, Lukáš Kríž), **štvrtá otázka kvartálu** „Splnili sme, čo report navrhol?" (`report_akcie`, snímka pri zamknutí mesiaca, áno/čiastočne/nie; staršie mesiace dopočítané).

- ~~Heinrich 24. 9.: 2 400 Kč Terezkina výplata~~ — **zapísané 9. 10. 2026** (Jerry: „áno 2400"): hotovosť 24. 9. −2 400, kategória výplata Terezka; september 46 329 → 48 729 Kč. Tržba je v septembri z PTmindera (7 790), takže príjem sa nezapisoval. Krátke odkazy /t/ a /k/ cez prosapiens.cz naostro od 9. 10. (snippet 26).

- **Mesačný a kvartálny report — NAOSTRO 8. 10. 2026** (Jerry vybral „C s kartami z A"): Uzávierka → pod zámkom „📄 Report za <mesiac>" (pred zamknutím „Náhľad"), za mar/jún/sep/dec aj „📊 Kvartálny report". `lib/psb/mesacnyReport.ts` + `ReportMesiaca.tsx`, vstup `vstupReportu` v App. Tlač/PDF hotová 8. 10., štvrtá otázka v kvartálnom 9. 10. (do tlače/PDF zatiaľ nejde).

- ~~Odpočet hodín — tri návrhy~~ — **Jerry 8. 10. 2026 vybral A** (rad pod sebou, teda to, čo beží). Návrhy B (pás hodín) a C (dve kôpky) zostávajú v `navrhy-kokpitu/odpocet-hodin.html`, keby sa k tomu raz vrátil.
- ~~Faktúra 20261001 (Vaško, 7 790 Kč)~~ — **stornovaná 8. 10. 2026**, nahradená faktúrou **20261006 na 6 990 Kč** (splatná 22. 10.). Jerry 9. 10.: posielať netreba. Príčina (klik na popis prepisoval sumu) je opravená.

- **Späť/dopredu v Kokpite — HOTOVÉ 8. 10. 2026, overené naostro 8. 10.** (Workspace → Kalendár → Firma, ‹ ‹ › a Alt+← vrátia presne poradie). Tlačidlá ‹ › pred záložkami, Alt+šípky, Cmd+[ a Cmd+]. Stopa si pamätá aj kartu Workspace a klienta na stole, takže návrat zo stola klienta vráti zoznam a dopredu zasa stôl. Vyskúšaj, či to v prstoch sedí: za prihlasovaciu bránu sa nedostanem, overené je len testami a typmi.

- **Úvodný tréning ako vlastný balíček — HOTOVÉ 8. 10. 2026, ale len dopredu.** Appka si úvodný balíček (1 h / 1 100 Kč) založí sama prvým tréningom a nezaplatený ide do mínusu. Pri otvorení Kokpitu vzniknú dva: **Petr Baťa** 5. 10. → dlh 1 100 Kč (presne ako Jerry chcel) a **Lenka Divinova** 28. 8. → zaplatené, dlh 0. Druh tréningu sa dá prepnúť oboma smermi v karte klienta (tabuľka `trening_druh`, prebije kalendár aj export).
  **Doplnené 8. 10. 2026** (Jerry: „áno doplň tie staršie úvodné"): sedem úvodných z augusta a septembra má vlastný balíček — Pavlik, Hrdinova, Spoligova, Pehalova, Malinova, Dvořak, Matl. Nikomu z nich nevznikol dlh (všetci zaplatili) a nikomu sa nezmenili hodiny okrem troch, ktorí dovtedy nemali žiadny záznam.
  **Čo sa doplniť NEDÁ:** zvyšných 59 úvodných späť do januára 2025. Nasucho to vymyslelo dlh 1 100 Kč štrnástim ľuďom, ktorí zaplatili (ich platby z 2025 sa k balíčku nespárujú), dvom iným naopak dlh 6 990 Kč zmazalo a piatim stlačilo hodiny do mínusu. Keby to raz malo zmysel, musí sa k tomu prilepiť párovanie starých platieb — nie samotné balíčky.
- ~~Nadpis stránky klienta vs. os~~ — **vyriešené samo** (overené 9. 10. 2026 kontrolórom profilov nad ostrou DB: nadpis odkazu = karta u všetkých, os = karta okrem Milana Bařinu, kde os vidí dokúpených 8 h z 21. 6. 2025). Hanus: os aj karta rovnako.

- **Vyskúšať na vlastnom telefóne (Jerry, 7. 10. 2026 — „daj to na zoznam"; 9. 10.: „vyskúšam najskôr"):**
  1. **Kalendár v mobile** (8. 10.: zatiaľ nikto nemá odkaz, `klient_kalendar` je prázdna) — poslať si odkaz z profilu klienta, pridať na iPhone: zostanú zapnuté upozornenia (iOS „Odstranit upozornění")? Ako rýchlo sa prejaví presun? To isté na Androide / Google Kalendári.
  2. **Ponuka termínov** — zápis z /t/ do Google FUNGUJE (overené 8. 10. v dátach): ponuka pre Mateja Prochadzku vytvorená 7. 10. o 9:47, termín vybraný o 31 s neskôr, udalosť 14. 10. 10:00 je v Google aj v Kokpite. **Jerry 9. 10. 2026: nebola to skúška** — termín 14. 10. platí. Prvý ostrý výber teda prešiel. Push trénerovi neoverený.
  3. **Gestá v Kalendári** — švih prstom (telefón/iPad) a dva prsty na touchpade medzi týždňami; overené len simuláciou.
- ~~September: chýbalo 10 výdavkov z banky (−17 641 Kč)~~ — HOTOVÉ 7. 10. 2026: Jerry stiahol mesiac z Fio (september má 132 pohybov); krok Fio odvtedy hlási hotovo až pri 0 nepotvrdených a 0 nezaradených výdavkoch.
- ~~Pravidlo Terezkinho účtu → Služby~~ — HOTOVÉ 7. 10. 2026: výplata 29. 9. prehodená na Výplata Terezka, pravidlo účtu teraz → výplata Terezka; SmsManager ostáva Apps AI (Jerry).
- ~~5 príjmov s kategóriou „AI aplikácie" + pravidlo „pro"~~ — HOTOVÉ 7. 10. 2026 s Jerryho súhlasom: nálepky vymazané, pravidlo zmazané.
- ~~Kratšie odkazy v SMS pre /t/ a /k/~~ — HOTOVÉ 9. 10. 2026: snippet 26 presmerúva aj /t/ a /k/ (overené curl 302 → worker → 200), `verejnyOdkaz` ich posiela cez prosapiens.cz.

- **Editor fotiek + editor videa (6. 10. 2026)** — Jerry: fotky ako v appke Layout (štvorec na polovicu, výrez, mriežka, prekrytie, čiary a uhly), z 5 rozložení vybral **1 · panel vpravo**; potom „editor videa musí byť samostatný". Náčrty: `navrhy-kokpitu/editor-fotiek.html` a `navrhy-kokpitu/editor-videa.html` (video: krok o snímku, rýchlosť bodkou 0,07–2×, strih bodkami na osi + I/O, čiary viazané na snímku, 📷 snímka, stiahnutie videa so strihom a spomalením — MP4 v Chrome). Snímky idú do spoločného zásobníka (`skladacka-sklad.js`, IndexedDB) a editor fotiek ich ponúka v „Snímky z videa". Spoločné časti vkladá `python3 zostav-skladacku.py`. **V Kokpite od 6. 10. 2026: Workspace → karta Editor → Foto / Video** (zdroj `app/editor/`, `python3 editor/zostav.py`). **Napojené na kartotéku klienta 6. 10. 2026** (porovnanie, video, snímky; klient sa vyberá nad editorom). Otvorené (**Jerry 9. 10. 2026: „editor videa necháme na potom"** — odložené): veľké videá nahrávať po kusoch (limit veľkosti požiadavky Workera), HEVC z iPhonu. Pozor: súhlas v anamnéze hovorí „nikde se nezveřejňují" — export na sociálne siete chce samostatný súhlas.

| Vec | Odkedy | Otázka |
|---|---|---|
| ~~PSI kľúč~~ — HOTOVÉ 6. 10. 2026: nový kľúč (projekt Kokpit kalendar, obmedzený na PageSpeed Insights API) v Údajoch; 3 merania cez appku prešli (07:09 UTC), priamy test u Google 200. Pozn.: „41 znakov" bola dĺžka s úvodzovkami JSON v `vzas_settings`, nie chyba kľúča. | 1. 10. | — |

## 2 · Prijaté, nezačaté

- **Termíny klienta v kalendári mobilu — NAOSTRO 7. 10. 2026 (A1 profil + B1 stránka /k/). Otvorené: overiť na skutočnom iPhone upozornenia a obnovu; Android/Google obnova. Pôvodne — náčrty 7. 10.: `navrhy-kokpitu/kalendar-do-mobilu.html` (A1 profil / A2 záložka „V mobile" / A3 hromadne; B1–B3 stránka /k/; C náhľad v telefóne), čaká sa na výber:** každý klient tajný odkaz (iCal odber) na svoje tréningy z Google kalendára; telefón ich pripomenie sám, presuny sa prejavia samy, zadarmo. Pozor: iPhone obnovuje po hodinách, Android/Google aj pol dňa–deň; iOS pri odberoch často vypína upozornenia — OVERIŤ na skutočnom iPhone pred spustením (návod klientovi „zapni Upozornění"). V udalosti len „Trénink ProSapiens · tréner" + adresa, nič citlivé. Ide až po ponuke termínov.
- **Ponuka termínov klientovi — NAOSTRO 7. 10. 2026 (A1 + B1):** záložka Kalendár → Ponuka termínov (pôvodne Workspace, presunuté na Jerryho želanie), bez ±15 min, stránka /t/. Otvorené: prvý ostrý výber sledovať (zápis do Google netestovaný naostro); kratší odkaz cez prosapiens.cz chce /t/ v WP snippete id 26. Pôvodné zadanie: v Kokpite týždeň z Google kalendára, ťukaním ponúknuť voľné časy (60 min, upraviť po 15 min hore/dole), vybrať klienta (alebo nový z dopytu), „Vytvoriť odkaz" → SMS. Klient na stránke (čeština) klepne na jeden → udalosť v kalendári trénera + push. Platí do konca týždňa alebo kým sa termín nezaplní (vybraný termín zmizne aj z iných ponúk). Každý tréner ponúka zo svojho kalendára, filter Jerryho / Terezkine / oboje. Náčrty: `navrhy-kokpitu/ponuka-terminov.html`.

- **Anonymný dotazník — POSTAVENÝ 9. 10. 2026** (varianta B): stránka `/d/<token>` (7 otázok v češtine, bez JS, odkaz použiteľný raz), odpovede v `dotaznik_odpovede` bez tokenu/klienta/času (len deň), výsledky až od 5 odpovedí (Výsledky → Dotazník). Posiela sa vo Workspace → 2 · SMS → Hromadná správa → „+ odkaz na anonymný dotazník" (`{dotaznik}`, audit `sms-dotaznik`); pripomienka cez filter „Neodpovedali na dotazník". **Hlasovanie o funkciách Jerry 6. 10. ZAMIETOL** („ľudia volia to, čo znie dobre" / „hlasovanie je sľub") — nestavať. Otvorené: (1) bývalí klienti — zatiaľ len aktívni; (2) krátky odkaz `/d/` cez prosapiens.cz — HOTOVÉ 9. 10. (snippet 26, Jerry súhlasil); náhľad stránky v hromadnej správe pred odoslaním (`/d/NAHLADDOTAZNIK`, nič neukladá).

- ~~Dizajn stiahnutého JPEG z editora~~ — **POSTAVENÉ 9. 10. 2026** (Jerry: „postav D a nechaj tam aj E na Instagram"): „Stiahnuť JPEG" aj ukladanie do kartotéky = návrh D (biele štítky PŘEDTÍM/POTOM s dátumom, postavička ako vodoznak, Agrandir); tlačidlo „Instagram 4 : 5" = návrh E (nadpis „N týdnů práce" z dátumov, štvorec v zaoblenom okne, nápis + prosapiens.cz). Popisky v editore sú odteraz po česky. Zverejnenie chce samostatný súhlas klienta. Náčrty ostávajú v `navrhy-kokpitu/jpeg-z-editora.html`.

- ~~**Dávkové potvrdzovanie bankových platieb**~~ — HOTOVÉ (akcia
  `priradz-davka`, použité 28. 9.; pravidlá od 5. 10. len z priezviska).
  Pôvodne (Jerry, 25. 9.): Z 238 príjmov
  od 1/2026 je priradených 113. Pri poslednom meraní malo 74 nepriradených
  jednoznačný návrh — zoznam s odškrtávaním a jedným potvrdením z toho robí
  prácu na večer, nie na mesiac. Dnes sa potvrdzuje po jednom.

- ~~**Anamnéza klienta v Kokpite**~~ — HOTOVÉ 30. 9. (sekcia 0c), kartotéka
  fotiek 5. 10. Pôvodne (Jerry, 26. 9.): Argument je jeho: „ak už
  máme citlivé dáta o meraniach klientov, spravme v Kokpite aj anamnézu a tým
  pádom tu bude všetko." Tabuľka `klient_merania` už dnes drží telesné
  merania, takže sa tým nezvyšuje kategória údajov — len prestane byť pravda
  o klientovi roztrhaná medzi appku a papier. Rozsah dohodnúť; pri zdravotných
  údajoch platí „len to, čo sa naozaj používa pri tréningu".

- ~~**Fakturácia v Kokpite**~~ — HOTOVÉ (vydané faktúry s QR a mailom od
  26. 9., spoločná faktúra za viacerých 4. 10.). Pôvodne (Jerry, 26. 9.): Rozhovor je v konverzácii z 26. 9.,
  fakty: 84 faktúr od 2023, z toho 37 za rok 2026 (347 079 Kč), číselná rada
  `RRRRNNNN`, posledná 20260038. Dnes v iDokladi. Faktúra má vzniknúť pri
  balíčku, niesť QR platbu a odísť mailom.

- **6. 10. 2026 — PREPÍNAČ PEŇAZÍ POSTAVENÝ** (`peniazeZKokpitu.ts`): tržby,
  grafy aj P&L berú platby pred zvoleným mesiacom z PTmindera, od neho
  z vlastnej evidencie; prepína sa v Prechode → Platby a server pustí len
  mesiac, ktorý sedí (200 Kč / 1 %) a nečaká v ňom nepriradený príjem.
  Tréningy od 1. 10. už idú z kalendára, takže staré názvy v kalendári mapovať
  netreba (pred 1. 10. platí PTminder). **Čaká na Jerryho:** priradiť
  októbrové príjmy z banky (4, 33 580 Kč), zapisovať hotovosť a bitcoin do
  Kokpitu (zošit nie je v Kokpite od 28. 8.), potom tlačidlo „Prepnúť peniaze
  na Kokpit od 10/2026" (Jerry 9. 10.: „to ešte počká"). Stav 6. 10.: október Kokpit 0 / PTminder 17 190.
  **Bitcoin sa berie sám z BTC knihy** (6. 10., Jerry: „prečo sa BTC platby
  nečítajú?") — od začiatku súbežného chodu, nespoznané mená ukáže karta.
  V knihe zatiaľ žiadna októbrová platba (posledná 17. 9.).
  Pozn.: v dávke návrhov stojí znova Miřejovský 752 (platba bola 5. 10.
  zrušená, pohyb v banke ostal) — rozhodne Jerry.
  Pôvodný text: **Grafy na vlastných dátach, nie na reportoch** (Jerry, 26. 9.). Meradlo
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

- **Export rokov pred 2025 z PTmindera** (Jerry, 26. 9.). Kokpit má dáta od
  3. 1. 2025; PTminder drží aj 2022–2024 (používa sa 4,5 roka). Dohoda:
  NEMIGROVAŤ do živých tabuliek — staré čísla by vstúpili do priemerov, LTV
  a kohort a Jerry by musel riešiť nezrovnalosti, ktoré ho nezaujímajú.
  Namiesto toho ARCHÍV: surové riadky tak, ako prídu, bez opráv, a z nich sa
  nič nepočíta; na karte klienta len riadok „pred 2025: N tréningov, X Kč".
  Čaká na Jerryho: stiahnuť z PTmindera kompletný export za celé obdobie.
  Urobiť to treba TAK ČI TAK, kým PTminder beží — po vypnutí sú dáta preč.

- [x] **6. 10. 2026 vyriešené:** Jerry — „Veronika chodí online a občas ide na
  offline, ale to si platí ako samostatný tréning." Kúpená 1 h iného druhu
  (ON/OFF z NÁZVU balíčka) počas platného členstva pokryje svoj tréning
  a členstvo beží ďalej (`samostatne` v `priebehBalickov`); Marcela Hrůzová
  24. 9. a 1. 10. má odvtedy 3 a 2 namiesto prázdneho riadku. Prísne „online
  len z online" ZÁMERNE nie: Lucia Podolová má „ON - 6h" a tréningy vedené
  ako offline — balíček by sa jej nemínal. Pôvodný text:
  **Tréningy pod balíčkom ignorujú DRUH sedenia.** Jerry, 28. 9. 2026:
  „prečo má Veronika 2 tréningy na 1 hodinu?" Rozbalenie balíčka berie
  všetko, čo padne do jeho platnosti — Veronika Stoklasková má „OFF -
  1 hodina offline" (2. 9. – 29. 9.) a v tom okne dve sedenia: OFFLINE 2. 9.
  (to je tá hodina) a **ONLINE 16. 9.**, ktoré z offline balíčka čerpať
  nemôže. Rovnaká slepota je v odpočte hodín. Treba rozhodnúť, čo z čoho
  čerpá: `session_type` (OFFLINE/ONLINE/UVODNE) verzus názov balíčka
  („OFF - …" / „ON - …"), a či sa online hodiny platia zvlášť.
  Súvisí s tým aj to, že balíček na 1 h mal v tom okne dve sedenia — keď
  ONLINE vypadne, sedí to.

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

**Všetky štyri postavené 5. 10. 2026** (Jerry: „pokračuj s myšlienkovou
mapou"), aj s tromi menšími: Enter vkladá hneď za (server prečísluje rad,
`vlozenieZa`), server overuje `rodic` a vetva/viditeľnosť sa počítajú raz
za prekreslenie (`vetvyVsetkych`, `viditelneVsetky`). Pri overovaní sa
našla strata textu pri rýchlom písaní — viď CLAUDE.md „Koncept sa ukladá
bez čakania".

~~**Vlastné vetvy.**~~ Hotové 25. 9. 2026 (migrácia 0078): zoznam vetiev
žije v `mkt_mapy.vetvy`, nová sa píše v ponuke pri kmeni, na obvode vetvy sa
dá premenovať, prefarbiť, prehodiť na druhú stranu a zmazať. Zmazanie nápady
nemaže — padnú do odkladiska.

## 2c · Balíčky: história z PTmindera a jedno pravidlo „zaplatený"

Stav k 3. 10. 2026 večer (audit, `docs/kontrola-clenstiev.md`):

- [x] Matl, Luky Križ, Hanus, Podolova — v `balicky` už sú (naliate 3. 10.).
- [x] **Nezaplatený balíček je nula, zostatok má znamienko** — nasadené
  3. 10. večer (`zostatokKokpitu`, `priebehBalickov`, `osKlientaZoServera`).
  Hanus −1 h a 6 990 Kč, Šašinková −3, Vaško −3. Viď CLAUDE.md.
- [x] **História balíčkov z PTmindera** — 4. 10. 2026 (Jerry: „neriaď sa
  podľa názvu"). Tabuľka `ptminder_historia`, 1 232 riadkov; os času z nej
  berie skutočné hodiny a koniec členstiev. Upload ju odteraz plní sám.
  Doplnenia z nej zámerne nie (viď CLAUDE.md).
- [x] **Karta ≠ zoznam — overené v PTminderi 5. 10. 2026**:
  Stoklasková sedí (1). Broskva a Krčmar opravené v kóde (nový balíček
  preberá nekryté tréningy pred sebou — PTminder ich tam má). Obrovská:
  karta 2 správne (doplnenie 5 h). Přinosilová: májové členstvo malo 17 h,
  nie 18 — opravené v DB, karta 7 = PTminder. Holubová: hodiny prepadli,
  karta 0 správne. Gerich: karta 6 správne, 15 580 = členstvo + kredit vopred.
- [x] **Šnirychová** (5. 10. 2026) — Janke zrušený duplicitný ručný „SPECIAL 3"
  z 22. 9. (Jerry odklepol); karta aj zoznam 2 h = PTminder (doplnenie 3 h).
- [x] **6. 10. 2026 prepočítané nad kópiou ostrej DB:** prenos mínusu zo
  skončeného členstva NESEDÍ s PTminderom (Kouřil, Vopalenský, Kadličková,
  Khamaziuk — 4 z 4 overiteľných dávajú o 1–3 h menej než PTminder aj karta;
  Tsiolis by si stiahol 20 tréningov až z 11/2025). „Mínusy" v histórii sú
  väčšinou artefakt delenia osi podľa dňa kúpy (Kadličková mala v členstve
  6/30–8/24 presne 6 tréningov). Pre históriu teda ostáva vypnutý.
  **6. 10. doplnené (Jerry):** po konci platnosti sa zvyšok hodín nečerpá,
  kým nepadne rozhodnutie; balíček vzniká hneď a ide do mínusu. Rušenie
  a nové založenie automatického balíčka po doplnení Jerry odmietol
  („minulosť by som nemenil") — odstránené.
  - [x] **Doplnenie a prepadnutie na osi (6. 10. 2026, Jerry):** zvyšok 2 h
    po konci platnosti → doplnenie: tréningy „2 h, 1 h · doplnenie", potom
    nový balíček od 6 h (pri neskorom rozhodnutí sa automatický balíček zruší
    a hneď založí za doplnením). Prepadnutie: v deň konca platnosti značka
    „2 h, 1 h · prepadlo" bez tréningu (z odpovede v `anomaly_ack`). Značka
    je v profile, klientovi na stránke/v maili sa nekreslí. Resnerová
  nemala čo presúvať — PTminder: 8 h, 8 tréningov 11. 8. – 1. 10.
  Dopredu (členstvo skončené v Kokpite) platí Jerryho logika: tréning po
  konci platnosti a bez hodín je prvá hodina nového členstva, nezaplatené =
  „6 h −1", balíček vznikne sám (Resnerová 6. 10. — predtým ticho).
  Pôvodný text: **Prenos mínusu zo skončeného členstva** je od 4. 10. vypnutý (poistka
  proti vymysleným deficitom). Jerryho pravidlo z 28. 9. hovorí, že nový
  balíček mínus preberá — 13 klientov má skutočne pretrénované skončené
  členstvo (napr. Vaňková −1 tesne pred súčasným). Zapnúť späť sa dá, až
  keď aj karta počíta prenos, inak sa karta a zoznam rozídu znova.
- [x] ~~ROZHODNUTIE (Jerry): naliať históriu balíčkov z PTmindera.~~ Hotové vyššie.
  Pôvodný text: **naliať históriu balíčkov z PTmindera.** Kokpit
  má z reportu „Packages & Memberships" len stav *Active* (124 riadkov).
  Pod *Finished* je 553 balíčkov a 634 členstiev s obdobiami až do 2022
  (Cancelled/Paused/Expired sú prázdne). Súbory: `~/Downloads/ptminder-2026-10-03/`.
  Bežný import ich NESMIE dostať — `packages` import je po klientoch výmena
  a Active by zmizlo; treba vlastnú cestu do `balicky` (parsePackages ich
  číta, dedup klient|názov|platnosť_od). Dopad: hodiny sa pohnú u veľkej
  časti klientov — preto najprv simulácia, potom Jerry.
- [x] **Jedno pravidlo „zaplatený"** — hotové 5. 10. 2026, viď PORADIE PRÁCE.
- [x] **Deň z UTC** — hotové 5. 10. 2026, viď PORADIE PRÁCE.
- [x] **SMS rozhoduje o QR z iného čísla než stránka** (`SmsKlientovi.tsx:142`
  vs `v.$token.tsx`): overiť po nasadení, či po zjednotení `packageRemaining`
  ešte môžu nesúhlasiť; ak áno, SMS má stav nečítať vôbec (pamäť „Jedna SMS").
- [x] `KlientStol`/`Dashboard`/`Kalendar` odčítavajú `mimoExportu` od čísla,
  ktoré od 1. 10. kalendár už obsahuje — overiť, že je po 1. 10. vždy nula.
- [x] `objednaneUvodne` zakladá profil s `lastSession` v budúcnosti (Petr Baťa
  5. 10.) → `daysBetween` záporné na troch miestach v `compute.ts`.
- [x] **Jarek Heinrich (6. 10. 2026, Jerry: „zaplatil 7 790 za 6 h od 27. 7.")**
  — overené v PTminderi: platba 21. 9. bez členstva, tréningy 27. 7., 31. 8.,
  14. 9. za 0 Kč na doplneniach. Nahodený „6h Balíček" 27. 7. – 15. 11.
  (koniec ako členstvo kúpené 21. 9.), 7 790 Kč; os 6/5/4/3, karta 2 h, dlh 0.
- [x] **Monikine hodiny na Danovi (6. 10. 2026, Jerry: „áno, oprav to")** —
  sedenia 6., 13. a 20. 3. o 8:30 s Terezkou preradené z Dana Kouřila na
  Moniku Schonwalderovú (sessions + dedup_key, audit `sedenie-preradene`).
  Marec je zamknutý, import ich späť neprepíše. V PTminderi ostali na Danovi
  — Kokpit je od 1. 10. pravda, netreba.
- [x] **Staré obdobia vynulované (6. 10. 2026, Jerry: „neber to ako mínus ani
  ako plus, dôležité je, aby to sedelo teraz")** — v uzavretom členstve spred
  1. 10. je tréning nad rámec „—" (`vyrovnane`), nie −N. 39 mínusov a 124
  prázdnych riadkov; karty, koniec osi ani návrhy sa nezmenili. Rozdiely
  nižšie sú tým vybavené, netreba ich opravovať v PTminderi.
- [x] ~~Pre Jerryho — rozdiely kalendár ↔ PTminder (6. 10. 2026)~~, príčina
  mínusov pri prenose; súčasné balíčky sedia, ide len o históriu:
  - Kadličková: kalendár 17. 6. 16:00, v PTminderi nie je.
  - Kouřil: kalendár 24. 5. (ne 10:00) a 14. 6. (ne 9:00), v PTminderi nie sú;
    6., 13. a 20. 3. má v PTminderi DVA tréningy, v kalendári je v ten deň
    Monika 8:30 a Dan inokedy → áno, Monikine; preradené 6. 10.
  - Khamaziuk: v PTminderi druhá rezervácia o 11:00 (11. 3., 29. 4., 13. 5.,
    20. 5., 10. 6.; a 6. 5. 11:00), kalendár má len 9:00 → duplicity?
    A 22. 2. (ne 11:00) v kalendári, v PTminderi nie.
  - Vopalenský: zdroje sedia; skutočne nekrytý je len 14. 4. — deň po konci
    členstva 17. 2. – 13. 4., ďalšie začalo 7. 6.
- [x] ~~Pre Jerryho: Jarek Heinrich~~ (vyriešené vyššie) trénuje od 27. 7. bez platného členstva
  (posledné 27. 4. – 21. 6., potom len doplnenia bez počtu hodín 23. 6.,
  5. 9., 20. 9.). Tréningy 27. 7., 31. 8., 14. 9., 5. 10. sú na osi bez čísla
  a automatický balíček zámerne nevznikne (história z PTmindera). Platba
  7 790 z 24. 9. — za čo? Ak je to 6 h od 27. 7., stačí ho nahodiť ručne.
- [x] **Jerry 6. 10. 2026 vysvetlil:** Kalva/Martinek/Vaško 8/8/7 h = presun
  nevychodených hodín do ďalšieho mesiaca (PTminder má pravdu); Čechová 5 h =
  odpočítaný nevychodený tréning po letnej pauze (správne); Gerich = nový
  balík začína nové členstvo, má predplatené dva balíčky; Gažo platí len
  v PTminderi (bez zásahu).

## 3 · Blokované niečím mimo Kokpitu

- **NDA pri fotkách pred/po** (od 8. 9.) — kým nie sú skontrolované súhlasy
  klientov, ktorých fotky sa už niekde použili, nemá zmysel stavať úložisko.
  Je to jediná zostávajúca cesta, ako dokázať výsledok obrazom (meranie
  bolesti Jerry 24. 9. zrušil natrvalo — pozri „Zavreté").
- ~~**Google Ads „Basic"**~~ — PRIDELENÉ (overené 6. 10. 2026 v API Center
  aj naživo: `akcia: "skus-planovac"`, „osobní trenér praha" 260/mes.).
  Objem hľadania sa teda dá ťahať — zatiaľ nie je postavená obrazovka.
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
| dopyty bez dôvodu, prečo sa z nich nestal klient | 46 → 0: od 6. 10. 2026 sa pýta len pri nových (`DOVOD_DOPYTU_OD`) |
| dopyty bez času prvej odpovede | 46 |
| nevysvetlené zmeny v kalendári | 36 |
| závery po termíne overenia | 13 z 18 otvorených |
| šesť konkrétnych dôvodov odchodu — Andrea Čonkova, Vojta Bartoň, Viera Adamkova, Josef Žiška, Jiri Kubik, Denisa Chmelarova | 6, všetky prázdne od 15. 9. |

## 6 · Nový web (téma psb-spready — ŽIVÁ, od 1. 10. 2026 overené)

Téma je na webe AKTÍVNA (admin hlási „Theme: ProSapiens Spready 1.0"),
nie nahratá bokom — nadpis tu tvrdil opak. Zmena v nej sa preto robí na
DVOCH miestach: v repe (`navrhy-webu/tema/psb-spready/`) aj cez Editor
šablón vo WordPresse, inak ju prvé nahratie témy prepíše.

**5. 10. 2026 — premerané a opravené** (`tools/kontrola_tema.py` meria
odvtedy aj zaplnenie obrazovky a zeleň; `--tablet`, alebo rozmery `820x1180`):
- tablet na šírku: pretekanie ani prekryv už nie sú (opravilo kolo 19. 9.);
- zelené zvýraznenia: všade najviac 4 a do 5 slov (2 obrazovky na telefóne
  so 6 sú ceny — zámer);
- tablet na výšku: riedke obrazovky 86 → 18 (820×1180), 62 → 16 (768×1024);
  telefóny tiež o trochu menej, počítač bez zmeny. Tri opravy v prototype:
  T-1 koniec článku sa centroval na skrytú pätičku `.folio` a padal ku
  spodku; T-2 vyvažovanie aj medzi susednými kusmi „Text N" článku; T-3
  `growScale` — riedka obrazovka na tablete sa celá zväčší (najviac 1,35×).
- viditeľný text overený zhodný so starou verziou; menia sa len `style.css`
  a `js/app.js`. Náhľad: https://psb-tema.prosapiensbio.workers.dev
- **Nahraté 5. 10. 2026** cez Editor šablón (Jerry výslovne povolil; bez
  toho automatický režim zápis zamieta ako „Production Deploy“). Overené:
  návštevník dostáva nové `?ver=`, na 820×1180 sa Cena a Otázky na Úvodnom
  tréningu zväčšia 1,345×, nič nepreteká, konzola bez chýb.

Z posledného kola kontroly (17.–18. 9.) zostalo (stav pred 5. 10. — všetko
vyriešené opravami 5. 10. vyššie, ponechané ako história):

- tablet na šírku 1024×768 — pretekanie pod spodnú lištu na viacerých
  stránkach (Domov, Úvodný tréning, Vzdelávanie, Služby, Online, Test),
- tablet na výšku 820×1180 — 22 obrazoviek vyplnených pod 55 %,
- „Kariéra → Koho hledáme" pri výške 600 px — druhá obrazovka na 33 %,
- v článkoch je zeleného zvýraznenia priveľa (74 zvýraznení dlhších než osem
  slov na 15 článkoch; pravidlo boli 2–4 krátke spojenia).

---

## Zavreté (aby sa neotvárali odznova)

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
