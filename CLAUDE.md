# Kokpit — pravidlá pre stavanie

## Nové pole nie je hotové, kým neprejde celou reťazou

Jerry, 14. 8. 2026:

> „mám pocit, že si vždy staval izolované — spravil si riadok, kde sa dalo
> písať, ale vlastne si nespravil ani že by sa to uložilo, nie to ešte aby to
> Jarvis alebo hocičo evidovalo."

Mal pravdu. `precoNeprisiel` vzniklo 13. 8. ako pole v type a input na
obrazovke. Chýbala migrácia, chýbal zápis do zoznamu povolených polí v API
a funkcia na ukladanie vracala `void`, takže sa neúspech stratil. Obrazovka
urobila optimistický zápis, ukázala „uložené" a po načítaní stránky bolo
prázdno. Jerry vypisoval dôvody celý večer do niečoho, čo len vyzeralo, že
funguje.

**Preto: pri každom novom údaji prejdi týchto sedem bodov a povedz nahlas,
ktoré si vynechal a prečo.**

| # | Krok | Kde to je |
|---|---|---|
| 1 | **Stĺpec v databáze** + migrácia | `app/migrations/00XX_*.sql` — migrácie sa NEPÚŠŤAJÚ samy, treba `wrangler d1 execute --file` |
| 2 | **Čítanie z DB** do objektu | `db.server.ts` — mapovanie `snake_case` → `camelCase` |
| 3 | **Zápis do DB** | `db.server.ts` `colMap` + zoznam povolených polí v `routes/api/*.ts` |
| 4 | **Typ** | `types.ts` a odvodené (`ClientAgg` v `compute.ts` má vlastnú kópiu) |
| 5 | **Obrazovka** hlási pravdu | ukladanie vracia `boolean`; „uložené" sa ukáže až po úspechu |
| 6 | **Jarvis** to vidí | `aiContext.ts` — inak na otázku odpovie „neviem", hoci dáta sú |
| 7 | **Register** (ak to čaká na človeka) | `deriveAnomalies` alebo `nezapisaneDoRegistra` v `compute.ts` |

Body 1–4 sú povinné vždy. Body 5–7 podľa toho, čo to robí: údaj, ktorý sa
ručne zapisuje, potrebuje 5; údaj, na ktorý sa dá spýtať, potrebuje 6; údaj,
ktorý na niekoho čaká, potrebuje 7.

## Ticho zlyhávajúci zápis je horší než hlasitá chyba

Optimistický zápis do obrazovky je v poriadku len vtedy, keď sa neúspech
dostane späť. Človek, ktorý si myslí, že má hotovo, sa k tomu už nevráti —
a práca zmizne bez stopy.

## Prázdna odpoveď nie je dôkaz

Keď dopyt do databázy nič nevráti, sú dve možnosti: vec tam nie je, alebo je
otázka zle napísaná. Sú na nerozoznanie. Over si názvy stĺpcov
(`pragma_table_info`) skôr, než z prázdna urobíš záver — obzvlášť keď ten
záver odporuje tomu, čo Jerry hovorí zo skúsenosti.

## Ďalšie zásady, ktoré už v kóde platia

- **Jedna definícia na jednom mieste.** Klient, kotva dát, okno mesiacov,
  hranica pauzy — keď to isté počítajú dve miesta, skôr či neskôr sa rozídu.
- **Číslo bez akcie je zbytočné.** Jerryho vlastný test pre každú metriku.
- **Register nesmie svietiť celý.** Keď svieti všetko, nesvieti nič —
  zoskupuj a obmedzuj vek toho, čo sa hlási.
- **Slovenské úvodzovky v TS reťazcoch** rozbijú build, keď je zatváracia
  ASCII. Používaj `“` alebo sa im v kóde vyhni. Platí to aj v JSX atribútoch
  (`text="… „X" …"`) — tam to ASCII `"` ukončí atribút. Stalo sa to 14. 8.
  trikrát za jeden deň.
