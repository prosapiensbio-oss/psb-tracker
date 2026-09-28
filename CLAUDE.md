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
  a platbou." Značka po zaplatení nezmizne, len sa ďalej nepridáva. Počíta sa
  tréning na členstve s otvoreným poplatkom, tréning pred platbou zaň, a
  tréning mimo hodín vyčerpaného členstva. Za platbu členstva sa berie len tá
  do MESIACA od jeho začiatku — inak by sa ňou stala platba za to ďalšie.
  Na ostrých dátach to vychádza na 21 % tréningov; Jerry o tom čísle vie.
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
  nafukoval šesťhodinový balíček na sedem.

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
