# Otvorené úlohy a otázky

**Stav k 26. 8. 2026.** Predchádzajúci zoznam (13. 8.) je v archíve dole.

Tento súbor drží to, čo čaká na **Jerryho**. Čo je na mne, je v druhej časti.
Živý marketingový zoznam je v [zoznam-marketing.md](zoznam-marketing.md),
webový v [uprava-webu.md](uprava-webu.md).

---

## A · Čaká na teba — s termínom

| kedy | čo | kde to je |
|---|---|---|
| **po odpovedi FP** | **Verifikačný odkaz na stránku „Co je Functional Patterns".** Handbook ho povoľuje a je to jediné miesto, kde meno metódy niečo dokazuje. | prosapiens.cz/co-je-functional-patterns |
| **september** | **UTM parametre pri spustení reklamy.** Zámerne odložené — bez reklamy nemajú čo merať. | — |

---

## B · Čaká na teba — bez termínu, ale blokuje ďalšie veci

**0 · Full Access: ŽIADOSŤ ODOSLANÁ — čaká sa na Metu (do ~20 dní)**
20. 8. večer: Business Verification prešla ešte v deň podania (údaje podľa ŽR:
Mgr. Filip Stráňavský, IČO 19126841) a žiadosť o Marketing API Access Tier je
odoslaná do App Review — stav „Review in progress“. Z tvojej strany NIČ
netreba; keby Meta chcela doplnenie, príde mail. Register to pripomenie 3. 9.
(záver zv-full-access-verifikacia). Keď schvália, appka sama prepne propagáciu
z kópie na pravý boost. Dovtedy všetko funguje záložnou cestou.

**1 · NDA pri fotkách pred/po**
Prejsť klientov, ktorých fotky sa už niekde použili, a skontrolovať súhlasy.
Kým to nie je hotové, nemá zmysel stavať úložisko na fotky — a to je jediná
vec, ktorá chýba k tomu, aby appka merala výsledky aj obrazom, nie len číslom.
FP navyše žiada dve brány: súhlas klienta **a** schválenie na fp.app.

---

## C · Práca, ktorá je pripravená a čaká len na teba

**4 · Dve nové stránky na web**
Zadania sú hotové v Jarvisovi, obe v pevnom tvare a s overenými číslami:

| téma | prečo | stav |
|---|---|---|
| **subokcipitální svaly** | 849 zobrazení, pozícia 2,3 — a na webe o tom nie je veta | zadanie pripravené |
| **thorakolumbální fascie** | 630 zobrazení, pozícia 1,8 — termín je len v článkoch o SBL a DFL | zadanie pripravené |

Postup: skopírovať zadanie → Project napíše → **text vrátiť Jarvisovi na
kontrolu** → publikovať → označiť nápad ako *použitý*.

**5 · Register čaká na akciu**
- **4× SMS po úvodnom** — Roman Pavlik, Hana Hrdinova, Zuzana Sopoligová, Tereza Pehalova
- **5× odmena za odporúčanie (10 %)** — Petra Rupova, Natalia Peckova, Regina Obrovska, Jakub Gerich, Katerina Matlova

**6a · Päť tréningov chýba v PTminderi**
Kalendár ich má, export ten deň pokrýva a sedenie v ňom nie je. Pri každom
sú v Notifikáciách dve tlačidlá — *Netrénoval* (zapíše sa zrušenie) alebo
*Trénoval* (potom je to hodina, ktorá nie je vyfakturovaná):

| kto | kedy | tréner |
|---|---|---|
| Marketa Lozias | 13. 8. | Terezka |
| **Roman Pavlik** | **13. 8.** | **Jerry** — zaplatil 7 790 Kč |
| Naďa Khamaziuk | 12. 8. | Terezka |
| Iva Stoklaskova | 12. 8. | Terezka |
| Richard Matl | 10. 8. | Jerry |

**6 · Šesť dôvodov odchodu, na ktoré sa appka už nepýta**
Sú staršie než 90 dní, takže sa v registri neobjavia — ak si na niektorý
spomenieš, stačí meno a jedno slovo: Andrea Čonkova (12/2025), Vojta Bartoň,
Viera Adamkova, Josef Žiška, Jiri Kubik, Denisa Chmelarova.

**7 · Prvé meranie bolesti**
Tabuľka je prázdna a čaká. Pri najbližšom tréningu: **+ Zápis** → meno z čipov
→ číslo 0–10. Bez prvého merania sa nedá porovnať nič.

---

## D · Rozhodnutia, ktoré sú na tebe

