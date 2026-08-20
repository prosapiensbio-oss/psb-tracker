# Revízia Kokpitu — 19. 8. 2026 (večer)

Kompletná revízia podľa Jerryho zadania (peniaze → metriky → zápisy →
definície → reťazce → prekliky → Jarvis → aktuálnosť). Päť paralelných
prieskumov kódu + živé overovanie klikaním a dopytmi do produkčnej D1.
Opravy nasadené vo verziách **534** (revízia) po 511–533 (Meta blok).

## 1 · Chyby podľa dopadu na peniaze

| # | čo | dopad | stav |
|---|---|---|---|
| 1 | **KPI počítali rok cez bežiaci august** (86 875 Kč tržieb, 0 nákladov — Fio za august neexistuje). Marža 2026 ukazovala 19,85 % namiesto ~14 %, „Rozdiel nad break-even" 25 % namiesto 19,6 % — KPI s NESPLNENÝM cieľom svietilo ako splnené. `vzas.ts computeKpis` jediný nepoužíval orez na uzavretý mesiac. | KPI klamali v prospech | ✅ opravené, overené naživo (okno „Jan 26 – Júl 26", 19,6 % < cieľ 20) |
| 2 | ~~Júl nemá v banke nájom~~ — **NIE JE CHYBA.** Odpoveď stála v registri od 6. 8. („Radek Baláž ako nový majiteľ dal júl zadarmo — nájom sa neplatil") aj v poznámke mesiaca; revízia ju mala čítať PRED hlásením. Ponaučenie zapísané do CLAUDE.md: poradie kontroly rozporu = anomaly_ack → month_notes → jarvis_zavery, až potom je to nález. | 0 Kč | ✅ vysvetlené (moja chyba postupu) |
| 3 | **„Pravidelné náklady" počítali medián cez prázdny august** — nájom vychádzal 19 625 Kč namiesto 29 250 a položka s 3 výskytmi nemohla prejsť pravidlom „4 zo 6". | fixný základ −14 900 Kč/mes | ✅ opravené (filter nenulových mesiacov ako v predikcii) |
| 4 | **Barter Sofie sa vymaže sám**: stavia sa zo SNÍMKY `packages` — po 13. 9. by z nej vypadol a júl by sa vynuloval, dlh by spätne narástol. | 7 790 Kč, opakovane | ✅ opravené (v. 535): raz videný barter sa ukladá do `vzas_settings.barter_jarek`, vstup = zjednotenie so snímkou; snímka má prednosť, kým balíček v exporte JE |
| 5 | **Jarkova splátka feb 2025: P&L 4 000 vs. dlhová kniha 8 000.** Kniha sedí na checkpoint do koruny. Jerry: „už je jedno, zapíš ako chceš" → P&L zosúladený s knihou (8 000), zisk 2025 −4 000 Kč. | 4 000 Kč | ✅ opravené (v. 535) |
| 6 | **`predikciaNakladov` má dve definície výplat** — nárok z hodín (129 650) vs. medián poslaného (111 011). | 18 639 Kč/mes | ✅ opravené (v. 539): Jerry vybral medián, 1 mesiac — viď 1b/1 |
| 7 | „Cena za klienta" a „konverzia dopytov" na Dashboarde počítali klientom KAŽDÉHO s úvodným (bez `jeKlient`): konverzia referencií 69 % namiesto 50 %, cena za klienta o ~19 % nižšia než na karte Reklama. | skreslené % | ✅ opravené (jeKlient + !vratenie) |
| 8 | „Návratnosť" reklamy: celoživotná tržba klienta ÷ výdavok okna (latentné — 0 reklamných dopytov). | latentné | ✅ opravené (tržba v okne) |
| 9 | Financie hodnotili bežiaci mesiac ako plný (august 79 sedení → „Slabšia", ťahal Ø kapacity aj Ø CZK/sedenie). | skreslené Ø | ✅ opravené (Ø z uzavretých, riadok „rozbehnutý") |
| 10 | „Ø nových/mes." delil mesiacmi PRÍTOMNÝMI V MAPE — mesiac bez pohybu (10/2025) z priemeru vypadol (~+8 %). | ~8 % priemeru | ✅ opravené (kalendárne okno) |
| 11 | Kohorty dopytov párovali mená bez fuzzy (Lukáš/Lukas = 2 ľudia) a `zDopytu` počítal ako konverziu aj EXISTUJÚCEHO klienta, čo vyplnil formulár znova. | skreslené % | ✅ opravené |
| 12 | Frekvencia reklám pri zlúčení mesiacov brala MAXIMUM namiesto váženého priemeru; dopyty po kampaniach sa nededuplikovali menom. | kozmetika čísel | ✅ opravené |

**Tiché zápisy (opravené):** denník klienta pri `ok:false` (vypršaná relácia)
ticho zahodil text — teraz červená hláška a text ostáva; `client-notes` API bez
try/catch; nápady: UPDATE neexistujúceho id hlásil úspech; Jarvisov záver zo
zápisu (`saveZaver`) sa zahadzoval bez stopy — teraz „⚠ pripomienka sa
NEULOŽILA"; obnovenie kalendára po chybe ukazovalo starú snímku bez varovania
(Balíčky aj Zmeny teraz chybu ukážu); sťahovanie IG príspevkov vo formulári
kampane malo `.catch(() => {})`.

**Prekliky:** register „nový klient po úvodnom" ukázal profil NAPOSLEDY
fokusovaného klienta a rámček „Čakajú na potvrdenie" sa nevykreslil — starý
focus sa pri cieli bez focusu nečistil. Opravené, overené scenárom
Sofia→Tereza. Ostatné prekliky (anomálie, 6M, zmeny kalendára, dlaždice
Odmlčaní/Rezerva/Odhad, uzávierka) fungujú.

**Dvojité definície:** `jeKlient` presunutá do `lib/psb/compute.ts` (jediné
miesto; MarketingLievik re-exportuje) a Jarvis dostal `klientovPct` — dovtedy
definoval klienta ako „5+ sedení" a na otázku o konverzii odpovedal iným
číslom než obrazovka. `jeDoplnok`/`membershipBucket` zjednotené na jednu
konštantu `DOPLNKOVY_NAZOV`. `WEB_STRANKY` memá v KampanForm a UTM staviteľovi
dostali `marketingVerzia()` (tá istá chyba ako PlanObsahu 18. 8.).

**Jarvis (SCHEMA_DB):** doplnená `meta_volania` (Jarvis živo tvrdil, že dáta
neexistujú — pritom appka počítadlo má), opravené hodnoty `stav_sad`
(v DB je `skoncila`, nie „dobehla" — dopyt na „dobehla" vracal prázdno),
doplnený PK `(id, mesiac)` pri mkt_kampane s varovaním pred SUM cez mesiace,
doplnené chýbajúce stĺpce (ig_prispevky, kal_*, wishlist, jarvis_zavery),
zmazané zastarané tvrdenia („37 zo 62 ACTIVE", „79 stránok", poznámka o `cas`).
Zamerania: strop správne uvádzaný ako NEPOVINNÝ; „appka nerobí kreatívu"
odstránené zo systémového promptu aj z Info-textov (Udaje, metaPristup,
KampanForm, meta.ts).

**Živý test Jarvisa:** tržby júla povedal správne (311 800), ale zisk 157 500
namiesto 133 465 z obrazovky — počítal „hrubý zisk po výplatách" vlastnou
cestou; prázdnu tabuľku meraní priznal vzorne; na meta volania odpovedal „také
dáta nemám" — po oprave SCHEMA_DB má odkiaľ.

## 1b · Dorobené po tvojich odpovediach (19. 8. večer, verzie 537–539)

| # | čo | ako |
|---|---|---|
| 1 | **Výplaty v predikcii: medián, 1 mesiac** (tvoje rozhodnutie). Nárok z hodín (129 650) nemal spoločné ani Matyáša; medián poslaného (111 011) má všetko. Druhá cesta z `predikciaNakladov` odstránená — jedna definícia. | `vzas.ts`, Info-texty vo Financie/DashGrafy |
| 2 | **Mŕtva konštanta `JAREK_OBNOVA` zmazaná** — jediný výskyt v celom repe bola jej definícia (grep cez kód, testy, skripty, docs). Hodnoty (54 600 Kč, 23. 6. 2026) zostali v komentári pri `JAREK_ZLAVA_ROCNE`, ktorá z obnovy jediná vstupuje do dlhovej knihy. | `vzas.ts` |
| 3 | **Úvodné tréningy — jedna definícia `pocetUvodnych`** (ľudia, nie sedenia). Tri zápisy (sedenia / mená / meno+dátum) nemali dôvod — na ostrých dátach 62 = 62 = 62. „Súhrn sedení" zámerne ráta sedenia ďalej (stojí vedľa offline/online). 3 testy. | `compute.ts`, Dashboard, DashGrafy ×3 |
| 4 | **Stráž migrácií v `nasad.sh`**: pred nasadením porovná priečinok s `d1_migrations`; chýbajúcu OHLÁSI a nasadenie ZASTAVÍ (nespúšťa sám — aplikovaná migrácia by bežala druhýkrát). Evidencia dorovnaná z 24 na 50 — každú z 25 schémových migrácií som overil proti skutočnej schéme (473 stĺpcov, 59 tabuliek), nič nechýba. Otestované s falošnou migráciou: zastavilo. `--migracia-hotova <súbor>` na dopísanie. | `scripts/nasad.sh` |
| 5 | **Jeden zdroj marketingových dát**: `/api/marketing` sa volá **1×** (predtým 6×). Kanály dostali sklad `KANALY`; Kanaly, Reklama, Lievik, Marketing, DashGrafy čítajú zo skladov s `marketingVerzia()` v deps. Overené naživo cez 8 obrazoviek: 1 volanie, všetko zobrazené. | `marketing.ts`, App.tsx + 5 komponentov |
| 6 | **Klik-cez pre 6 čísel MarketingVrchu**: každé číslo otvorí mená/položky, z ktorých vzniklo, s čitateľom aj menovateľom v nadpise. Hneď to ukázalo, prečo: „Dopyt → úvodný 121 %" = 41 ľudí na úvodnom / 34 dopytov — na prvý klik vidno, že menovateľ je iná skupina (klienti z referencií dopyt nemajú). | `MarketingVrch.tsx` |
| 7 | **Zisk do Jarvisa ako hotové číslo**: `pnlSuhrn` v kontexte BOL, ale bez pokynu — Jarvis si zisk „poctivo" skladal z banky (157 498, bez väčšiny výplat). Doplnená poznámka v kontexte + pravidlo v prompte rovnakého tvaru ako pri rezerve a dlhu. Overené naživo: **133 465 Kč, „z Peniaze → Zisky a straty (pnlSuhrn), nie súčet z banky"**. | `aiContext.ts`, `chat.ts` |

## 1c · Dokončenie revízie (19. 8. neskoro večer, verzia 541)

| # | čo | ako |
|---|---|---|
| 8 | **`PNL_POVODNE` — „zrušiť opravu" vracia hodnotu z POSLEDNÉHO importu.** Pôvodná hodnota sa pamätala raz (pri prvej oprave) a import ju už neobnovil: kto opravil bunku v júni (Excel 5 000) a v auguste po importe (banka 7 000) opravu zrušil, dostal 5 000. `pouziOverrides(obnov=true)` po importe prepíše pôvodnú čerstvou. Test chytá starý kód (overené: s vrátenou zmenou 1 fail). | `vzas.ts`, `vzas.test.ts` |
| 9 | **Referencie — okno „6m/3m/1m" z plných mesiacov**, nie 183/92/31 dní. Jediné miesto v appke s dňovým oknom; zahŕňalo bežiaci mesiac, ktorý všetko ostatné vynecháva. Teraz `mesiaceVOkne` + `kotvaDat`, roky a vlastný rozsah bez zmeny. | `Referencie.tsx` |
| 10 | **`setOverride` vracia `boolean`**, API odpovedá `ok:false` + 502 pri zlyhaní D1; `saveOverride` v klientovi číta `r.ok` (HTTP), takže obrazovka ukáže červenú namiesto „uložené" nad ničím. Dovtedy `void` + `ok:true` vždy. Neznáme pole už nie je tiché preskočenie, ale `false`. | `db.server.ts`, `override.ts` |
| 11 | **Prekliky registra: 23 z 23 správnych** — nie vzorka, všetky položky s „Otvoriť": 14× profil správneho klienta (anomálie, zápisy, odporúčania), 2× Zmeny v kalendári, 2× Dopyty (bitcoin bez dokladu, nezapísaný dôvod), 1× 6M riadok Barbory Vankovej, 1× rámček „Čakajú na potvrdenie" (Tereza), 3× dnešný tréning → profil. Overené programovo + 4 ručne. | živý test |
| 12 | **Jarvis: 5 oblastí, 5/5 presne proti zdroju** — klienti 53 aktívnych ✓ (packages), marketing TFL 18 uložení + odkaz ✓ (a sám doplnil, že novšia evidencia má iné maximum), peniaze júl 311 799,50 ✓ (payments), dopyty 37 / 16 ref ✓, kampaň 109 volaní / 391 chýba / 4 chyby ✓ (meta_volania). Pri každom povedal zdroj. | živý test |

## 1d · Nízke priority dorobené (verzia 542)

| # | čo | ako |
|---|---|---|
| 13 | **Tempo v KlientProfil pri Pauze**: appka pozná len „dokedy" pauza trvá, nie odkedy, takže okno sa nedá očistiť presne. Tempo sa preto pri Pauze NEZAMLČÍ ani nevymyslí — označí sa sivo s vysvetlením, že zahŕňa mesiace, keď klient zámerne nechodil. Predikcia ráta rovnako (90 dní bez pauzy), takže definície sa nerozchádzajú. | `KlientProfil.tsx` |
| 14 | **Algoritmus „označiť prečítané"**: optimisticky, ale pri `ok:false` sa stav vráti — dovtedy fetch bez čakania na odpoveď. | `Algoritmus.tsx` |
| 15 | **Klik-cez — zvyšné obrazovky** (zoznam „neoveriteľné očami" z §3 je týmto celý uzavretý): |  |
|  | · **Reklama**: 5 hlavičkových čísel otvorí zoznam (mesiace výdavku / dopyty z reklamy s dátumom / klienti s tržbou v okne); mená zbiera `reklamaSuhrn` v TEJ ISTEJ slučke ako čísla. Overené naživo. | `reklama.ts`, `Reklama.tsx` |
|  | · **Lievik**: „Tržba od nových" klikateľná — otvorí ten istý zoznam ako „Noví klienti", s tržbou pri každom; `trzbaVOkne` je jeden zdroj pre číslo aj zoznam (test). **Kohorty**: klik na riadok mesiaca ukáže mená s dátumom dopytu, úvodného a tržbou. Overené naživo. | `MarketingLievik.tsx` |
|  | · **DashGrafy**: Segmenty, Dochádzka, Referenčný motor, „Čo stojí úvodný a klient" — každé číslo otvorí PRESNE tú skupinu ľudí cez `onNavigate("klienti", …, { skupina })`, menovateľ podielu vrátane. **Overené naživo, všetkých 16 čísel** (v. 543): číslo na karte = počet ľudí v otvorenej skupine (23 Anchor → 23, 24 pod 50 % → 24, 35 úvodných → 35, 28 klientov → 28, 61 z odporúčania → 61, podiel 54 % → menovateľ 113). Karty zapnuté cez knižnicu a uložené. | `DashGrafy.tsx` |
|  | · **Chyba nájdená pri overovaní**: `toggleHide` v knižnici grafov čítal `hidden` zo stale closure — dva rýchle kliky (zapnúť A, hneď B) vychádzali oba zo starého zoznamu a druhý prvý prepísal: A sa na obrazovke ukázala, ale v localStorage zostala skrytá a po reloade zmizla. Opravené na funkčnú formu v jednom updateri (poradie sa odvodí z toho istého `next`). Overené naživo. | `Dashboard.tsx` |
|  | · **Financie**: Ø sedení / Ø CZK / Ø využitie nesú v labeli „· z N uzavr." a pod pásom stojí, z ktorých mesiacov sú (bežiaci je v súčtoch, nie v priemeroch). Overené naživo: „z 7 uzavr.". | `Financie.tsx` |
|  | · **Klienti KPI**: „Ø dochádzka · ÷ 63", „Ø hodín/klient · ÷ N", „Ø CZK/sedenie · ÷ N sed." — dva priemery vedľa seba mali rôzne menovatele a nebolo to vidno. Overené naživo. | `Klienti.tsx` |
|  | · **SixM**: klik na kartu fázy filtruje tabuľku na tých ľudí (overené: 13 → 12 riadkov, filter aktívny). | `SixM.tsx` |
|  | · **Kanaly**: hlavička „Podiel ÷ N" nesie menovateľ (súčet zobrazení). | `Kanaly.tsx` |

## 2 · Čo vyžaduje Jerryho rozhodnutie

Nič. Všetko z tejto sekcie je rozhodnuté a dorobené (viď 1b, 1c).

## 3 · Čísla, ktoré sa nedajú overiť očami (klik neukáže mená/riadky)

Najväčšie riziko do budúcna — metrika bez prekliku sa pokazí a nikto si
nevšimne. Zoznam (z metriky-prieskumu, neopravované):
- **MarketingVrch**: všetkých 6 dlaždíc (Dopytov mesačne, Z dopytu klient,
  Cena za dopyt, Úvodných mesačne, Dopyt → úvodný, Minuté na reklamu).
- **Reklama**: 5 hlavičkových čísel + tabuľky po kampaniach/mesiacoch.
- **MarketingLievik**: „Tržba od nových" (jediný krok lievika bez kliku),
  stĺpec Podiel, celé Kohorty, Predstihové čísla.
- **DashGrafy**: Referenčný motor, „Čo stojí úvodný a klient" (klik vedie na
  Lievik, nie na tých ~29 ľudí), „Odkiaľ klienti prišli", Dochádzka, Segmenty.
- **Financie**: Ø CZK/sedenie, Ø využitie, Ø prijaté; riadky tabuľky.
- **Klienti KPI pás, SixM štyri StatCard, Kanaly stĺpec Podiel.**
Návrh: postupne dorobiť „klik → zoznam mien/riadkov" začínajúc dlaždicami
MarketingVrchu (najčítanejšie).

## 4 · Redundancie

- `/api/marketing` sa pri jednom otvorení appky volá až 6× (App, DashGrafy,
  Marketing, MarketingLievik, Kanaly, Reklama) — posledné tri do lokálneho
  stavu, ktorý sa so skladom nikdy nezosúladí. Kandidát na jeden zdroj.
- `d1_migrations` eviduje len 0001–0024; 0025–0050 bežali cez `execute --file`.
  Obsahovo je schéma v poriadku (overený diff), ale `migrations apply` je už
  nepoužiteľný a zoznam aplikovaného neexistuje. Kandidát: zapisovať vlastnú
  evidenciu, alebo prejsť späť na `migrations apply` s vyčistením.
- `JAREK_OBNOVA` konštanta — mŕtvy kód, nikto ju nečíta.
- Tri rôzne deduplikácie „úvodných" (meno / meno+dátum / prvý dátum) na troch
  obrazovkách — zatiaľ len rôzne, nie nutne zle; zjednotiť pri ďalšom dotyku.
- Referencie majú vlastnú, DŇOVÚ definíciu okna (183 dní) — jediné miesto
  mimo `mesiaceVOkne`/kotvy.

## 5 · Návrhy (odhad práce → čo ušetria)

1. **Klik-cez pre dlaždice MarketingVrchu** (pol dňa) — každé číslo otvorí
   zoznam ľudí, z ktorých vzniklo. Ukončí kategóriu „neoveriteľné očami" tam,
   kde sa pozeráš najčastejšie. (Môj názor, bez externého zdroja.)
2. **Evidencia migrácií** (hodina) — malá tabuľka + zápis v nasad.sh; zavrie
   dieru, cez ktorú kedysi prepadol `precoNeprisiel`. (Môj názor.)
3. **Jeden zdroj `/api/marketing`** (2–3 h) — zníži 6 fetchov na 1 a odstráni
   triedu chýb „karta má staršie čísla než sklad". (Môj názor.)
4. **Barter z payments** (2 h) — odstráni časovanú stratu 7 790 Kč. (§2 bod 3.)
5. **Zisk v Jarvisovom kontexte ako hotové číslo** — Jarvis na „aký bol zisk"
   počíta vlastnou cestou (157 500 vs. 133 465). Poslať mu mesačný zisk
   hotový, s poznámkou nech ho neráta sám — vzor `chybaDoCiela`. (1 h;
   pravidlo už je v CLAUDE.md, len ho dodržať aj pre zisk.)

## 6 · Čo som NEspravil a prečo

- Nič nezostáva — aj nízke priority dorobené (1d). Jediné, čo sa nedá spraviť
  presne: očistiť tempo od mesiacov pauzy, lebo appka nepozná jej začiatok
  (len koniec) — preto sa pri pauze tempo označí, nie prepočíta.
- Finančné dáta (feb 2025) prepísané AŽ po tvojom „zapíš ako chceš".
- Prekliky: všetkých 23 položiek, nie vzorka (1c/11). Jarvis: 5 oblastí (1c/12).