- **Spätné apostrofy v SYSTEM šablóne** v `routes/api/chat.ts` rozbijú build —
  je to template literal. Escapuj ich alebo píš názvy tabuliek bez nich.
- **Meno klienta je v siedmich tabuľkách** a v troch z nich aj v `dedup_key`.
  Premenovať sa smie len cez `/api/premenuj`, ktorý mení oboje naraz — inak
  najbližší import založí klienta druhýkrát.
- **Schéma, ktorú Jarvis dostáva** (`SCHEMA_DB` v `chat.ts`), je samostatná
  kópia. Nový stĺpec do nej treba dopísať ručne — Jarvis má SQL prístup, ale
  nevie sa spýtať na to, o čom nevie. To bol 14. 8. celý dôvod, prečo o dôvodoch
  strát nevedel, hoci boli v databáze.
- **`searchStream` v Google Ads vracia POLE dávok**, nie objekt s `results` —
  a to isté platí pre CHYBY. Kód napísaný podľa bežného endpointu prečíta
  `data.results` (alebo `data.error`), nájde `undefined` a ohlási „žiadne dáta"
  alebo „HTTP 400" pri odpovedi, ktorá presne vysvetľuje, čo je zle. Stalo sa
  to 14. 8. 2026 pri prvom sťahu. Rieši to `adsRiadky()` a `chybaZOdpovede()` —
  nečítaj z odpovede priamo.
- **Nikdy nehlás len stavový kód.** Keď sa telo odpovede nedá rozobrať, ukáž
  jeho prvých 300 znakov. Nerozobraná odpoveď je stále stopa; „HTTP 400" nie je
  nič a pátranie sa na nej zastaví.
- **Peniaze z Google Ads sú v mikrách.** Zabudnuté delenie miliónom vyrobí
  číslo, ktoré má správny počet číslic na to, aby vyzeralo ako suma.
- **Token vývojára na úrovni „prieskumník" nepustí plánovač kľúčových slov.**
  Objem hľadania čaká na Basic (žiadosť podaná 14. 8. 2026). Nepíš do appky
  odhady objemu — Search Console meria len tam, kde sa web už zobrazil.
- **GAQL chce rozsah dátumov ohraničený z OBOCH strán.** `WHERE segments.date
  >= '...'` Google odmietne s `EXPECTED_FILTERS_ON_DATE_RANGE`; musí to byť
  `BETWEEN od AND do`. Test na to je v `googleAds.test.ts` — otvorený rozsah
  nespadne pri písaní, spadne až naživo.
- **Nový import znamená nový riadok v `SCHEMA_DB`.** Jarvis má SQL prístup, ale
  schéma, ktorú dostáva, je samostatná kópia — bez riadku o tabuľke o nej nevie
  a na otázku odpovie „nevidím", hoci dáta sú. Pri `web_stranky` som to 15. 8.
  najprv vynechal: do kontextu som dal 90 titulkov a text nechal len v DB, takže
  Jarvis mal „prístup na celý web" len na papieri. Keď je tabuľka veľká na to,
  aby šla celá do kontextu, patrí do schémy s návodom, ako sa v nej hľadá
  (`WHERE text LIKE`) a s ktorou tabuľkou sa JOIN-uje.
- **PageSpeed Insights je jediná Google služba v Kokpite bez servisného účtu.**
  Nemá čo autorizovať — meria verejnú stránku — a chce obyčajný API kľúč
  (`psi_api_key` vo `vzas_settings`). Bez kľúča beží, ale Google po pár
  meraniach vráti 429; pri dvadsiatich stránkach na to narazíš hneď.
- **Jedno meranie PSI trvá 10–30 s** (Google si stránku naozaj otvorí
  v prehliadači). Preto sa meria po troch na klik a hlási sa, koľko zostáva —
  dvadsať stránok krát dve zariadenia je pol hodiny a request by vypršal.
- **Skóre z Lighthouse je 0–1 a môže chýbať.** `null` a `0` sa nesmú zliať:
  nezmeraná stránka by sa tvárila ako najpomalšia na webe. To isté platí pre
  chybu — PSI vracia HTTP 200 s chybou vnútri, tak ako Google Ads.