| | |
|---|---|
| **Forminator /dychani — meranie, nie formulár** | Overené naživo 20. 8.: formulár FUNGUJE (testovacie odoslanie prešlo, ďakovná správa s PDF sa zobrazila; test som po sebe zmazal). V databáze sú 2 reálne leady (28. 7. a 2. 8.) + tvoj test z 19. 7. „Nula odoslaní" z čias reklamy bola z väčšej časti iná vec: formulár prišiel na /dychani až 19. 7. — dovtedy tam bol priamy odkaz na PDF bez zbierania mailov, takže 448 klikov z reklamy (1.–19. 7.) nemalo čo vyplniť. Meranie je navyše slepé dodnes: poďakovanie je inline (`behaviour-thankyou`), nikdy nepresmeruje na ďakovnú stránku, takže GA4/Pixel udalosti sa nespúšťajú. **Reklama na príručku je zámerne STOP** (jún+júl spolu 2 082 Kč, produkt za 290 Kč, predaje ~0 — ekonomicky sa to nemôže vrátiť; kampaň 52576823609275 pozastavená). Prípadná oprava merania má teda zmysel len pre organiku: nová ďakovná stránka `/podekovani-dychani/` (nie tá „ozveme sa do 48 h" — tá patrí dopytom) + vlastná udalosť `LeadMagnetDychani`. Pozor: Forminator leady nejdú do Kokpitu — snippet počúva len Contact Form 7. |
| **Appka na iPhone** | PWA je pol dňa práce, mobilná verzia Kokpitu deň, upozornenia na telefón ďalší deň. Natívna appka až keby ju mal používať niekto mimo vás. Povedz, či to ide na rad. |
| **Prepojenie Kokpit ↔ Project** | Cesta A (adresa so snapshotom, hodina) alebo B (konektor MCP, deň). Zhodli sme sa, že B je lepšia, ale A sa dá overiť za hodinu. Zatiaľ nestaviame. |
| **Cieľ presmerovania** | `/drevena-bezecka-draha/` teraz vedie na `/o-nas/` — cieľ, ktorým som si najmenej istý. |
| **Rezerva 1,2 mesiaca** | Cieľ sú 3. Nie je to úloha, je to číslo, ktoré rozhoduje o tom, koľko sa dá minúť. |
| **Tvoj dlh −132 402 Kč** | Rastie ~7 283 Kč mesačne (tento rok). Otočiť sa dá dvomi pákami: viac hodín, alebo si menej posielať. |

---

## E · Čo zostáva mne

**Nič.** Stav k 20. 8. 2026, verzia 551 (revízia podľa docs/revizny-prompt.md — 6 nálezov, všetky opravené a nasadené; aj ks=1 pri položke faktúry je po tvojom odklepnutí opravený v DB).

### Hotové z tohto zoznamu

- **Claude Project nastavený** (19. 8. 2026, urobené cez Jerryho Chrome, potvrdené
  v Kokpite — `anomaly_ack project|nastavene`). Project „PSB Marketing" už mal
  rozsiahle Instructions (identita, FP pravidlá, tón, čeština 2×) a knowledge na
  75 % (FP streamy, Playbook, PSB 2025, fascie…). Chýbali DVE veci z Kokpitu:
  (1) kánon ako súbor — vložený ako `kanon-psb.md` cez „Add text content",
  7 399 znakov, overené znak po znaku proti originálu (prvý pokus mal rozbitú
  diakritiku zo schránky, zahodený); (2) pevný tvar zadania z Jarvisa a pokyn
  „odpovedz len na ČO CHCEM SPÄŤ" — dopísané na KONIEC existujúcich Instructions
  ako blok `<kokpit_zadania>`, pôvodných 5 105 znakov nedotknutých. Kapacita
  zostala 75 %.

- **Kompletná revízia Kokpitu** (verzia 534, 19. 8. večer) — peniaze, metriky,
  tiché zápisy, dvojité definície, reťazce, prekliky, Jarvis, aktuálnosť.
  12 nálezov s dopadom na peniaze (najväčší: KPI počítali rok cez bežiaci
  august a „Rozdiel nad break-even" svietil ako splnený pri skutočných
  19,6 %), z toho 8 opravených a nasadených; 5 vecí čaká na tvoje rozhodnutie
  (júlový nájom 29 250 Kč v banke chýba!). Celý protokol s dôkazmi:
  [`revizia-19-8.md`](revizia-19-8.md).



- **Vlastný obrázok a video k novej kampani** (verzia 533). Dovtedy appka
  skladala kreatívu vždy bez vizuálu — Meta ju prijala, ale reklama bez
  obrázka je v praxi nepoužiteľná a dopĺňať ho bolo treba v Ads Manageri.
  V príprave kampane je teraz **„+ pridať obrázok alebo video"**; súbor sa
  nahrá HNEĎ pri výbere, nie až pri zakladaní, lebo je to najpomalší krok
  a keby padol uprostred, zostali by v účte prázdne kampane. Appka si odloží
  len odtlačok (obrázok) alebo id (video) a pošle ho so zvyškom. Video má
  vlastný tvar kreatívy (`video_data`), obrázok ide ako `image_hash`; bez
  média sa skladá to, čo doteraz. Nový endpoint `/api/meta-media` berie
  `multipart/form-data` priamo, aby sa binárny súbor nemusel baliť do base64.
  Overené naživo: nahranie obrázka → kampaň + sada + kreatíva **s obrázkom**
  + reklama, všetko PAUSED, a všetko zmazané (62 kampaní pred aj po).

- **Propagácia príspevku prenesie aj VIDEO** (verzia 531). Dovtedy sa z reelu
  bral len statický náhľad — a keďže **71 % príspevkov PSB sú videá** (189 z
  265; z posledných 30, ktoré formulár ponúka, je 19 videí), znamenalo to, že
  z väčšiny obsahu vznikala nehybná reklama z jedného náhodného snímku.
  Teraz appka stiahne celé video, nahrá ho cez `/advideos` a poskladá kreatívu
  s `video_data`.

  Kľúčové zmeranie: **kreatíva prejde aj počas spracovania videa**, takže sa
  naň nečaká. Čakanie by request predĺžilo o desiatky sekúnd a v Cloudflare
  Workeri by hrozilo, že vyprší; Meta si video dospracuje sama. Náhľad je
  povinný aj pri videu a `/advideos` ho vracia hneď.

  Overené naživo cez appku na reeli „Petra přišla s bolestí…": kampaň + sada +
  kreatíva s `video_id` + reklama, všetko PAUSED, a všetko zmazané (62 kampaní
  pred aj po). Pozn.: nahraté video sa cez API zmazať nedá (chýba oprávnenie
  `pages_manage_posts`), ale v knižnici účtu nič nestojí a nikde sa nezobrazuje.

