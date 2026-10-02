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

Stav k **1. 10. 2026**.

---

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
- [ ] **Peniaze z banky a zošita** — `platby_od` = 2026-10. Pri tom doplniť
  platby zapísané v Kokpite aj do osi času klienta (`osCasuKlienta` číta len
  PTminder `payments`) — inak „celá história + platby" v maili od októbra
  nové platby neuvidí.
- [ ] **Os času a „dnes"** — os počíta celý dnešný deň, nové sedenia len to,
  čo začalo. ±1 h do konca dňa.

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
- [ ] **Kartotéka fotiek** — fotky držania tela z úvodného + poznámka.
  Potrebuje R2 bucket (účet ho zatiaľ nemá); do D1 nepatria.
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
- [ ] **Profil trenéra na webe** — stránka Jerryho ani Terezky neexistuje,
  odkaz zatiaľ vedie na `/o-nas/`.
  (Skúšobné hodnotenia v `klient_merania` už zmazané sú — tabuľka je prázdna.)
- [ ] **Pocitovka beží od 30. 9. 2026** — o mesiac sa pozrieť, koľkí klienti
  odpovedali. Keď to bude pár ľudí, nie je to dôkaz, že sa nezlepšujú, ale
  že sa nepýtame dosť nahlas; vtedy zvážiť pripomenutie v SMS po treťom
  tréningu.

## 0b · Ostatné otvorené z 29. 9.

- [x] Nedeľná pripomienka — zrušená (Jerry: stačí karta „Balíček dojde" na dashboarde).
- [x] Tréningy v kalendári, ktoré v PTminderi nie sú — **pred 1. 10. je PTminder
  pravda**, čo v ňom nie je, sa nekonalo (Jerry, 29. 9.). 38 sporných uzavretých
  ako „neprišiel"; 5 z Jerryho kalendára (jan.–jún) sa nezapisuje.
- [x] Dan Kouřil 9. 7. (7 790 Kč) — zmazaný, platil len členstvo od 2. 7.
- [ ] **SMS od „ProSapiens"** — Jerry chce. Objednať odosielateľa v SmsManageri
  (500 Kč + 500 Kč/mes.), po schválení zapísať „ProSapiens" v Údaje → SMS.
- [ ] Import služieb stále len pridáva (oprava v PTminderi → zdvojený predaj).
- [ ] Export Sessions s 28.–29. 9., keď ich Jerry dopíše.
- [x] **Nahadzovanie tréningov do Google kalendára z Kokpitu** — hotové 29. 9.
  (servisný účet kokpit-kalendar@evident-catcher-510117-k6.iam.gserviceaccount.com,
  secret GCAL_SA_KLUC; stôl klienta → všetko → „+ Nahodiť tréning do kalendára").
  Overené naostro: AATest 30. 9. 10:00 je v Google aj v kal_udalosti.
- [ ] **Terezkin kalendár zdieľať servisnému účtu** — z jej účtu
  (teres.zat@gmail.com) zdieľať kalendár adrese vyššie s právom „Robiť zmeny
  a vidieť všetky podrobnosti udalostí". Dovtedy zápis jej klientom vráti chybu s návodom.
- [ ] Jerry: zmazať súbor kľúča ~/Downloads/evident-catcher-510117-k6-c9f048e10703.json
  (v appke už je ako secret, na disku ho netreba).
- [ ] Zrušenie tréningu z Kokpitu — API `trening-zrus` existuje, tlačidlo na
  obrazovke zatiaľ nie (maže z reálneho kalendára, chce potvrdenie). Ak ho Jerry
  bude chcieť, doplniť k objednaným termínom.

## 1 · Čaká na Jerryho slovo

| Vec | Odkedy | Otázka |
|---|---|---|
| 17 potvrdení mien z kalendára (Terezka) | 25. 9. | zlúčiť do jedného riadku registra, alebo nechať po jednom? |
| 9 falošných zrušení („zmizol tréning", ktorý sa nezmizol) | 25. 9. | označiť ako vysvetlené, alebo prejde sám? |
| Dovolenka Anny Kadličkovej a Jakuba Kaňovského zapísaná k 7. 10. | 25. 9. | patrí k 30. 9.; tlačidlo „Vrátiť späť" už existuje |
| Odskok augusta: zisk 18 072 → −26 154 Kč za pár hodín | 25. 9. | mám zistiť, odkiaľ ten rozdiel 44 226 Kč prišiel? |
| PSI kľúč v Údajoch je neplatný (41 znakov, má mať 39) | 1. 10. | meranie rýchlosti beží bez kľúča a Google ho odmieta — dáš nový z Google Cloud? |

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

- **Export rokov pred 2025 z PTmindera** (Jerry, 26. 9.). Kokpit má dáta od
  3. 1. 2025; PTminder drží aj 2022–2024 (používa sa 4,5 roka). Dohoda:
  NEMIGROVAŤ do živých tabuliek — staré čísla by vstúpili do priemerov, LTV
  a kohort a Jerry by musel riešiť nezrovnalosti, ktoré ho nezaujímajú.
  Namiesto toho ARCHÍV: surové riadky tak, ako prídu, bez opráv, a z nich sa
  nič nepočíta; na karte klienta len riadok „pred 2025: N tréningov, X Kč".
  Čaká na Jerryho: stiahnuť z PTmindera kompletný export za celé obdobie.
  Urobiť to treba TAK ČI TAK, kým PTminder beží — po vypnutí sú dáta preč.

- **Tréningy pod balíčkom ignorujú DRUH sedenia.** Jerry, 28. 9. 2026:
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

## 6 · Nový web (téma psb-spready — ŽIVÁ, od 1. 10. 2026 overené)

Téma je na webe AKTÍVNA (admin hlási „Theme: ProSapiens Spready 1.0"),
nie nahratá bokom — nadpis tu tvrdil opak. Zmena v nej sa preto robí na
DVOCH miestach: v repe (`navrhy-webu/tema/psb-spready/`) aj cez Editor
šablón vo WordPresse, inak ju prvé nahratie témy prepíše.

Z posledného kola kontroly (17.–18. 9.) zostalo:

- tablet na šírku 1024×768 — pretekanie pod spodnú lištu na viacerých
  stránkach (Domov, Úvodný tréning, Vzdelávanie, Služby, Online, Test),
- tablet na výšku 820×1180 — 22 obrazoviek vyplnených pod 55 %,
- „Kariéra → Koho hledáme" pri výške 600 px — druhá obrazovka na 33 %,
- v článkoch je zeleného zvýraznenia priveľa (74 zvýraznení dlhších než osem
  slov na 15 článkoch; pravidlo boli 2–4 krátke spojenia).

---

## Zavreté (aby sa neotvárali odznova)

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
