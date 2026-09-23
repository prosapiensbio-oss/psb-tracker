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
najprv overiť, či to už nie je urobené. Falošný poplach je horší než
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

## Poštový server vie odmietnuť správne heslo

Beh importu mailu o 6:00 spadol na `[AUTHENTICATIONFAILED]`, ten o 6:46 prešiel
bez akejkoľvek zmeny — Dovecot po sérii prihlásení chvíľu odmieta. Preto sa
vedľa posledného behu drží aj posledný ÚSPEŠNÝ (`mail_stav_ok`) a panel pri
chybe povie, kedy sa naposledy čítalo. Jedna chyba nie je rozbité napojenie;
to je tá istá lekcia ako pri kalendári.

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
