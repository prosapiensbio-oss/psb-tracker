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
- **`searchStream` v Google Ads vracia POLE dávok**, nie objekt s `results`.
  Kód napísaný podľa bežného endpointu prečíta `data.results`, nájde
  `undefined` a ohlási „žiadne dáta" pri odpovedi plnej riadkov. Rieši to
  `adsRiadky()` — nečítaj z odpovede priamo.
- **Peniaze z Google Ads sú v mikrách.** Zabudnuté delenie miliónom vyrobí
  číslo, ktoré má správny počet číslic na to, aby vyzeralo ako suma.
- **Token vývojára na úrovni „prieskumník" nepustí plánovač kľúčových slov.**
  Objem hľadania čaká na Basic (žiadosť podaná 14. 8. 2026). Nepíš do appky
  odhady objemu — Search Console meria len tam, kde sa web už zobrazil.
