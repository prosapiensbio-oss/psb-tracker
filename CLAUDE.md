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
- **`wrangler.jsonc` je JEDINÝ config nasadenia.** Kópia `wrangler.psb.jsonc`
  vedľa neho tvrdila, že nasadzovacia je ona, hoci ju skript nepoužíval —
  25. 8. 2026 sa väzba pridaná do nej ticho nenasadila. Kópia je preč a skript
  odovzdáva `-c wrangler.jsonc` výslovne. Druhý config už nezakladaj.
  Workers Builds sú ŽIVÉ:
  push na main → `bun install && bun run build` → `npx wrangler deploy`
  (root /app) → nasadené za ~2 min. POZOR: CI deploy NEMÁ stráž migrácií ani
  testovú bránu z nasad.sh — migrácie aplikuj VŽDY pred pushom a testy pusti
  lokálne; nasad.sh zostáva primárna cesta, buildy sú poistka.
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
  Basic bol pridelený (overené 6. 10. 2026 naživo cez `akcia: "skus-planovac"`
  v `/api/google-ads`). Niektoré všeobecné semienka („bolest zad") vrátia
  NULU nápadov — prázdna odpoveď nie je dôkaz, že sa to nehľadá.
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

- **`navigator.clipboard` zlyhá aj pri skutočnom kliku.** Chce povolenie
  clipboard-write a prehliadač ho nemusí dať ani v zabezpečenom kontexte pri
  kliku vyvolanom myšou (overené 23. 8. 2026 v mape cyklu). Kopírovanie preto
  potrebuje dve cesty: najprv `clipboard.writeText`, po zlyhaní výber textu
  a `document.execCommand("copy")` — a keď padne aj ten, nechať text OZNAČENÝ
  a povedať „stlač cmd+C“. Jedna cesta znamená tlačidlo, ktoré u niekoho ticho
  nerobí nič.

- **`\d{4}-\d{2}` NIE JE overenie mesiaca.** Pustí „2026-13" aj „2026-00" —
  dve číslice sú dve číslice. 23. 8. 2026 tak cez API prešiel plán začínajúci
  trinástym mesiacom, appka z neho vyrobila prázdne obdobie a nič nehlásila.
  Používaj `jeMesiac()` z `lib/psb/format.ts`, ktorá kontroluje aj rozsah 01–12.
  **Ten istý vzor je ešte na piatich miestach** (`parse.ts` ×2, `periods.ts`,
  `sprava.ts`, `vzas-notes.ts`) — pri ďalšom zásahu do nich ho vymeň; pri
  finančných mesiacoch to môže tichým prázdnom pokaziť viac než plán.

- **Worker umiera na limit BEZ zápisu chyby.** Sťahovanie kalendárov robilo oba
  v jednej požiadavke; Cloudflare ju zabil na „Worker exceeded resource limits"
  a keďže worker zomrel pred zápisom, `kal_zdroje.posledna_chyba` zostala
  prázdna a `aktivny` na 1. Terezkin kalendár tak sedem dní nechodil a obrazovka
  celý čas svietila zeleno „pripojený" (24. 8. 2026). Ťažká práca patrí do
  JEDNEJ požiadavky na jeden zdroj a ku každému zdroju patrí kontrola veku
  poslednej úspešnej synchronizácie — chýbajúca chyba nie je dôkaz, že je dobre.
- **iCal sa filtruje PRI ČÍTANÍ, nie po ňom.** `citajIcal` načítalo všetkých
  ~8 000 udalostí do pamäte a filtrovalo na okno až na konci, hoci do okna ich
  patrí ~130. Séria s RRULE a presunutý výskyt (RECURRENCE-ID) sa musia držať
  aj keď začali dávno — séria z roku 2023 môže mať výskyt budúci týždeň.
- **Primárny tréner sa ráta z POSLEDNÝCH 6 MESIACOV.** Celoživotný počet sedení
  pripísal klienta navždy tomu, kto ho trénoval prvý: Natália Pečková mala 55
  sedení s Matyášom (posledné v marci) a 26 s Jerrym (posledné 19. 8.) a appka
  ju viedla ako Matyášovu. Matyáš nie je v prepínači, takže podľa pravidla
  „klient tretieho trénera patrí obom" svietili jej narodeniny aj Terezke.
  Bez sedení za pol roka platí celoživotný pomer, inak by klient na pauze
  zostal bez trénera.
  **Od 14. 9. 2026 rátajú len sedenia Jerryho a Terezky** (`zaskok.ts`):
  Matyáš je záskok a „kto trénoval" ≠ „čí je klient". Matyášov je automaticky
  len nový klient, ktorého prvý deň (od 9/2026) viedol on. Jeho mzda (DPP,
  370 Kč/h) sa od 7/2026 plní sama zo sedení (`nastavMatyasZTrackera`).

- **Chýbajúci stĺpec v INSERTe nespadne — ticho mlčí.** 24. 8. 2026 som ho
  zabudol ŠTYRIKRÁT za jeden deň (hotovy_text, zaber, scenar so sekvenciou,
  poznamka): obrazovka hodnotu poslala, SQLite ju zahodila, appka ohlásila
  „uložené" nad stratou. TypeScript ani testy o tom nevedia. Odteraz to stráži
  `src/lib/psb/zapisy.test.ts` — porovná stĺpce v UPDATE a v INSERT v tom istom
  súbore. Keď spadne, buď stĺpec do INSERTu dopíš, alebo ho pridaj do VYNIMKY
  aj s dôvodom; zoznam výnimiek je krátky a každá v ňom má vetu, prečo tam je.

## Číselné políčko bez spodnej hranice vyrobí −1

`<input type="number">` bez `min` spraví pri šípke dole z PRÁZDNEHO poľa
hodnotu **−1**. Nie je to preklep používateľa a nič na to neupozorní —
1. 10. 2026 tak stála v jednej anamnéze výška −1 cm. Overené na odhodenom
políčku: bez hranice vyjde −1, s `min={0}` vyjde 0.

Pri každom novom číselnom poli sa teda pýtaj, aký je najmenší zmysluplný
údaj, a napíš ho. **Ale nie všade:** v appke je 11 číselných polí a päť
z nich hranicu mať NESMIE, lebo sú to peniaze a mínus je tam normálny stav
(ručný pohyb v banke — výdavok je záporný, položky faktúry kvôli dobropisu,
bunka P&L, cieľová hodnota). Hranica tam nie je oprava, ale tichá prekážka.

A keď si obsluha hranicu aj tak vynucuje (`Math.max(15, …)`), patrí
do políčka tiež — inak človek klikne, uvidí nezmysel a appka mu ho ticho
prepíše na niečo iné.

## Okno sa stráži z OBOCH strán, inak sa appka pýta na prehistóriu

Kontrola „tréning je v kalendári, ale v PTminderi nie — konal sa?" strážila
len horný koniec pokrytia exportu. Spodný chýbal. Export v Kokpite začína
3. 1. 2025, kalendár drží série z roku 2024 (RRULE sa nesmie zahodiť) — a tak
sa appka pýtala na obdobie, o ktorom PTminder v Kokpite nikdy nič nemal.
Zmerané 1. 10. 2026: **695 otázok, z toho 650 z roku 2024**, pri dvadsiatich
odklepnutiach za celý čas.

Jerry: „veľa notifikácií naraz takých istých bude iba áno áno áno a nebudem
tomu venovať pozornosť." To je presne ten spôsob, akým register prestane
fungovať — nie tým, že mlčí, ale tým, že svieti celý.

**Pravidlo:** keď sa niečo porovnáva s dátami, ktoré pokrývajú OBDOBIE,
ohranič ho z oboch strán — `MIN` aj `MAX` zdroja. A ku každému nálezu, ktorý
čaká na človeka, pridaj vek: otázka, s ktorou sa už nedá nič urobiť (tréning
spred dvoch mesiacov nikto spätne nedopíše), nepatrí do zoznamu vôbec.

**A TÚ ISTÚ CHYBU SOM O HODINU NESKÔR SPRAVIL ZNOVA, ZRKADLOVO.** Nová
kontrola v opačnom smere („v PTminderi áno, v kalendári nie") sa pýtala
31 dní dozadu — lenže pole udalostí, s ktorým appka pracuje, siaha len
**21 dní** (`okno()` v `api/kalendar.ts`). Sedenia spred 22–31 dní tak nemali
s čím sedieť a appka ohlásila ako chýbajúce desiatky tréningov, ktoré
v kalendári celý čas sú: 33 klientov, niektorí s piatimi otázkami naraz.
Prešlo to typmi aj testami; zastavila to až kontrola ostrých dát
(`naostro.sh`, sekcia „tá istá otázka dvakrát") — a bolo to už nasadené.

Z toho platí navyše:
- **Hranica okna sa berie Z DÁT, nie z konštanty.** `mimoKalendara.ts` si
  spodnú hranicu zisťuje z najstaršej udalosti v poli; 31 dní je len strop,
  keby okno niekto rozšíril. Konštanta, ktorá „bude bezpečne vnútri", je
  predpoklad — a ten sa raz zmení bez toho, aby si to niekto všimol.
- **Prázdny zdroj = mlčanie.** Žiadne udalosti neznamená „nič nie je
  v kalendári", znamená „nevie sa nič". Je to tá istá veta ako „prázdna
  odpoveď nie je dôkaz", len o krok vyššie.
- **Nová položka registra sa pred nasadením púšťa cez `naostro.sh`.** Typy
  a testy overia pravidlo na vymyslených dátach; koľko riadkov z toho vznikne
  nad ostrou databázou, povie len tá kontrola.
- **A ani `naostro.sh` nestačí — tretia chyba sa dala vidieť len na
  obrazovke.** Prvý deň okna sa nedá súdiť: tolerancia ±1 deň sa tam nemá
  o čo oprieť, lebo udalosť z predošlého dňa už v poli nie je, a presunutá
  hodina vyzerá ako chýbajúca. Kontrola to prepustila (každý človek mal len
  jednu otázku), ale na Dnes stálo pätnásť mien s tým istým dátumom.
  Hranica preto je **najstaršia udalosť PLUS JEDEN DEŇ**.
- **Najlacnejšie overenie je spočítať si to v prehliadači PRED nasadením.**
  `/api/data` a `/api/kalendar` sa dajú zavolať z konzoly a pravidlo
  prepočítať nad tými istými dátami, s ktorými beží appka. Dve minúty; mňa
  to 1. 10. 2026 stálo dve zbytočné nasadenia, kým som na to prišiel.

**A pozor na dátum spotreby celej kontroly.** Táto vznikla, keď bol PTminder
pravda. Od 1. 10. 2026 je pravdou Kokpit — až Jerry prestane do PTmindera
zapisovať, bude „v kalendári áno, v PTminderi nie" normálny stav KAŽDÉHO
tréningu a kontrolu treba vypnúť. Jej nástupca už existuje: karta „Vydrží
kalendár sám?" v Prechode hovorí to isté ako jedno číslo za týždeň namiesto
jednej otázky na tréning.

## Odporúčanie bez pamäte sa opakuje donekonečna

Karta „Čo publikovať ďalej" navrhovala napísať stránky, ktoré už napísané
boli, a „Pripomeň na Instagrame" sa nedala odklepnúť vôbec — nemala ako.
Jerry, 26. 8. 2026: „ako Kokpit bude vedieť, že sú hotové?" Nijako; žiadny
mechanizmus tam nebol.

Pravidlá, ktoré z toho platia pre každý zoznam odporúčaní:

- **Kľúč sa neodvodzuje z textu karty.** Text nesie čísla zo Search Console
  a mení sa každý týždeň; odklepnutie by padlo pri prvom pohybe. Kľúč je druh
  práce + čoho sa týka (`obsah|napis|<téma>`). Pri prepise titulku je to
  ADRESA, nie titulok — ten sa prepisom práve zmení.
- **Skrýva sa na čas, nie navždy.** „Hotové" a „už to nechcem vidieť" vyzerajú
  rovnako a znamenajú opak. Lehoty sú v `SKRY_DNI` a líšia sa podľa práce:
  nová stránka 90 dní, pripomenutie na Instagrame 180, tempo 30.
- **Odklepnuté sa nezahadzuje, nechá po sebe riadok.** Zoznam, ktorý po
  odklepnutí vyzerá prázdny, tvrdí, že práca neexistuje.
- **Musí to vidieť aj Jarvis** (`uzHotove` v aiContext) — inak odporučí to,
  čo Jerry práve označil za vybavené. To je ten istý druh straty odpovede,
  ktorý rieši register.

## Import, ktorý číta cez keš, ticho nerobí nič

`web_stranky` sa ťahalo LEN ručne a naposledy 17. 8.; karta rozhodovala
z desať dní starého obrazu webu. Pridané do cronu (3:30) — ale prvý beh
načítal NULA stránok, hoci sa v ten deň zmenilo 44 článkov: hosting
(openresty) aj WP Fastest Cache držia starú sitemapu hodiny po úprave a
`lastmod` v nej ukazoval desať dní dozadu. Import z toho usúdil, že sa nič
nezmenilo, a vrátil úspech.

**Každé sťahovanie z prosapiens.cz preto ide s jednorazovým parametrom
v adrese** (`stiahni()` vo `web-obsah.ts`). Samotné `cache-control: no-cache`
nestačí — CDN odpovie skôr. A pri overovaní webu zvonku platí to isté:
`curl` bez parametra ti ukáže starú stránku a vyzerá to ako chyba v kóde.

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

## Odpoveď platí aj pre vety, ktoré sa z nej odvodzujú

21. 8. 2026: Jerry 10. 8. odpovedal na 6M otázku o Lukášovi Hanusovi
(`sixm|Lukas Hanus|Obnova|5`) a 21. 8. mu „5. mesiac — hodnotiaci rozhovor"
svietilo znova — nie ako 6M položka (tá bola ticho), ale prilepené k DENNEJ
pripomienke „Dnes o 10:00 máš tréning s…", ktorá vzniká každý deň nanovo
a brala si text z `sixM[].alert` bez pohľadu na ack. Pravidlo: keď sa text
upozornenia SKLADÁ z iných upozornení (6M, balíček, narodeniny…), každý diel
sa pýta na svoj vlastný ack. Inak zodpovedaná vec prežije v cudzom tele.
Jerryho meradlo: „keď sa k niečomu vyjadrím a uzavriem to, už sa to nesmie
zobraziť."

## Ceny sedení nie sú peniaze

`session.price` je cena zapísaná pri sedení a pri 663 z 3 449 sedení (19 %) je
NULOVÁ — platba visí na balíčku zaplatenom dopredu. Kde ide o otázku „koľko
klient zaplatil", platia PLATBY (`data.payments`), nikdy súčet cien sedení
(`totalPrice`). 22. 8. 2026 sa to našlo na štyroch miestach naraz: LTV karta,
KPI „Hodnota klienta", Referenčný motor (−220 tis. Kč) — a appka to pritom
o pár riadkov ďalej sama hovorí pri „Ø cene sedenia", kde ceny sedení odmieta.
Legitímne použitie `revenue` (súčet cien sedení) je len tam, kde je prepínač
„prijaté vs. odtrénované" a používateľ vidí, ktoré číslo čita (Financie,
dlaždica tržieb).

Rovnaká rodina: výdaj na reklamu. `mkt_prispevky.spend` je Metricool
(len boostnuté kusy z nahratého exportu, mesiac bez exportu = 0), `mkt_kampane`
je Meta Marketing API a je to jediný úplný zdroj — rozdiel za 19 mesiacov je
18 179 vs 31 454 Kč. Pole `spendAds` v MktMesiac nesie ten správny.

## „Nič sa nestane" nemusí byť zhltnutý catch — promise vie visieť

`navigator.clipboard.writeText` sa nemusí odmietnuť: vie sa zaseknúť a NIKDY
sa nedokončiť. Overené 28. 8. 2026 v živom Kokpite — povolenie
`clipboard-write` bolo `granted`, stránka mala focus, a promise sa po 3 s
ešte nehol. Kód tvaru

```
try { await navigator.clipboard.writeText(t); setOk(true); }
catch { /* záložná cesta */ }
```

potom nespustí ani záložnú cestu, ani hlášku — používateľ klikne a nestane sa
nič. Presne to Jerry hlásil pri „skopírovať prompt do Higgsfieldu" a oprava
z 26. 8. to neriešila, lebo riešila len ODMIETNUTIE.

Kopíruj vždy cez `doSchranky()` v `lib/psb/kopirovanie.ts` — má časový limit
a druhú cestu cez execCommand. Test `kontrolnePrompty.test.ts` stráži, že sa
`await navigator.clipboard.writeText` nikde v komponentoch neobjaví znova.

Zovšeobecnenie: pri každom `await` nad prehliadačovým API sa pýtaj, čo sa
stane, keď sa NEVRÁTI. Catch chráni pred chybou, nie pred tichom.

## Spoločná pripomienka na osobný zápis zhasne cudzou rukou

Týždenná únava sa zapisuje po ľuďoch (`jerry_score`, `terezka_score`), ale
pripomienka bola JEDNA a zhasínala cez `PEOPLE.some(...)`. Len čo svoje
hodnotenie napísal Jerry, Terezke zmizla — a jej týždne zostávali prázdne.
V dátach to bolo vidieť mesiac dozadu, na obrazovke nie, lebo appka
vyzerala „hotovo".

**Keď je záznam per osoba, musí byť per osoba aj pripomienka** — vlastné
`id` (inak odklepnutie umlčí oboch) a vlastný `trener` (inak ju filter ukáže
obom). Platí pre všetko, čo má v kľúči meno človeka.

**Po osobách v registri, zlúčené v zozname.** Rovnaká vec sa v okne „Čo
chceš zapísať" nesmie objaviť dvakrát — dva týždne × dvaja ľudia dali štyri
riadky, ktoré hovorili to isté. `zlucRitualy()` ich spojí do jedného riadku,
ktorý navyše povie, na koho sa čaká. Prvý pokus (mená do nadpisov) riadky
nezmenšil — meno je informácia, nie riešenie počtu. A odznak s počtom musí
počítať ZLÚČENÉ riadky, inak hlási dva tam, kde zoznam ukáže jeden.

Pripomienka sa navyše pýta **jeden týždeň spätne**: bez toho zmizol
v pondelok aj nezapísaný týždeň a už sa nikdy nevrátil (tak zostal navždy
prázdny týždeň 17. 8. 2026). Hranica je zámerne jeden týždeň — viac by
nakopilo stĺpec starých riadkov.

## Preklik má viesť k písaniu, nie k tabuľke

`Treningy` rozlišujú cieľ podľa TVARU: `RRRR-MM-DD` riadok týždňa **rozbalí**,
štítok `24.8.` ho len zvýrazní. Register posielal štítok, takže sa tabuľka
prefiltrovala a políčko na náročnosť zostalo zabalené — človek stál nad
správnym riadkom a nemal kam písať. Pri každom novom prekliku over, že
cieľová obrazovka nielen otvorí, ale aj ROZBALÍ to, čo sa má vyplniť.

## Remeslo písania žije na dvoch miestach

`docs/textar-psb.md` je zdroj pravdy; blok `<copywriting>` v Instructions
Claude Projectu je jeho skrátená kópia. Keď sa zmení jedno, musí sa druhé —
inak Project píše podľa starého pravidla a nikto to nezistí, lebo text
vyzerá „nejako napísaný".

Pozadie (29. 8. 2026): celé remeslo bolo v Instructions popísané 188 znakmi
(„piš vecne, kľudne, odborne"). Modelu sa zakázal hype a nedal sa mu iný
zdroj energie, tak siahol po vysvetľovaní — a každý príspevok bol esej
o mechanizme. Jerry to nazval „slová idúce za sebou bez výpovednej hodnoty".

## Formulár otvorený skôr než dáta prepíše, čo v ňom už bolo

`useState(entry)` berie hodnotu LEN pri prvom vykreslení. Keď sa riadok
otvorí deep-linkom hneď po štarte, `weeks` sú ešte prázdne — formulár sa
nakreslí prázdny, hoci zápis existuje, a uloženie ho prepíše. Takto 29. 8.
2026 zmizli poznámky týždňa 24. 8.

Dve poistky, obe musia platiť pri každom takom formulári:
1. **Klient:** kým sa políčok nikto nedotkol, draft zrkadlí prichádzajúce
   dáta (`dotknute` ref). Po prvom písmene sa zamkne.
2. **Server:** zápis ZLUČUJE (`{...povodne, ...data}`), neprepisuje celý
   riadok, a predchádzajúcu podobu odloží do `vzas_audit` (action `tyzden`).

D1 Time Travel tu nepomôže — vracia celú databázu, nie jeden riadok. Preto
audit.

## Dva iCal kalendáre v jednom volaní zhodia celý worker

29. 8. 2026 som zmenil cron endpoint tak, aby sťahoval VŠETKY kalendáre
namiesto jedného. Vyzeralo to lacno — dva súbory, ~95 udalostí. Výsledok:
Cloudflare **error 1102 (worker prekročil limit CPU)** a appka vracala 503 na
KAŽDÚ požiadavku, nielen na ten endpoint. Nasadenie prešlo, testy prešli,
build bol zelený; zistilo sa to až `curl`-om na hlavnú stránku.

**Preto je „jeden zdroj na volanie" zámer, nie nedbalosť.** Parsovanie iCal
je drahšie, než vyzerá. Keď treba obidva kalendáre častejšie, riešenie je
VIAC BEHOV plánovača (alebo `?trener=` adresne), nie viac práce v jednom.

**A ponaučenie mimo kalendára:** po nasadení zmeny v serverovom kóde over
`curl -o /dev/null -w '%{http_code}' <adresa>`. Zelený build ani úspešný
`wrangler deploy` nehovoria nič o tom, či worker beží — 503 sa objaví až pri
prvej skutočnej požiadavke.

## Presun záložky je aj prepis textov, ktoré na ňu ukazujú

29. 8. 2026 sa „Dáta a uzávierka" osamostatnili z Mesiaca do vlastnej záložky
**Upload**. Samotný presun bol pár riadkov; polovicu práce tvorilo dohľadať
**jedenásť viet v desiatich súboroch**, ktoré posielali človeka „do Mesiac →
Dáta" alebo „do Údajov" — vrátane Jarvisovho kontextu (aiContext), rituálov
a kontrolných promptov. Nič z toho by nespadlo v testoch: sú to reťazce.

**Postup pri premenovaní alebo presune záložky:** id NIKDY nemeniť (visia na
ňom adresy, ciele rituálov, Jarvisove odkazy), a potom
`grep -rn '<starý názov>' src/lib src/components` a prejsť všetko.

## Jarvisovi neposielaj dátum, posielaj rozsah

`weekLabel` dáva len pondelok („17.8.“). Dlaždice s tým vystačia — človek vidí
stĺpec v tabuľke. Jarvis nie: 30. 8. 2026 si z toho domyslel okno „18.–24. 8.“
a Jerrymu tvrdil pokles 5 %, kým dlaždica hovorila 18 %. Dlaždica mala pravdu.

**Každý časový údaj v aiContext musí byť jednoznačný** — rozsah pre človeka
(`17.–23. 8. 2026`) a `od`/`do` v ISO pre stroj. Skratka, ktorú si musí model
domyslieť, sa raz domyslí zle a nikto to nezistí, kým dve miesta nepovedia
dve rôzne čísla.

## Pripomienka, ktorá posiela konať, sa najprv overí v dátach

Záver „ozvať sa a dohodnúť termín" sa hlásil bez toho, aby sa niekto pozrel
do kalendára. 31. 8. 2026 podľa neho Jerry napísal Romanovi Pavlíkovi SMS
a Roman odpísal, že sú dohodnutí — mal termín na utorok 10:30. To isté
platilo o Michalovi Knapčokovi (tri termíny) a o Janovi Kralovi (dnes o 18:00).

`zaverUzMaTermin()` sa spúšťa LEN na záveroch, ktorých overenie hovorí
o dohode alebo tréningu — záver „prišla odpoveď z Facebooku?" sa kalendárom
overiť nedá a nesmie ním byť umlčaný.

**Pripomienka nezmizne — ODPOVIE.** Prvá verzia ju umlčala; Jerry to o hodinu
upresnil: chce ju vidieť aj s odpoveďou („napísal som si, že ide na dovolenku,
a rovno vidím, že sme dohodnutí na ten a ten termín") a zavrieť ju klikom na
Vybavené. Ticho by ho pripravilo o informáciu, že sa človek vracia. 

**Ale nie všade rovnako.** „Prestal chodiť" sa pri termíne NEZOBRAZÍ vôbec.
Najprv som k nemu termín dopísal a vzniklo „14 dní bez tréningu — termín má
po 31. 8.", čo si protirečí a navyše hovorí to isté, čo Jerryho vlastný záver
o dovolenke. Rozdiel je v tom, čia je to veta: **záver je Jerryho poznámka**
a tam sa termín dopisuje, lebo je to odpoveď na otázku, ktorú si sám položil.
**„Prestal chodiť" je pravidlo appky** — a to má mlčať, keď nemá čo povedať.
Kto má termín v kalendári, neprestal chodiť; má pauzu.

**Pravidlo:** každá pripomienka, ktorá posiela človeka NIEČO UROBIŤ, musí
najprv overiť, či to už nie je urobené. **Výnimka (9. 10. 2026): „pripomeň mi" + deň
je výslovná pripomienka a príde v ten deň vždy** — kalendár ju neumlčí
(Panagiotis chcel termín pre KOLEGU, jeho vlastný tréning 22. 10. by ju
zamlčal). Zápis z denníka s „pripomeň" nesie pôvodnú vetu v `preco`;
`zaverUzMaTermin` hľadá „pripom" v zaver/preco/overit. Falošný poplach je horší než
zmeškaný, lebo podľa neho sa koná — a druhá strana to vidí.

## naostro.sh vidí závery — odkedy sa umlčujú notifikácie

Doplnené 31. 8. 2026 (predtým `jarvis_zavery` nesťahovalo a celá kategória
„Čas overiť rozhodnutie" bola pre kontrolu neviditeľná). Bolo to nutné v tej
istej chvíli, keď otvorený záver začal UMLČIAVAŤ notifikácie o klientovi
(`zaverKryjeKlienta`): bez záverov by kontrola nad ostrými dátami hlásila ako
otvorené to, čo Jerry s Jarvisom už vyriešil, a rozišla by sa s obrazovkou.

Skript ťahá aj `poplatky` — a preto v ňom stojí kontrola, či každý poplatok
sedí na známeho klienta. Pravidlo: **keď pribudne tabuľka, ktorá vstupuje do
registra alebo do notifikácií, pridaj ju do `naostro.sh` v tom istom kroku.**

## Zaseknutý PWA shell = biela obrazovka, nie chyba servera

11. 9. 2026: „Kokpit nefunguje" — v Safari fungoval, v PWA na ploche biela
obrazovka. Server, SSR, D1, všetkých 30 assetov: v poriadku. Príčina: nasadenie
vymení hashované `index-<hash>.js` a staré ZMAŽE; iOS si pri PWA drží STARÝ
`index.html`, ktorý žiada starý hash → 404 → nespustí sa JS → biela. Appka sa
ani nenaštartuje, takže pás „nová verzia" nepomôže.

**Riešenie v kóde:** `lib/psb/samoliecenie.ts` + routa `routes/assets/$.ts`.
Na worker padnú len CHÝBAJÚCE assety (`not_found_handling: "none"`); chýbajúci
`*.js` sa vráti ako **200 + skript**, ktorý appku presmeruje na `?v=<čas>` →
čerstvý shell (`no-cache`) → nový bundle. 404-ový module script by sa
nevykonal, preto 200. Poistka: jeden reload za minútu (sessionStorage).

**Diagnostický postup pri „nefunguje":** najprv `curl` shell + assety + API
(401 = žije, 5xx = padá), potom **„funguje to v Safari?"** — ak áno, je to
zariadenie/PWA, nie appka. Nepúšťaj sa do lovu v kóde skôr, než vylúčiš keš.
A `naostro.sh` vie spadnúť na rate-limite wranglera (stlmený stderr) —
prechodná chyba nástroja nie je nález; zopakuj beh.

**Druhá vrstva (9. 10. 2026):** keď appka už beží a pri prechode pýta chunk,
ktorý nasadenie zmazalo, spadne do koreňovej hranice („This page didn't
load"). `ErrorComponent` v `__root.tsx` pri chybe načítania modulu appku sám
tvrdo obnoví (raz za 30 s) a každú inú chybu zapíše cez
`/api/chyba-prehliadaca` do `vzas_audit` (action `chyba-prehliadaca`: správa,
stack, adresa, šírka, prehliadač). **Pri „spadlo mi to na telefóne" sa
najprv pozri tam** — predtým o chybe vedela len obrazovka telefónu.

## Export bez ID operace zahadzoval rovnaké platby v jeden deň

13. 9. 2026: Jerry nahráva „Pohyby na všech účtech" namiesto „Výpisu z účtu".
Formát parser čítal správne — ale export **nemá stĺpec ID operace**, takže
kľúč bol `dátum|suma|protistrana`. Jerry si posiela výplatu po častiach, a dve
„Jerry vyplata −1500" v jeden deň mali ten istý kľúč; `INSERT OR IGNORE` na
unikátnom `dedup_key` druhú **ticho zahodil**. V jednom súbore 3 kolízie =
5 000 Kč výplat preč a dlh by vyšiel o toľko lepší.

**Oprava:** `ocislujDuplicity` v `fio.ts` očísluje druhý a ďalší rovnaký pohyb
bez ID (`#2`, `#3`) podľa poradia v súbore — stabilné aj pri znovunahratí a pri
dlhšom prekrývajúcom sa exporte. Prvý výskyt má kľúč PRESNE ako predtým (v DB
bolo 22 takých riadkov). Kľúč má **jednu definíciu** `fioKluc`; server aj
`pohybSplit.pohybKluc` ju volajú. Testy v `fio.test.ts` na presnom tvare exportu.

**Čo tento export stále nevie:** (1) nemá „Koncový stav účtu", takže stav účtu
v Rezerve sa z neho neaktualizuje; (2) pre ten istý mesiac NEMIEŠAJ oba typy
exportu — pohyb z Výpisu má kľúč `fio:<id>`, z Pohybov `dátum|suma|…`, a
naimportoval by sa dvakrát.

## „Kalendár odpojený" = worker zomrel, nie adresa

13. 9. 2026 Jerry: „to ich fakt musím pripájať raz za 1,5 týždňa?" Nie —
adresy boli platné (HTTP 200). Jerryho kalendár (2,6 MB) zabíjal worker na
CPU: `posunMinut` staval `new Intl.DateTimeFormat` pri každom čase v súbore
(78 % CPU v profile). A cron vyberal zdroj podľa posledného ÚSPECHU, takže
padajúci kalendár si vybral každý beh — tri dni sa nestiahol ani jeden.

Tri pravidlá, ktoré z toho platia:
- **Drahý objekt (Intl, RegExp s flagmi, formátovač) nestav v slučke nad
  súborom.** Parser si formátovač drží a posun pásma pamätá po hodinách.
- **Rotácia podľa pokusu, nie úspechu** (`vyberZdroj` v `kalendarZdroje.ts`)
  — inak jeden padajúci zdroj zablokuje všetky ostatné.
- **Pokus sa zapíše PRED ťažkou prácou** (`kal_snimky`, `chyba` začína
  „nedokončené"); úspech/chyba ho prepíše. Neprepísaný pokus starší než
  2 min je na obrazovke chyba (`chybaZdroja`), nie zelené „pripojený".

Zmena parsera sa overuje porovnaním starej a novej verzie na REÁLNYCH
súboroch v rôznych oknách (vrátane prelomov letného času) — výstup musí
byť zhodný do znaku. Syntetické testy sú v `ical.test.ts`.

## Dlaždica bez zoznamu zhodí celú appku, nielen svoju kartu

20. 9. 2026: do karty reklamy pribudla dlaždica „Cena za dopyt" a zoznam
riadkov k nej nie. `zoznamy[kluc]` bolo `undefined`, `z.riadky.length`
vyhodilo výnimku — a koreňová hranica TanStacku zhasla CELÝ Kokpit. Jerry
videl „This page didn't load" na všetkom, nie na jednej karte. Worker pritom
bežal (HTTP 200, assety 200); príčina bola v prehliadači a poznať ju bolo len
z konzoly.

- **Index do `Record<string, …>` TypeScript nekontroluje.** Nový kľúč pre
  existujúcu mapu je rovnako nebezpečný ako chýbajúci stĺpec v INSERTe.
  Stráži to `Reklama.test.ts` — porovná kľúče v `stat("…")` s kľúčmi v
  `zoznamy`.
- **Komponent, ktorý číta z mapy podľa kľúča, musí mať pád nabok**
  (`zoznamy[kluc] ?? { nadpis: label, riadky: [] }`). Prázdny zoznam je
  zrozumiteľná strata, biela stránka nie.
- **Diagnostika „appka nejde":** `curl` shell + assety (ak sú 200, server
  žije) → konzola prehliadača. Do konzoly sa dá pozrieť aj cez Chrome
  s Jerryho prihlásením, netreba ho o nič prosiť.

## Schránka info@ je tretí zdroj dopytov

Formulár na webe posiela dopyt sám, ale kto napíše rovno mailom, do
štatistiky nespadol. 21. 9. 2026 prvý ostrý beh ukázal, že to nie je teória:
v schránke ležal **test postury Josefa Pávka z 13. 9.**, ktorý snippet
na webe stratil a v Kokpite nebol vôbec.

- **IMAP z workera ide len na `imap.m1.websupport.sk` (alebo
  `mail.m1.websupport.sk`).** `imap.websupport.sk` sa spojí a povie
  „Dovecot ready", ale schránka na ňom NIE JE — vráti
  `[AUTHENTICATIONFAILED]`, čo vyzerá ako zlé heslo. Ktorý stroj je ten
  pravý, povie SPF domény (`include:_spf.m1.websupport.sk`) a IP adresa
  `mail.<doména>`. `mail.prosapiens.cz` samo o sebe TLS nedokončí
  („Stream was cancelled" — certifikát znie na websupport).
- **Knižnice z npm sem nejdú** (bežia nad `net`/`tls` z Node). Klient je
  vlastný, nad `cloudflare:sockets`, a robí len čítanie: `BODY.PEEK`, žiadne
  mazanie, žiadne označovanie prečítaného.
- **Čisté rozobratie odpovede je v `imapParse.ts`**, socket v `imap.ts` —
  `cloudflare:sockets` sa pod bunom nenačíta a testy by celý súbor nevideli.
- **`BODY[TEXT]` je celá MIME zásielka**, nie text: oddeľovače `--b1=…`,
  hlavičky dielov a telo často v base64. Prvá verzia to brala ako reťazec
  a z dopytu Josefa Pávka spravila poznámku „--b1=_l6zOgx… NOV? TEST
  POSTURY… Jm?no". Diel sa vyberá podľa `Content-Type` a dekóduje podľa
  `Content-Transfer-Encoding`; preklad z bajtov len tam, kde sú `=XX`.
- **Contact Form 7 posiela mail Z ADRESY WEBU** (`online@prosapiens.cz`)
  a pisateľa dáva do **Reply-To**. Bez toho vznikol z Hany Marko druhý dopyt
  pomenovaný „online@prosapiens.cz" vedľa jej vlastného zo snippetu. Preto
  sa ťahá aj hlavička Reply-To a pošta z vlastnej domény sa inak nezapisuje.
- **„Vyzerá to ako formulár" sa musí DOKÁZAŤ.** Keď stačilo slovo
  „prosapiens" kdekoľvek v texte, prešli tadiaľ dva studené obchodné maily —
  správa označená za formulár totiž obchádza celý filter. Formulár = z našej
  domény + šablóna alebo pomenované polia.
- **Studená obchodná pošta sa zahadzuje a bežná pošta musí niečo CHCIEŤ**
  (slová o tréningu, bolesti, termíne, cene). Falošný dopyt pokazí cenu za
  dopyt skôr, než si ho niekto všimne; falošné preskočenie je vidieť
  v zozname „Čo sa nezapísalo".
- **Počty musia dať súčet.** `prečítaných = nových + doplnených + už
  evidovaných + preskočených`; bez „už evidovaných" to vyzeralo, akoby sa
  po ceste strácali správy.

## Offline členstvá PTminder vyváža ako 0/0 — zostatok sa dopočítava

21. 9. 2026 Jerry: „Gažo mi ukazuje 0 a pritom má 5 hodín ešte." Jeho
„OFF - 18 hodín offline" je v PTminderi ČLENSTVO a v exporte stojí na
`0 left from 0` — rovnako ako paušál GOLD. Počet hodín je pritom priamo
v názve, takže nula nie je pravda o produkte, je to chýbajúci údaj. Týkalo sa
to **14 balíčkov u 11 klientov** (celá rodina „OFF - …"), takže appka hlásila
„balíček došiel" skoro každému offline klientovi.

- **Keď export mlčí (0/0) a v názve je počet hodín, zostatok sa dopočíta:**
  hodiny z názvu mínus tréningy v platnosti balíčka (`deriveClients`).
- **Dopočítané číslo sa musí PRIZNAŤ.** `packageOdvodeny` → obrazovky píšu
  „≈4/18", profil povie prečo, denná pripomienka dodá „(dopočítané —
  over v PTminderi)". Odhad, ktorý sa tvári ako výpis, je horší než chýbajúce
  číslo — Jerry ho hovorí klientovi nahlas.
- **Dopočet je presný na ±1 hodinu a viac sa z exportu vytiahnuť nedá.**
  Jerry to vysvetlil 21. 9.: „platí 18 h na 6 mesiacov, ale minie ich skôr,
  takže má akoby dve členstvá — na jednom 0, na druhom 5." V deň prekryvu
  (u Gaža 24. 7.) sa z dát nezistí, ktorému z nich PTminder hodinu strhol.
  Platby to potvrdzujú: druhé členstvo má `valid_from` 24. 7., ale zaplatené
  bolo až 7. a 17. 8.
- **Preto kotva, nie lepší odhad.** `client_overrides.balicek_zostatok`
  + `balicek_k_datumu`: Jerry raz odpíše, čo ukazuje PTminder, a appka od
  toho čísla odpočítava ďalšie tréningy (`deriveClients`). Dátum zapisuje
  SERVER spolu s číslom (`/api/override`) — hodnota bez dňa je bezcenná
  a zabudnúť sa na ňu nesmie dať. Nastaviť to vie aj Jarvis
  („Gažo má v PTminderi 5 hodín" → set-override `balicekZostatok`).

## Poštový server vie odmietnuť správne heslo — aj pri ODOSIELANÍ

Beh importu mailu o 6:00 spadol na `[AUTHENTICATIONFAILED]`, ten o 6:46 prešiel
bez akejkoľvek zmeny — Dovecot po sérii prihlásení chvíľu odmieta. Preto sa
vedľa posledného behu drží aj posledný ÚSPEŠNÝ (`mail_stav_ok`) a panel pri
chybe povie, kedy sa naposledy čítalo. Jedna chyba nie je rozbité napojenie;
to je tá istá lekcia ako pri kalendári.

**Platí to aj pre SMTP a zle som to prečítal.** 27. 9. 2026 nešla faktúra
Martinovi Vaškovi na `535 5.7.8 authentication failed`. Vyhlásil som, že heslo
je zmenené, a poslal Jerryho prepisovať ho — pritom tá istá faktúra o
JEDENÁSŤ MINÚT neskôr odišla s tým istým heslom (v `vzas_audit` stojí
`faktura-mail-zlyhal 14:55:28` a `faktura-odoslana-mailom 15:06:30`, dĺžka
`mail_heslo` sa nezmenila). Diagnostika, ktorú som spravil, bola správna —
uložené heslo je čisté, kódovanie sedí, adresa servera sedí — ale záver
z nej nie. **Keď sú všetky vstupy v poriadku a server odmieta, prvá odpoveď
je „skús znova", nie „zmeň heslo".** Hláška v appke to odvtedy hovorí v tomto
poradí.

**Keď mail odíde, ale nedorazí, kópiu v schránke už NEMÁME.** Faktúry a výpisy
chodili BCC na `info@prosapiens.cz`; Jerry to 28. 9. 2026 zrušil („plní nám to
mailovú schránku" — je to tá istá schránka, z ktorej Kokpit číta dopyty).
Mechanizmus (`kopiaSkryta` v `mime.ts`) zostáva, len ho nikto nepoužíva.

Stopa je odteraz v appke: `vydane_faktury.odoslane_at` a `odoslane_komu`
(vidno ich pri riadku faktúry) plus záznam v `vzas_audit`. Čo z nej nezistíš,
je telo správy — to sa dá zložiť znova, lebo text skladá appka. Pri „klientovi
mail nedorazil" tak zostávajú tri kroky: 1. je v audite `faktura-mail-zlyhal`?
2. sedí adresa v `odoslane_komu` na znak? 3. nech sa pozrie do spamu. DNS je
v poriadku: SPF má `include:_spf.m1.websupport.sk`, DKIM je pod selektorom
`mail`, DMARC je `p=none`.

## Pripomienka na dopyt patrí do deriveRegister, nie vedľa neho

21. 9. 2026: „notifikáciu pre Terezku, že v schránke je nový mail — treba
odpísať." Prvý inštinkt bol pridať to k `dopyt|nevyriesene`
v `nezapisaneDoRegistra`. Bola by to slepá ulička: **push číta
`deriveRegister`, nie `nezapisaneDoRegistra` ani `pripomienkySlubov`** — tie
dve sa skladajú až v `App.tsx`, takže ich položky žijú len na obrazovke
a na telefón sa nikdy nedostanú.

Pravidlo: keď má nová pripomienka dôjsť aj na telefón, patrí do
`deriveRegister` (`add(...)` s `kto: { trener }`). Overenie, komu sa ukáže,
robí `./scripts/naostro.sh` v sekcii „KOMU SA NOTIFIKÁCIA UKÁŽE".

## Porovnanie s priemerom musí počítať s krátkou históriou

21. 9. 2026 Jerry: „skontroluj, či tie štatistiky v profile klienta fungujú
správne." Priemery sedeli, ale dve zo štyroch čísel klamali pri nováčikoch —
a klamali o rád:

- **Tempo** delilo sedenia z 90 dní vždy TROMI mesiacmi. Dominika Križova
  (chodí 6 dní) tak mala 0,3 sedenia mesačne namiesto 2,0; Albert Matl 0,7
  namiesto 4,0. Vedľa priemeru 3,4 vyzerali obaja ako ľudia, ktorí prestali
  chodiť — čo je presne opačná informácia. Týkalo sa to 12 zo 66 aktívnych.
  Oprava: delí sa počtom mesiacov, ktoré klient NAOZAJ chodí, najviac tromi
  a najmenej pol mesiaca (`tempoMesacne` v `lib/psb/profil.ts`).
- **Dochádzka** má menovateľ `max(6, týždne histórie)`, takže dvojtýždňový
  klient má strop 33 % a jednotýždňový 17 %. Pod šesť týždňov sa preto
  neporovnáva vôbec — namiesto stĺpca je veta, koľko týždňov chodí.
- **„Zaplatené celkovo"** neporovnávalo hodnotu klienta, ale dĺžku vzťahu
  (Knapčok 51 934 Kč za 20 mesiacov = 2 520 Kč mesačne, Gažo 118 797 =
  7 157 Kč mesačne). Stĺpec je odteraz **mesačný**; celková suma zostáva ako
  dlaždica.

Pravidlo: **každé porovnanie dvoch klientov musí byť normalizované na čas** —
inak meria, kto je dlhšie, nie kto je lepší. A keď sa normalizovať nedá
(dochádzka v pevnom okne), radšej mlč než ukáž stĺpec.

Druhé kolo kontroly (tie isté dáta, zvyšok dlaždíc) našlo ešte tri veci —
všetky z rodiny „dve miesta, dve pravdy":

- **„Posledné" čítalo len export.** Janka šnirychova mala v profile
  „11. 8. (41 d)", hoci 17. 9. na tréningu bola — appka o tom vedela
  z kalendára a o pár centimetrov vedľa hlásila „tréning nie je v PTminderi".
  Profil teraz berie `poslednyTrening` (kalendár + export), rovnako ako
  notifikácie, a keď dátum pochádza z kalendára, povie to v bublinke.
- **„Koho priviedol" páruje meno cez `===`.** Dominika Križova odporučila
  Lukáša Kríža, ale v poli odporúčateľa stálo „Dominika Krížova" — jeden
  dĺžeň, a odporúčanie (36 390 Kč tržby) sa v profile nezobrazilo vôbec.
  Páruje sa cez `najdiKlienta`, ako všade inde. Z 61 odporúčaní bolo takto
  stratené jedno; ďalších osem sú ľudia mimo klientely („Masérka z BestGym"),
  čo je v poriadku.
- **Okno „90 dní" sa hýbalo podľa hodiny.** Sedenia majú v dátume polnoc,
  takže tréning presne na hranici vypadol podľa toho, kedy si profil otvoril
  (Janka 0,7 namiesto 1,0). Porovnáva sa po dňoch.

## Jedno meno v kalendári môže sedieť na dvoch klientov

22. 9. 2026: v Terezkinom kalendári stojí „Marketa" a v štúdiu sú dve —
Resnerová (vždy 8:30) a Lozias (11:00, 14:00, 17:00, 18:00). `kal_mapovanie`
malo kľúč `(nazov, trener)`, takže meno mohlo patriť len jednej: **šesť
tréningov Resnerovej sa pripísalo Lozias** — aj s tempom, dochádzkou
a zostatkom balíčka. Vyzeralo to ako „chýbajúce tréningy v kalendári",
pritom tam boli celý čas.

- **Krstné meno nie je identita.** V PSB má 18 krstných mien viac než jedného
  klienta (Tomáš štyria, Martin a Jakub traja) a 13 z nich má viac klientov
  AKTÍVNYCH. Pri takom mene sa appka nesmie rozhodnúť sama.
- **Mapovanie má čas** (`kal_mapovanie.cas`, migrácia 0068): presný čas
  vyhráva nad všeobecným, prázdny platí pre všetky hodiny. Funkcie sú
  v `lib/psb/kalendarMena.ts` s testami.
- **Staré mapovanie nie je rozhodnutie.** Vzniklo vtedy, keď appka
  o dvojznačnosti mlčala — preto `vedome` (migrácia 0069): za vyriešené sa
  počíta len mapovanie na čas alebo potvrdenie z karty „Jedno meno, viac
  klientov", kde je dvojica vidieť.
- **Kontrola, ktorá to odhalí:** udalosť z kalendára, ktorej priradený klient
  v ten deň v PTminderi nie je — a **MUSÍ mať `zmizla_at IS NULL`**. Bez toho
  filtra hlási aj zrušené tréningy (v tabuľke zostávajú ako stopa po zmiznutej
  udalosti) a z 321 živých udalostí vyrobí vyše sto „nesedí". Takto som sa
  22. 9. sám vyplašil, že kalendár nesedí v pätine prípadov.
- **Zmerané 22. 9. 2026 po priradení mien** (1. 8. – 20. 9., pokiaľ siaha
  export): 321 živých udalostí, **1 bez sedenia v PTminderi**; opačne
  **4 z 339 sedení** bez udalosti v kalendári — a dve z nich sú z 3. a 5. 8.,
  teda spred pripojenia kalendárov (8. 8.). Kalendár je dosť presný na to,
  aby niesol dochádzku.
## Platby: banka z výpisu, hotovosť zo zošita

Tretia tretina odchodu od PTmindera (migrácia 0071, `lib/psb/platbyEvidencia.ts`,
karta „Platby — vlastná evidencia"). Jerry, 22. 9. 2026: „platby by ťahal
z výpisu banky a hotovosť stále zo zošita, tam sa nič nemení."

- **Komu platba patrí, sa nedá čítať z jedného poľa.** Fio dáva v
  `counterparty` zlepenec „správa · odosielateľ" a klient je raz v jednej
  polovici, raz v druhej, raz nikde:
  „Prosapiens 18h · Natália Pecková" (klient platí sám),
  „Josef snyrich · Filip Stráňavský" (platí niekto iný, klient je v správe),
  „20260035 MGR. FILIP STRANAVSKY · Ing. BARBORA VANKOVÁ" (naša faktúra),
  „Vklad do bankomatu" (nie je to platba klienta vôbec).
  Preto sa hľadá PRIEZVISKO kdekoľvek v celom texte — jediná časť mena, ktorá
  v bankovom zápise prežije skratky aj poradie. Tokenu stačí priezviskom
  začínať a byť najviac o tri písmená dlhší (prechyľovanie: „Dvořákové"),
  a y/i sa nerozlišuje („snyrich"/„šnirych").
- **Priezviská kratšie než štyri písmená sa nehľadajú** — „Kral" by sadol na
  pol výpisu.
- **Pri kolízii sa nevyberie nikto** (Richard Matl verzus Katerina Matlová).
  Zle priradená platba je horšia než nepriradená: pokazí tržbu klienta aj
  jeho históriu a nikto to nezbadá, lebo súčet v banke sedí.
- **Nenalieva sa hromadne, na rozdiel od balíčkov.** V exporte balíčkov klient
  STOJÍ, vo výpise nie. Hromadné naliatie by rozdalo peniaze cudzím ľuďom.
  Appka navrhne, človek potvrdí — a odosielateľ sa zapamätá
  (`platba_mapovanie`), takže ten istý platiteľ sa pýta raz. Vzor je LEN
  odosielateľ, nie celá správa: tá nesie číslo faktúry a mesiac a nikdy by sa
  nechytila druhý raz.
- **Vlastný vklad hotovosti do bankomatu sa preskakuje.** Tie peniaze sú už
  v zošite a v banke by sa započítali druhýkrát.
- **Porovnáva sa po MESIACOCH, nie po platbách.** Jedna platba v banke môže
  v PTminderi stáť ako dve (balíček aj doplatok jedným prevodom). Mesačný
  súčet je to, čo musí sedieť, a aj to, z čoho appka počíta tržby.
- **Kým čaká front nepriradených, rozdiel sa NEUKAZUJE.** Prvé spustenie
  hlásilo −209 867 Kč, čo meralo len to, koľko práce zostáva. Červené číslo,
  ktoré nič nehovorí, je horšie než žiadne.

- **Naučí sa LEN platiteľ, v ktorom stojí priezvisko klienta**
  (`smieSaZapamatat`). Bez toho by sa pravidlo naučilo zo sprostredkovaného
  prevodu („Josef snyrich · Filip Stráňavský" posiela Jerry sám) a odvtedy by
  appka každý jeho prevod ponúkala ako platbu toho klienta. Pri 113 ostrých
  priradeniach sa takto zapamätalo 50 platiteľov a 63 sa zámerne nezapamätalo.
- **Súbežný chod sa súdi až od zvoleného mesiaca** (`vzas_settings.platby_od`,
  predvolene bežný mesiac). Bankové platby sa dajú doplniť spätne z výpisu,
  HOTOVOSŤ nie — tá je v zošite a nikto ju rok dozadu prepisovať nebude.
  V starších mesiacoch by rozdiel ukazoval chýbajúcu hotovosť, nie chybu,
  a cieľ „rozdiel nula" by bol nedosiahnuteľný. Staršie bankové platby
  v evidencii zostávajú, len sa nesúdia.

Zmerané pri spustení (234 príjmov vo výpise od 1/2026): 121 jednoznačných
návrhov, 25 s viacerými možnosťami, 88 bez návrhu. **Z tých 121 ich PTminder
potvrdil 118** (klient má platbu do 10 dní) a pri 113 sedí aj suma do 2 %.
Tých 113 je priradených (666 247 Kč); zvyšok zostáva na človeku — sú to
peniaze a pri kolízii sa hádať nesmie.

## Záložka sa zlučuje nápisom, nie `id`

22. 9. 2026 sa Klienti, Peniaze a Výsledky zliali do jednej záložky **Firma**
(Jerry: „napadá ťa pod tie tri spoločný menovateľ?" — je: v žiadnej z nich sa
nič nevypĺňa, sú to tri pohľady na to isté z inej vzdialenosti). Zlúčenie
NEPREPÍSALO smerovanie:

- **`id` `tracker`, `vzas`, `mesiac` zostali.** Visia na nich adresy
  (`#vzas/pnl`), ciele rituálov, odkazy z registra aj Jarvisove ⟦odkazy⟧
  a kontrolujú sa proti `TABS`. Preto TABS drží všetky tri ďalej a nesie na
  nich len značku `skupina: "firma"`; rad záložiek ich zastúpi jedným
  tlačidlom na mieste tej prvej a `active` je ďalej jedno z tých troch.
  Vďaka tomu funguje `setActive("vzas")` odkiaľkoľvek bez zmeny.
- **Riadok sekcií je PLOCHÝ.** „Tréningy" a „Klienti" boli o úroveň nižšie,
  vnútri Klientov; po zlúčení by z toho boli tri úrovne (Firma → Klienti →
  Tréningy). Štyri tlačidlá v jednom rade (`FIRMA_SEKCIE`) sú o úroveň menej.
- **Posledná sekcia sa pamätá** (`firmaSub`) a dopĺňa sa aj pri príchode
  zboku (odkaz, adresa, Jarvis) — inak by tlačidlo Firma hádzalo človeka inam,
  než kde naposledy skončil. Pri uzávierke chodí do Peňazí.
- **Nápis hlavnej obrazovky je „Dnes", nie „Kokpit".** Appka sa volá Kokpit
  celá; hlavná obrazovka je zoznam toho, čo dnes čaká. `id` zostáva
  `dashboard`. Pri premenovaní treba prejsť aj vety, ktoré na ňu ukazujú —
  „dlaždica Rezerva na Kokpite" v `aiContext` by inak posielala na záložku,
  ktorá sa tak už nevolá.

## Beta: ten istý kód, iné meno workera — `./scripts/beta.sh`

Jerry, 23. 9. 2026: „vedel by si postaviť niečo ako beta verziu Kokpitu, kde
by sme mohli testovať rôzne návrhy?" Beží na
`kokpit-beta.prosapiensbio.workers.dev`.

- **Žiadny druhý config.** `wrangler.jsonc` zostáva jediný (pravidlo z 25. 8.
  2026); meno workera sa prepisuje parametrom `--name kokpit-beta`. Jeden
  config, dva ciele — druhý súbor by raz začal tvrdiť, že nasadzovací je on.
- **TÁ ISTÁ DATABÁZA.** Oddelená kópia by znamenala skúšanie na starých
  číslach a stratilo by to zmysel. Preto červený pruh — a je aj na
  PRIHLASOVACEJ obrazovke: človek inak zadá heslo v domnení, že je v ostrom
  Kokpite, a skúša na ostrých dátach bez toho, aby to vedel.
- **Beta sa pozná z ADRESY** (`lib/psb/beta.ts`), nie z premennej prostredia.
  Premenná by sa raz pri nasadení zabudla a beta bez pruhu je horšia než
  žiadna beta.
- **Skúšané obrazovky sa zapínajú `jeBeta()`**, nie vetvou v gite. Vetva by
  sa rozišla s hlavnou a zlučovanie by trvalo dlhšie než samotná skúška;
  takto je v ostrom Kokpite ten istý kód, len bez tlačidla. Prvá taká
  obrazovka je **Workspace** (kopa kariet, `workspaceKarty.ts`).
- **Prihlásenie je per adresa.** Session cookie ostrého Kokpitu na bete
  neplatí — do bety sa treba prihlásiť zvlášť.

Pri workspace platia tri pravidlá, bez ktorých je kopa kariet horšia než
zoznam: vidno, koľko toho ešte je; vybavený riadok zmizne, ale počet
vybavených je vidieť; a postupy na dvadsať minút (uzávierka, nahrávanie
exportov) medzi karty nepatria — karta z nich je len dvere inam a kopa by sa
tvárila dlhšia než práca.

**Karta je KATEGÓRIA, nie položka.** Prvá verzia dávala jednu kartu na jednu
vec a z troch zmien v kalendári boli tri karty. Jerry po skúške v bete
(23. 9. 2026): „na tých kartách som si predstavoval celé kategórie, nie že
klienti jeden po druhom, ale zmeny kalendára v jednom." Focus nie je „teraz
riešim Martina", ale „teraz robím zmeny v kalendári" — jeden druh práce
naraz, lebo hlava sa neprepína.

**Session nesie `users.name`, nie login.** `ktoSom` je „Jerry" s veľkým J
(z tabuľky `users`), nie „jerry". Porovnanie s malými písmenami nesedí nikdy
— a je to tichá chyba: nič nespadne, filter len prepustí všetko. Takto Jerry
videl aj Terezkine veci a poradie skupín v karte „Nové názvy" sa podľa
prihláseného nikdy neriadilo. Jedna definícia je
`trenerZPrihlasenia` vo `workspaceKarty.ts` a porovnáva bez ohľadu na
veľkosť písmen.

**Karta patrí prihlásenému.** Zmeny a názvy majú trénera v sebe; peniaze ho
nemajú a sú Jerryho, rovnako ako mesačné kontroly a stav hotovosti (pravidlo
z 31. 8. 2026). Terezka teda vidí dve karty, Jerry tri.

## Ručná pauza je tvrdenie o budúcnosti — tréning ju vyvráti

23. 9. 2026 malo **trinásť klientov ručne nastavenú „Pauzu" a odvtedy
trénovali**. Anetka Přinosilová od 4. 8. trikrát a ešte aj zaplatila
21 150 Kč; appka ju celý čas viedla ako pauzu, takže o nej mlčali aj
notifikácie. Ručný stav je snímka a nikdy nevyprší — nikto ho nechodí rušiť.

Jerry: „malo by to byť automaticky — keď klient príde na tréning, ten deň sa
mu pauza zruší, a keď to niekto prenastaví a on zase príde, znovu sa to
zmení." Je to v `deriveClients`:

- **„Pauza|2026-08-27"** je dohoda na konkrétny čas. Tréning POČAS nej je
  výnimka a pauzu nechá bežať; tréning PO nej ju ruší. Inak by sa dohoda
  zmazala prvou výnimkou.
- **Holá „Pauza"** padne ktorýmkoľvek tréningom po dni, keď sa zapísala.
  Preto musel `updated_at` prejsť z `client_overrides` až do `ClientOverride`
  — bez neho nie je odkiaľ merať a kontrola by ticho nikdy nezabrala.
- **„Neaktívny" sa tréningom NERUŠÍ.** Je to rozhodnutie o konci vzťahu, nie
  tvrdenie o budúcom týždni; tam sa appka spýta a rozhodne človek.
- Po zrušení `statusOverride` prestáva platiť — inak by obrazovky tvrdili
  „nastavené rukou", hoci rozhoduje appka. `pauzaZrusenaTreningom` to povie
  nahlas, aby sa človek nedivil, kam sa podel stav, ktorý zapísal.

Zovšeobecnenie: **ručný zápis, ktorý hovorí o budúcnosti, potrebuje dátum
alebo udalosť, ktorá ho ukončí.** Bez toho žije večne a appka podľa neho
mlčí o veciach, ktoré sa dávno zmenili.

## Celý reťazec jedným príkazom: `./scripts/hotovo.sh`

Jerry, 22. 9. 2026: „postav testera, kontrolóra, nasadzovača — a ty mi len
napíš, keď to bude celé hotové." Kúsky existovali (`bun run test`,
`nasad.sh`, `naostro.sh`), ale spúšťali sa ručne a v rôznom poradí, takže sa
dalo nasadiť bez toho, aby niekto overil, či appka naživo vôbec beží.

Poradie je zámer: **typy → testy → nasadenie → naživo → ostré dáta.**
Kontrola naživo je AŽ PO nasadení — pred ním by merala starú verziu. Overuje
tri veci cez HTTP: shell 200, čerstvý `index-*.js` z `dist/client/assets`
200 (to je jediný spôsob, ako zistiť, že wrangler assety naozaj nahral)
a `/api/*` bez prihlásenia 401. Dvestovka na API by nebola úspech, ale diera.

`--bez-nasadenia` pustí len kontroly. Návratový kód je 0 len vtedy, keď
prešlo všetko.

Dve pasce, na ktoré skript naráža a ktoré platia pre každý shell v tomto repe:
- **`printf %-22s` aj `${#retazec}` počítajú BAJTY** (bash 3.2 na macOS), tak
  sa stĺpec pri „ostré dáta" rozsypal. Znaky = bajty mínus pokračovacie
  bajty UTF-8.
- **`cut -c` krája po bajtoch** a z rámčekov v `naostro.sh` robilo kašu.
  Posledný riadok sa preto neoreže.

## Balíčky majú vlastnú evidenciu, nielen export

Druhá polovica odchodu od PTmindera (tabuľka `balicky`, migrácia 0070,
`lib/psb/balickyEvidencia.ts`, karta „Balíčky — vlastná evidencia").
Dochádzku vypnúť samostatne NEJDE: keď Jerry prestane zapisovať tréningy do
PTmindera, prestanú tam klesať hodiny a zostatky z exportu sa stanú
nepravdou.

- **Záznam v knihe, nie snímka.** `balicky` drží to, čo sa PREDALO; zostatok
  je odvodenina (predané mínus odtrénované podľa kalendára). Uložený zostatok
  by po prvom tréningu klamal.
- **Štart bez prepisovania.** Akcia `nalej` založí riadky z aktuálneho
  exportu; `ptminder_id` je unikátne, takže opakované spustenie nič nezdvojí.
  Bez toho by súbežný chod znamenal prepísať ručne päťdesiat členstiev —
  presne tú administratívu, ktorej sa má Jerry zbaviť.
- **Porovnáva sa po KLIENTOVI, nie po balíčku.** Pri dvoch balíčkoch cez seba
  (Gažo) sa nedá povedať, ktorému PTminder hodinu strhol; súčet je
  jednoznačný, kus nie.
- **Porovnáva sa K DÁTUMU EXPORTU.** Prvé ostré porovnanie hlásilo 59
  rozdielov a takmer všetky boli −1 h: export bol z 20. 9. a Kokpit rátal aj
  tréningy z 21.–22. 9. Meralo to vek súboru, nie zhodu.
- **Doplnenie členstva nemá v exporte dátumy.** Zahodiť sa nedá (Tomáš Krčmar
  68 h, Jaroslav Broskva 50 h), dopočítať minulosť tiež nie. Preberá sa ako
  OTVÁRACIA POLOŽKA k dňu exportu — to jediné, čo taký riadok naozaj hovorí.
  Riadok s nulovým zostatkom sa preskočí úplne.
- **Prázdny riadok v exporte nie je nález.** PTminder hovorí nulu, Kokpit
  nemá nič — tá istá odpoveď. Bez tejto vetvy karta hlásila 24 „chýbajúcich"
  klientov, ktorým nezostávala ani hodina.

Stav pri spustení 22. 9. 2026: 54 klientov sedí do hodiny, **2 rozdiely**
(Markéta Lozias, Veronika Stoklasková), 11 sa porovnať nedá.

## Súbežný chod potrebuje meradlo, nie druhú tabuľku

Jerry, 22. 9. 2026: „nemohli by sme postaviť spôsob, kde by ešte stále
fungoval PTminder, ale súčasne by tam bola už aj samostatná evidencia,
nejakú dobu by sme používali obe, a keď by to všetko sedelo, PTminder by sme
odstránili?" Áno — a pre dochádzku ten súbežný chod už BEŽÍ od 8. 8. 2026,
len ho nikto nemeral. Chýbalo číslo, nie tabuľka.

`lib/psb/porovnanieDochadzky.ts` (`porovnajTyzdne`) + karta „Vydrží kalendár
sám?" v Kalendári. Pravidlá, ktoré z toho platia pre každý súbežný chod:

- **Dva smery nie sú symetrické.** Sedenie bez udalosti v kalendári je
  RIZIKO (po vypnutí PTmindera by sa stratilo) a rozhoduje. Udalosť bez
  zápisu v PTminderi je len dnešná robota navyše — po vypnutí prestane
  existovať aj otázka. Jedno číslo pre oboje by zamlžilo to dôležité.
- **Okno sa ohraničuje z oboch strán, a zľava PER ZDROJ.** Prvá verzia brala
  začiatok z najstaršej udalosti v tabuľke (26. 7.) a týždne pred pripojením
  kalendárov hlásili stratu troch sedení. Hranica je prvá SNÍMKA daného
  kalendára (`kal_snimky`): Jerry 8. 8., Terezka 9. 8. Sprava je to posledný
  deň exportu — za ním PTminder nemá nič a každá udalosť by bola „prebytok".
- **Kto nemá zdroj, nesmie z porovnania ticho vypadnúť.** Tréner bez
  pripojeného kalendára sa neporovnáva, ale vracia sa ako `bezKalendara` —
  jeho sedenia by sa po vypnutí stratili všetky.
- **Tolerancie sú tie isté ako v `nezapisaneTreningy`** (meno bez diakritiky,
  ±1 deň na presunutú hodinu). Vlastná kópia by sa rozišla a dve obrazovky by
  tvrdili dve veci.
- **Čísla o peniazoch klienta stoja LEN na exporte, a musia to povedať.**
  Dlaždica na karte klienta („nezaplatené X", „zaplatil X") sa počíta
  z PTmindera; platby zapísané v Kokpite sú vo vlastnej tabuľke a nevstupujú
  do nej. Sčítať oba zdroje sa počas súbežného chodu NESMIE — tá istá platba
  príde raz z Fia a raz z exportu a započítala by sa dvakrát. Preto popiska
  hovorí „podľa PTmindera" a pod ňou stojí, koľko je zapísané v Kokpite
  (Jerry, 24. 9. 2026).
  **PO VYPNUTÍ PTMINDERA:** nahradiť to dvoma číslami vedľa seba — Kokpit
  a export — aby bolo vidieť, kde sa rozchádzajú. Dovtedy nie.
- **Do `aiContext` ide hotové číslo zo servera**, nie prepočet:
  `kalendar.udalosti` je okno 21 dní dozadu a Jarvis by odpovedal inak než
  obrazovka.

Stav 22. 9. 2026: 296 sedení, **1 chýba v kalendári** (Lenka Prinosilová
17. 9.), 1 chýba v PTminderi. Šesť celých týždňov 10. 8. – 13. 9. na nule.

## Diera v kalendári nebola diera — bolo to nespoznané meno

22. 9. 2026 som ohlásil, že kalendár v okne 31. 8. – 3. 9. vynechal štrnásť
Terezkiných tréningov, a hľadal príčinu vo výpadku sťahovania. **Bola to
nesprávna diagnóza.** `kal_snimky` ukazujú, že sa v tých dňoch sťahovalo
každý deň a prešlo; tie udalosti boli v databáze celý čas — s `typ` aj
`klient` na NULL, pretože Terezka ich v tých dňoch písala ako **zdrobneninu
krstného mena + iniciálu priezviska** („Peťa B", „Katka S", „Lucka P").

Z toho platia tri veci:

- **Chýbajúci ÚDAJ a chýbajúci ZÁZNAM vyzerajú v dopyte rovnako.** Dopyt na
  `typ IN ('trening','uvodny')` tie riadky nevrátil, takže vyzerali ako
  neexistujúce. Keď niečo „chýba", najprv sa pozri, či to tam nie je
  nepomenované — až potom hľadaj výpadok.
- **Kalendár netreba dopĺňať ďalšou tabuľkou.** Jerryho otázka znela, či by
  proti stratám pomohlo zapisovanie tréningov niekam bokom. Nepomohlo by:
  zápis nechýbal, chýbalo rozpoznanie. Ďalší zoznam by len znamenal písať to
  isté dvakrát.
- **Zoznam, ktorý sa nedá vyčistiť, sa prestane čítať.** Karta „Nové názvy"
  mala 91 položiek, z toho sedemdesiat veterín a poznámok — a preto v nej
  tých štrnásť tréningov ležalo týždne. Má preto dve časti: hore to, kde
  appka niekoho spoznala (alebo aspoň tuší meno), dole zvyšok s jedným
  tlačidlom „toto nie sú tréningy" (`akcia: "mapujVela"`, LEN typ, nikdy
  klient). Čo `vyzeraNaMeno` označí za meno, dole nespadne — inak by jeden
  klik umlčal skutočný tréning.

Pravidlá párovania mena sú v `navrhniKlientaKandidati` (compute.ts): zdrobnenina
sa uvoľňuje LEN cez spoločný začiatok krstného mena a len keď priezvisko sedí
ďalej; y a i sú to isté písmeno („Šnyrychová"/„šnirychova"). Pri dvoch
zhodách sa nevyberie ani jedna. **Návrh nie je zápis** — appka ho predvyplní,
potvrdí ho človek.

- **Dve pravopisné podoby toho istého klienta vyzerajú ako chýbajúci tréning.**
  „Tereza/Terezie Pehalova" a „Tomas/Tomaš Dvořak" boli dva z troch nálezov:
  kalendár si meno vyrobil z názvu udalosti, PTminder má svoje. Pozná sa to
  tak, že ten istý deň je v OBOCH zoznamoch (nesedí aj chýba). Rieši to
  mapovanie názvu na meno z PTminderu, nie prepis riadku — najbližšia
  synchronizácia by ho vrátila.

## Prelepiť nápisy nie je zmena

25. 9. 2026 sa v bete skúšali dve veci a Jerry obe odmietol tou istou vetou:
„len si zmenil v marketingu názvy kategórií, ktoré ale inak ostali rovnaké."
Mal pravdu v oboch prípadoch. Prvá zmena PRESÚVALA kartu preč z obrazovky —
teda absencia, ktorú si nikto nevšimne. Druhá premenovala a preusporiadala
skupiny záložiek tam, kde skupiny boli aj predtým. Ani jedna neubrala ani
jeden klik.

**Meradlo pre každý návrh na „lepšie usporiadanie": o koľko menej práce to
stojí odpoveď na otázku, kvôli ktorej sa obrazovka otvára.** Keď odpoveď
znie „o nič, len to inak vyzerá", nerob to. Obe zmeny sú vrátené.

Čo z toho vzniklo namiesto nich: **Marketing → Prehľad** a **Peniaze →
Prehľad** (`MarketingPrehlad.tsx` / `PeniazePrehlad.tsx`) — nie nové poradie
starých kariet, ale jedna obrazovka, ktorá odpovie bez preklikávania. Jerry
ich v ten istý deň nasadil naostro a sú PRVÉ v oboch záložkách
(`marketingSub` aj `vzasSub` štartujú na `prehlad`).

- **Dlaždica sa nekreslí druhýkrát.** `PristrojeMriezka` v `Prehlad.tsx` je
  tá istá dlaždica ako na Dnes (pásmo, značka „riešiť"/„sledovať", sparkline,
  preklik) — bez registra a kotvy. Druhá kópia by sa o mesiac rozišla.
- **Žiadny nový výpočet.** `krokyZa`, `reklamaSuhrn`, `pnlCalc`,
  `breakEvenRad`, `spocitajRezervu`, `byCommitment`, `salaryCalc`,
  `jarekCalc`. Overené proti D1: nezaplatené 12 / 85 642 Kč.
- **Dve čísla s rovnakým nápisom na jednej obrazovke sa vylučujú.** Vrchný
  pás Marketingu („Cena za dopyt" za bežiaci mesiac, zmiešaná) sa nad
  Prehľadom NEKRESLÍ — Prehľad ju počíta za rok a len z platenej cesty.
- **Diagnóza sa pýta najprv na VSTUP** (`diagnozaLievika`
  v `prehladPasma.ts`). Prvá verzia hlásila „najslabší prechod: úvodný →
  klient (77 %)" a posielala prerábať úvodný tréning, ktorý funguje. Pri
  zdravých prechodoch (oba nad 60 %) je odpoveď iná: lievik drží, chýbajú
  dopyty — 3,6 namiesto 10,5 mesačne.
- **Čísla s opačným znamienkom sa nesčítavajú.** `cumDebt` je kladný, keď
  firma dlží trénerovi, a záporný, keď si tréner vzal viac. Súčet Jerryho
  −107 897 a Terezkiných +34 255 nehovorí nič; preto veta so smerom
  (`smerDlhu`), nie jedno číslo.
- **Karta filtrovaná trénerom musí povedať, čo ukazuje.** Nezaplatené je na
  Dnes za vybraného trénera (6 / 47 560 Kč), v Prehľade za oboch
  (12 / 85 642 Kč). Bez poznámky „obaja tréneri" sú to dve pravdy o jednom.

## Chýbajúci stĺpec v SELECTe zhasne celý Kokpit

Dvojča pravidla o INSERTe — a horšie. 25. 9. 2026 pribudla v Kalendári karta
„Nedávno vybavené" (krok späť nad vysvetlenými zmenami) a brala riadky
z `zmenyHistoria`. Ten dopyt nikdy nevracal `uid`, lebo ho dovtedy nikto
nepotreboval; `popis()` ním pritom rozlišuje ručne zapísané zmeny
(`z.uid.startsWith("rucne-")`). Výsledok: `undefined.startsWith` v `.map`,
koreňová hranica TanStacku a **„This page didn't load" na celom Kokpite** —
nie na jednej karte. Typy to nechytili (riadky idú z `fetch` cez `as`),
testy tiež nie, `hotovo.sh` prešiel celý.

- **Keď novú obrazovku kŕmiš EXISTUJÚCIM dopytom, porovnaj jeho stĺpce
  s poľami, ktoré tá obrazovka číta.** Dopyt bol napísaný pre iného
  konzumenta a nikto ho neupravil.
- **Komponent, ktorý číta pole z fetchnutých dát, musí prežiť jeho
  neprítomnosť** (`(z.uid || "").startsWith(…)`). Popis má v najhoršom
  stratiť slovo, nie zhasnúť appku.
- **Po nasadení novej obrazovky ju OTVOR** — `curl` shell a assety vrátili
  200, worker bežal, chyba bola len v prehliadači. Nájsť sa dala jedine
  v konzole.

## Zoznam úloh je `docs/zoznam.md`, nie správa v chate

25. 9. 2026 sa Jerry spýtal, čo zostáva. Vypísal som zoznam — a poskladal som
ho len z tej jednej konverzácie, v ktorej som práve bol. Vypadla z neho
**myšlienková mapa na plánovanie marketingu** (vypýtal si ju 7. 9.), **NDA pri
fotkách pred/po** (8. 9.) a **šesť konkrétnych dôvodov odchodu** (15. 9.).
Jerry na to prišiel sám: „v tvojom zozname mi napr. chýba…“

Príčina nie je zábudlivosť, je to miesto: zoznam žil v správach a tie sa
sumarizujú preč. **Keď Jerry niečo odloží alebo mu niečo sľúbim na neskôr,
zapíše sa to do `docs/zoznam.md` v tom istom ťahu** — nie na konci debaty,
nie „potom“. A hotová vec sa nemaže: presunie sa do sekcie „Zavreté“, aby sa
o mesiac neotvárala odznova (tá sekcia už raz ušetrila druhé kolo debaty
o meraní bolesti).

## Písanie do Reactu z konzoly potrebuje `_valueTracker`

25. 9. 2026 som pri overovaní myšlienkovej mapy „našiel" chybu, ktorá
neexistovala. Do políčka som z konzoly nastavil hodnotu cez natívny setter
a poslal `input` — v DOM sa text objavil, React o ňom NEVEDEL, stav zostal
prázdny a appka koncept správne zahodila ako prázdny. Vyzeralo to ako tichý
zápis do prázdna a prepísal som kvôli tomu obsluhu dvakrát.

React si pri každom riadenom políčku drží `el._valueTracker`; kým sa
nevynuluje, zmenu považuje za tú istú hodnotu a `onChange` nepustí:

```js
const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
el._valueTracker?.setValue("");          // bez tohto React zmenu prehliadne
set.call(el, "text");
el.dispatchEvent(new Event("input", { bubbles: true }));
```

**A všeobecnejšie:** keď kontrola z prehliadača ohlási, že sa zápis nedeje,
najprv over, či testovací nástroj vôbec dokázal napísať — až potom hľadaj
chybu v appke. Je to tá istá lekcia ako pri `naostro.sh`: dvakrát sa mýlila
kontrola, nie appka.

## Odpoveď API bez `cache-control` si prehliadač smie nechať

25. 9. 2026: po presune bubliny v myšlienkovej mape ukazovalo čítanie starý
stav a vyzeralo to, že sa zápis nestal. `/api/napady` nemalo `cache-control`,
takže prehliadač smel odpoveď považovať za čerstvú podľa vlastného uváženia —
a čítanie hneď po zápise vrátilo predošlý zoznam. Je to tá istá pasca ako
„proxy drží obrázky", len na JSON.

**Endpoint, z ktorého sa číta hneď po zápise, posiela
`{ headers: { "cache-control": "no-store" } }`.** Platí to najmä tam, kde
ten istý zoznam číta viac kariet na jednej obrazovke.

**A pri overovaní z prehliadača:** skôr než vyhlásiš zápis za nefunkčný,
over, či nečítaš z inej mapy/iného filtra a či odpoveď nie je z keše. 25. 9.
ma to stálo štyri kolá — bublina sa naozaj presúvala, len som sa pozeral na
mapu, ktorú mi pamätal `localStorage`, a nie na tú, do ktorej appka písala.

## Odvodené číslo sa počíta SPÄTNE od toho, ktoré appka už pozná

26. 9. 2026 pribudol v profile klienta stĺpec s hodinami pri každom riadku osi
času a výpis na poslanie klientovi. Trvalo tri pokusy, kým čísla sedeli — a
všetky tri zlyhania boli tá istá chyba: dopredný súčet nad zdrojom, ktorý
nesie len výsek sveta.

1. **Súčet od začiatku osi** dal Anetke Přinosilovej **−37 h**. Tréningy má
   appka od 2025, ale balíčky len tie, ktoré PTminder exportuje dnes (55 zo
   120 riadkov má dátum, najstarší 3/2026). Roky tréningov sa odčítali od nuly.
2. **Súčet od posledného balíčka** opravil Anetku, ale zabil zvyšok histórie
   a filter obdobia prestal čokoľvek meniť.
3. **Súčet od hodín balíčka** („18 h mínus tréningy") sedel len tam, kde má
   klient jedno členstvo. Pri OBNOVOVANOM členstve nesie export jediný riadok
   za posledné obdobie, takže Jakubovi Gerichovi („OFF - 6h S viazanosťou",
   export hovorí 1 zo 6) vyšlo **−30 h** a Natálii Pečkovej −3 h.

Pravda o zostatku je jedno číslo: to, ktoré appka ukazuje na karte klienta
(`packageRemaining` — z exportu, z ručnej kotvy alebo dopočítané z názvu pri
0/0). `zostatkyOsi` preto ide od neho DOZADU: pred každým tréningom mal klient
o hodinu viac. Rad tak vždy končí na čísle, ktoré sedí s PTminderom — overené
na všetkých 125 klientoch, 0 záporných riadkov, 0 rozchodov s kartou.

- **Kde rad prerastie hodiny balíčka, počítanie sa ZASTAVÍ** a riadok ostane
  prázdny. Tam už história patrí predošlému obdobiu členstva, o ktorom appka
  nič nevie. Prázdno je lepšie než vymyslený riadok.
- **Pod nulu sa nejde.** Mínusový zostatok neznamená, že klient dlží hodiny,
  ale že appka ešte nevidí novší balíček (Natália zaplatila 16. 9., export je
  z 20. 9.).
- **Dve čísla, lebo appka vie dve rôzne veci.** `spolu` (odtrénované hodiny)
  pozná od prvého dňa a beží cez celú históriu; `zostatok` existuje len tam,
  kde vie aj nákup. Miešať ich do jedného stĺpca bez pomenovania znamená, že
  si ich klient zlúči.
- **Hodina je hodina, nie tréning.** Sedenie nesie `duration_min` (3 698 má
  60 minút, 11 má deväťdesiat). „Jeden tréning = jedna hodina" bola výhovorka,
  nie pravidlo.
- **Dokument pre klienta sa sádže inak než obrazovka.** Do mailu nepatrí ISO
  dátum (`2027-03-01`), kód metódy (`bank`) ani dva tvary času vedľa seba
  (PTminder „3:00pm", kalendár „15:00").

Zovšeobecnenie: **keď appka niekde ukazuje číslo, ktorému verí, odvodený rad
sa má od neho odvíjať — nie ho prepočítavať nanovo z neúplných vstupov.** Je
to tá istá vec ako „číslo, ktoré vidí obrazovka, musí vidieť aj Jarvis", len
o riadok nižšie.

## Snímka verzus kniha: `packages` je dnešok, `services` je história

27. 9. 2026 Jerry: „vidím zapísané platby, ale nevidím začiatky členstiev, iba
tak max posledného." Bola to pravda o zdroji, nie o obrazovke. Os času brala
balíčky z `packages` — to je SNÍMKA aktuálneho stavu z PTmindera (55 riadkov
s dátumom, najstarší 3/2026). Kniha predajov je `services` (Payroll → Services):
708 riadkov od 5. 1. 2025, každý s dňom, názvom aj cenou. Tá istá dvojica platí
inde v appke tiež — keď niečo „chýba", over najprv, či sa nečíta zo snímky.

Z toho vzišiel model odpočtu, ktorý si Jerry vypýtal (`priebehBalickov`):

- **Odpočet sa pri každom začiatku členstva vráti na jeho hodiny** (6, 5, 4…)
  a tréningom klesá. Nie je to jeden súčet cez celú históriu — to Jerry
  výslovne odmietol („nepočítalo by sa to ako celok spolu 9, spolu 8").
- **Číslo pri tréningu je stav PRED ním**, teda koľkátá hodina balíčka to je.
  Jerry, 27. 9. 2026: „1 h = posledná v balíku a prvá hodina v balíku = 6 h."
  Prvý zo šiestich ukáže 6, šiesty 1, siedmy už číslo nemá a je to −1.
- **Riadok balíčka číslo NEMÁ.** Počet hodín je v jeho názve a číslo vedľa
  pôsobilo mätúco („OFF - 18 hodín offline · ≈18 h … 18 h").
- **Pod nulu odpočet nejde.** Prebytok sa preleje do druhého čísla.
- **Dlh (−1, −2, −3) je počet tréningov, ktoré si klient vybral skôr, než zaň
  zaplatil.** Jerry, 27. 9. 2026: „na štvrtý týždeň zaplatila, tak to už len
  pokračuje 15, 14 — a je tam naznačené, že bol rozdiel medzi prvým tréningom
  a platbou." Počíta sa tréning na členstve s otvoreným poplatkom, tréning
  pred platbou zaň, a tréning mimo hodín vyčerpaného členstva. Za platbu
  členstva sa berie len tá do MESIACA od jeho začiatku — inak by sa ňou stala
  platba za to ďalšie. Na ostrých dátach to vychádza na 21 % tréningov;
  Jerry o tom čísle vie.
- **Mínus sa PLATBOU VYNULUJE — nesčítava sa cez históriu.** Jerry, 28. 9.
  2026: „keď zaplatí, minusovanie sa vynuluje, a ak zase zaplatí neskoro, ide
  do nového mínusu." Prvá verzia počítala cez celý úsek členstva, takže
  Richard Matl mal na 28. 9. **−3**: dva tréningy z augusta pred platbou
  (10. a 19. 8., zaplatené 23. 8.) plus jeden nad rámec balíčka. Dva z nich
  boli mesiac vyrovnané a číslo tvrdilo tri hodiny v mínuse namiesto jednej.
  Počítadlo beží po SÉRIÁCH: vynuluje ho platba aj tréning, ktorý mal hodinu
  aj zaplatené. Čísla na starých riadkoch zostávajú — sú to fakty o tých
  dňoch; mení sa len to, odkiaľ začína ďalší mínus. Vynulovanie pritom nie je
  strop: druhá séria bez hodín zase rastie −1, −2.
- **Platba nemá vedľa seba odpočet.** Hodiny nemení a číslo by len opakovalo
  riadok nad ňou.
- **Pri dátume je deň v týždni** — klient pozná „streda", nie „23. 9.". Pri
  platnosti členstva („do 28. 10.") deň v týždni nič nehovorí a nedáva sa.
- **Dve členstvá kúpené v ten istý deň sa SČÍTAJÚ** — ale najprv sa overí, či
  sú naozaj dve. Viď „Snímka klame v počte" nižšie.
- **Posledné členstvo sa zrovná s číslom z karty klienta, a to KU DŇU EXPORTU.**
  Dopredný odpočet sedel na ostrých dátach v 28 z 35 prípadov; rozdiel robia
  „Doplnenia členstva" (144 riadkov v exporte a ani jedno nehovorí, o koľko
  hodín ide). Zrovnávať sa musí ku dňu exportu, nie k dnešku — tréning, ktorý
  prišiel po ňom z kalendára, PTminder ešte nevidel a Danovi Kouřilovi
  nafukoval šesťhodinový balíček na sedem. **Od 3. 10. 2026 sa zrovnáva len
  KONIEC, nie rad** (6, 5, 4, 3, 2, 1 sú pevné) a číslo z karty je od 1. 10.
  z Kokpitu (`zostatokKokpitu`), nie z exportu — viď „Nezaplatený balíček je
  nula" nižšie.

## Nezaplatený balíček je nula a zostatok má znamienko

3. 10. 2026 Jerry: „nezaplatený balík je 0" a „keď Hanušovi pošlem odkaz a má
tam −3, tak to je naozaj tak a nie že bude mať pocit, že ho chcem oklamať."
Lukáš Hanus mal zaplatené členstvo 6 h od 9. 9., sedem tréningov od vtedy
a druhé členstvo od 2. 10. s otvoreným poplatkom 6 990 Kč. Karta hovorila
+5 h (12 − 7), stránka 3 h, Jerry −1 — a Jerry mal pravdu. To isté Daniela
Šašinková (+5 namiesto −3) a Martin Vaško. Traja dlžníci videli plus.

- **Balíček s otvoreným poplatkom hodiny nedáva, kým sa nezaplatí.** Jedna
  definícia „nezaplatený" pre kartu aj os: poplatok v `poplatky` z dňa
  `platnost_od` (`klucNezaplateneho` v `zostatokKokpitu.ts`; os ho má ako
  `nezaplatene` na `balicekOd`). Nezaplatený balíček zostáva aktívny — určuje
  názov členstva a odkedy sa počíta — len jeho hodiny sú nula.
- **Zostatok má znamienko.** `zostatokKokpitu` ani `priebehBalickov.koniec`
  už nestropujú na nule: −1 znamená jeden tréning bez hodiny. Mínus nie je
  dlh v korunách (ten je `dlhJednehoKlienta`), je to značka, ktorú ďalší
  zaplatený balíček prepíše na hodiny — na osi ich prevezme (`prevzate`).
- **Nový balíček preberá tréningy len z členstva, ktoré v ten deň ešte
  platí (ostro: koniec v deň začiatku ďalšieho je obnova, nie prekryv).**
  4. 10. 2026: karta −1, zoznam −3 u Hanuša. Zoznam si do balíčka z 9. 9.
  preniesol dva tréningy zo skončeného augustového členstva, o ktorom appka
  pozná len názov „6h" (júl mal v skutočnosti 8 h, doplnenia bez počtu) —
  vymyslený deficit sa valil cez celý rok a balíček začal na 4 namiesto 6.
  Skončené členstvo si mínus nechá na vlastných riadkoch; bez známeho konca
  platnosti sa neprenáša nič. Tým sa zmenilo Jerryho želanie z 28. 9. (Matl:
  „nech sa od tej −1 odpočítava nový balík") — tam, kde staré členstvo už
  skončilo, nový balíček začína na svojich hodinách a karta s osou sedia.
- **Hodiny minulého členstva sú v histórii z PTmindera, nie v názve**
  (`ptminder_historia`, migrácia 0095, od 4. 10. 2026). Toto bola skutočná
  príčina Hanušovho −3: júlové „OFF - 6h S viazanostou" malo v PTminderi
  8 hodín, appka ho poznala len z knihy predajov a počítala šesť. Rovnako
  na tom bolo 9 členstiev u 8 klientov (Kral 1 → 4, Gažo 8 → 16, Kalva,
  Vaško, Martinek 6 → 8, Čechová 6 → 5). Report „Packages & Memberships"
  so stavom **Finished** sa nahráva cez Upload ako ktorýkoľvek export:
  `ingest` ho pozná podľa stĺpca Status (všetko `expired`) a zapíše LEN do
  histórie — do snímky `packages` nie, lebo tú import po klientoch nahrádza
  a Finished by klientom zmazal živé balíčky. Každý export Active ide do
  histórie tiež.
  **Doplnenia sa z histórie neberú.** Skúšané 4. 10. nad všetkými klientmi:
  doplnenie je „presne toľko, koľko mu ostalo" (Jerry) a z exportu sa nedá
  poznať, ku ktorému členstvu patrí — Šašinkovej doplnenie 1 h zo
  skončeného členstva sa pripočítalo k novému a z −3 bolo −2. Overenie nad
  ostrými dátami: nesúhlas karta/zoznam z 10 na 8, žiadny nový.
- **Karta, stránka `/v/`, mail „celá história", register aj Jarvis čítajú
  to isté číslo** (`packageRemaining`). Stránka a mail stavajú os cez
  `osKlientaZoServera` — jedno miesto, s kalendárom aj balíčkami z Kokpitu
  (mail ich dovtedy nemal) — a s pražským časom aj hodinou, takže dnešný
  tréning o 18:00 nie je o 15:00 odtrénovaný.
- **Obsah odkazu má jedno miesto: `obsahOdkazu.server.ts`** (4. 10. 2026,
  Jerry: „aby z toho, čo vyšlo, sa sťahovali dáta pre obsah odkazov").
  Stránka `/v/` z neho kreslí nadpis, os, mínusy aj platbu; okno SMS sa ho
  pýta cez `/api/sms` (akcia `odkaz` vracia `stav.sQr`), takže veta „a QR na
  platbu" sa riadi tým, čo stránka naozaj nakreslí — nie číslom, ktoré
  pošle obrazovka (karta, Kalendár a Dnes posielali tri rôzne); mail „celá
  história" z neho berie os bez platby. Popis poplatku z PTmindera ide
  klientovi preložený (`popisPoplatku`: „6h Předplatné · 2. 10. – 2. 11.
  2026" namiesto „OFF - 6h S viazanostou - from 02/10/2026…"). Overené po
  nasadení na všetkých 12 živých odkazoch: nadpis aj suma zhodné s výpočtom.
- **Otázky klienta sú v anamnéze VŽDY** (4. 10. 2026, `sekcieZapisu`
  v anamnezaFormular.ts). Prvá sekcia zápisu trénera sú otázky, ktoré
  dostáva klient pred úvodným: vyplnené jeho odpoveďami, alebo prázdne
  s pokynom vyplniť ich spolu na úvodnom. Odpovede idú do tých istých `id`,
  takže súhrn aj Jarvis ich čítajú rovnako, nech ich vyplnil ktokoľvek.
  Dovtedy `predvyplnZapisu` prevzal od klienta len oblasti a cieľ a varovné
  príznaky, lieky a zákaz od lekára tréner v zápise nevidel. Jerry
  upozornenie „klient nevyplnil" odmietol v prospech tohto — nestavať ho.
  V zápise trénera má každá otázka klienta s možnosťami aj **„Jiné"**
  s políčkom `<otázka>_jine` („na osobnom stretnutí sa odpovedá inak než
  v dotazníku"); dotazník pre klienta ho nemá. **„Hlavní obtíž" (`obtiz`)
  stojí hneď pod „Co vás k nám přivádí?"** a v „Co ho trápí" sa už nepýta —
  Jerrymu sa zdali rovnaké. Súhrn ukáže namiesto „Jiné" dopísaný text.
- **Pasca: tlačidlo, ktoré sa číta ako stav.** Stôl klienta mal pri každom
  tréningu tlačidlo s holým „zdarma" a Jerry ho čítal ako údaj („zdarma pri
  každom tréningu, hoci je `treningy_zdarma` prázdna"). Akcia má sloveso
  („označiť zdarma"), stav sa kreslí inak.
- **Pasca: `?1` a `.catch(() => ({ results: [] }))`.** Dopyt na kalendár
  v `loadData` používa číslovaný parameter `?1`; shim, ktorý nahrádzal len
  `?`, ho rozbil a `.catch` z toho ticho spravil prázdny zoznam — appka by
  od 1. 10. nevidela ani jeden tréning a nikomu by nič nepovedala. Pri každom
  takom `.catch` sa pýtaj, kto sa dozvie, že padol.
- **Čo ešte nie je jedno pravidlo (3. 10. 2026):** „zaplatený" má v kóde
  ďalšie tri definície — `dlhKlienta` (ceny ručných − platby), `platbyEvidencia`
  (poplatok vs platba s oknom), `vypisHodin` (platba do 30 dní od úseku).
  Hodiny ich nečítajú; dlh áno. Zjednotenie je v `docs/zoznam.md`.

**Hodiny, ktoré nie sú v názve, sú v exporte Packages & Memberships**
(„50 left from 78"). Odtiaľ je ONE YEAR = 78 a SPECIAL 3 = 3 v mape
`HODIN_PODLA_NAZVU`. Staré stupne z roku 2025 (SILVER, BRONZ, GOLD, ČLENSTVÍ
ONE, EXKLUZIVNÍ PLÁN) tam zámerne nie sú — počet hodín k nim nikto nepovedal
a vymyslené číslo je horšie než prázdny odpočet.

**Uzávierka blokuje aj import histórie.** `ingest` preskakuje riadky
z uzamknutých mesiacov (`vzas_periods.locked`) a zamknuté je všetko do 8/2026.
Nový export sa teda nedoimportuje spätne — v `services` ostalo 456 zo 708
riadkov. Je to zámer (uzavreté obdobia sa nemenia), ale pri každom „appka o tom
nevie" nad starými dátami to treba overiť skôr, než sa hľadá chyba v kóde.
27. 9. 2026 to Jerry odklepol a 251 chýbajúcich riadkov (9/2025 – 6/2026) sa
doimportovalo priamo do D1 s tým istým `dedup_key` (`date|client|description`),
aký robí `ingest`. Odpočet odvtedy beží 73 klientom namiesto 57 a na osiach je
689 začiatkov členstiev namiesto 450. `services` nevstupuje do P&L — ide z neho
6M proces a počty služieb.

## Tréning zdarma nie je v exporte — je to rozhodnutie trénera

27. 9. 2026 Jerry: „niekedy chceme dať tréning ZDARMA. V PTminderi dávame
recoil tréningov, tu ale nič také nie je — čo keď nechcem, aby sa klientovi
odpočítal tréning od členstva?"

Z exportu sa to zistiť NEDÁ a je to pasca, na ktorú sa dá naletieť: `price_czk
= 0` má 690 zo 3 449 sedení a znamená „zaplatené balíčkom", nie „zadarmo".
Je to tá istá rodina omylu ako „ceny sedení nie sú peniaze".

- **Tabuľka `treningy_zdarma`** (migrácia 0081), kľúč klient + DEŇ, nie id
  sedenia: ten istý tréning príde raz z kalendára a raz z exportu a os času
  ich už dnes páruje po dňoch. Značka tak prežije oba zdroje aj opakovaný
  import.
- **Neodpočítava sa z členstva a nemôže byť na dlh.** Darovaná hodina nemá
  ako chýbať — ani v balíčku, ani v platbe.
- **Do dochádzky, vyťaženosti trénera a „naposledy trénoval" sa POČÍTA.**
  Čas trénera to stálo, len klienta nie.
- **Musí to vedieť aj karta klienta**, nielen os času. `deriveClients` má
  vlastný počet odtrénovaných hodín (`odtrenovaneOd`) a bez tej istej výnimky
  by karta hovorila o hodinu menej — a to číslo Jerry hovorí klientovi nahlas.
- **Dôvod sa píše hneď** („kompenzácia za zrušený tréning") a ide aj do výpisu
  pre klienta. Darovaná hodina bez dôvodu sa o mesiac nedá obhájiť.

## Kontrolór profilu: `./scripts/kontrola-profilov.sh`

Tretí skript nad ostrými dátami, vedľa `naostro.sh` (notifikácie) a jednotkových
testov (pravidlá). Tento overuje ČÍSLA V PROFILE: odpočet hodín, dlh, platby,
dochádzku — a hlavne miesta, kde sa dva zdroje o tom istom rozchádzajú.
Iba číta. Prvý beh 27. 9. 2026 našiel 324 vecí a ani jedna nebola chyba
výpočtu; všetko sú rozdiely medzi zdrojmi, ktoré treba vedieť prečítať:

- **8× „os a karta hovoria iné číslo"** — a všetkých osem má tú istú príčinu:
  os pozná dokúpené hodiny (`packages.added` + počet), `deriveClients` nie.
  Karta je tam menej informovaná než os. Preto kontrola príčinu POMENUJE,
  nielen ohlási rozdiel — nález bez príčiny sa prestane čítať.
- **Porovnávať sa musí KU DŇU EXPORTU.** Prvá verzia hlásila 27 rozdielov,
  z toho 17 boli tréningy z kalendára po poslednom nahratí. Karta počíta
  k dňu exportu; kto porovná k dnešku, meria vek súboru.
- **Zrovnanie s kartou potrebuje kotvu aj v prázdnom členstve.** Keď v ňom
  ešte nebol tréning, nie je sa čoho chytiť a rad ostal na hodinách z názvu
  (Josef Šnirych: SPECIAL 3 kúpené 20. 9., PTminder hovorí 2 z 3). Fallback
  je otváracia hodnota obdobia.
- **35 % tréningov nesie značku dlhu a má ju 123 zo 125 klientov.** Pravidlo
  „tréning skôr, než prišla platba" je doslovne to, čo Jerry chcel, ale ako
  signál je to nepoužiteľné — svieti skoro všetko. Meradlo z 19. 8. 2026 tu
  platí znova: kontrola, ktorá svieti na nesprávnych ľudí, je horšia než žiadna.
- **98 zo 113 platieb v Kokpite je aj v PTminderi a 15 len v Kokpite.** Karta
  ich drží oddelene a nesčítava (správne), ale výpis pre klienta berie len
  PTminder — tých 15 platieb v ňom klientovi chýba.

## Snímka klame v počte — koľko ich je, povie kniha predajov

27. 9. 2026 som Jerrymu vysvetlil, že Anna Nová má dve členstvá „OFF - 8 hodín
offline" z 3. 9., „rovnako ako Gažo". **Bola to nesprávna odpoveď a stálo ma to
len jeden dopyt navyše, aby som to zistil.** Rozdiel:

- **Gažo** má dve členstvá s RÔZNYMI dňami (18. 5. a 24. 7.) — dve skutočné,
  prekrývajúce sa členstvá. To je ten prípad z 21. 9.
- **Anna Nová** má dva riadky s TÝM ISTÝM dňom, platnosťou aj cenou (4/8 a 8/8).
  V knihe predajov (`services`) je v ten deň predaj JEDEN a platba jedna. Je to
  duplicita v PTminderi.

Naprieč celou databázou je taká dvojica JEDINÁ. Napriek tomu škodila na oboch
stranách: os čas sčítala na 16 hodín a `deriveClients` si ako aktívny vybral
ten netknutý riadok (8 z 8), takže karta hlásila zostatok, ktorý sa netýkal
ničoho. Rieši to `bezDuplicitBalickov` — JEDNA funkcia, ktorú volá os aj
karta; keď kniha o tom dni nevie (staršie obdobia), berie sa jeden riadok.

**Pravidlo:** keď snímka (`packages`) a kniha (`services`) hovoria o počte
rôzne, platí kniha. A keď si nie som istý, čo dáta znamenajú, nemám to
vysvetľovať ako fakt — mám sa pozrieť na druhý zdroj.

## Keď meno nestačí, druhý pohľad spor rozsekne

28. 9. 2026 Jerry nad výpisom: „28. 7. 7 790 Kč, neviem či je Roman Pavlík
alebo Roman Jakubiček — podľa PTmindera by sa dalo zistiť, pochybujem že
zaplatili obaja v ten istý deň."

Mal pravdu a príčina bola v PORADÍ, nie v pravidlách. `nepriradene` má štyri
zdroje návrhu (faktúra → firma → meno → suma a deň z PTmindera) a brala prvý,
ktorý niečo vrátil. Párovanie podľa sumy tak bežalo len vtedy, keď meno
nenašlo NIC — pritom priezvisko vracia pri Stokláskovcoch a Tomášoch aj šesť
mien naraz a práve tam je druhý pohľad najcennejší. Z 38 sporných príjmov
ich takto ubudlo 24.

- **Zužuje sa PRIENIKOM, nie nahradením.** Keď PTminder ukáže na niekoho, kto
  v texte platby nie je, je to zhoda čísel a nie dôkaz — vtedy sa nechá
  pôvodná dvojica a rozhodne človek.
- **Zovšeobecnenie:** keď zdroj vráti VIAC než jednu možnosť, neskončil —
  vtedy sa má pýtať ďalej. Prvý zdroj, ktorý niečo vráti, nie je automaticky
  ten, ktorý vie odpoveď.
- **Platba z PTmindera sa smie použiť RAZ** (`volnePtPlatby`). Jerry, 28. 9.:
  „veľa platieb 6990, 7790 alebo 1100 — porovnaj ich s dátumami z PTmindera."
  PTminder o nich vedel, len ponúkal viacerých naraz: 1 100 Kč za úvodný
  tréning zaplatia za týždeň traja. Lenže dvaja z nich už majú svoj bankový
  pohyb priradený — tá platba je vysvetlená a druhýkrát sa použiť nesmie.
  Je to párovanie JEDNA KU JEDNEJ, nie hľadanie zhody čísla; sporných tak
  z deviatich ostali tri. Okno je tu desať dní (v PTminderi zapisuje človek
  a vie sa oneskoriť), kým pri hľadaní kandidáta sú tri — tam ide o dôkaz,
  tu o to, čo je už vybavené. Vedľajší účinok: čím viac Jerry priradí, tým
  menej zostane sporných. Zoznam sa čistí sám.

Tá istá chyba bola v mene samotnom a Jerry ju našiel o hodinu neskôr
(„9. 6. Marketa Resnerova, 20. 6. Tomáš Krivda"):

- **Celé meno prebíja samotné priezvisko.** Krstné sa používalo AŽ vtedy, keď
  priezvisko nesedelo na nikoho — takže „Marketa Resnerová" v texte ponúkla
  všetky tri Resnerové. Keď je v texte aj krstné, je to o jednu zhodu viac
  a rozhoduje ono.
- **Mužský tvar ženského priezviska.** Platí manžel: „Tomáš Krivda" a
  klientka je Natália Krivdová. „Krivda" je KRATŠIE než „Krivdová", takže
  pravidlo „token začína priezviskom a je najviac o tri písmená dlhší" ho
  nenašlo a appka spadla na krstné — šesť Tomášov. Porovnávajú sa preto aj
  korene bez prechyľovacej koncovky, a to na ZHODU, nie na začiatok
  („Novák" a „Nová" sa zliať nesmú). Koreň musí mať aspoň päť písmen; pri
  kratších (Matl / Matlová) by to len vyrobilo ďalšie kolízie.

**Jeden prevod vie patriť dvom klientom.** „15 580 DK Consulting" sú dva
balíčky po 7 790 (Dan Kouřil a Monika Schonwalderová). Akcia `rozdel` zapíše
toľko platieb, koľko je dielov, všetky s tým istým `fio_id` — pohyb zmizne zo
zoznamu nepriradených a mesačný súčet sedí.

**Prvá verzia to nedokázala zapísať a vyzeralo to, že sa nestalo nič.** Nad
`platby` bol `UNIQUE INDEX platby_fio (fio_id)`, takže pohyb smel mať práve
jednu platbu; batch s dvoma dielmi padol na porušení indexu, worker vrátil
HTML stránku „This page didn't load" a obrazovka o tom mlčala. Stráž bola
správna, len príliš hrubá — od migrácie 0082 je unikátna dvojica
`(fio_id, klient)`: ten istý pohyb sa stále nedá započítať tomu istému
klientovi dvakrát, ale rozdeliť medzi rôznych sa dá.

**Zápis do D1 bez try/catch je pád na HTML stránku.** Vracať sa má veta, ktorú
človek prečíta („Tento pohyb už má priradenú platbu pre toho istého klienta"),
nie chybová stránka — to je ten istý druh tichej chyby ako zhltnutý catch,
len hlučnejší a rovnako nepoužiteľný. Diely sa musia zložiť na sumu
pohybu (tolerancia koruna); rozdelenie, ktoré nesedí, sa nezapíše. A
odosielateľ sa pri rozdelení NEUČÍ: vzor by ukazoval na dvoch ľudí naraz.

## Číslo faktúry je najtvrdší dôkaz — a appka ho dovtedy nemala

28. 9. 2026 Jerry: „vidím, že tie ťažko identifikovateľné platby sú faktúry —
vedel by si to porovnať ešte s faktúrami?" Mal pravdu a chýbal celý zdroj.

V texte prevodu stojí „20260037 MGR. FILIP STRANAVSKY" — číslo dokladu
a meno PRÍJEMCU. Meno klienta tam nie je vôbec, takže príjem zostával bez
návrhu. `klientPodlaFaktury` pritom existuje a stojí na vrchole poradia
dôvery — len čítala `vydane_faktury`, teda doklady vystavené v Kokpite (od
26. 9. 2026 ich je jeden). Osemdesiatštyri starších faktúr žije v iDoklade
a do appky sa nikdy nedostalo.

- **`idoklad_faktury`** (migrácia 0083) je zrkadlo exportu „Seznam vydaných
  faktur". Je to INÁ tabuľka než `vydane_faktury`: tamtie appka tvorí, tieto
  len číta. Jedna spoločná by znamenala, že import prepíše Kokpitom vystavený
  doklad alebo naopak.
- **Dátum v iDoklade je AMERICKÝ** (`08/26/2026`). Prehodené dni a mesiace by
  boli tiché a v polovici prípadov (deň ≤ 12) aj neviditeľné.
- **Meno na faktúre je FIRMA, nie klient** („FSH Devices s.r.o." → Jan Kral).
  Preklad je cez `fakturacne_kontakty` — tie isté párovania, ktoré Jerry robil
  26. 9. Bez nich je faktúra len číslo.
- **Výťažnosť je malá, ale je to istota, nie odhad:** z 55 nepriradených
  nesú číslo faktúry tri. Rastie to s každou vystavenou faktúrou a na rozdiel
  od zhody sumy sa nedá pomýliť.

## Zostatok bez dátumu nerozlíši naliehavosť

28. 9. 2026 Jerry nad kartou „Balíček dojde po objednaných hodinách (15)":
„vidím veľa mien aj takých, čo majú 4/6 alebo 5/8 alebo 4/18 — za mňa je
rozdiel mať posledné 4 z 18 vs posledné 4 zo 6, a keď mám 6 h v balíčku, to
tam vkuse niekto svieti."

Mal pravdu dvakrát. Karta brala každého, komu po objednaných hodinách zostane
≤ 1 — lenže šesťhodinový balíček sa míňa stále, takže to sadne skoro na
každého a karta je trvalo plná. A z pätnástich mien ich jedenásť hovorilo
„dôjde po objednaných", čo znamená, že práve NEDÔJDE: „2 zo 6 a jeden
objednaný termín" skončí na jednej hodine a nedeje sa nič.

- **Dátum rozlíši to, čo zostatok nie.** Kto chodí raz týždenne, minie štyri
  hodiny za mesiac, nech má balíček akýkoľvek — a preto sa počíta DEŇ hodiny,
  ktorá balíček vyčerpá (`terminy` z kalendára, `dojde`). Riadok tým odpovedá
  na otázku, kvôli ktorej sa karta otvára: komu zavolať prvému.
- **Do zoznamu patrí len ten, komu naozaj dôjde:** hodiny už nemá, objednané
  termíny ho vyčerpajú do DVOCH týždňov, alebo mu zostáva posledná hodina.
- **Karta videla kalendár len 14 dní dopredu** a „obj. N" preto klamalo:
  Vítězslav Papiež má naplánované tréningy do konca roka a stálo tam „obj. 2".
  Hlavné okno udalostí (21 dozadu, 14 dopredu) je pre týždenný pohľad správne
  a nemení sa; karta dostáva vlastný úzky rad `buduceTreningy` (klient + deň,
  120 dní dopredu) z tej istej tabuľky. Sťahovanie kalendára sa nemení.
  Termín, ktorý príde z oboch radov, sa počíta RAZ — inak by balíček minul
  skôr, než sa naozaj minie.
- **Horizont sa musel skrátiť, keď appka začala vidieť ďalej.** Päť týždňov
  bolo napísaných v čase, keď sa dátum aj tak nedal spočítať; s termínmi na
  štyri mesiace to znamenalo dvadsaťtri mien. Dva týždne sú toľko, koľko sa
  dá za týždeň obvolať.
- **„Platnosť skončila" sa netvrdí.** Sedem klientov má v appke členstvo
  s platnosťou v minulosti a vyzeralo to ako sedem urgentných prípadov —
  lenže väčšina z nich je len chýbajúci novší riadok v exporte (Jakub Gerich
  má mesačne obnovované členstvo, Regina Obrovska dokúpené hodiny z 20. 9.).
  Dátum zostáva v riadku ako informácia („členstvo v appke platilo do…"),
  ale do zoznamu nikoho neťahá a poradie nemení.
- **Horizont nesmie schovať toho, kto je na nule.** Kto hodiny minul už dnes,
  zostáva bez ohľadu na dátum — to je najurgentnejší telefonát.

## Otvorený poplatok už nie je dôkaz — Kokpit je napred

28. 9. 2026 Jerry nad kartou Nezaplatené: „Kalva má platbu 27. 9., to isté aj
Kouřil." Mal pravdu a týkalo sa to ŠTYROCH z jedenástich poplatkov (Lucie
Podolová 7. 8., Monika Schonwalderová 28. 8., Dan Kouřil 2. 9., Jaroslav
Kalva 17. 9.).

Pravidlo z 31. 8. 2026 znelo, že poplatok v `poplatky` je otvorený, lebo
PTminder ho po zaplatení ZMAŽE. To bola pravda, kým bol PTminder jediný
zdroj platieb. Počas súbežného chodu je Kokpit o dni až týždne NAPRED:
peniaze vidí vo výpise z banky hneď, kým v PTminderi ich Jerry zapíše neskôr
alebo vôbec.

- **Neruší sa zákaz párovať s `payments` z PTmindera** — ten platí ďalej a
  nefunguje. Odratáva sa vlastná evidencia (`platby`), čo je iný, nezávislý
  zdroj.
- **Jedna ku jednej, suma na korunu, okno −10 až +60 dní.** Lucie Podolová má
  dva poplatky po 6 990 a jednu platbu: zavrie sa STARŠÍ, druhý zostáva.
  Mínus desať dní preto, že Barbora Vanková zaplatila päť dní PRED vystavením
  poplatku — „platba až po poplatku" neplatí ani tu.
- **Odratáva sa v `loadData`, nie v komponente.** Na „nezaplatené" sa pozerá
  karta na Dnes, Prehľad peňazí aj Jarvis; tri kópie toho istého pravidla by
  sa rozišli. Jarvis má v schéme napísané, že surový dopyt do `poplatky`
  vráti viac riadkov než to, čo appka ukazuje.

Karta na Dnes tým spadla zo 6 položiek za 43 972 Kč na 4 za 29 192 Kč.

## Tlačidlo, ktoré prepína na kartu, musí mať kam prepnúť

28. 9. 2026 Jerry: „keď Terezka cez seba dáva vystaviť faktúru Janke
Šnyrych, tak sa nič nedeje a nefunguje to." Tlačidlo „Vystaviť faktúru" je
na karte klienta a tú má v kope každý; po kliku Workspace hľadá kartu
Faktúry (`zive.findIndex`) a prepne na ňu. Terezka ju nemala — `idx` bolo
−1, `if (idx >= 0)` nič neurobilo a appka nepovedala ani slovo.

Chyba nebola v tom `findIndex`, ale v tom, že sa VIDITEĽNOSŤ tlačidla
a viditeľnosť jeho cieľa riadili inde a nikto ich nedržal spolu. Pravidlo:
**keď akcia prepína na kartu, obrazovku alebo záložku, ktorá sa niekomu
nemusí zobraziť, patrí k nej test, že cieľ existuje pre KAŽDÉ prihlásenie**
— alebo sa musí skryť aj samo tlačidlo. Ticho je najhoršia odpoveď: človek
klikne znova a znova a usúdi, že je appka rozbitá.

A vecne: **„peniaze sú Jerryho" neplatí na faktúry.** Front nepriradených
príjmov z banky je administratíva nad celým účtom a Terezku nezaujíma;
doklad pre klienta, ktorého vedie, je jej robota. Dve rôzne práce, ktoré
dostali jedno pravidlo.

## „Nesprávne heslo" znamenalo nesprávnu KRAJINU

28. 9. 2026 prestali chodiť faktúry aj čítanie dopytov. Server vracal
`535 5.7.8 authentication failed` na SMTP a `[AUTHENTICATIONFAILED]` na IMAP,
pritom Jerryho webmail to isté heslo bral. Dvakrát som z toho usúdil zlú vec:
najprv „heslo je zmenené" (nebolo), potom „je to len na odosielaní" (nebolo —
zlyhávalo aj čítanie, len som si prečítal skrátený text na obrazovke namiesto
dát).

Príčina je v administrácii Websupportu, v nastaveniach schránky:
**GEO ochrana**. Je zapnutá a púšťa len Maďarsko, Rakúsko, Slovensko a Česko.
Kokpit beží na Cloudflare Workers a tie idú von z toho dátového centra, kde
požiadavku spracujú — keď padne na Prahu alebo Viedeň, prejde; keď na
Frankfurt alebo Varšavu, schránka ho odmietne. **A odmietne ho vetou o hesle.**
Preto to ráno fungovalo, na obed nie a večer zase áno.

Čo z toho platí:

- **Chybová hláška servera hovorí, čo sa stalo, nie prečo.** Tri hodiny
  diagnostiky išli po hesle, lebo to server napísal. Keď to isté heslo inde
  funguje a kód sa nezmenil, príčina nie je v tom, čo hláška tvrdí.
- **Rovnaká chyba na dvoch nezávislých protokoloch nie je náhoda.** IMAP
  (993) a SMTP (465 aj 587) majú iný kód aj inú knižnicu; keď odmietnu naraz,
  chyba je pred nimi — v sieti alebo v pravidle na účte.
- **Aplikácia bez pevnej výstupnej IP neprejde geo filtrom spoľahlivo.**
  Nedá sa to obísť pridaním krajín: zoznam by musel obsahovať celý svet.
- **`smtp.m1.websupport.sk` má v administrácii uvedený port 465 (SSL/TLS).**
  587 so STARTTLS funguje tiež, ale dokumentovaný je 465. Klient skúša 465
  a potom 587 (`smtp.server.ts`), a chyba nesie číslo portu — inak sa nedá
  odlíšiť „neprešlo ani jedno" od „skúsilo sa len jedno".

## Balíček nahodený v Kokpite musí stáť na osi, inak sa nemá čo odpočítať

28. 9. 2026 Jerry nad Richardom Matlom, ktorý mal po vyčerpanom členstve −1:
„keď mu nahodím nový balík, chcem, aby sa od tej −1 znovu odpočítaval počet
tréningov, ktoré mu nahodím — keby mu nahodím 18 h, vedľa −1 sa ukáže 18 h,
ako keby tá −1 bola 18. hodina z toho balíka."

Nefungovalo to z dôvodu, ktorý nebolo vidieť: os času čítala LEN PTminder
(`packages` + `services`), takže balíček zapísaný v Kokpite (`balicky`) na nej
nestál. Jerry ho nahodil a na obrazovke sa nezmenilo nič.

- **Z `balicky` sa berú len ručne nahodené (`zdroj = "rucne"`).** Zvyšných 82
  riadkov tam nalial import z exportu a 22 z nich sú OTVÁRACIE POLOŽKY ku dňu
  exportu („Doplnenie členstva", 20. 9. 2026) — snímky zostatku, nie predaje.
  Na osi by každému klientovi otvorili v ten deň nové obdobie a prepísali
  odpočet. Overené: s týmto filtrom dáva `kontrola-profilov.sh` rovnaký počet
  nálezov, ako keby sa `balicky` nečítali vôbec.
- **Nový balíček PREBERÁ tréningy, na ktoré už hodina nebola** (`prvyNekryty`
  vo `vypisHodin.ts`). Preberajú sa len tréningy z VYČERPANÉHO členstva;
  obdobie bez hodín (paušál, čas pred prvým balíčkom) by nový balíček zhltlo
  celé. Mínus im zostáva — odtrénované boli skôr, než balíček vznikol, a to je
  iná informácia než koľká hodina to bola.
- **S kartou klienta sa takýto balíček NEZROVNÁVA** (`zKokpitu`). Karta ráta
  z exportu PTmindera a o ňom nevie; zrovnanie by nový balíček stiahlo na
  zostatok toho vyčerpaného, teda na nulu. Kontrolór profilov túto príčinu
  pomenúva, aby z nej nebol nález bez vysvetlenia.

## Balíčky na jednej karte, peniaze na druhej

Jerry, 28. 9. 2026: „chcem novú kartu — všetci aktívni ľudia, ktorí nemajú
aktívne balíky, a ďalšiu, kde sú všetci, ktorí dlhujú peniaze. Ide mi o to,
aby na jednom mieste boli balíčky a na ďalšom peniaze."

Sú to dva rôzne telefonáty — „kúp si ďalší balíček" a „pošli, čo dlžíš" —
a preto dve karty, nie jedna. To je tá istá myšlienka ako pri celej kope:
jeden DRUH práce naraz.

- **„Bez balíčka" sa pýta OBOCH zdrojov** (`bezBalicka.ts`). Karta klienta
  ráta z PTmindera a nevie o balíčku nahodenom v Kokpite; keby sa zoznam
  staval len z nej, klient by v ňom svietil aj potom, čo mu balíček pribudol
  — a fronta, ktorá sa po vybavení nevyprázdni, sa prestane čítať.
- **Z `balicky` sa počítajú LEN ručne nahodené — tu rovnako ako na osi času.**
  Zvyšok je kópia exportu, teda tie isté členstvá, ktoré už nesie
  `packageRemaining`. Prvá verzia ich počítala tiež a odtrénované hodiny
  k nim rátala z kalendára, ktorý siaha 21 dní dozadu, kým platnosť balíčka
  beží mesiace: Richard Matl mal 6 h kúpených 10. 8. a všetky minuté, ale
  v okne kalendára boli vidieť dva tréningy — karta usúdila, že mu štyri
  hodiny zostávajú, a vynechala ho. Jerry si to všimol hneď („bez balíčka
  a čo Richard Matl?"), lebo o tom klientovi hodinu predtým hovoril.
  **Odvtedy sa minuté hodiny rátajú z oboch zdrojov naraz**
  (`treningyZObochZdrojov`): export nesie celú históriu, kalendár to, čo
  v ňom ešte nie je, a páruje sa po dňoch.
- **Paušál nie je chýbajúci balíček.** GOLD a spol. stoja v exporte navždy na
  0/0, lebo sa nemíňajú po hodinách. Tá istá pasca ako pri anomálii „chodí,
  ale má 0 hodín" (19. 8. 2026).
- **„Dlhujú peniaze" SČÍTAVA dva zdroje** (`dlznici.ts`): otvorené poplatky
  z PTmindera (kľúč `nezaplatene`) a balíčky nahodené v Kokpite, na ktoré
  neprišla platba (`dlhKlienta`). Hovoria o inom období a klient môže dlžiť
  v oboch naraz; dve karty vedľa seba by z jedného človeka spravili dvoch.
- **Hlavné číslo je MÍNUS, nie objednané termíny.** Prvá verzia radila podľa
  objednaných hodín; Jerry, 28. 9. 2026: „mňa skôr bude zaujímať, koľko sú už
  v mínuse." Objednaný termín je budúcnosť, ktorá sa dá prehodiť, odtrénovaná
  hodina bez krytia je hotová vec. Mínus berie `vMinuseKlienta` z
  `priebehBalickov` — tá istá funkcia, ktorá kreslí −1, −2, −3 v profile;
  vlastný prepočet by znamenal, že o týždeň bude na obrazovke iné číslo než
  v kope. Os času sa stavia LEN kandidátom zoznamu (bolo ich sedem), nie
  všetkým stodvadsiatim piatim.
- **„Na nule" a „v mínuse" sú dve rôzne veci.** Kto má 0 h a nechodil, nič
  nedlží; kto má 0 h a odvtedy trénoval, stojí firmu peniaze. Karta to preto
  rozlišuje slovom, nie len poradím.
- **Kľúč odklepnutia je MENO, nie suma.** Suma aj počet hodín sa hýbu každým
  importom a odklepnutie by padlo pri prvom pohybe (pravidlo z 26. 8. 2026).
  „Vybavené" tu navyše nič nezapisuje do databázy — vybavuje sa telefonátom
  a appka nevie, či klient zaplatil.
- **Bez balíčka sa filtruje trénerom, dlhy zostávajú Jerryho.** Predať balíček
  svojmu klientovi je robota toho, kto ho vedie.

## `requestAnimationFrame` v skrytej záložke nebeží

Prepínanie kariet v kope drží zámok `bezi`, aby sa dve animácie neprekryli —
a púšťal sa LEN v `requestAnimationFrame`. V neaktívnej záložke rAF nebeží,
takže kto prepol kartu a hneď odišiel do iného okna, našiel po návrate kopu,
ktorá sa nedala prepnúť ani tlačidlom, ani gestom. Nič nespadlo a v konzole
nebolo nič. Poistkou je obyčajný časovač; pustiť zámok dvakrát nevadí.

**Všeobecne:** čo púšťa zámok, nesmie visieť na jedinom callbacku, ktorý
prehliadač smie odložiť. Je to tá istá rodina ako „promise vie visieť" pri
schránke (28. 8. 2026) — catch chráni pred chybou, nie pred tichom.

## Kontrolór profilov bežal bez ručných zásahov

`scripts/kontrola-profilov.ts` skladal `PSBData` a ručné zásahy dával do poľa
`overrides`. `deriveClients` ich ale číta z `clientOverrides` a ako MAPU podľa
mena, takže sa na ne ani nepozrel: manuálne „Neaktívny" neplatil, kotvy
`balicek_zostatok` sa neuplatnili a časť nálezov boli ľudia, o ktorých už
Jerry dávno rozhodol. Našlo sa to 28. 9. 2026 tak, že kontrolór hlásil piatich
klientov bez balíčka a appka dvoch.

**Keď sa harness a appka rozídu, najprv over harness.** Platí to aj pre
`naostro.sh` — dvakrát sa mýlila kontrola, nie appka.

**Druhýkrát 5. 10. 2026:** po jednom pravidle „zaplatený" kontrolór stavil
os času bez `bezHodin`, platieb z Kokpitu a histórie z PTmindera a hlásil
„Janka odkaz 5 h · karta 2 h", ktoré v appke nebolo. Teraz počíta
`dlhyKlientov` z tých istých tabuliek ako `loadData` a os dostáva tie isté
polia ako `KlientStol`. **Keď pribudne vstup do `loadData` alebo do volania
`osCasuKlienta`, pribudne aj do `kontrola-profilov.ts`** (skript `tsc`
nekontroluje — je mimo `src`).

## Trackpadové gesto nie je dotykové gesto

28. 9. 2026 Jerry: „na telefóne sa mi nedajú jednotlivé karty vo Workspace
posúvať posunom palca do strany." Nedali sa — `krokGesta` číta `wheel`
a telefón `wheel` neposiela vôbec. Kopa sa na mobile dala prepnúť len bočnými
šípkami, ktoré majú 38 px a sedia pri okraji obrazovky.

Ťah prsta rozhoduje `krokSvihu` v `gestoKariet.ts`, vedľa trackpadu a z toho
istého dôvodu mimo komponentu. Dve podmienky: vodorovná zložka musí byť
**väčšia než zvislá** a ťah musí prejsť **aspoň 44 px a najviac 12 % šírky
okna**. Počúva sa `pointer*` AJ `touch*` a rozhoduje sa **počas ťahu**
(`*move`), nie pri zdvihnutí prsta; `touch-action: pan-y` nechá zvislé
rolovanie prehliadaču.

**TRI POKUSY, KÝM TO ZABRALO — a všetky tri zlyhania boli to isté.**
Overoval som gesto testami a testy som písal podľa toho, ako si ŠVIHNUTIE
predstavujem ja, nie podľa toho, čo robí ruka:

1. `wheel` namiesto dotyku — telefón taký event neposiela vôbec.
2. „vodorovný ťah 1,5× väčší než zvislý" — palec ide po OBLÚKU, pri ťahu
   o 80 px do strany klesne aj o 50 a podmienka spadne.
3. „do 800 ms" — človek, ktorý skúša, či appka reaguje, ťahá POMALY a pozerá
   sa pritom na obrazovku. Presne taký ťah sa zahodil.

Pri geste platí: **prah sa neháda, overuje sa prstom.** A kým overený nie je,
starý spôsob ovládania zostáva na mieste.

## Inline štýly nevedia médiá, takže na telefón treba `matchMedia`

Tá istá karta, ktorá na monitore vyzerá dobre, mala na 375 px bočné šípky
zožierajúce 92 px šírky a riadky s `minWidth` 150 + 160 + 118 + 96 px, ktoré
sa lámali do štyroch riadkov na jedného človeka. Zo siedmich mien tak bolo
vidieť dve a zvyšok sa musel vyrolovať vnútri karty — o čom sa nedalo tušiť.

Na úzkej obrazovke preto: okraje 30 px namiesto 46, šípky užšie a vyššie,
a v riadku ide **meno a hlavné číslo do prvého riadku**, zvyšok pod ne ako
jedna veta. Hook je rovnaký ako `useDashColumns` v Dashboarde.

**ŠÍPKY SOM PRITOM NAJPRV SKRYL A BOLA TO CHYBA.** Zdôvodnenie znelo logicky
— gesto ich predsa nahradí — lenže gesto som overil len testami a na Jerryho
telefóne nezabralo. Zostal bez oboch spôsobov: „teraz mi to nejde už vôbec,
pretože tam nie sú ani tie gombíky po strane." **Starý spôsob sa vypína až
vtedy, keď je nový overený rukou na tom zariadení, kde má bežať.** Nie keď
prejdú testy a nie keď to dáva zmysel.

**Od 9. 10. 2026 má telefón vlastné ovládanie (návrh C, `MobilNavigacia.tsx`):**
tenký riadok hore (≡ Viac · ‹ · názov · hľadanie) a lišta dole Dnes · Workspace ·
+ · Kalendár · Jarvis; Firma, Marketing, Prechod, Upload a Bitcoin sú vo „Viac".
Vybral si ho Jerry po skúške A/C v bete. Bočné šípky vo Workspace na telefóne
zmizli — nahrádza ich rad kariet hore (ťuk, overené) a švih; plávajúci Jarvis
na telefóne nie je. Prepínač je `useMobilRozlozenie()` (= `useUzke()`).

**Pravidlo:** keď karta pribudne do kopy, pozri sa na ňu aj v šírke telefónu.
Súčet `minWidth` v jednom riadku je strop, pod ktorý sa layout nezmestí.

**A to isté platí pre každý DVOJSTĹPCOVÝ layout.** 30. 9. 2026: „veľa vecí sa
mi nezobrazuje, pretože sa to tam nezmestí, vrátane profilu." Tri obrazovky
mali pevný stĺpec vedľa obsahu a na 375 px zostalo na obsah sto pixelov:

- **Profil klienta** (`KlientStol`) — 250 px vľavo, os času a jej filtre za
  okrajom karty. Na telefóne idú stĺpce pod seba a vnútorné rolovanie sa
  vypína; dve rolovacie plochy v sebe sa na dotyk ovládať nedajú.
- **Anamnéza** (`AnamnezaPanel`) — rebrík sekcií 216 px vľavo, z otázok
  osemdesiat pixelov a text sa lámal po jednom písmene. Rebrík je na
  telefóne vodorovný pás.
- **Kalendár** (`Tyzden`) — sedem stĺpcov po osemdesiat pixelov a okno
  udalosti mimo obrazovky. Okno sa na telefóne lepí na spodok obrazovky.
  Mriežka najprv kreslila JEDEN deň s pásom dní nad ním; fungovalo to, ale
  Jerry chcel celý týždeň ako v Google Calendari (30. 9. 2026, so snímkou) —
  týždeň sa inak nedá prehliadnuť jedným pohľadom a to je dôvod, prečo sa
  kalendár otvára. Sedem stĺpcov sa do 390 px vojde, len sa musí ubrať
  všade: pás hodín 22 px a holé čísla, medzery 1 px, mriežka si vezme aj
  odsadenie karty (`marginInline: -12`), písmo 9,5 px, čas v bloku sa
  nekreslí (v Googli tiež nie — hodinu povie poloha).
  **Zostane 46 px na stĺpec a to je na meno málo** — preto `menoDoBloku`:
  sám v hodine → „Monika Č.", pri prekryve (22 px) → iniciály „MČ" na jeden
  riadok. Pôvodné lámanie `overflowWrap: anywhere` z „Anna Nová" spravilo
  „An / na / No / vá"; dve písmená na riadok nie sú meno.
  **Prepínač Týždeň / 3 dni / Deň** (Jerry, 30. 9. 2026) drží voľbu
  v `localStorage`. Dve veci, ktoré k nemu patria a nesmú sa zabudnúť:
  šípky posúvajú o TOĽKO, KOĽKO JE VIDNO (skok o týždeň by pri troch dňoch
  preskočil štyri dni, o ktorých sa človek nedozvie) a prechádzajú cez
  okraj týždňa; a čísla nad mriežkou („37 tréningov · 37 h") aj výška
  mriežky sa počítajú z TOHO, ČO JE NA OBRAZOVKE, nie z týždňa — inak
  obrazovka ukazuje jeden deň a tvrdí súčet za sedem.
  Pri JEDNOM dni je nad mriežkou pás dní s počtom tréningov — prepínanie
  v rámci týždňa bez šípok. Šípky zostávajú vedľa neho, lebo nimi sa dá
  prejsť aj do susedného týždňa, kam pás nedočiahne.

Hranica je JEDNA: `useUzke()` v `components/psb/useUzke.ts` (640 px). Vlastná
kópia s inou hranicou znamená na jednej obrazovke dva rôzne telefóny.

**Stĺpce pod seba nestačia — musí sa dať aj rolovať.** Karta klienta má
`overflowY: visible`, lebo si výšku riadi sama; to platí len vedľa seba. Keď
sa stĺpce poskladajú pod seba, nerolovalo NIČ a spodok profilu sa nedal
dosiahnuť (Jerry, 30. 9. 2026: „v profile klienta sa mi nedá scrolovať").
Na telefóne preto roluje CELÁ karta a os času vnútri nej nie — vnorené
rolovanie sa prstom trafiť nedá.

**Okno nad obsahom nesmie byť priesvitné — `C.surface`, nie `C.bg`.** Okno
udalosti v kalendári malo `background: C.bg`; pod sklenenými paletami je to
priesvitná plocha a na telefóne, kde okno stojí nad mriežkou, sa cezeň čítali
mená tréningov (Jerry, 30. 9. 2026: „je to priesvitné, na tom telefóne je to
okno nečitateľné"). `C.surface` je práve tá nepriehľadná plocha a komentár nad
ňou v `theme.ts` to hovorí doslova: sklo funguje nad plochou, nie nad textom.
Platí to pre každý modál, pripnutý riadok a plávajúce okno.

**Pri tom istom pohľade sa našlo, že hodiny v rovnakom čase sa kreslili JEDNA
NA DRUHEJ** — všetky mali `left: 2, right: 2`. Rieši to `rozlozUdalosti`
(`lib/psb/kalendarRozlozenie.ts`): skupina prekrytí sa hľadá tranzitívne
(A–B, B–C → jedna skupina rovnakej šírky), stĺpec sa po skončení hodiny
uvoľní. Platí to na monitore rovnako ako na telefóne; na monitore sa to len
dalo prehliadnuť.

**Overiť to v prehliadači sa nemuselo dať.** Jerryho Chrome má priblíženie
~35 %, takže `innerWidth` je 1665 aj v malom okne a `resize_window` s tým nič
neurobí (ohlási úspech a `innerWidth` sa nehne — to je tá istá lož ako
„No updated asset files to upload"). Cesta je podstrčiť `window.matchMedia`
a prepnúť záložku tam a späť, aby sa komponent nanovo pripojil.

## Platnosť skončila a hodiny zostali — tri východiská, appka nevyberá

Jerry, 28. 9. 2026: „keď niekomu skončí platnosť členstva, ale ostane mu tam
nejako hodiny, chcem, aby ma notifikácie na to upozornili." Dovtedy sa to
nedozvedel od nikoho: karta „Balíček dojde" hovorí o tom, komu hodiny
DOCHÁDZAJÚ, a klienta po platnosti zámerne neťahá dopredu.

Tri východiská sú jeho, nie appkine (`platnostZostatok.ts`):

1. **Prepadlo** — hodiny zaniknú, nič sa nedopisuje.
2. **Doplnenie členstva** — „má ako keby tréning zdarma, ale vlastne nemá, len
   ho odtrénuje nad rámec platnosti". Hodiny sa zapíšu ako ručný balíček, takže
   ich odpočet ďalej vidí.
3. **Pri PREDPLATNOM** to isté, alebo **presun do ďalšieho balíčka — najviac
   dve hodiny**. Zvyšok nad dve prepadá aj tam; preniesť celé nedočerpané
   členstvo by znamenalo, že platnosť neznamená nič.

- **Hlási sa TRI DNI VOPRED.** Po skončení sa dá ešte dohodnúť, čo s tým, ale
  pred ním sa dá aj niečo odtrénovať — a to je lacnejšie pre oboch.
- **Kľúč nesie deň konca platnosti** (`platnost|meno|deň`): nové členstvo je
  nová otázka, ale to isté sa nepýta každý deň znova.
- **MOŽNOSTI PATRIA MEDZI TLAČIDLÁ, NIE DO TEXTU.** Prvá verzia mala vo vete
  „— nechať prepadnúť, alebo dopísať ako doplnenie a nechať ho to odtrénovať".
  Jerry: „toto sa nepýtaj a daj to dole medzi možnosti." Upozornenie, ktoré
  vymenuje, čo sa dá urobiť, a potom pošle človeka urobiť to inam, je
  polovičná odpoveď. Veta hovorí STAV, tlačidlá ponúkajú ROZHODNUTIE.
  Register na to má `RegisterItem.akcie` — zoznam možností s nepovinným
  balíčkom; bez neho sa len zapíše odpoveď, s ním sa najprv dopíšu hodiny.
  Je to všeobecný mechanizmus, nie jednorazovka: ďalšie upozornenie s
  konečným počtom východísk ho vie použiť tiež.
- **Odpoveď sa MUSÍ zapísať do `anomaly_ack`, nielen schovať riadok.**
  Notifikácia sa riadi zostatkom z PTmindera a ten sa dopísaním doplnenia
  nezmení — bez `ack` by sa upozornenie zajtra vrátilo, hoci Jerry odpovedal.
  Preto všetky tri tlačidlá acknú a dve z nich k tomu ešte zapíšu hodiny.

Stav pri spustení: 7 klientov, z toho 5 po platnosti (Regina Obrovská 5 h,
20 dní) a 2 pred ňou.


## Filter trénera musí platiť na CELÝ zoznam, nie na jeho časť

Karta „Balíček dojde" filtrovala podľa trénera len v slučke, ktorá dopĺňa
ľudí bez termínu v kalendári. Kým sa zoznam staval z `udalosti`, stačilo to —
tie prichádzajú už prefiltrované podľa trénera udalosti. 28. 9. 2026 k nim
pribudol rad `buduce` (objednané termíny na štyri mesiace), ktorý nesie len
klienta a deň, žiadneho trénera, a keď je neprázdny, `udalosti` NAHRÁDZA.
Filter tým ticho prestal platiť a Jerry videl pod svojím menom Terezkiných
klientov.

**Keď pribudne nový zdroj do zoznamu, over, čo z neho vypadne** — najmä
filtre, ktoré visia na poliach, ktoré nový zdroj nemá. A filter patrí na
KONIEC, k hotovému riadku, nie do jednej z vetiev, ktorými riadky vznikajú.
Rozhoduje pritom primárny tréner KLIENTA, nie trénera udalosti: karta je
o tom, komu predať ďalší balíček, a to je vec toho, kto ho vedie.

## Mail pre klienta: tabuľky namiesto obrázkov, údaje namiesto HTML

Jerry, 28. 9. 2026: „vedeli by sme ten mail spraviť nejako pekne vizuálne?
A okrem dochádzky a QR platby dať nejaké grafy?" (`mailKlientovi.ts`)

- **Tréningy sú ČASOVÁ OS, nie zoznam dátumov.** Jerry, 28. 9. 2026: „páčilo
  by sa mi, keby si z toho spravil časovú os, čiaru s bodkami — 6 h posledného
  balíka, deň a dátum, hodina, bodka, ďalšia bodka bude platba, a potom
  klasicky 5 h, 4 h." Zoznam dátumov hovorí, KEDY klient bol; os hovorí, ako
  sa balíček míňal — a to je to, kvôli čomu mail chodí. Na osi stoja aj
  platby a začiatok balíčka, nie iba tréningy, a ide OD NAJSTARŠIEHO (v
  profile je najnovšie hore, lebo tam Jerry hľadá poslednú vec; klient číta
  príbeh smerom dole). Predvolené obdobie je preto „posledný balíček", nie
  kalendárny mesiac — ten by os začal uprostred a prvý bod by chýbal.
- **Hodiny a mínus stoja VEDĽA seba.** „6 h −1" sú dve rôzne veci: koľká
  hodina balíčka to bola a koľký tréning to bol bez krytia. Prvá verzia
  mínusom hodiny prekryla a z osi zmizlo, že balíček vtedy ešte plný bol.
- **Grafy sú z TABULIEK, nie z obrázkov.** Stĺpec je bunka s `bgcolor`
  a šírkou v percentách — vykreslí ju aj Gmail, aj Outlook, nič sa nesťahuje
  zvonku a nerastie tým šanca na spam. Doména má DMARC `p=none`, takže
  obrázkový newsletter je riziko, ktoré si nemusíme pridávať. `<div>` so
  šírkou v percentách Outlook ignoruje, tabuľková bunka nie.
- **QR musí byť PRÍLOHA s `Content-ID`.** SVG aj `data:` adresu Gmail
  v obrázkoch zahadzuje; `cid:` prejde všade. `mimeSprava` preto vie skladať
  `alternative` (text + HTML), `related` (HTML + obrázky v ňom) a `mixed`
  (to všetko + prílohy na stiahnutie) — každá vrstva pribudne len vtedy, keď
  má čo obaliť, takže holý text vyzerá presne ako predtým.
- **Do poznámky pre príjemcu ide MENO klienta, nie variabilný symbol.**
  Kokpit páruje bankové príjmy podľa mena v texte platby; číslo, ktoré nikam
  nepatrí, by párovaniu nepomohlo a klienta by mýlilo.
- **Obrazovka posiela ÚDAJE, HTML sádže server.** Správa ide cudziemu
  človeku z našej adresy — hotové HTML z prehliadača by bola zbytočne
  otvorená cesta. Z prehliadača ide len veta, ktorú Jerry naozaj napísal.

### Čo v tom maili zámerne NIE JE

- **Porovnanie s ostatnými.** Jerry ho chcel („ako je na tom v porovnaní
  s priemerom"), ale polovica ľudí je z definície pod priemerom — a práve tej
  polovici by veta „chodíš menej než ostatní" dala dôvod skončiť, nie kúpiť
  si ďalší balíček. V maili stoja jeho VLASTNÉ čísla.
- **Bolesť.** Ponúkol som ju ako najsilnejší graf a bol to omyl:
  `klient_merania` je prázdna a zostane, meranie bolesti Jerry 24. 9. 2026
  zrušil. Pamäť to hovorí jasne a aj tak som to navrhol znova.
- **Naše písmo.** Agrandir mailová čítačka nemá a webové písmo Gmail
  ignoruje. Farby značky nesie zvyšok.

## Balíček a Předplatné — slovník, nie prepis dát

Jerry, 29. 9. 2026: „musíme zmeniť názvy balíkov — nemôže to byť bez
viazanosti a s viazanosťou, ale Balíček a Předplatné." Mal pravdu v tom,
čo tie slová hovoria: „BEZ viazanosti" je pohľad zvnútra, opisuje, čo klient
PODPÍSAL. Klient si kupuje balíček hodín alebo předplatné.

- **Dáta sa NEPREPISUJÚ.** Názvy chodia z PTmindera (133 + 89 riadkov
  exportu); prepísať ich v databáze by znamenalo rozísť sa so zdrojom —
  najbližší import ich prinesie späť a appka by mala od každého balíčka dve
  verzie. Preklad je na povrchu (`nazvyProduktov.ts`), pod ním zostáva
  pôvodný názov a všetko, čo z neho appka číta.
- **Nové predaje nesú nové názvy** (`cennik.ts`), takže sa slovník zjednotí
  sám. Parser hodín si s „Balíček 6 h" poradí rovnako ako s „OFF - 6h".
- **Sémantiku číta `jePredplatne`, nie `includes("s viazanost")`.** Na tom
  viseli DVE veci: príslušnosť k 6M (`sixMClientSet`) a dĺžka platnosti
  (`platnostMesiacov`, předplatné = 1 mesiac). Keby sa aktualizoval len
  cenník, nový „Předplatné 6 h" by prestal byť 6M a dostal by osemtýždňovú
  platnosť namiesto mesačnej.
- **Zdvojenie na osi sa odteraz pozná po DNI A HODINÁCH, nie po názve.**
  Ten istý predaj má počas súbežného chodu v Kokpite iné meno než v exporte
  a Jerry ho zapisuje do oboch — bez tejto zmeny by stál na osi dvakrát
  a hodiny by sa zdvojili.
- **Staré produkty sa neprekladajú.** SILVER, BRONZ, GOLD, ČLENSTVÍ ONE
  a spol. sú z roku 2025 a už sa nepredávajú; premenovať ich by znamenalo
  prepisovať históriu na niečo, čo si klient nikdy nekúpil.

## SMS je zvonček k mailu, nie druhá správa

Jerry, 28. 9. 2026: „mne by stačilo, že by klientovi došla SMS, že dnes máš
posledný tréning." Celý prehľad — dochádzka, tempo, QR — je v maili; SMS má
jedinú úlohu: aby si ho klient otvoril v deň, keď na tom záleží.

- **SMS má 70 znakov, nie 160.** Limit 160 platí len v GSM abecede; jediný
  mäkčeň prepne správu na UCS-2 a limit padne na 70. Zoznam tréningov by bol
  päť správ a vyzeral by ako vysypaná tabuľka do telefónu — preto v SMS nie
  je. `dlzkaSpravy` to počíta a obrazovka to ukáže PRED odoslaním: „jedna
  veta" a „tri SMS" sú dve rôzne veci.
- **Posiela sa AŽ PO maili a len keď mail prešiel.** Správa hovorí „v maili
  nájdeš dochádzku a QR"; poslať ju do prázdnej schránky je horšie než
  neposlať nič. Keď zlyhá SMS, mail už odišiel a povie sa to — opačne sa to
  napraviť nedá.
- **Nikdy sa neposielajú samy.** Naše číslo hodín je pri časti klientov
  dopočítané (`packageOdvodeny`) a správa „dnes si mal poslednú hodinu"
  človeku, ktorý má ešte tri, ide von k zákazníkovi a späť sa vziať nedá.
  Žiadny cron, žiadna dávka — jedna správa, ktorú niekto pred odoslaním videl.
- **Číslo sa normalizuje a nezmysel sa neposiela** (`cisloPreBranu`). V
  dátach sú „605965949", „776 491 800" aj osemciferný preklep; bez predvoľby
  sa predpokladá české číslo, domáci tvar s nulou je slovenský.
- **Brána je vymeniteľná** (`smsBrana.server.ts`): SMS Manager (predvolená,
  jeden kľúč, jedno volanie) a Twilio. Kľúč sa zadáva v Údajoch, von sa už
  nevracia a do chýb ide odpoveď brány, nie to, čím sme sa prihlásili —
  tá istá zásada ako pri hesle do schránky.


## Zrušené rozhodnutie sa môže vrátiť — keď padne jeho DÔVOD

Meranie bolesti Jerry 24. 9. 2026 zrušil a v pamäti stálo „neponúkať to
znova". 30. 9. 2026 to otvoril sám a z druhej strany: „to, čo sme povedali,
že robiť nebudeme, lebo je to robota navyše — tak že by to robil ten klient
sám."

Zrušené nebolo MERANIE, zrušená bola práca navyše pre trénera. Keď sa tá istá
vec spýta stránky, na ktorú klient aj tak klikne z SMS, dôvod neexistuje.
Pri každom „toto sme zamietli" sa preto pýtaj, či dnešný návrh nesie ten istý
dôvod — a nie len tú istú tému.

**Pocitovka** (`lib/psb/pocitovka.ts`, `pocitovkaStranka.ts`) — tri otázky
1–10 na verejnej stránke klienta:

- **Smer NIE JE pri všetkých rovnaký a je to zámer.** Bolesť sa na svete meria
  tak, že desať je najhoršie; prevrátiť ju „aby všetko rástlo" by znamenalo,
  že klient klepne sedmičku v opačnom význame, než v akom ju pozná. Každá
  otázka nesie `lepsie` a nikde sa smer nepočíta z hlavy.
- **Zmena sa počíta PRE KAŽDÚ OTÁZKU ZVLÁŠŤ**, z jej prvej a poslednej
  vyplnenej hodnoty. Klient nemusí zakaždým klepnúť všetky tri a spoločné
  „prvé a posledné meranie" by porovnávalo dva rôzne dni v jednej vete.
- **Bez JavaScriptu.** Stránka sa otvára z SMS, často v okne, ktoré si otvorí
  správa; skript, ktorý sa nenačíta, by z otázok spravil mŕtve políčka.
- **Klepnutie musí byť VIDNO.** Prvá verzia mala predvýber len zo servera:
  hodnoty sa zapisovali správne, ale kým bol klient na stránke, klepol na
  číslo a nestalo sa nič viditeľné — odosielal by naslepo. Rieši to
  `:checked + span` v `<style>`, teda zase bez skriptu.
- **Jedno hodnotenie nie je výsledok** a appka to hovorí nahlas. Je to tá istá
  veta ako pri „zostal rok je vernosť, nie zlepšenie".

**Personalizovaná je tým, že sa pýta na JEHO oblasti.** Jerry, 30. 9. 2026:
„v anamnéze môže človek zakliknúť, ak ho niečo bolí, preto by mala byť tá
správa personalizovaná a človek by mohol zaškrtávať stále tie svoje
problémy, ktoré mal na počiatku." Jedno číslo „bolesť" to nevie: klient má
v anamnéze krk 7 a koleno 3 a po troch mesiacoch sa jedno zlepší a druhé
nie. Stránka preto číta oblasti z jeho anamnézy (`podlaKlienta`, zápis
trénera prebíja to, čo odklikol klient) a pýta sa na ne v TOM ISTOM tvare
`[{oblast, sila}]` a na tej istej stupnici 0–10 — prvá hodnota je tým pádom
to, čo povedal na úvodnom, a graf má odkiaľ začať. Bez anamnézy sa pýta
jeden všeobecný riadok; otázka bez anamnézy je lepšia než žiadna.

**Každá oblasť je vlastný rad s vlastným začiatkom.** Klient pridá „koleno"
až po mesiaci a spoločné „prvé a posledné meranie" by ho porovnávalo s krkom.

**Meno oblasti ide do skrytého políčka, hodnota sa páruje PORADÍM.**
„hrudní páteř" ani „lokty / zápěstí" sa do názvu poľa dať nedajú.

**Smer je JEDEN — a stojí pri stupnici napísaný slovom.** Jerry, 30. 9.
2026: „vedľa nuly naľavo daj najlepšie a vedľa 10 napravo daj najhoršie."
Sú pod krajnými číslami, nie vedľa nich: vedľa by sa im na 375 px nezmestili
tak, aby na číslo zostal palec. Otázka „ako ťažko ti išli bežné veci" je od
toho istého dňa preč (migrácia 0091) — bola jediná, ktorá sa nepýtala na to,
s čím klient prišiel, a pocitovka má byť tak krátka, aby ju človek klepol
cestou z tréningu.

**NIČ sa nepredklepáva.** Jerry, 30. 9. 2026: „pôvodnú odpoveď nevyznačuj
napevno, ale iba daj inou farbou alebo orámikuj." Je to viac než vzhľad:
predvybraná odpoveď by sa odoslala aj vtedy, keď sa jej klient ani nedotkol,
a z „nechcelo sa mi" by spravila tvrdenie o jeho tele. Minulá hodnota sa
kreslí prerušovaným rámikom a vetou „minule 9 · 15. 8."; to isté platí pre
napísaný odkaz — ukáže sa ako citát nad prázdnym políčkom.

**Je to DOBROVOĽNÉ a stojí to hneď pri nadpise.** Jerry, 30. 9. 2026: „toto
je vec, ktorou nechceme klientov obťažovať, toto by mali spraviť, keď tak,
z vlastnej vôle." Preto „Ako ti je? — nepovinné, len ak sa ti chce", žiadne
`required` a v Jarvisovom kontexte veta, že chýbajúca odpoveď NIE JE
odpoveď.

**Posun nie je stupnica, sú to tri možnosti** (vôbec / trochu / veľmi).
Je to otázka na pocit zo zmeny, nie na stav tela; desať stupňov by z nej
spravilo meranie, ktorým nie je. A vedľa nej stojí otvorená „Čo sa
zmenilo?" — to je to, čo sa z čísel nevyčíta, a v profile aj v Jarvisovom
kontexte sa ukazuje doslovne.


## Šesť SMS nie je správa, je to stránka poslaná po kúskoch

Text, ktorý Jerry posielal pred úvodným tréningom, má 780 znakov. To je
v GSM abecede šesť SMS — a s diakritikou dvanásť, lebo jediný mäkčeň zhodí
limit zo 160 na 70 znakov. Klient to dostal rozsypané na šesť bubliniek,
v ktorých sa odkaz na YouTube môže zalomiť.

Od 1. 10. 2026 chodí jedna veta s odkazom na `/u/<token>`
(`routes/u.$token.tsx`, obsah skladá `lib/psb/uvodnaStranka.ts`). Pravidlá,
ktoré k tomu patria:

- **Termín sa berie ŽIVO Z KALENDÁRA**, nie z riadku odkazu. Keď sa hodina
  presunie, stránka ukáže nový čas — a presne to je dôvod, prečo je za SMS
  stránka a nie šesť bubliniek s dátumom, ktorý sa už nedá opraviť. Uložené
  `kedy` je len záchranná sieť. Dopyt MUSÍ mať `zmizla_at IS NULL`, inak
  stránka pozve na zrušenú hodinu.
- **CENA PATRÍ K ODKAZU, nie do konštanty.** Jerry, 1. 10. 2026: „niekedy
  chceme dať klientovi za úvodný tréning zľavu — a vtedy by sa mala upraviť
  aj cena v tom odkaze." `uvodne_odkazy.cena_czk`: NULL = bežných 1100,
  nula = zadarmo (rozhodnutie, nie chýbajúci údaj). Zľava sa NEZAMLČÍ —
  pôvodná cena zostane prečiarknutá vedľa novej, inak klient vidí len iné
  číslo, než aké mu niekto povedal po telefóne.
- **Stránka patrí tomu trénerovi, ktorý ten tréning vedie.** Meno, podpis,
  telefón aj cieľ tlačidiel berie `TRENERI` z `mailFaktury.ts`. Keď vedie
  úvodný Terezka, Jerryho číslo tam nesmie byť nikde — test to stráži.
- **Potvrdenie otvorí SPRÁVU s vyplneným číslom aj textom** (`sms:` s
  `?&body=`). Odoslať ju musí človek: žiadny systém nedovolí stránke poslať
  SMS za niekoho, a je to tak dobre — inak by chodili potvrdenia od omylom
  klepnutých tlačidiel. V HTML je `&` ako `&amp;`; prehliadač ho dekóduje.
- **Žiadny JavaScript.** Otvára sa z SMS, často v okne, ktoré si otvorí
  správa; skript, ktorý sa nenačíta, by z tlačidiel spravil mŕtve obdĺžniky.
- **Sadzba je zo ŽIVÉHO WEBU** (biela, `#1A2E24`, akcent `#2D7D5A`, Raleway
  a Open Sans, polomer 32 px), nie z Kokpitu — klient nie je používateľ
  appky a Kokpit je tmavý. Logo je `znacka-napis-tmava.svg`: PNG z mailu je
  BIELA a na bielom pozadí nebolo vidieť nič.
- **Nová routa potrebuje preklad stromu.** `routeTree.gen.ts` generuje vite,
  takže `tsc` pred buildom o novej routy nevie a `hotovo.sh` spadne na typoch.
  Pusti `bunx vite build` raz a potom celý reťazec.

**Odkaz sa vyrába z NOTIFIKÁCIE o novom dopyte** (`odpoved|<id>`, Terezkina).
Tlačidlo „Úvodný dohodnutý" otvorí rovno tam dátum, čas, kto povedie a cenu;
appka vyrobí odkaz a pripraví SMS. Pravidlá:

- **Telefón nesie POLOŽKA REGISTRA** (`RegisterItem.telefon`), nie prop cez
  pol komponentu. Nesie ho len tá jedna položka — číslo, ktoré nikto
  nepotrebuje, je ďalší údaj navyše.
- **Správa sa neposiela sama.** Je v políčku, dá sa prepísať a odošle sa až
  klikom; vedľa stojí počet znakov a SMS. To isté pravidlo ako pri SMS po
  tréningu: ide von k cudziemu človeku a späť sa vziať nedá.
- **Keď dopyt nemá telefón, povie to** („odkaz vyrobím, poslať ho budeš
  musieť ručne") namiesto tlačidla, ktoré nič neurobí.
- **Odkazy v SMS idú cez `prosapiens.cz`, nie cez workers.dev**
  (`lib/psb/verejnyOdkaz.ts`, od 1. 10. 2026). Adresa workera má 46 znakov
  a správa s ňou mala 172 = dve SMS; cez vlastnú doménu má 28 a správa 153 =
  jedna. Pri 56 úvodných ročne je to 56 správ zadarmo.
  Presmerovanie robí WordPress — snippet „Krátky odkaz pre SMS (/u/ a /v/)",
  id 26: `/u/<token>` a `/v/<token>` pošle 302 na workera, všetko ostatné
  nechá na webe. **Doména NIE JE na Cloudflare** (DNS je na Websupporte),
  takže vlastná doména workera ani Workers Route neprichádzajú do úvahy —
  preto redirect na webe a nie elegantnejšia cesta.
  `verejnyOdkaz` púšťa cez doménu LEN to, čo snippet pozná (`/u/`, `/v/`
  a tvar tokenu); čokoľvek iné ide priamo na workera. Odkaz, ktorý skončí
  na 404, je horší než dlhá adresa — a snippet sa dá zmeniť len na webe,
  kým appka sa nasadzuje odtiaľto.
  Keď sa presmerovanie raz rozbije, mení sa JEDNA konštanta
  (`VEREJNA_DOMENA`) a odkazy idú znova priamo.
- **Ceník je na `/sluzby/`, nie na `/jak-to-funguje/`.** Jerry, 1. 10. 2026.
  Odkaz vedie na `/sluzby/#cenik` — kotvu som pridal do témy
  (`parts/sluzby.html`, `<div class="spread" id="cenik">`), lebo stránka je
  vodorovné listovanie a bez nej človek pristane na začiatku a ceny musí
  nalistovať. Téma kotvy vie (`anchorGo` v `js/app.js`), len ich dovtedy
  žiadna obrazovka nemala. **Zmena témy sa robí na DVOCH miestach**: v repe
  (`navrhy-webu/tema/psb-spready/`, zdroj pravdy) a cez Editor šablón vo
  WordPresse (živý web) — inak sa pri najbližšom nahratí témy prepíše.


## `<datalist>` kreslí prehliadač — a na telefóne si ju položí, kam chce

1. 10. 2026 Jerry nahadzoval tréningy z iPadu: zoznam klientov sa zjavil
**odtrhnutý v ľavom hornom rohu obrazovky** a po prvom písmene zmizol úplne
(iPadOS ho prehodí do pásu nad klávesnicou). Na MacBooku sa nad roletu
položila **ponuka KONTAKTOV z telefónu** a náš zoznam ostal schovaný pod ňou.

Ani jedno nie je chyba v našom kóde — je to presne to, čo `<datalist>` robí:
dáva vzhľad aj umiestnenie prehliadaču. Pri poli, ktoré sa volá „meno",
si ho navyše operačný systém vyloží ako kolónku na meno z adresára.

**Roletu preto kreslí appka** (`components/psb/VyberMena.tsx`), filter je
`najdiMena` v `lib/psb/vyberMena.ts`:

- **Políčko musí systému povedať, že o kontakty nestojí**: `autoComplete`,
  `autoCorrect`, `autoCapitalize` na `off`, `spellCheck` false a `name`,
  v ktorom nie je slovo meno (`psb-vyber`). Bez toho ponuka kontaktov
  prebije čokoľvek, čo nakreslíme.
- **Roleta je NEPRIEHĽADNÁ** (`C.surface`) — pravidlo z 30. 9. 2026 platí aj
  tu; cez priesvitnú by sa čítal text pod ňou.
- **`onMouseDown` na položke robí `preventDefault`.** Bez toho políčko
  stratí fokus skôr, než klik dobehne, roleta sa zavrie a nevyberie sa nič.
- **Filter je lepší než prehliadačový**: nerozlišuje diakritiku ani veľkosť
  písmen, hľadá aj v priezvisku a dve slová musia sedieť obe („martin v" →
  Martin Vaško). Kto začína hľadaným, je hore.
- Šípky, Enter a Escape fungujú — na MacBooku je to rýchlejšie než myš a je
  to to isté, čo robila pôvodná roleta.

V Kalendári boli takéto polia ŠTYRI; vymenili sa všetky naraz. Keď pribudne
ďalšie pole s menom klienta, patrí doň `VyberMena`, nie `<datalist>`.

## Jeden prevod za viacerých klientov — každý dostane svoju platbu

Jerry, 4. 10. 2026: „Dan a Monika platia na jednu faktúru… jedna faktúra za
oboch, preto je to 15 580, ale v PTminderi/Kokpite sa zapíše každému členstvo
a platba za 7 790." Dávka 28. 9. zapísala 15 580 z DK Consulting (15. 5.
a 26. 7.) celé Danovi, lebo variabilný symbol ukazoval na jeho firmu.

- **Faktúra za viacerých** — `vydane_faktury_polozky` (migrácia 0096). Hlavný
  riadok faktúry je prvá položka platiteľa; `celkom_czk` je SÚČET všetkých.
  Každá ďalšia položka nesie svojho klienta. Formulár: „+ ďalší klient na
  tejto faktúre". Doklad aj mail píšu pri každej položke meno.
- **Návrh rozdelenia** (`navrhniRozdelenie`, `rozdelenieZFaktury` v
  `platbyEvidencia.ts`) — v poradí: položky faktúry podľa VS → spoloční
  platitelia (dvojica z už rozdelených pohybov; diely z PTmindera alebo
  z ceny balíčka, aj z `ptminder_historia`) → PTminder sám. Návrh len keď je
  jediný. Spoločný prevod sa NIKDY nepredvyplní jednému človeku celý —
  dávka, Workspace aj zoznam platieb ho ponúknu ako diely.
- **PTminder hovorí iné meno** — keď navrhnutý klient v PTminderi tú platbu
  nemá a v ten deň ju má niekto iný, návrh prestane byť jednoznačný (obaja
  do výberu + veta). Platí aj pre naučené pravidlo: z dávky sa naučilo
  „hrdina michal" → Michal Knapčok.
- Diely zapisuje jedno miesto, `zapisDiely` v `api/platby.ts` (ručné
  rozdelenie aj dávka). Pravidlo odosielateľa sa pri dieloch neučí.

## Workspace po krokoch a balíček z prvého tréningu (naostro od 5. 10. 2026)

Jerry: „z 12 krokov sa stanú štyri — a na každý ten krok chcem vo Workspace
jeden list." Od 5. 10. 2026 naostro (predtým beta) má kopa karty Kalendár · SMS · Platby a balíčky
(od 5. 10. 2026 bez samostatnej karty Balíčky — balíčky vznikajú samy, jej dve
rozhodnutia, končiaca platnosť a „sedí?" po návrate, sú v kroku Platby) (`krokyBety` vo `workspaceKarty.ts`, pravidlá vo `workspaceKroky.ts`,
obrazovka vo `WorkspaceKroky.tsx`). Krok nezmizne, prázdny povie „Všetko
vybavené". SMS sa posielajú LEN z kroku 2 (z Dnes a Kalendára preč).

- **Nezaplatený balíček z Kokpitu ide do mínusu** (`nezaplateneZKokpitu`,
  počíta `loadData` raz → `data.nezaplateneKokpit`, `data.dlhKokpit`).
  Platby sa kladú na balíčky od najstaršieho; čiastočná platba = nezaplatené.
  Kartu, os aj dlh (zoznam dlžníkov, profil, QR za odkazom) rozhoduje to isté.
- **Poistka z PTmindera** (`zaplateneVPtminderi`): kým beží PTminder, jeho
  platba alebo členstvo bez otvoreného poplatku = zaplatené. Bez nej by
  Papiež a Šnirychová vyšli ako dlžníci — Kokpit mal výpis z Fio len do 27. 9.
  **Pravidlo je pravdivé len pri stiahnutej a spárovanej banke.**
- **Platba vopred** (`platby.vopred`, migrácia 0097): nastaví sa pri priradení,
  keď klient nič nedlží (`jeVopred` v `api/platby.ts`). Počíta sa do dlhu aj
  spred prvého balíčka z Kokpitu → pokryje balíček, ktorý vznikne neskôr.
- **Balíček vzniká SÁM** (`automatickeBalicky.server.ts`, `/api/balicky`
  akcia `automaticky`): App ho volá 8 s po načítaní dát, najviac raz za 10 min
  (ťažké dopyty naraz zhodili worker 1. 9.). Idempotentné; poznámka začína
  „automaticky —". Klient s nerozhodnutou platnosťou čaká (doplnenie ide prvé).
  Naliatie z PTmindera preskočí balíček s rovnakými hodinami do 14 dní od
  automatického; poplatok z PTmindera sa s balíčkom z Kokpitu páruje pri
  rovnakej cene do 3 dní. Krok Platby a balíčky sa pýta len „sedí?" pri návrate.
- **Kalendár v kroku 1**: klik na meno rozbalí týždeň trénera
  (`TyzdenKalendara`, `/api/kalendar?tyzden=`): zmazané červeno, presun bliká
  žlto medzi starým a novým časom, nový názov sa zvýrazní.
- **Platby v kroku 3**: klik na dlžníka ukáže nepriradené platby z Fio, ktoré
  k nemu sedia menom alebo sumou (`kandidatiPlatby`); „vybavené" tam nie je.
- **Dashboard**: nezaplatené (aj z Kokpitu) navrchu karty balíčkov,
  „Hodiny bez balíčka" preč, pri „Balíček dojde" bez „napísať".
- **Nový balíček z prvého tréningu** (`navrhNovehoBalicka`): len POSLEDNÉ
  obdobie klienta; tréning s odpočtom (`zostatok`) je krytý aj s mínusom
  (to je „odtrénované pred platbou"); na nezaplatenom balíčku sú nekryté len
  tréningy nad jeho hodiny. Veľkosť ako naposledy, cena z cenníka (stála iná
  cena dvakrát po sebe sa drží). Návrat po > 60 dňoch = otázka „sedí?".
  V bete sa zapisuje klikom — beta píše do ostrej DB.
- **Platnosť ako PTminder** (`platnostDo` v `cennik.ts`): 8 týždňov = +55 dní,
  4 týždne +27, mesiac/pol roka = deň pred tým istým dňom.
- **Končiaca platnosť** (`KrokPlatnost`): posuvník doplnenia 0…X h, zvyšok
  prepadá; předplatné aj „preniesť 2 h do ďalšieho balíčka" (`balicky_presun`,
  pridá ich prvý ďalší balíček). Odpoveď ide do `anomaly_ack` — nevráti sa.
- **Suma nesedí** (`otazkyPlatieb`): platba na balíček nesedí → „je to 6h?"
  (prepíše veľkosť) / „zľava 10 %" / iná cena s dôvodom / doplatí zvyšok.
- **Druhé číslo klienta** (`klient_fakturacia.telefon2`): okno SMS ponúkne
  uložiť číslo, ktoré nepatrí nikomu, ako druhé; prepínač medzi číslami.
- Platba mení hodiny → App po `oznam("peniaze")` načíta `/api/data` znova.
- Beta nemá `FIO_TOKEN` — „Stiahnuť príjmy z Fio" tam hlási chýbajúci token.

## Workspace — mesačné karty a peniaze podľa trénera (naostro od 5. 10. 2026)

Jerry: „Workspace má byť miesto práce." Najprv v bete, naostro od 5. 10. 2026
(„postav v Kokpite aj Dopyty, Uzávierku a Kontroly" — s nimi aj peniaze podľa
trénera, lebo Jerry videl u seba Terezkinu dlžníčku Šašinkovú):
- **Dopyty** (`KrokDopyty`) — Terezkina karta: čaká na odpoveď (od 12. 8.,
  bez klientov a bez termínu — tie isté pravidlá ako `Dopyty.tsx`), dopyty
  bez výsledku, úvodní bez zdroja (jej krok uzávierky), celý zoznam zabalený.
- **Uzávierka mesiaca** (`KrokUzavierka`) — kroky z `krokyZamku` v App,
  predošlý kalendárny mesiac; „Odkiaľ prišli" je Terezkin, zvyšok Jerryho.
  Fio sa nenahráva súborom: „Stiahnuť mesiac z Fio" stiahne cez API a zapíše
  všetky pohyby (aj výdavky) s kategóriou z pravidiel. Zámok cez /api/periods.
- **Mesačné kontroly** (`KrokKontroly`) — štyri z `ritualy`; odškrtnutie je
  ten istý kľúč ako register (`zapis|kontrola-…`).
- **Kto čo vidí** (`krokyBety` `ja`): Dopyty len Terezka, Uzávierka
  a Kontroly len Jerry; pri „všetko" všetky.
- **Uzávierka sa robí v karte**: klik na krok rozbalí jeho pracovné miesto
  (`obsahKroku`) — tie isté komponenty ako v Údajoch a VZAS: `UploadCard`
  (PTminder, Metricool), `BankaUlozene` s filtrom mesiaca (Fio, zaradenie),
  `Zosit`, `OtazkyMesiaca` (obal `MonthNoteRow`), `KamOdisliCard`
  (hotovosť), `RegisterRow` (upozornenia). App kvôli tomu posiela Workspace
  `actions`, `chat`, `register`, `pohybSplits`. Marketing sa po nahratí
  načíta znova (`data.uploadLog`), inak krok Metricool ostal neodškrtnutý.
- **Krok uzávierky ukazuje len svoj zdroj** (`UploadCard zameranie`): PTminder
  jeho päť reportov (dáta do / nahraté), Metricool jednotlivé reporty
  s obdobím z názvu súboru (`/api/raw-uploads?druh=metricool`). Fajku má len
  report, ktorý POKRÝVA mesiac uzávierky — augustový export septembrovú
  nezavrie. Mesačná PDF zostava je len v `upload_log` a `data.uploadLog` nesie
  posledných 40 riadkov, preto ju endpoint vracia zvlášť. Dátum nahratia
  stojí pri každom kroku; Fio a zošit z `/api/fio?nahrate=1` (nemajú upload_log).
- **Uzávierku má aj Terezka** — vidí v nej „Odkiaľ prišli" a „Otázky mesiaca"
  (otvorené hneď) a píše len do svojich polí (`OtazkyMesiaca ja`); Jerryho
  odpoveď vidí ako text. `/api/vzas-notes` odpovede ZLUČUJE s uloženými,
  inak by zápis jedného prepísal druhého. `OtazkyMesiaca` kreslí formulár až
  po načítaní odpovedí (pravidlo z 29. 8.). „Čo bolo iné" sú dlaždice
  (`CoBoloIne`) — výplaty neutrálne modré, nižšia výplata nie je úspora.
- **Peniaze podľa trénera** (`rozdelPeniaze` v `postavKarty`): dlžníci a platby
  z banky podľa trénera klienta; platba bez návrhu ostáva Jerrymu. Faktúry
  vo Workspace cez `lenTrenera`.

## Workspace drží prácu na každej karte (pravidlo, 5. 10. 2026)

Jerry: „nech na ktorejkoľvek karte robím čokoľvek — mám otvorený profil,
píšem, vyberám — a prepnem zámerne alebo omylom doľava či doprava, po návrate
mám byť presne tam, kde som skončil, so všetkým, čo som tam robil."
- Všetky karty kopy ostávajú NAČÍTANÉ; neaktívne majú `visibility: hidden`
  (nie `display: none` a nie odmontovanie) — drží sa stav komponentov aj
  rolovanie. Nová karta sa preto nesmie spoliehať na „pri otvorení sa
  načítam znova"; obnovu rieši signál (`oznam`/`pocuvaj`).
- Index karty je v `sessionStorage` (`psb-workspace-karta`) — návrat do
  Workspace aj obnovenie stránky pristane na tej istej karte.
- Platnosť končí: posuvník ide od „doplnenie" (vľavo, predvolené) k „prepadne"
  (vpravo), vedľa „1 h doplnenie · 1 h prepadne" / „2 h prepadne"; druh
  členstva a koniec platnosti sú pod menom.
- **Vyťaženosť týždňa navrchu kroku 1** (naostro od 5. 10. 2026, krok sa
  volá „Kalendár a vyťaženosť"): `VytazenostTyzdna` píše do `<osoba>_score/_hours/_note`
  (tie isté polia ako Tréningy → Prehľad, server zlučuje). Od piatku sa pýta
  na bežiaci týždeň, po–št na minulý (`tyzdenVytazenosti`); rozbalená, kým
  chýba MOJE číslo, po uložení sa zabalí. Pri „všetko" za prihláseného. Předplatné má vedľa zelené „Preniesť N h" (najviac 2).
## Workspace je jediné miesto, kde sa niečo ROBÍ (5. 10. 2026)

Jerry: „dáva zmysel, aby to bolo na dvoch miestach?" Nie. Pravidlo: vo
Workspace sa vybavuje, ostatné záložky sa pozerajú a ukazujú naň.
- **Kalendár**: zoznam zmien a „Nové názvy" sa tu nevybavujú — riadok „N zmien
  · M nových názvov → Vybaviť vo Workspace". Ostáva ručný zápis toho, čo
  kalendár nevidel, „Nedávno vybavené" (krok späť), Jedno meno – viac
  klientov a Chýba v PTminderi.
- **Upload**: bez zošita, pohybov z banky a uzávierky. Ostáva nahrávanie
  súborov, ktoré inde miesto nemajú (iDoklad, Alza, Klienti, cenník…),
  BTC párovanie a nastavenia. Zoznam všetkých mesiacov so zámkom/odomknutím
  (`Uzavierky`) je zbalený pod kartou Uzávierka mesiaca.
- **Tréningy → Prehľad**: náročnosť len na čítanie (stĺpce „N", farby už
  správne — nízke je dobré).
- **Register / + Zápis**: týždenná vyťaženosť a mesačné kontroly sa
  vyfiltrujú (`mimoWorkspace` v `rituals.ts`). V `registerServer` (ranná
  správa na telefón) sa vyťaženosť NEFILTRUJE — Jerry si piatkový push
  vrátil; klik vedie na `workspace|kalendar`.
  Uzávierka a stav hotovosti ostávajú ako pripomienka, ale vedú do Workspace.
- **Preklik na krok**: `navigate("workspace", "<krok>")` → `otvorKrok`.
  Upozornenia o zmenách, „bol tam?" a nových názvoch majú `workspace|kalendar`.
- Karta Klient je v kope POSLEDNÁ; kopa sa otvára na kroku 1.

## Duplikovať a iný tréner v kalendári (5. 10. 2026)

Okno udalosti (`OknoUdalosti`) má pri tréningu s klientom „Duplikovať"
(predvolene o týždeň, ten istý čas — ide cez `trening-nahod`) a „Iný tréner"
(`trening-iny-trener`): server NAJPRV založí udalosť v kalendári druhého
trénera, až potom zmaže pôvodnú. Keď zlyhá zmazanie, vráti `castocne: true`
a vetu „bude dvakrát" — opačné poradie by vedelo tréning stratiť. Pôvodná
dostane `zmizla_at`, takže ju snímka nehlási ako zrušenie.

## Hromadná správa (5. 10. 2026)

Workspace → 2 · SMS → „Hromadná správa" (úplne dole) (`HromadnaSprava.tsx`): filter
Aktívni / + pauza / Všetci, „len moji klienti", ručný výber zaškrtnutím
a hľadanie kohokoľvek; `{meno}` = krstné meno. Odosiela sa po DRUHOM
potvrdení s počtom SMS, po jednej cez `/api/sms` (dá sa zastaviť). Čísla
z `klient_fakturacia` (`/api/vydane-faktury` → `udaje`). V audite ako
`sms-hromadna`, NIE `sms-odoslana` — inak by oznam pre všetkých vyčistil
zoznam kroku SMS, ktorý stojí na stave hodín.

## Nový balíček preberá nekryté tréningy pred sebou (5. 10. 2026)

PTminder („Sessions allocation") pripíše novému balíčku aj tréningy pred jeho
zápisom, na ktoré predošlé obdobie nemalo hodinu: Broskva ONE YEAR (9. 5.)
má 5. 5., Krčmar (2. 8.) 23., 28., 30. 7. Koľko ich je, sa z exportu presne
nevyčíta (doplnenia bez počtu), tak ho prezradí karta: o koľko by posledný
balíček mal viac než `packageRemaining`, toľko NAJNOVŠÍCH nekrytých
tréningov (do 60 dní pred ním) prevezme — aj s platbami od prvého z nich
(Krčmar platil 23. a 24. 7. v dvoch častiach). Len balíček, ktorý sa ešte
používa (tréning za posledných 60 dní od dneška) — inak by si ho zobral aj
klient s prepadnutými hodinami (Holubová). Overené nad celou DB: mení presne
Broskvu a Krčmara. `priebehBalickov` vo `vypisHodin.ts`, testy tam.

## Jedno pravidlo „zaplatený" — `dlhyKlientov` (5. 10. 2026)

Do toho dňa rozhodovalo o „zaplatený / dlh" 13 miest a 12 si vedelo
protirečiť (okná ±3, ±14, 0–30, −10…+60 dní; Dnes a karta dlžníkov
odstraňovali zdvojený predaj z opačných strán; profil ho sčítal dvakrát —
Vaško 13 980 namiesto 6 990). Odteraz:

- **`lib/psb/zaplatene.ts` `dlhyKlientov`** — jediné miesto. Kroky:
  poplatky PTmindera − platby Kokpitu → balíčky Kokpitu FIFO → poistka
  z PTmindera → poplatok, ktorý je ten istý predaj ako balíček z Kokpitu
  (rovnaká cena do 3 dní), ustúpi balíčku.
- `loadData` z neho plní `data.dlhy` (položky dlhu: klient, deň, za čo,
  cena, doplatit, zdroj, id balíčka) a `data.bezHodin` (dni, ktoré hodiny
  nedávajú = položky dlhu + **dvojčatá** — poplatok, ktorý ustúpil balíčku;
  pod ním je v PTminderi riadok toho istého predaja a nesmie dať hodiny).
- Čítajú LEN toto: karta klienta (hodiny), os času, karta dlžníkov, dlh
  jedného klienta (stránka `/v/`, QR, SMS), Dnes, profil, Prehľad peňazí,
  Jarvis (`nezaplatene`, `dlznici`), otázka „suma nesedí" (`otazkyPlatieb`)
  aj príznak „vopred" pri zápise platby (`jeVopred` volá tú istú funkciu
  pre jedného klienta).
- **`loadData` musí brať `id` balíčkov** — bez neho `otazkyPlatieb` mlčí
  (nález nezávislej kontroly; test v `dlznici.test.ts`).
- Zámerne mimo: tržby z kalendára (`platnyBalicek` — tržba vzniká
  tréningom) a karta „Bez balíčka" (nezaplatený balíček je balíček; patrí
  do „Dlhujú").
- **Os času berie riadky `balicky` v oboch tvaroch** (`platnost_od` aj
  `platnostOd`) — App, Workspace a automatické balíčky posielali camelCase
  a Kokpitove balíčky im na osi ticho chýbali.
- Overenie: snímka pred/po nad kópiou ostrej DB pre všetkých 127 klientov
  (hodiny, dlh, dlžníci, príznaky na osi, mínus, otázky, návrhy balíčkov) —
  zhodné; jediná zmena na obrazovkách je oprava Vaškovho profilu.

## Deň podľa Prahy, nie UTC (5. 10. 2026)

`toISOString().slice(0, 10)` je UTC deň — medzi polnocou a 01:00/02:00
v Prahe bola appka vo včerajšku (na serveri aj ranná piatková pripomienka,
„dnešné" tréningy, týždeň v registri). Pravidlá:

- **„Dnes" je `dnesPraha()`**, „teraz" na porovnanie s kalendárom
  `terazPraha()`, posun dní `posunDen`, mesiac `mesiacPraha`, deň v týždni
  `denVTyzdniPraha` — všetko v `lib/psb/cas.ts`. Formátovač sa stavia raz
  a výsledok sa pamätá na minútu (toLocaleString stál 42 µs na volanie).
- **`kal_udalosti.zaciatok` je pražský čas bez pásma.** Neparsuj ho cez
  `Date.parse` a neporovnávaj s `Date.now()` (server ho číta ako UTC) —
  porovnávaj reťazce `zaciatok.slice(0, 16)` s `terazPraha()`.
- **Časy zápisu (`created_at`, `vzas_audit.at`) sú UTC.** S holým dňom ich
  neporovnávaj; začiatok pražského dňa je `polnocPrahaUtc()`.
- **Okno kalendára (`okno()` v `api/kalendar.ts`) musí byť pre databázu aj
  pre `citajIcal` z tých istých reťazcov** — `citajIcal` číta miestny čas
  ako „…Z". Rozídené okná = každý tréning o 21 dní neskôr „pribudol".
- **Pozor na hromadné nahrádzanie v reťazcoch**: snippet pre web v Údajoch
  je JavaScript v texte — `dnesPraha()` tam neexistuje.
- Testy púšťaj aj s `TZ=UTC` (tak beží server): `TZ=UTC bun test src/lib/psb src/components/psb`.
- Lokálny čas v module zostal len tam, kde beží iba v prehliadači
  (`vzas.ts` mesiace, `nextMonthKeys`) — na serveri ich nič nečíta.

## Platby z Kokpitu na osi času klienta (5. 10. 2026)

Os (`osCasuKlienta`) do toho dňa poznala len platby z PTmindera — platba
videná len v banke chýbala v profile aj v maili „celá história". Teraz
`loadData` posiela `data.platbyKokpit` a os ich zlúči cez **`zlucPlatby`**
(`klientOsCasu.ts`): platba z Kokpitu ide na os vždy, z PTmindera ostane len
to, čo v Kokpite nie je. Párovanie: (1) rovnaká suma ± 1 Kč do 10 dní,
(2) súčet 2–3 riadkov PTmindera do 3 dní (Albert Matl 1 100 + 7 790 = 8 890),
(3) preklep do 3 dní a 5 % / 100 Kč (Kalva 990 → 900). Deň sa berie SKORŠÍ —
banka pripisuje o deň-dva neskôr a tréning v deň platby by dostal −1.
Overené snímkou pred/po nad ostrou DB: karta, koniec osi, mínus a návrhy
balíčkov u všetkých 127 klientov bez zmeny; mínusov pri tréningoch 468 → 467.

## Myšlienková mapa: klávesnica, osnova, výber, hľadanie (5. 10. 2026)

Štyri mechaniky z rešerše 25. 9. (`docs/zoznam.md` 2b), všetko nad tými
istými riadkami `mkt_napady`:

- **↑ ↓** — na mape súrodenci (nad prvým jeho rodič), v osnove riadky.
  **⌘↑ ⌘↓** preradí; rad súrodencov sa prečísluje celý a zapíše naraz
  (`akcia: "mapa-poradie"`, D1 batch). Staré poradie má diery aj zhody.
- **Osnova** je tretí pohľad, nie druhá pravda. Klávesnica je JEDNA
  (`klavesy`, `vstupNapadu`) pre mapu aj osnovu — dve kópie by sa rozišli.
- **Vysyp a usporiadaj**: klik vyberá, shift+klik úsek, číslica 1–5 alebo
  tlačidlo dá fázu všetkým (`akcia: "napady-faza"`).
- **⌘F** hľadá vo všetkých mapách bez diakritiky; skok prepne mapu,
  rozbalí zbalených predkov a postaví na nápad pohľad. Berie ⌘F len keď je
  mapa v strede obrazovky alebo je v nej kurzor.
- **Enter vkladá hneď za** (`za` → server `vlozenieZa`): do toho dňa sa nový
  zrazil s ďalším súrodencom. Server overuje, že `rodic` existuje v tej
  istej mape.

**Koncept sa ukladá bez čakania.** Enter predtým koncept odstránil, počkal na
server (~0,4 s) a až potom založil ďalší riadok — čo človek medzitým napísal,
padlo do prázdna a raz to skončilo v CUDZOM riadku (overené v bete
skutočnými klávesmi; testy ani typy to nevideli). Teraz `odosliKoncept`
nechá text hneď na obrazovke pod dočasným id `ukladam-N`, nový riadok vznikne
okamžite a kto potrebuje skutočné id (dieťa, kotva), počká naň
(`skutocneId`). React kľúč nesie riadok od konceptu po skutočné id
(`kluce`), aby políčko neodišlo spod kurzora; `nacitaj` riadky na ceste
nezahadzuje a `posli` dočasné id serveru nepošle. **Rýchle písanie sa overuje
skutočnými klávesmi v prehliadači, nie dispatchom udalostí** — chyba sa
ukáže len pri reálnom poradí focus/blur.

Nezávislá kontrola (subagent) k tomu našla ďalšie tri veci, všetky opravené:
**načítanie, ktoré príde neskôr než novšie** alebo bolo odoslané pred
zápisom, sa zahodí (`nacitanieCislo`/`platneOd`), inak riadok zmizne spod
kurzora; **rozpísaný text načítanie neprepíše** (`upravene`); a **D1 batch
sa pri UPDATE s nulou zmien NEVRÁTI** — kontrola, či všetky id existujú,
ide PRED zápis. Zoznam id do SQL ide cez `json_each(?)`: D1 pustí najviac
100 parametrov na dopyt.

## Kartotéka fotiek držania tela (5. 10. 2026)

Časť C návrhu anamnézy: fotky z úvodného (a každého ďalšieho fotenia)
a poznámka k foteniu. Panel anamnézy → stupienok „Fotky držania tela"
(`KartotekaFotiek.tsx`, `/api/fotky`, `lib/psb/kartoteka.ts`).

- **Obrázky nie sú v D1** — ležia v R2 (väzba `STORAGE`, bucket
  `kokpit-fotky`) **zašifrované kľúčom anamnézy** (`zasifrujBajty`,
  hlavička `PSB1`). Bez kľúča sa nedajú ani nahrať, ani pozrieť. Verejná
  adresa neexistuje — každé čítanie ide cez `/api/fotky?id=` a prihlásenie.
  Kľúč objektu nenesie meno klienta (objavuje sa v logoch).
- **Poznámka k foteniu je tiež zašifrovaná** (`klient_fotky_poznamky`).
- **Súhlas:** z anamnézy (`suhlasy_json.gdpr.fotky`, nová anamnéza sa pýta
  „včetně fotografií držení těla… nikde se nezveřejňují"); staré z Google
  Forms ho nemajú — vtedy tréner potvrdí osobný súhlas a pri fotke sa
  zapíše `suhlas = 'osobne'` aj kto. Bez jedného z nich server fotku odmietne.
- **Fotka sa zmenšuje v prehliadači** (2000 px, JPEG, `imageOrientation:
  from-image` — inak by fotka z iPadu na výšku prišla naležato; EXIF aj
  poloha sa tým zahodia).
- **R2 zapnuté 5. 10. 2026** (Jerry odsúhlasil predplatné za 0 $, karta
  na účte), bucket `kokpit-fotky`, väzba `STORAGE` vo `wrangler.jsonc`.
  Overené naostro na vymyslenom klientovi: bez súhlasu odmietne, v R2 je
  `PSB1…` (nie JPEG), poznámka v D1 `v1:…`, zmazanie zmaže R2 aj riadok
  a zapíše audit.
- **Fotka ide s `cache-control: private, no-cache`.** S `max-age` išla
  zmazaná fotka v tom istom prehliadači ešte hodinu z keše.
- Beta nemá `ANAMNEZA_KLUC`, takže kartotéka tam nič neuloží.

## Hodiny: koniec platnosti a samostatná hodina (6. 10. 2026)

- **Prenos mínusu zo skončeného členstva ostáva pre históriu vypnutý.**
  Prepočet nad kópiou ostrej DB: pri 4 z 4 overiteľných klientoch dal iné
  číslo než PTminder a pri Tsiolisovi stiahol 20 tréningov z 11/2025. Mínus
  pred novým členstvom je v histórii väčšinou artefakt delenia osi podľa dňa
  kúpy, nie pretrénovanie. Simulácia: `globalThis` prepínač v kópii osi
  a snímka všetkých klientov pred/po (riadky, koniec, návrh balíčka).
- **Dopredu platí: tréning po konci platnosti bez hodín = prvá hodina
  ďalšieho členstva** (`poPlatnosti` v `priebehBalickov`), len pri členstve
  skončenom od 30. 9. — inak by `navrhNovehoBalicka` zakladal balíčky do
  minulosti (Heinrich od júla). Automatický balíček sa zakladá až z
  tréningu, ktorý ZAČAL (`terazPraha`), nie z dnešného o 17:00.
- **Po konci platnosti zvyšok NEPLATÍ, kým nepadne rozhodnutie** (Jerry,
  6. 10.: „ide mínus, dokým to nedefinujeme, či je to doplnenie alebo
  prepadnutie"). Tréning po konci čerpá len doplnenie zapísané od toho dňa
  (`poKonciHodin` — NAHRÁDZA zvyšok, nesčíta sa). Automatický balíček na
  rozhodnutie nečaká; `pridaj` doplnenia zruší neskorší automatický balíček
  a ďalšie otvorenie appky ho založí za doplnením.
- **Doplnenie po konci platnosti = „2 h, 1 h · doplnenie", potom nový balíček
  od 6 h** (`zDoplnenia`). Neskoro rozhodnuté doplnenie zruší automatický
  balíček za koncom platnosti a obrazovka ho hneď založí znova. Prepadnutie
  je značka `balicekDo.prepadlo` z vety odpovede („N h prepadlo") —
  `prepadnuteHodiny` v klientOsCasu; keď sa zmení znenie odpovede v
  KrokPlatnost, musí sa zmeniť aj tento regex.
- **Staré obdobia z PTmindera sa nesúdia** (`vyrovnane`): tréning nad rámec
  uzavretého členstva spred 1. 10. je „—", nie mínus (Jerry: „či to sedí
  v marci, je irelevantné").
- **Samostatná hodina iného druhu** (najviac 1 h, ON/OFF z NÁZVU balíčka)
  počas platného členstva pokryje svoj tréning a obdobie neotvára
  (`samostatne`). Druh tréningu rozhoduje len keď je známy; prísne „online
  len z online" nie — Lucia Podolová má ON balíček a tréningy vedené offline.
- **Pripomienka pri dnešnom tréningu hovorí stav PRED ním** (`dnesneTreningy`):
  karta ráta len tréningy, ktoré začali, takže ráno a poobede je zostatok
  iný. Veta „dnes je posledná hodina, ktorú mu appka pozná" pri nule aj
  mínuse sa čítala ako „má poslednú hodinu" (Hanus, 6. 10. 2026 — −1, lebo
  platba z 3. 10. nebola priradená). Teraz „dnes má poslednú hodinu
  z balíčka" alebo „hodiny má minuté — dnešný tréning je nad rámec (−N)".
- **Kontrolór profilov reže kalendár po TERAZ.** Ráno inak hlásil „odkaz −1
  · karta 0" pri každom, kto má tréning neskôr v ten deň.

## Peniaze z Kokpitu — prepínač od mesiaca (6. 10. 2026)

`lib/psb/peniazeZKokpitu.ts`: `loadData` skladá `data.payments` ako pri
dochádzke — pred `peniaze_kokpit_od` (vzas_settings) export PTmindera, od
neho tabuľka `platby`. Celý export ostáva v `data.paymentsPtminder`.
- **Prepína sa len mesiac, ktorý SEDÍ** (`mozePrepnut`: 200 Kč / 1 %, žiadny
  nepriradený klientsky príjem). Pri meraní 6. 10. mal september v Kokpite
  190 026 proti 324 849 — chýbal zošit od 28. 8., bitcoin a 10 príjmov.
  Pevný dátum ako pri dochádzke by tržby zrazil o tretinu.
- Rozhoduje SERVER (`akcia: "peniaze-od"`), tlačidlo len pýta. Späť sa dá vždy.
- Od prepnutia sa ručný príjem (split `prijem`) do P&L nepripočíta — úvodný
  v hotovosti je platba klienta, inak by bol dvakrát.
- **Bitcoin sa berie SÁM z BTC knihy** (`btcNaPlatby`, `akcia: "btc-import"`;
  Jerry, 6. 10. 2026: „prečo sa BTC platby nečítajú, keď je na to celá
  appka?"). Knihu sťahuje prehliadač (worker → worker padá na 522) a pošle
  ju serveru najviac raz za 10 min. Zapíše sa len od `platby_od`, len
  klient, ktorého meno `najdiKlienta` nájde jednoznačne, `fio_id` =
  `btc:deň|meno|sats` (nič sa nezdvojí). Staršie BTC platby zámerne nie —
  `jeVopred` z dnešného stavu by starej platbe dal „vopred" a tá by ticho
  zaplatila budúci balíček. Prevod z cudzieho účtu a hotovosť ostávajú
  ručné (formulár „Zapísať platbu mimo banky").

## Editor fotiek a videa — karta Editor vo Workspace (6. 10. 2026)

Jerry: „pridaj ešte jednu kartu editor, tam budú dve možnosti, foto a video."
Karta `editor` (BEZ_FRONTY, za Anamnézami) → `EditorKarta.tsx` → dve
samostatné stránky v rámiku: `public/editor/foto.html` (predtým/potom ako
appka Layout: štvorec na polovicu, výrez, mriežka, prekrytie, čiary a uhly)
a `public/editor/video.html` (chôdza a beh: krok o snímku, rýchlosť bodkou,
strih bodkami na osi, uhly na snímke, 📷 snímka, stiahnutie MP4).

- **Stránky NIE SÚ React** — sú to náčrty, ktoré si Jerry vyskúšal, prenesené
  bez prepisu. Zdroj je `app/editor/` (jadro.js/.css, ui.css, sklad.js,
  *.sablona.html); spoločné časti sa do stránok VKLADAJÚ cez
  `python3 editor/zostav.py`. `editorZostava.test.ts` stráži, že public je
  zostavený z aktuálnych častí. Meníš jadro → zostav → commit oboch.
- **V `<style>` je značka vloženia CSS komentár, nie HTML** — `<!--` v CSS
  pokazilo prvé pravidlo štvorca a ten mal výšku 0 (stalo sa v náčrte).
- **Snímky z videa → fotky cez IndexedDB** (`sklad.js`, databáza
  `skladacka`, rovnaký pôvod ako Kokpit) — pracovný zásobník v prehliadači.
- **Kartotéka klienta (od 6. 10. 2026):** klienta vyberá `EditorKarta`
  nad editormi a pošle ho `postMessage` (`psb-klient`; editor sa pri
  načítaní spýta `psb-kto-je-klient`). Spoločná časť `kartoteka.js`.
  Ukladá sa cez `/api/fotky` do `klient_fotky` s `pohlad`
  **`porovnanie`** (hotový štvorec 2000 px) a **`video`** (strih so
  spomalením a čiarami, 1280 px, 4 Mb/s; `typ` = MIME, migrácia 0099);
  snímka z videa voliteľne rovno ako fotka tela (zmenšená na 2000 px).
  Bez súhlasu v anamnéze sa editor spýta na osobný (confirm). Po uložení
  `psb-ulozene` → `oznam("fotky")` → kartotéka v profile sa obnoví
  (sekcia „Z editora", video sa prehrá cez fetch → blob, nie `<video src>`
  — Safari chce pri videu Range a server vracia celý súbor).
  `jeFotkaTela` oddeľuje fotky tela od výstupov editora (fotenia,
  porovnania prvá/posledná). Zmerané naostro: 20 MB video worker zašifruje
  (nahratie 10,6 s, späť 1,8 s); strop `MAX_VIDEO_BAJTOV` 40 MB.
- Rámiky ostávajú načítané aj po prepnutí Foto/Video a karty (pravidlo
  „Workspace drží prácu"). Statické súbory idú cez assets bez workera —
  CSP Kokpitu na ne nepadá; rámik povoľuje `frame-src 'self'`.

## Ponuka termínov — klient si vyberie sám (7. 10. 2026)

Jerry: „ponúknem mu dva a nemôže ani jeden… vytukal by som si všetky
termíny, poslal by som mu odkaz, klikol by na ten, ktorý chce, a mne by sa
objavila udalosť v kalendári." **Záložka Kalendár → navrchu dve záložky
„Kalendár" (predvolená) a „Termíny"** (`PonukaTerminov.tsx`; obe ostávajú
načítané, skrytá má `display: none`, voľba v sessionStorage
`psb-kalendar-zalozka`). Ponuka sa chytí a ťahá po 15 min aj do iného dňa
či pruhu trénera (`data-pol` na stĺpci + `elementsFromPoint`); týždeň
v Kalendári sa prepína švihnutím prsta aj dvoma prstami na touchpade
(`gestoKariet.ts`, krok ako šípky, nie za hranicu stiahnutého kalendára). Najprv bola vo Workspace — Jerry v ten istý deň: „postav mi to
v záložke Kalendár, nie vo Workspace" (výnimka z pravidla „Workspace je
jediné miesto, kde sa robí" — jeho rozhodnutie) a „tie +/- 15 preč"
(termín má pevných 60 min, × ho zmaže). Stránka **`/t/<token>`**
(`routes/t.$token.tsx`, HTML z `ponukaStranka.ts`, variant B1, čeština, bez JS).

- **Tabuľky** `ponuky_terminov` + `ponuky_terminov_casy` (migrácia 0100).
  Pravidlá (voľné časy, platí do nedele posledného termínu, stav, .ics) sú
  čisté v `ponukaTerminov.ts` s testami; DB a push v `ponukaTerminov.server.ts`.
- **Voľné = bez živej udalosti TOHO ISTÉHO trénera a bez termínu vybraného
  z inej ponuky**, nie v minulosti. Server to overí aj pri vytvorení (ponuka
  do obsadeného času nevznikne) aj pri výbere.
- **Výber je zamknutý podmieneným UPDATE** (`vybrany_id IS NULL`) PRED
  zápisom do Google — dve klepnutia nevyrobia dve udalosti. Keď Google
  odmietne, zámok sa uvoľní a klient dostane vetu, nie chybovú stránku.
- **Zápis do kalendára je JEDNO miesto: `zapisTrening`**
  (`nahodTrening.server.ts`) — volá ho aj „nahodiť tréning" v Kokpite.
  Udalosť nesie meno klienta; nový človek z dopytu dostane typ `uvodny`.
- Po výbere ide push trénerovi („X si vybral(a) …"); SMS s odkazom posiela
  tréner sám cez `SmsKlientovi` s `ponuka` → audit `sms-ponuka` (nie
  `sms-odoslana`, inak by klient zmizol zo zoznamu kroku 2 · SMS).
- **Odkaz ide cez prosapiens.cz** (od 9. 10. 2026 — snippet id 26 presmerúva
  aj `/t/` a `/k/`, Jerry súhlasil). Formulár výberu odosiela na adresu
  workera, kam klient po 302 dorazil.
- Overené naostro na vymyslenom „AATest Ponuka" (vytvorenie, odmietnutie
  obsadeného času, stránka, zrušenie) a zmazané. **Výber do kalendára nebol
  skúšaný** — zapísal by skutočnú udalosť; prvý ostrý výber treba sledovať.

## Kalendár v mobile — klient odoberá LEN svoje tréningy (7. 10. 2026)

Jerry: „ak dám klientovi zdieľať môj kalendár, uvidí všetky moje udalosti?"
Nie — trénerov Google kalendár sa NEZDIEĽA. Kokpit klientovi poskladá
vlastný kalendár (`/k/<token>/kalendar.ics`, `feedKlienta`
v `lib/psb/kalendarMobil.ts`) len z `kal_udalosti` s jeho menom
(živé, typ trening/uvodny, −60 až +200 dní). Náčrt A1 + B1:

- **Profil klienta → dlaždica „📅 Kalendár v mobile"** (`KalendarVMobile.tsx`,
  pod kontaktom): „Poslať odkaz SMS" (audit `sms-kalendar`, nie
  `sms-odoslana`), kopírovať, nový odkaz (starý zneplatní — telefón potom
  dostane PRÁZDNY kalendár, nie chybu, aby staré tréningy zmizli).
- **Stav vie telefón sám**: každé stiahnutie zapíše `posledne_stiahnutie`,
  `pocet`, `platforma` (z User-Agent). „Odoberá" = stiahnutie za 3 dni.
- **Stránka `/k/<token>`** (B1, čeština, bez JS): iPhone dostane
  `webcal://`, Android odkaz do Google Kalendára (`?cid=webcal…`), druhá
  cesta pod tlačidlom; rada „vypněte Odstranit upozornění" pre iPhone.
- V udalosti: „Trénink ProSapiens", s kým, ako sa ozvať, pripomienky
  −1 deň a −2 h. Žiadne hodiny, peniaze ani iné mená. Riadky .ics sa lámu
  na 75 bajtov (`zalom`), časy idú v UTC (`prahaNaUtcIcs`).
- Migrácia 0101 (`klient_kalendar`). Odkaz `/k/<token>` ide cez prosapiens.cz
  (snippet id 26 od 9. 10. 2026); feed `.ics` NIE — stránka ho skladá z adresy
  workera, aby odber v telefóne nemusel prejsť presmerovaním.
- **Neoverené na skutočnom telefóne**: či iPhone pri odbere nevypne
  upozornenia a ako rýchlo Google Kalendár obnovuje.

## Metricool cez MCP — jedno ťuknutie v uzávierke (8. 10. 2026)

API Metricoolu je len v pláne Advanced; MCP server `ai.metricool.com/mcp` je na
každom pláne. Kokpit je preto **MCP klient**: OAuth s dynamickou registráciou
(`app.metricool.com/oauth/register`), PKCE S256, rozsah `mcp:read`, tokeny vo
`vzas_settings` (`metricool_klient`, `metricool_token`) — von sa nevracajú.
Kód: `lib/psb/metricool.ts` (čisté mapovanie, testy), `metricool.server.ts`
(OAuth + JSON-RPC, odpoveď môže byť JSON aj SSE), `routes/api/metricool.ts`
(`?akcia=pripoj`, POST `stav`/`stiahni`/`odpoj`), `routes/api/metricool-spat.ts`
(návrat z povolenia). Uzávierka → krok Metricool: „Pripojiť Metricool" raz,
potom „Stiahnuť mesiac z Metricoolu".
- Zapisuje to isté ako export: `mkt_prispevky` (ID príspevku/reelsu =
  `<media>_<účet>` ako v CSV, story = adresa) a `kanaly_mesiace` Instagram
  s názvami metrík PDF zostavy; `upload_log` typ `metricool`.
- Jednotky: čas pozerania MCP v sekundách → ×1000 (CSV je v ms); view rate v %.
- Brand ProSapiens = 2101108 (`BRAND_PSB`). Ostatné siete zatiaľ nie.

## „Vybavené" platí na to, čo bolo, keď padlo (9. 10. 2026)

Jerry: „vyskakujú mi notifikácie, ktoré sú už vybavené, a iné zas nie."
Odpoveď v `anomaly_ack` je trvalá a viaže sa na KĽÚČ. Stály kľúč nad niečím,
čo sa mení, je preto pasca v oboch smeroch:

- **Zoskupená položka** (`kalendar|zmeny|<tréner>`, `dopyt|nevyriesene`,
  `kalendar|konanie|…`) — jedno „je to hotové" z 29. 8. schovalo 51 zmien,
  ktoré prišli až potom. Riešenie: položka nesie `platneOd` (čas najnovšej
  veci v nej) a `stavPolozkyRegistra(…, platneOd)` staršiu odpoveď nepočíta.
- **Epizóda** (`gone|`, `duch|`) — `platneOd` = posledný tréning; odpoveď na
  jedno z dvojice kryje obe (je to to isté ticho). Duch mlčí aj pri termíne
  v kalendári alebo otvorenom závere, rovnako ako „Prestal chodiť".
- **Kľúč s dátumom behu alebo týždňa** (`nezname|…|<týždeň>`) sa vracia každý
  pondelok — kľúč je zo samotných mien. Pri kontrole webu nesie deň PÁDU.
- **Stupne tej istej pripomienky** (narodeniny 7/3/1/0) — vybavené na skoršom
  zavrie ďalšie; odloženie nie.
- **„+ Zápis" berie rituály cez `ritualyZapisu`** (odpoveď + tréner), nie surové.
- Stav hotovosti „ku koncu mesiaca" je `stavHotovostiHotovy` — jedna definícia
  pre krok uzávierky aj pripomienku (zošit ≠ zostatok v obálke).
- Do notifikácie idú zmeny v kalendári len za 14 dní; staršie len vo Workspace.

Pri novej položke registra sa pýtaj: čo sa stane s odpoveďou, keď pribudne
nová vec rovnakého druhu, a keď sa tá istá vec zopakuje o mesiac?