- **Jarvis pozná rešerše zvonku a hlási, keď zostarnú** (verzia 528,
  migrácia 0050). Jerry: „nahraj ten dokument do Jarvisa. Ale takéto veci sa
  často menia, nemohol by byť nejaký sledovač, ktorý by to raz za pol roka
  aktualizoval?"

  Dokument NEŠIEL do `jarvis_dokumenty` — tam sa obsah po 30 dňoch maže (sú to
  prílohy k jednej debate, nie trvalé vedomosti). Vznikla tabuľka
  `jarvis_vedomosti`: text, zdroj, dátum overenia a **lehota obnovy**.
  Do kontextu ide len PREHĽAD (názov, o čom to je, ako staré) — rešerš má
  8 000 znakov a v každej správe by vytláčala čísla; text si Jarvis vytiahne
  SQL dopytom, keď ho potrebuje.

  Sledovač je v registri: keď vedomosť prekročí svoju lehotu, ozve sa
  s vetou „Rešerš treba obnoviť". Nie naslepo raz za pol roka — **každá
  vedomosť má vlastnú lehotu**, lebo benchmarky zastarajú rýchlo a princípy
  pomaly. Kým je čerstvá, Jarvis z nej cituje normálne; po lehote dostane
  v kontexte pokyn brať jej čísla s odstupom.

  Vidno to v **Mesiac → Dáta a uzávierka → Napojenia → „Čo Jarvis vie
  zvonku"** (verzia 529): zoznam s dátumom overenia a odpočtom do obnovy,
  text sa načíta až na klik — osemtisíc znakov by inak ležalo na obrazovke
  pri každom otvorení. Po lehote sa rámček zmení na oranžový.

  Prvá vedomosť: „Od koho sa učiť reklamu (Meta Ads)", lehota 180 dní.
  Overené naživo — Jarvis z nej sám vymenoval dve rady, ktoré pre PSB
  neplatia (50 udalostí týždenne, minimum 220 Kč/deň) aj s dôvodmi.

- **Rozpočet celkovou sumou + prepočet** (verzia 525). Jerry, 19. 8.: „čo keby
  chcem pri kampani nastaviť celkovú sumu, ktorú chcem dať za reklamu?" —
  uvažuje v „dám 2 000 Kč na test", nie v korunách na deň. Pri rozpočte je
  teraz prepínač **denne / celkom**: pri „celkom" appka pošle
  `lifetime_budget` a koniec, Meta si sumu rozvrhne sama (v deň, keď je aukcia
  lacnejšia, minie viac) a strop zmizne — celková suma je sama hranicou.
  Vedľa stojí **prepočet na druhú stranu**: „2 000 Kč na 14 dní = 143 Kč na
  deň", a v dennom režime naopak „100 Kč × 14 dní = 1 400 Kč celkom".
  Keď z celkovej sumy vyjde menej než minimum, appka povie obe východiská:
  „200 Kč na 14 dní je 14 Kč na deň — zvýš sumu na 308 Kč, alebo skráť na
  9 dní." Overené v prehliadači, 4 nové testy v `kampanPlan.test.ts`.

- **Zoznam príspevkov pri propagácii bol prázdny** (verzia 524). Preklep
  v adrese: komponent pýtal `?co=prispevky`, API pozná len `?co=instagram`,
  takže dostával odpoveď iného tvaru a `prispevky` v nej neboli. Vyzeralo to,
  že appka žiadne príspevky nemá — pritom ich vracala 265. Pri výbere je
  odteraz aj odkaz **„↻ stiahnuť nové z Instagramu"**: zoznam je z poslednej
  stiahnutej dávky, nie živý, a bez toho by sa nový príspevok dal pridať len
  cez Mesiac → Dáta a uzávierka.

- **Karusel pri propagácii príspevku** (verzia 521). Appka brala z karuselu
  len prvý obrázok — reklama bola technicky správna, ale hovorila desatinu
  toho, čo príspevok. Teraz si vyžiada `children`, nahrá **všetky karty**
  (postupne, nie naraz: desať súbežných uploadov je presne ten náraz, na
  ktorý Meta odpovedá limitom) a poskladá kreatívu z `child_attachments`.
  Meta berie 2–10 kariet, čo sedí na strop Instagramu; jedna karta nie je
  karusel, tak sa vtedy skladá obyčajná kreatíva. Karty sa nechávajú
  preusporiadať podľa výkonu (`multi_share_optimized`) — poradie z Instagramu
  nenesie príbeh, je to zoznam cvikov. Overené naživo cez appku na
  10-kartovom príspevku: kampaň + sada + kreatíva s **10 kartami** + reklama,
  všetko PAUSED, a všetko zase zmazané (62 kampaní pred aj po).

