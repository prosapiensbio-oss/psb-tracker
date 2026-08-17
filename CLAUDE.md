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
- **Nasadzuj `./scripts/nasad.sh`, nie `wrangler deploy` priamo.** Wrangler na
  tomto stroji klame a je to zmerané (17. 8. 2026, šesť rovnakých behov za
  sebou): dva skončili sekundu po štarte s výpisom obsahujúcim len hlavičku,
  návratovým kódom 0 a bez nasadenia; jeden sa nasadil úspešne, ale výpis sa
  zastavil na „Total Upload" a o úspechu nepovedal nič. Príčina: na stroji NIE
  JE Node, wrangler ho vyžaduje (v22+) a jeho spúšťač `node_modules/.bin/wrangler`
  má `#!/usr/bin/env node`, takže beží pod bunom — a robí
  `.on("exit", (code) => process.exit(code ?? 0))`, čiže smrť dieťaťa na signál
  ohlási ako ÚSPECH. **Návratový kód aj výpis sú tu bezcenné.** Skript preto
  púšťa priamo `wrangler-dist/cli.js`, pred každým pokusom maže `.wrangler/tmp`
  (inak wrangler tvrdí „No updated asset files" a assety nepošle, takže
  v prehliadači beží stará appka nad novým workerom) a výsledok OVERUJE: číslo
  verzie na Cloudflare musí stúpnuť a kontrolný `index-*.js` musí vrátiť 200.
  Skúša až šesťkrát. Trvalá liečba je doinštalovať Node — na stroji nie je ani
  Homebrew, takže to je na Jerryho.
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