- **Prihlásenie wrangleru drží API token, nie `wrangler login`.** OAuth token
  vypršal 15. 8. dvakrát za deň a obnovenie skončilo na `400 Bad Request`; nové
  prihlásenie chce prehliadač, takže v neinteraktívnom shelli sa nasadiť nedá.
  Token je v `~/.zshrc` ako `CLOUDFLARE_API_TOKEN`, ale môj shell ho z profilu
  NENAČÍTA — pred nasadením ho treba pridať:
  `eval "$(grep '^export CLOUDFLARE_API_TOKEN=' ~/.zshrc)"`.
  Token má povolenia zo šablóny Edit Cloudflare Workers **plus Account → D1 →
  Edit** (bez neho neprejdú migrácie).
- **`cd` v shelli nedrží medzi príkazmi.** `bun run build`, `bunx tsc` ani
  `wrangler deploy` sa nesmú spustiť bez `cd .../psb-tracker/app` v tom istom
  príkaze. Z koreňa `philipjerry-web` `tsc` a testy zelené LEN preto, že
  nekontrolovali nič, a `wrangler deploy` začal nahrávať 280 000 súborov
  z celého Downloads. Stalo sa to 15. 8. dvakrát.
- **Číslo, ktoré vidí obrazovka, musí vidieť aj Jarvis — a z toho istého výpočtu.**
  Záťažový test 17. 8. 2026 našiel tri čísla, ktoré žili len v komponente:
  rezerva (dlaždica 1,2 mes. / 219 371 Kč, Jarvis „appka rezervu nepočíta"),
  odmlčaní (dlaždica 3, Jarvis 9 z registra) a dlh trénera (obrazovka
  −132 402 Kč, Jarvis „neviem, tabuľka je prázdna" a potom odhad z banky, kde
  sa pod „Jerry vyplata" mieša výplata s topánkami). Vždy je to tá istá chyba:
  výpočet vo `.tsx`, ktorý sa nedostal do `aiContext`. Keď pridávaš dlaždicu
  alebo kartu s číslom, výpočet patrí do `lib/psb/*`, obrazovka aj kontext si
  ho volajú. Keď sa dve strany nezhodnú DO KORUNY, nedávaj do kontextu nič —
  druhé číslo je horšie než žiadne (preto v `dlhyVyplaty` chýba tempo rastu).
- **Čo sa dá spočítať v kontexte, nenechávaj počítať v odpovedi.** Jarvis mal
  v kontexte všetkých 31 zrušených tréningov a na otázku „komu najviac"
  vymenoval trojicu po troch — prehliadol klienta so štyrmi. Rebríčky, súčty
  a poradia patria do `aiContext` ako hotové pole (`zrusenePodlaKlienta`).
- **Nasadzuj `./scripts/nasad.sh`.** Robí build, nasadenie a OVERENIE výsledku
  proti Cloudflare API. Priamy `wrangler deploy` funguje tiež — odkedy je na
  stroji Node (v24.19.0, doinštalovaný 17. 8. 2026) je spoľahlivý, zmerané 6/6
  s úplným výpisom. Predtým Node chýbal, wrangler bežal pod bunom a z toho istého
  testu vyšlo 4/6: dva behy skončili sekundu po štarte s návratovým kódom 0
  a bez nasadenia, jeden sa nasadil, ale výpis sa zastavil na „Total Upload".
  Na vine bol spúšťač `node_modules/.bin/wrangler`, ktorý robí
  `.on("exit", (code) => process.exit(code ?? 0))` — smrť dieťaťa na signál
  ohlási ako úspech. **Ak sa Node zo stroja niekedy stratí, tá istá tichá lož
  sa vráti**; skript to pozná a spadne späť na `bun wrangler-dist/cli.js`.
- **Overovanie po nasadení nevynechávaj ani s Node.** Druhá pasca s runtime
  nesúvisí: wrangler si v `.wrangler/tmp` pamätá, čo už nahral, a po prerušenom
  pokuse hlási „No updated asset files to upload" — workera nasadí, ale assety
  nepošle a v prehliadači beží STARÁ appka nad novým workerom. 16. 8. som na to
  naletel a pol hodiny testoval starú verziu. Poznať sa to dá len tak, že si
  vypýtaš nový súbor: `curl -o /dev/null -w '%{http_code}' <adresa>/assets/<index-*.js z dist/client/assets>`.
  Skript to robí sám a pred každým pokusom `.wrangler/tmp` maže.
- **Appka merala všetko okrem toho, čo PSB predáva.** Do 17. 8. 2026 vedel
  Kokpit povedať tržby, dochádzku aj dosah, ale nie to, či sa klientovi
  uľavilo. `klient_merania` je odpoveď: bolesť 0–10 v čase, zapisovaná jedným
  klikom pri denníku. Fotky pred/po sú lepší dôkaz, ale majú dve brány navyše
  (úložisko mimo D1, súhlas klienta a schválenie na fp.app) — kým sa vyriešia,
  jedno číslo odpovedá na tú istú otázku a nepotrebuje ani jedno.
  Pravidlo pri čítaní: „zostal rok" je vernosť, nie zlepšenie. Výsledok sa
  smie tvrdiť len z porovnania prvého a posledného merania toho istého človeka.
- **D1 má strop ~1 MB na jednu hodnotu.** Base64 z 5 MB PDF má ~6,7 MB a do
  riadku sa nezmestí — preto `jarvis_dokument_casti` krája po 700 000 znakoch
  a skladá sa späť pri čítaní. Platí to pre čokoľvek veľké, čo by niekoho
  lákalo uložiť do jedného stĺpca.
- **Do histórie rozhovoru nepatrí obsah, len odkaz.** Rozhovor sa ukladá po
  KAŽDEJ správe a nesie celú históriu; jedno vložené PDF by sa tak do databázy
  prepisovalo desiatky ráz za jednu debatu. Dokumenty ležia v `jarvis_dokumenty`
  a v správe je `psbdoc:<id>|<meno>`. Obsah drží 30 dní, potom zostane meno —
  a Jarvis má v prompte napísané, že vtedy má povedať pravdu, nie si domyslieť,
  čo v ňom bolo.
- **Ostré dáta majú vlastný test: `./scripts/naostro.sh`.** Jednotkové testy
  overujú pravidlá na vymyslených dátach; tento skript stiahne produkčné D1 do
  dočasného priečinka a spustí nad ním tie isté funkcie, ktoré beží appka —
  a hlavne simuluje, čo sa stane PO kliknutí (netrénoval → vráti sa „prestal
  chodiť"; export dorazí → čakajúci klienti sa potvrdia). Dvakrát takto vypadla
  chyba, ktorú testy nevideli: klient tretieho trénera (Matyáš), ktorého
  notifikácie nevidel ani Jerry, ani Terezka, a tri riadky o jednom človeku.
  Skript iba číta. Keď hlási zlyhanie, over najprv kontrolu samotnú — dvakrát
  sa mýlila ona, nie appka (natvrdo napísaný kľúč; „dve úlohy o jednom človeku"
  označené za duplicitu).
- **Definícia klienta je JEDNA: `jeKlient` v MarketingLievik.tsx** (prišiel
  znova, alebo zaplatil nad úvodný viac než 500 Kč). Revízia 18. 8. 2026 našla
  štyri mäkšie lokálne kópie („má platbu" — spĺňal ju každý, kto prišiel na
  platený úvodný): Kampane, Platená cesta, Kohorty, dlaždica Dopyty. Všetky už
  importujú `jeKlient`. Keď píšeš čokoľvek s „klientom" v čitateli alebo
  menovateli, importuj ju tiež — vlastná kópia je zárodok ďalšieho „124 %".
- **Sklady v marketing.ts majú verziu: `marketingVerzia()`.** Každý `nastav*`
  ju zvýši. Kto číta WEB_STRANKY/GSC_*/IG_PRISPEVKY v useMemo, MUSÍ ju mať
  v deps — inak memo zamrzne nad prázdnym skladom, keď jeho vlastný fetch
  dobehne skôr než /api/marketing (PlanObsahu, 18. 8.).
- **Importný setter musí mazať aj to, čo zo zdroja zmizlo.** nastavNakladyZFio
  nuloval P&L, ale nie Jarkovu splátku a výplaty z toho istého výpisu — pohyb
  preradený inam prestal byť nákladom, ale dlh ďalej klesal. To isté platilo
  pre BTC výplaty a barter. Pravidlo: keď vstup nesie CELÝ obraz zdroja,
  prejdi všetky importované mesiace a chýbajúce vynuluj (testy v vzas.test.ts).
- **Appka beží na `kokpit.prosapiensbio.workers.dev`** — s prefixom. Adresa bez
  neho v DNS neexistuje, takže prehliadač aj curl vrátia chybu. 18. 8. 2026 som
  z toho na pol dňa urobil záver „prehliadač ma tam nepustí" a celú revíziu
  overoval len cez dáta z D1, hoci sa dalo klikať. Adresa je v `scripts/nasad.sh`
  ako `adresa=` a je jediné miesto, kde treba pozrieť.
- **Meno klienta v Jarvisovej odpovedi má dva tvary.** `«Veronikou
  Stoklaskovou|Veronika Stoklaskova»` — vľavo to, čo číta človek, vpravo kľúč
  z `klientiDetail`, podľa ktorého appka nájde klienta. Bez zvislice je to
  jedno aj druhé. Parsuje to `menoOdkazu` v `lib/psb/odkazy.ts`; kto pridá
  ďalšie miesto, kde sa «» rozbaľuje, nech použije ju (18. 8. 2026 boli také
  miesta dve — bublina a úryvok vo vyhľadávaní).
- **Pravidlo v prompte, ktoré si odporuje so susednou vetou, prehrá.** „Skloňuj
  meno" vedľa „meno používaj presne ako je v dátach" nezabralo ani raz. Zabralo
  až prepísanie do jedného pravidla s doslovným ZLE/DOBRE príkladom. To isté
  platilo pre dĺžku: zákaz v odseku o strope funguje, poznámka na konci nie.
- **Po nasadení pred meraním v prehliadači daj tvrdý reload** (cmd+shift+r).
  18. 8. som meral odpoveď vykreslenú starým bundlom a vyzeralo to ako chyba
  v novom kóde — v odpovedi svietila surová zvislica.
- **Čo Jarvis počíta v hlave, to raz spočíta zle.** 18. 8. 2026 dal na tú istú
  otázku o rezerve dva rôzne rozdiely do cieľa (113 500 a 313 700 Kč) z tých
  istých vstupov. Model je dobrý na súvislosti, nie na aritmetiku. Pravidlo:
  keď má odpoveď obsahovať odvodené číslo, ktoré appka vie spočítať, spočítaj
  ho v `lib/psb/` a pošli ho v kontexte hotové — s poznámkou, že si ho nemá
  rátať sám. Vzor: `chybaDoCiela` v `rezerva.ts`, ktorý číta dlaždica aj kontext.
- **Import, ktorý vzal len časť sveta, vyzerá presne ako ten úplný.** Oba
  hlásia „hotovo" a číslo pridaných riadkov. 14. 8. 2026 tak prešiel export
  balíčkov za 14 dní: appka ohlásila „+20 riadkov", riadkov malo byť 77
  a Natália Pečková zostala na 0 hodinách, kým to Jerry o päť dní náhodou
  nenašiel. Merge per-klient (`ingest`, vetva `packages`) je pritom správny —
  klient mimo súboru sa nesmie zmazať. Chýbal len ten druhý pohľad: PRED
  zápisom si odložiť, kto mal živý balíček, a po porovnaní so súborom vrátiť
  mená tých, čo v ňom nie sú (`IngestResult.chybaju`). Keď píšeš import, ktorý
  nesie len VÝSEK zdroja, povedz nahlas, čo v tom výseku nebolo — inak sa
  ticho nedá odlíšiť od úplnosti.
- **Pri revízii najprv čítaj ODPOVEDE, až potom hlás nálezy.** 19. 8. 2026
  som ako dieru v P&L ohlásil chýbajúci júlový nájom — pritom odpoveď stála
  v `anomaly_ack` („Radek Baláž dal júl zadarmo — nájom sa neplatil",
  odklepnuté 6. 8.) aj v poznámke mesiaca. Vysvetlená vec nie je nález.
  Poradie kontroly rozporu v dátach: 1. `anomaly_ack` (kľúč aj note),
  2. `vzas_month_notes`, 3. `jarvis_zavery` — a až keď je všade ticho, je to
  nález. Presne na toto existuje pamäť „registra": odpovede neminú, len ich
  treba čítať.
- **Splátka dlhu je záznam v knihe, nie snímka.** Sofiin barter sa staval zo
  `packages` (momentka) a po vypršaní balíčka by sa už započítaný mesiac
  ticho vynuloval — dlh by spätne narástol. Raz videný barter sa preto ukladá
  (`vzas_settings.barter_jarek`) a vstup pre setter je zjednotenie snímky
  s uloženým. Pravidlo „importný setter maže, čo zo zdroja zmizlo" platí len
  pre zdroje, ktoré nesú CELÝ obraz — snímka aktuálneho stavu ho nenesie.

- **Hotové číslo v kontexte bez pokynu Jarvis nepoužije.** `pnlSuhrn` so
  ziskom po mesiacoch v kontexte BOL — a Jarvis si zisk júla aj tak poskladal
  z banky (157 498 namiesto 133 465), lebo nič mu nehovorilo, že TO je to
  pravé číslo. Model radšej „poctivo" počíta, než by veril kľúču, ktorý mu
  nikto nepredstavil. Každé hotové číslo v `aiContext` potrebuje `poznamka`
  s vetou „PREČÍTAJ, NEPOČÍTAJ" a odkazom na obrazovku — vzor je `rezerva`,
  `dlhyVyplaty`, od 19. 8. aj `pnlSuhrn`. Bez toho je kľúč v kontexte
  dekorácia.
- **`pragma_table_info` v JOINe D1 odmietne (`SQLITE_AUTH`) a vráti prázdno.**
  Stráž migrácií 19. 8. najprv „dokázala", že 25 migrácií v DB nie je — bol to
  zamietnutý dopyt, nie chýbajúca schéma. Schéma sa číta tabuľka po tabuľke.
  Prázdna odpoveď nie je dôkaz ani vtedy, keď ju vyrobil môj vlastný skript.

- **Zo zostatku hodín sa chýbajúci import poznať NEDÁ.** 19. 8. 2026 tu pár
  hodín žila anomália `nulahodin|` („chodí, ale má 0 hodín"). Vyzerala logicky
  — kto chodí a platí, má mať čo míňať — a padla na tom, že PSB predáva aj
  PAUŠÁLNE ČLENSTVÁ (GOLD/SILVER/DIAMOND/ONE). Tie v exporte stoja **navždy na
  0/N**, takže nula hodín je pri nich normálny trvalý stav; kontrola hlásila
  Jakuba Štiguta ako podozrenie na chýbajúci import, hoci appka aj PTminder
  ukazovali to isté. Takých klientov je 34 zo 76. Je to presne ten bug, ktorý
  `jeDoplnok` v `deriveClients` UŽ RAZ opravoval z druhej strany („došli hodiny"
  u 40 zo 73 klientov, ktorým nič nekončilo) — zopakoval som ho, lebo som si
  ten komentár neprečítal. **Príčinu chyby v dátach hľadaj tam, kde chyba
  vzniká** (pri importe), nie dodatočnou dedukciou z čísel, ktoré na ňu
  nestačia. A pred písaním kontroly nad balíčkami si prečítaj komentár nad
  `jeDoplnok` — je tam napísané, prečo tieto čísla neznamenajú to, čo sa zdá.
- **Kontrola, ktorá svieti na nesprávnych ľudí, je horšia než žiadna.** Tá istá
  anomália hlásila v prvej verzii šesť klientov, z toho štyroch zbytočne
  (dočerpaný balíček s bežiacou platnosťou, nováčik po úvodnej hodine — oboje
  normálne stavy). Vyplávalo to len tak, že som si každý nález overil v D1
  menom; testy aj `naostro.sh` boli zelené. Pri novej kontrole nad ostrými
  dátami platí: kým nevieš o KAŽDOM náleze povedať, prečo tam je, kontrola nie
  je hotová — a „prešlo to" nie je odpoveď. Zvyšok dorazil až Jerry pohľadom do
  PTminderu, čo je posledná inštancia pravdy o balíčkoch.

- **`(#3) capability` nemusí znamenať chýbajúce App Review.** 19. 8. 2026 sa
  ukázalo, že Kokpit nevedel vyrobiť kreatívu z celkom inej príčiny:
  facebooková aplikácia (App ID `1038839719119872`) stála v režime
  **Development**. Meta to povie až pri `object_story_spec` („Ads creative post
  was created by an app that is in development mode"), kým pri
  `source_instagram_media_id` vráti len holé `(#3)`. Po publikovaní appky
  (Settings → Basic doplniť Privacy policy URL + Category, potom Publish)
  prešli bežné kreatívy hneď. **Boost hotového IG príspevku
  (`source_instagram_media_id`) má vlastnú bránu a tú publikovanie
  neotvorilo** — na ten treba Full Access (500 volaní/15 dní). Keď Meta
  odmietne, over OBE veci; sú to dve rôzne brány a chyba vyzerá rovnako.
- **App ID `1038839719119872` sa v Events Manageri tvári ako dataset.** Je to
  aplikácia Kokpit, cez ktorú ide celé Meta API vrátane CAPI — nie zabudnutý
  pixel. Nemazať. (19. 8. som ju omylom navrhol zmazať.)

- **Reklamné kampane vznikajú len na účte `172897726151288`.** Je to jediný
  účet, ktorý Kokpit číta. Server ho berie z konštanty `UCET_REKLAM`
  (`lib/psb/kampanPlan.ts`), NIE z nastavenia `meta_ad_account` — nastavenie
  sa dá prepísať v inej karte a kampaň by ticho vznikla tam, kam appka
  nevidí. Presne to sa stalo v osobnom účte `3356679857899572`: dve zapnuté
  kampane z januára 2023, o ktorých Kokpit nevedel.

## Jarvisove zdroje pravdy nie sú len DB

Jarvisov kontext skladá `chat.ts` z viacerých zdrojov a pri oprave faktu treba nájsť VŠETKY:
`<data>` (aiContext z D1), `<pamat_zaverov>` (jarvis_zavery), `<pozadie_psb>`
(**PSB_KNOWLEDGE v `src/lib/psb/knowledge.ts` — importuje statické .md súbory z repa,
napr. `marketing-onboarding.md`!**), `<zameranie>` (zamerania.ts) a jarvis_vedomosti.
20. 8. 2026 Jarvis tri razy „konfabuloval" onboarding so zastaranou diagnózou — nebola to
konfabulácia, bol to statický marketing-onboarding.md zapečený v builde, ktorý som hľadal
len v databáze. Prázdna odpoveď z DB nie je dôkaz, že zdroj neexistuje — grep aj repo.
Keď sa zmení marketingový fakt, over: marketing-onboarding.md + jarvis_vedomosti +
jarvis_zavery + pamäť Claude Projectu (cez Chrome).

## Po commite pushni

Repo MÁ origin (github.com-prosapiensbio:prosapiensbio-oss/psb-tracker, SSH
alias funguje bez hesla). 20. 8. 2026 tam viselo 6 nepushnutých commitov
a ja som tvrdil, že remote neexistuje — `git status` pritom písal „ahead of
origin/main". Commit bez pushu = história len na jednom MacBooku. Po každom
`git commit` sprav aj `git push origin main`.