- **Appka vyrobí celú reklamu, nielen kostru** (verzia 518). Do 19. 8. končila
  pri sade reklám a text sa dopisoval v Mete — a vyzeralo to, že za to môže
  chýbajúce App Review. Nebola to pravda: facebooková aplikácia Kokpit stála
  v režime **„Development"**. Meta to povie len pri jednom type volania („Ads
  creative post was created by an app that is in development mode"), pri
  druhom vráti holé `(#3) capability`, takže obe brány vyzerajú rovnako.
  Po publikovaní aplikácie (Privacy policy URL + Category → Publish) prešla
  kreatíva na prvý pokus.

  V prípravе kampane je teraz **pole na text reklamy** (a nepovinný nadpis).
  Keď ho vyplníš, vznikne kampaň + sada + kreatíva + reklama, všetko
  POZASTAVENÉ; dopĺňa sa už len obrázok alebo video, tie appka nahrať nevie.
  Keď ho necháš prázdne, vznikne kostra ako doteraz. Overené naživo — kreatíva
  s textom, nadpisom, odkazom aj tlačidlom „Zistiť viac" prešla a bola zmazaná.

  **Propagácia hotového príspevku sa doriešila hneď potom (verzia 520).**
  Pravý boost (`source_instagram_media_id`) má vlastnú bránu, ktorú
  publikovanie neotvorilo a chce Full Access — tak appka skúša najprv jeho
  a keď neprejde, stiahne z príspevku obrázok aj text, nahrá obrázok do účtu
  a poskladá rovnako vyzerajúcu reklamu sama. Rozdiel je len v sociálnom
  dôkaze: pravý boost zdedí lajky a komentáre, kópia začína od nuly. Až Full
  Access dorazí, appka prepne na pravý boost bez zásahu do kódu. Overené
  naživo cez appku: kampaň + sada + kreatíva + reklama, všetko PAUSED,
  obrázok aj text z príspevku — a všetko zase zmazané (62 kampaní pred
  testom, 62 po ňom).

- **Kontrola úplnosti importu balíčkov** (verzia 512). Po Natáliinom prípade
  z 19. 8.: import z 14. 8. bol export za 14 dní, ona v tom okne nemala pohyb,
  jej riadok v súbore chýbal a appka to prijala potichu s hláškou „+20 riadkov"
  — malo ich byť 77. Teraz si import PRED zápisom odloží, kto je podľa
  PTminderu aktívny klient **v tom istom pohľade** (`package` / `membership`),
  a po porovnaní so súborom vypíše mená tých, ktorí v ňom nie sú. Kritérium je
  `client_status` z PTminderu, nie zostatok hodín: Natália mala v starých
  dátach len dočerpané riadky bez dátumov, takže by práve ona prepadla.

  Prvé ostré spustenie to hneď skorigovalo: report `package` ohlásil šesť
  „chýbajúcich", ktorí boli všetci paušáloví („Doplnenie členstva") a do
  package exportu ani nepatria. Príčinou boli staré riadky bez určeného typu,
  ktoré sa počítali do oboch pohľadov naraz — tie sa už do porovnania neberú.
  Cena: prvý import každého pohľadu nemá s čím porovnávať. Kalibrácia dnes:
  **6 aktívnych v `package`, 41 v `membership`.**

  **Druhá kontrola („chodí, ale má 0 hodín") bola postavená a zase zrušená.**
  Mala hľadať rozpor — kto chodí a platí, má mať čo míňať. Lenže PSB predáva
  aj paušálne členstvá (GOLD/SILVER/DIAMOND/ONE) a tie v exporte stoja navždy
  na 0/N: nula hodín je pri nich normálny, trvalý stav. Kontrola tak hlásila
  Jakuba Štiguta (ČLENSTVÍ ONE) ako podozrenie na chýbajúci import, hoci mu
  appka aj PTminder ukazovali to isté a nechýbalo nič. Takých klientov je 34
  zo 76. Trafila sa ale pri **Panagiotisovi Tsiolisovi** — ten mal naozaj
  o jeden tréning viac, než appka vedela, a import z 19. 8. ho opravil
  (0/6 → 1/6). Presnosť jedna z dvoch je na notifikáciu málo; poučenie je
  v CLAUDE.md aj v komentári na mieste, kde tá kontrola bola: zo zostatku
  hodín sa chýbajúci import poznať NEDÁ, appka nevie, koľko hodín má mať
  človek na paušále. Neúplný import sa chytá tam, kde vzniká.

- **Strážca rozpočtu a učiacej fázy** (verzia 505). Appka nedovolí založiť
  kampaň optimalizovanú na DOPYTY, kým appka nevidí aspoň 50 dopytov
  týždenne — toľko chce Meta od marca 2026 na výstup z učiacej fázy.
  PSB má **1,2 dopytu týždenne** (skutočný počet z posledných 90 dní, nie
  odhad), takže je to zámerne CHYBA, nie varovanie: kampaň, ktorá sa nemá
  z čoho učiť, minie rozpočet na náhodné doručovanie a jej výsledok sa
  potom vykladá, akoby niečo znamenal. Kontroluje to SERVER, nie obrazovka.
  Druhé pravidlo je o čitateľnosti testu: keď z rozpočtu a dĺžky vychádza
  menej než tri dopyty, appka to povie vetou aj s číslom („za 14 dní pri
  80 Kč denne čakaj menej než jeden dopyt — z toho sa nedá rozhodnúť nič").
  Overené naživo: pokus o cieľ „dopyty" server odmietol.
- **Počítadlo volaní do Marketing API** (verzia 503, migrácia 0048). Appka
  si ráta vlastné volania a chyby; v paneli Meta stojí, koľko ich za 15 dní
  bolo a čo ešte chýba na Full Access (500 volaní, chybovosť pod 15 %).
  Bez Full Access sa nedá vytvoriť kreatíva, teda ani propagovať príspevok —
  a bez počítadla by sa oň dalo požiadať len odhadom.
  Stav po zapnutí: **4 volania, 0 chýb.** Počíta sa od dneška, takže
  „chýba 496" je otázka niekoľkých dní bežného sťahovania, nie prekážka.
- **Metriky reklám** (verzia 502, migrácie 0046 a 0047). Nová tabuľka
  `mkt_reklamy` a karta **Čo robí kreatíva**: hook rate, hold rate, CTR, CPM,
  frekvencia a jedna veta, čo s tým. Stiahnutých 168 riadkov.
  **Hook sa NEMERIA proti benchmarku z internetu.** Odvetvové pásma (18–28 %)
  sú z trojsekundových videní, ktoré Meta zrušila; dnešná metrika je
  dvojsekundová a PSB na nej vychádza na 63–69 %. Proti tým pásmam by appka
  o každej reklame povedala „výborné" — čiže číslo, ktoré vyzerá ako odpoveď
  a nie je ňou. Porovnáva sa preto s **mediánom vlastných reklám**.
  CTR a frekvencia sa merajú proti odvetviu (2,19 %, únava nad 3).
  Cestou sa ukázalo, že Meta zrušila `video_3_sec_watched_actions` aj
  `3_second_video_plays`; platí `video_continuous_2_sec_watched_actions`.
  Test schémy sa naučil čítať `ALTER TABLE … RENAME COLUMN` — inak by tvrdil,
  že stĺpec neexistuje.
  **Prvý nález z dát:** kampane `IG_Post_*` majú CTR 0,14–0,25 % pri hooku nad
  65 %. Video zastaví palec, ale klik nepríde — a pri cieli na dosah to ani
  nie je chyba, len to potvrdzuje, že z nich dopyt čakať nemožno.
- **Cielenie na mesto + okruh** (verzia 494). Dovtedy vedela appka len Česko
  alebo Slovensko — pre štúdio v Brne priširoké. Teraz sa mesto vyhľadá
  v Metinom číselníku (nepozná „Brno" ako text, chce kľúč) a cieli sa naň
  s okruhom 17–80 km. Overené naživo: sada má `cities: [{key: 517188,
  name: "Brno", radius: 25, distance_unit: "kilometer"}]`.
  Pozor na radenie: Meta na „Brno" vracia najprv mestské časti (Brno-jih,
  Brno-sever…) a samotné Brno je až za dvadsiatym výsledkom — appka preto
  ťahá 50 výsledkov a presnú zhodu dáva navrch. Bez toho by človek cielil
  na štvrť a nevšimol si to.
- **Snippet pre web — doplnené `fbc`/`fbp`/IP/User-Agent** (19. 8. 2026,
  Jerry uložil sám). Snippet `PSB — dopyt do Kokpitu` predtým posielal Mete
  len meno, email, telefón a UTM. Teraz posiela aj cookies `_fbc`/`_fbp`
  (párovanie s pixelom), skutočnú IP a User-Agent návštevníka — server
  na strane Kokpitu tieto polia už predtým vedel prijať (`lead-web.ts`),
  chýbali len na strane webu. Overené naživo po uložení: snippet aktívny,
  žiadna chyba, kontaktná stránka funguje.
- **Snippet pre web s opravenou udalosťou `Lead`** (verzia 490). Appka dávala
  adresu a tajomstvo, kód si musel Jerry napísať sám — a práve tam sa dá
  nenápadne pokaziť meranie. Teraz je v Údaje → Napojenia hotový kód, ktorý:
  posiela sa až po `wpcf7mailsent` (ODOSLANÉ, nie kliknutie a nie načítanie
  stránky), používa **rovnaké `event_id` v prehliadači aj na serveri**, takže
  Meta započíta dopyt raz, a **ukladá UTM hneď pri príchode** na web, nie až
  pri odoslaní — kto medzitým klikne inam, o kampaň už neprišiel.
  Server odteraz kľúč z webu prijíma (s kontrolou tvaru).
  Serverová strana (CAPI) bola v poriadku už predtým: `Lead`, `event_id`,
  zahašovaný mail aj telefón, `fbc`/`fbp`. Chyba bola na webe.
- **Rešerš Meta Ads** — čo appka potrebuje, aby vedela reklamy nastavovať:
  [meta-ads-co-treba.md](meta-ads-co-treba.md). Kľúčové zistenie: učiaca fáza
  žiada 50 udalostí týždenne, PSB má 3 dopyty MESAČNE — kampaň na konverzie sa
  u nás nikdy nenaučí a optimalizovať treba na kliky.
- **Kampaň + SADA REKLÁM z Kokpitu** (verzia 489). Appka už nezakladá prázdny
  priečinok: k��kampani vytvorí aj sadu (Česko/Slovensko, 18–65, štart teraz,
  voliteľný koniec v dňoch), obe pozastavené. Overené naživo — sada sedela do
  detailu. Chýba len KREATÍVA a to appka nerobí.
  Dve veci, ktoré to odhalilo: účet má predvolenú ponukovú stratégiu „Strop
  ponuky", pri ktorej Meta sadu odmietne („Bid amount required") — kampaň
  preto explicitne nastavuje automatické ponúkanie. A strop výdavkov je
  odteraz NEPOVINNÝ, ako v Mete; prázdny znamená bez stropu a appka to povie.
- **Jarvis vie do návrhu dopísať strop a dĺžku** — token má tvar
  `⟦kampan|cieľ|adresa|rozpočet|názov|strop|dni⟧`, posledné dve nepovinné.
- **Propagácia príspevku — ZABLOKOVANÁ NA STRANE META APLIKÁCIE.** Kampaň aj
  sada prejdú, ale kreatíva z existujúceho príspevku vráti
  `(#3) Application does not have the capability to make this API call`.
  Nie je to chýbajúce právo tokenu (`ads_management` je udelené) ani chyba
  v tvare — je to úroveň prístupu samotnej facebookovej aplikácie
  (Advanced Access / Ads Management Standard Access, žiada sa v App Review).
  Poradie krokov je teraz kreatíva → kampaň → sada → reklama, takže neúspech
  po sebe nenechá prázdne kampane.
- **Kampaň je vlastné zameranie Jarvisa** (verzia 475). Prvá verzia mala
  v hlavičke okna prepínač „pripraviť kampaň" a Jerry na ňom ukázal, čo je
  zle: príprava kampane nie je nástroj vedľa rozhovoru, je to DRUH rozhovoru.
  Preto je z toho zameranie ako Marketing či Peniaze — vlastná rola („Ten,
  kto pripravuje reklamu"), vlastné pravidlá (účet, pozastavený stav, minimá,
  čeština, index brand-konfliktov) a formulár, ktorý sa otvorí s ním.
  V Marketingu → *Čo púšťame von* pribudol chip **Kampaň ↗**, ktorý založí
  nový rozhovor v tomto zameraní a preklikne do Jarvisa.
  Pri preklikoch do Jarvisa treba `zachovajOkno()` — inak si stránka pri
  otvorení založí ďalší rozhovor a zameranie sa stratí (overené naživo).
- **Prvá kampaň založená z appky** (19. 8. 2026): `TEST Kokpit — Úvodní
  trénink (pozastavená)`, ID `52597870696075`, PAUSED, 22 Kč/deň, strop
  2 000 Kč. Meta pritom odmietla strop 100 Kč, ktorý mala karta predvolený:
  minimum v korunách je **2 000 Kč**. Opravené a strážené testom.
- **37 kampaní vypnutých** (19. 8. 2026) na účte ProSapiens Biomechanic —
  boli zapnuté na úrovni kampane, ale ich sady dávno dobehli. Dopyt na
  `ACTIVE` teraz vracia prázdno. Ďalšie dve vypnuté v osobnom účte.
- **Kampaň sa dá pripraviť priamo v Jarvisovi** (verzia 471). V okne pribudlo
  *pripraviť kampaň* — ten istý formulár ako v Marketingu, len ako panel nad
  rozhovorom. Keď Jarvis navrhne konkrétnu kampaň, píše ju ako
  `⟦kampan|cieľ|adresa|rozpočet|názov⟧` a appka z toho spraví tlačidlo, ktoré
  formulár **vyplní** (nezaloží). Overené naživo: z otázky na septembrový test
  vypadol návrh „PSB 2026-09 — úvodní trénink", klik vyplnil stránku, názov aj
  80 Kč — a Jarvis k tomu sám dodal, že 80 Kč je pod tým, na čom sme sa
  13. 8. dohodli (~6 000 Kč na 4–6 týždňov).
- **Dve kampane v osobnom účte sú vypnuté** (19. 8. 2026). Boostnuté príspevky
  z 29. 1. 2023, oba `PAUSED`, overené spätným čítaním z Mety.
- **Kampane vznikajú len na účte `172897726151288`** (verzia 467). Nie je to
  nastavenie, je to konštanta `UCET_REKLAM` — server účet z nastavenia
  ignoruje a nesúlad zapíše do auditu. Osobný účet `3356679857899572` appka
  nesleduje; viseli v ňom dve zapnuté kampane z 29. 1. 2023 (boostnuté
  príspevky z Instagramu), ktoré nikdy nedoručovali. Pravidlo pozná aj Jarvis
  (`prevadzka.md`, bod 19).
- **Karta „Pripraviť kampaň"** (verzia 466) zakladá kampaň v Mete **vždy
  pozastavenú**, so stropom výdavkov a so značkovaným odkazom. `status`
  nastavuje server, nie obrazovka. Sadu reklám a kreatívu appka nerobí.
- **„Zapnuté" a „beží" sú dve rôzne veci** (verzia 470, migrácia 0045).
  Na účte je 32 kampaní na úrovni kampane ACTIVE a nebeží ani jedna — ich
  sady majú termín po konci. Nový stĺpec `stav_sad` odpovedá na otázku
  „beží to?" a karta to píše vetou. **Prvá verzia pravidla bola zlá**:
  brala „ACTIVE" pri sade ako beh, lenže Meta ho necháva aj na sade, ktorá
  skončila 14. júla. Vyhlásila by 32 bežiacich kampaní pri nulovom výdavku;
  opravené a strážené testom so skutočným tvarom dát.
- **Claude Project sa nastaví z Kokpitu** (verzia 464). Karta „Zadanie pre
  Claude Project" má nad každodennými tlačidlami trojkrokový návod: skopíruj
  kánon do Project knowledge, skopíruj tri vety do instructions, potvrď.
  Po potvrdení sa zapíše dátum a návod zmizne (`project|nastavene`
  v `anomaly_ack`, do Jarvisovej pamäte sa nedostane). Kánon sa **vťahuje
  priamo z `docs/kanon-psb.md`** — keby sa prepísal do kódu, mali by sme dve
  verzie pravidiel a jedna by časom klamala.
  Kopírovanie má poistku: keď schránka odmietne ALEBO neodpovie do 1,5 s,
  text sa ukáže na označenie. Naživo v prehliadači s otvoreným panelom
  `writeText` visí a tlačidlo predtým vyzeralo, akoby nerobilo nič.
- **Značkovaný odkaz sa vyrobí, nie prepíše** (verzia 456). Karta „Ako zapnúť
  meranie reklamy" mala jedinú adresu napevno — príručku o dýchaní so značkou
  pre Metu. Teraz je to generátor: vyberieš platformu, stránku (prvá v ponuke
  je úvodný tréning) a napíšeš názov kampane. **Google odkaz nedostane** —
  značkuje si sám cez `gclid` a ručné `utm_` mu automatické značkovanie vie
  prebiť; namiesto odkazu ukáže tri veci na skontrolovanie v jeho rozhraní,
  z toho tretia je práve tá rozbitá konverzná akcia. Mail má vlastný zdroj,
  aby nesplynul s reklamou. Pravidlá sú v `lib/psb/utm.ts` (8 testov).
- **Hlásenia sa dajú zabaliť** (verzia 455). Nadpis nesie správu, detail sa
  rozbalí klikom. Vysoká závažnosť je otvorená, stredná zabalená. Tlačidlo
  *rozumiem, skry na 30 dní* zapíše do `anomaly_ack` a po mesiaci sa hlásenie
  vráti — skryté nie je vyriešené. Skryté po sebe nechá jeden riadok
  s dátumom a odkazom *ukázať*, takže appka nikdy nepredstiera, že nič nemá.
  Overené naživo aj v produkčnej D1: skrytie zapíše riadok, *ukázať* ho zmaže.
  Stav skrytia sa do Jarvisovej pamäte nedostane (kľúč `hlasenie|`) — je to
  poloha ovládača, nie odpoveď na otázku.
- **Adresy stránok sú preklikávacie** (verzia 454) v štyroch tabuľkách:
  Titulky na prepis, Rýchlosť, Technické chyby, Najsilnejšie stránky. Klik
  otvorí novú kartu, Kokpit zostane. Prevod adresy je jedna funkcia
  `adresaStranky` — tabuľky ju držia v troch rôznych tvaroch.
- **Rozdiel do cieľa rezervy počíta appka, nie Jarvis.** Na tú istú otázku
  odpovedal raz „chýba 113 500 Kč" a raz „313 700 Kč" — vstupy boli rovnaké,
  len si to rátal v hlave. Správne je 313 708 Kč (3 × 178 522 − 221 858).
  Teraz je to jedna funkcia `chybaDoCiela` v `rezerva.ts`, ktorú číta
  dlaždica **aj** kontext, a v poznámke má napísané, že si to nemá počítať.
  Overené naživo: dlaždica „do 3 mesiacov chýba 313 708 CZK", Jarvis
  „Chýba ti 313 708 Kč do cieľa tri mesiace" — do koruny to isté.
- **Ohlasovacia veta — zakázaná.** Odpoveď o rezerve mala šesť viet a tá
  navyše bola „Tri veci to priamo brzdia alebo môžu naopak potiahnuť nahor."
  — veta, ktorá neniesla nič, čo by v bodoch pod ňou nebolo, a zožrala jedno
  z piatich miest. Prvá veta musí obsahovať ZÁVER, nie oznam, že záver príde.
  Po oprave (verzia 452) sedia obe merané odpovede na piatich vetách.
- **Bodkočiarka v prvej odpovedi — zakázaná.** Pravidlo o nej tam bolo aj
  predtým, ale ako poznámka na konci, a model ho obišiel: veta na 47 slov
  s dvoma bodkočiarkami je formálne jedna veta a päť viet sa cez ňu vojde
  dvakrát. Teraz je to zákaz v tom istom odseku, ktorý strop určuje.
  Vzorová odpoveď označená ako DOBRE ho sama porušovala — našiel to test,
  nie oko. Naživo: nula bodkočiarok v štyroch odpovediach.
- **Mená klientov sa skloňujú.** Jarvis písal „tréning s Richard Matl",
  lebo appka hľadala klienta tým istým reťazcom, ktorý čítal človek.
  Odteraz je tvar «Veronikou Stoklaskovou|Veronika Stoklaskova» — vľavo
  veta, vpravo kľúč. Overené naživo: veta znie „Začni s Veronikou
  Stoklaskovou", klik na ňu otvorí kartu Veroniky Stoklaskovej.
  Prvý pokus nezabral, lebo hneď vedľa stálo „meno používaj presne ako je
  v dátach" — dva pokyny, silnejší vyhral. Až prepísanie do jedného
  pravidla so ZLE/DOBRE príkladom to zlomilo.

- **Dĺžka prvej odpovede — overená naživo.** Na otázku „Mám zdvihnúť ceny?"
  odpovedal Jarvis **4 vetami a 69 slovami** (strop je päť viet). Tá istá
  otázka vyrobila 17. 8. odpoveď na 179 slov a deväť viet — to je ten zlý
  príklad v prompte. Tvar sedí: záver v prvej vete, dva body po jednej vete,
  otázka na koniec.
- **Prehliadač NIE JE blokovaný.** Celý čas som skúšal
  `prosapiensbio.workers.dev`, ale appka beží na
  **`kokpit.prosapiensbio.workers.dev`** — to meno DNS nepozná, tak mi to
  hádzalo chybu a ja som z toho urobil záver „nepustí ma tam". Bola to moja
  chyba; nasadzovací skript pritom správnu adresu používal celý čas. Odteraz
  sa Jarvis aj prekliky dajú testovať naživo, nielen cez ostré dáta z D1.

- **Dĺžka prvej odpovede** — strop sa počíta vo VETÁCH (jeden záver, najviac
  tri body, jedna otázka), nie v slovách. Predtým prompt žiadal „spočítaj si
  slová, kým odošleš" — a to je jediné, čo model spoľahlivo nevie: slová
  nevidí, vidí tokeny. Rozpočet 30 + 3×25 + 15 tak nebol strop, ale cieľ,
  ku ktorému sa odpoveď natiahla.
- **„Reels & posty" rozdelené** (verzia 448). Bola to jedna obrazovka na
  3 558 pixelov s dvoma rôznymi prácami: hore sa plánovalo, dole vyhodnocovalo.
  Teraz sú to dve záložky — **Čo publikovať** (zadanie, návrhy z dát, nápady
  zo Zápisu) a **Reels & posty** (čo vyšlo, ako to dopadlo, kedy publikovať,
  po čom sa ľudia ozvali). Rovnaký rez ako pri Web × Vyhľadávanie.
- **Tempo rastu dlhu** — jeden výpočet (`tempoDlhu` vo vzas.ts). Karta aj
  Jarvis čítajú to isté cez to isté okno a číslo chodí spolu s obdobím,
  nad ktorým platí.
- **Kruh nápad → príspevok** — pri označení „použité" sa pýta odkaz a zapíše
  sa deň. Prešlo celou reťazou: migrácia 0044 (nasadená), API, obrazovka,
  Jarvisov kontext aj SCHEMA_DB. Overené na dočasnom riadku v produkčnej D1.
- **Odporúčanie bez mena** — patrí Terezke, rovnako ako „Dopyty bez odpovede
  prečo". Predtým prepadlo obom trénerom.
- **Google Ads sunset** — planý poplach. Kokpit používa **v24**, nie v21;
  to „v21" v poznámke bola Meta Graph API, iná služba. Obe verzie sú živé
  (overené požiadavkou: 401, teda „chce prihlásenie", nie 404).
- **Odpoveď sa nezapisuje do dát sama** — zámerné rozhodnutie, nie chyba.
  Tichý zápis z voľného textu je horší problém než ten, ktorý rieši.

## Odložené — nie sú to otázky

- **Vylúčenie klientov z cielenia reklamy** — zvážené 19. 8. 2026 a **zamietnuté
  z vecného dôvodu**, nie pre zložitosť. Publikum Brno + 20 km má podľa Mety
  **351 000 – 413 000 ľudí**; 70 klientov je z toho 0,02 %, takže vylúčenie by
  pri rozpočte 2 000 Kč ušetrilo asi 40 halierov. Stálo by to dva zásahy
  (export e-mailov klientov z PTminderu — appka ich dnes vôbec nemá — a súhlas
  s podmienkami Mety plus zmienka v GDPR o prenose hashovaných kontaktov).
  Jediný skutočný úžitok by bol, aby človek, ktorý rok trénuje, nevidel reklamu
  na úvodný tréning; to je vec dojmu, nie rozpočtu. **Oplatilo by sa to až pri
  remarketingu**, kde je publikum úzke a klienti by v ňom tvorili poznateľnú
  časť — dovtedy sa k tomu netreba vracať.


- **Klientsky prístup** (klient vidí svoje tempo) — nápad, nie plán.
- **Export uzávierky do PDF** pre účtovníčku.
- **Vlastná doména** — appka beží na `workers.dev` a funguje.
- **Púšťanie reklám priamo z Kokpitu** — poistka: appka kampaň vytvorí
  v stave PAUSED, spúšťaš ju ty. Až po septembrovom teste.

---

## Hotové 17. 8. 2026 — archív

Šesť bodov z Jerryho zoznamu: dôvod odchodu na klik · kategórie z jedného
zdroja · kánon a tvar zadania · zadania na dve stránky · denník klienta na dva
klepnutia · meranie výsledkov (bolesť 0–10).

K tomu z jednodňového záťažového testu Jarvisa: FP Spain v schéme · rezerva,
odmlčaní a dlh do kontextu · odkazy vedú tam, kam sľubujú · čeština ku
klientovi ako pravidlo · päť slovenských meta popisov prepísaných · 14
presmerovaní po zrušených stránkach · päť skrátených reťazí · doplnených 10
dopytov · Node a spoľahlivé nasadzovanie.

## Hotové z 11.–13. 8. — starší archív

Úlohy: dopyty ako evidencia · konverzia a ekonomika do Jarvisa · Meta
Marketing API · obsah → dopyt · rozhodovacia obrazovka kampaní · Instagram
Graph API · dôvod straty pri dopytoch.

Otázky: B1 `uprav-pnl` spustené naostro · B2 sviežosť 10 dní · B3 kroky
uzávierky v Jarvisovi · B4 Naďa 1984 · B5 token pre Metu vytvorený ·
B6 júl 2026 z Metricoolu nahratý.
