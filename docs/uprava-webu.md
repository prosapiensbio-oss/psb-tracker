# Úprava webu prosapiens.cz — pracovný zoznam

Vznikol 15. 8. 2026 z auditu 79 stránok a 432 vnútorných odkazov (podrobnosti
v [`zoznam-marketing.md`](zoznam-marketing.md), časť G). Jerry: *„chcem aby si
to robil sám a odškrtával z neho položky."*

Poradie je podľa pomeru úžitok / riziko, nie podľa veľkosti. Úlohy sú
rozdelené tak, aby sa každá dala dokončiť a overiť samostatne — polovica
prepísaných meta popisov je horšia než žiadny, lebo sa k tomu nikto nevráti.

**Pravidlo overenia:** žiadna položka sa neodškrtne na základe toho, že som
klikol. Odškrtne sa až po kontrole zvonku — stiahnutím stránky ako obyčajný
návštevník, bez prihlásenia.

---

## Hotové

| | čo sa stalo | overené ako |
|---|---|---|
| ✅ **Slider Revolution vypnutý na článkoch** | 7 súborov, 546 kB z každého článku | stiahnutie troch článkov bez prihlásenia: `revslider` sa nevyskytuje ani raz; úvodná stránka slider ďalej má |
| ✅ **Cieľ zálohovania prepnutý z OneDrive na Google Drive** | Varovanie „need UpdraftPlus Premium" zmizlo, OneDrive sa v nastavení už nespomína | prečítanie stránky UpdraftPlus po uložení: varovanie preč, Google Drive vybraný |
| ✅ **4a · alt texty na troch najsilnejších článkoch** | Doplnených 52 altov: `arm-lines` 16, `deep-front-line` 29, `spiral-line` 7. Anatomické popisy podľa názvov súborov; kde názov neurčoval sval jednoznačne, opisujem oblasť namiesto hádania | stiahnutie zvonku: `arm-lines` **41/47**, `deep-front-line` **54/68**, `spiral-line` **32/41**. Zvyšok sú screenshoty, fotky a pozadia — pri dekoratívnom pozadí je prázdny alt správne, nie chyba |
| ✅ **Editor článkov prestal zamŕzať** | Asset CleanUp mal nastavené načítať zoznam súborov **hneď pri otvorení článku** — sťahoval si pritom celú stránku a na dlhších článkoch prehliadač zamrzol (`RESULT_CODE_HUNG`). Prepnuté na *až po kliknutí* (`assets_list_show_status = fetch_on_click`) | nastavenie po uložení drží; Jerry vie znova otvárať články |
| ✅ **Päť dlhých titulkov prepísaných** | `anterior-pelvic-tilt` zo 103 na 55, `padajici-kolena` 66→55, `bolest zad` 65→50, `rib-flare` 63→53, `ploche-nohy` 63→53. Nastavené v tom istom snippete, **nie v Yoaste** — editor v tej chvíli padal. Až pôjde, dajú sa prepísať do poľa „SEO název" a zo snippetu zmazať | stiahnutie všetkých 45 článkov: **nad 60 znakov ani jeden**, najdlhší 59, priemer 36 |
| ✅ **1 · Značka preč z titulkov článkov** | Yoast pridával na koniec „- ProSapiens Biomechanic" = 24 znakov. Snippet č. 18 ju odstraňuje **len pri príspevkoch**; na stránkach (Domů, Služby, Kontakt) zostáva, tam rozpoznateľnosť značky cenu má. Oddeľovač sa v článkoch líšil (pomlčka, en dash, em dash), preto regulárny výraz — prvá verzia štyri články prehliadla | stiahnutie všetkých 45 článkov zvonku: **nad 60 znakov ich je 5 namiesto 18**, priemerná dĺžka titulku klesla na 38 znakov, značku má v titulku už len 3 |
| ✅ **DMARC v DNS** | `_dmarc.prosapiens.cz` → `v=DMARC1; p=none; rua=mailto:info@prosapiens.cz`. Doplnil Jerry 16. 8. Doména má teraz celú trojicu SPF + DKIM + DMARC | overené cez `dig` proti Cloudflare aj Google DNS |
| ✅ **LocalBusiness schema vrátane otváracích hodín** | Meno, adresa, telefón, mail, logo a hodiny (Po–Pi 7:00–20:00, Ne 8:00–14:00) v JSON-LD na úvodnej stránke a na Kontakte. Snippet č. 17 v plugine Snippety, bez ďalšieho pluginu. Hodiny som najprv vynechal s odôvodnením, že na webe nie sú — **boli, na úvodnej pod „Kde trénujeme". Hľadal som ich len na Kontakte** | stiahnutie oboch stránok bez prihlásenia: JSON-LD sa načíta a rozparsuje, typ `LocalBusiness`, adresa Fanderlíková 70, 616 00 Brno – Žabovřesky. Na článku `arm-lines` sa nevyskytuje (má tam byť len na tých dvoch). Úvodná, Kontakt, Služby aj článok ďalej vracajú 200 |
| ✅ **Nič neodkazuje na skryté stránky** | Prehľadaných všetkých 32 adries zo sitemapy | na `skupinovy-trenink` ani `lekce-fascialni-svoboda` nevedie ani jeden odkaz. Moje tvrdenie o karte „Skupinový trénink" na Službách bolo nesprávne — taká karta tam nie je |
| ✅ **Zálohy chodia do Google Drivu** | Kompletná záloha z 15. 8. 20:11 (databáza, pluginy, šablóny, nahrané súbory) leží v Drive; ~4,7 GB, Drive obsadený 9,78 z 15 GB | v UpdraftPlus má riadok štítok **„Vzdálené úložiště: Google Drive"** (staršie dva majú OneDrive), a v Drive sú súbory `backup_2026-08-15…` z 20:12–20:21 |
| ✅ **Zrušené služby stiahnuté z webu** | `skupinovy-trenink` a `lekce-fascialni-svoboda` dané do konceptu — Jerry 15. 8.: „skupinový trénink sme upustili, tento projekt nerealizujeme… rovnako lekce fasciálni svoboda". Obsah v WordPresse zostáva | zvonku obidve vracajú **404** a zmizli zo sitemapy (32 adries namiesto 34); `jak-to-funguje`, `online-trenink` a `sluzby` ďalej 200 |
| ✅ **Ďakovná stránka prestavaná** | Časová os 24 h → 48 h namiesto odseku textu; test postury ako jediná plná akcia, „Jak probíhá úvodní trénink" ako textový odkaz, MFR protokol preč (Jerryho rozhodnutie). Farby, písma aj geometria tlačidla prečítané zo živej šablóny: `#1A2E24`, Raleway 700, Open Sans, polomer 32 px. Schovaný duplicitný pás s nadpisom, blok roztiahnutý cez celú šírku | stiahnutie zvonku po nasadení: blok je na stránke, pás schovaný, tlačidlo vedie na `/test-postury/`, Raleway aj Open Sans sa načítavajú, „3 minuty" na mieste, prázdny Raw HTML blok preč |
| ✅ **Test postury na ďakovnej stránke** | Jerryho nápad 16. 8. Ďakovná stránka naň dovtedy neodkazovala vôbec a test má z Googlu **47 zobrazení a 0 klikov** — nájsť sa nedá, jedine postaviť pred ľudí, čo už záujem majú. Kľúč je časovanie: stránka sľubuje ozvanie do 48 h, test odpoveď do 24 h, takže **výsledok dorazí skôr než hovor** a Jerry má pred prvým rozhovorom jeho odpovede | stiahnutie zvonku: odkaz na `/test-postury/` je tam raz, tlačidlo má vlastnú triedu webu `psb-ad-btn-primary`, pôvodné dve ponuky (úvodný tréning, MFR protokol) zostali pod ním |
| ✅ **1b · Mŕtvy odkaz „individuální trénink" opravený** | 4 výskyty na 3 stránkach prepísané na `/jak-to-funguje/` — na Službách to bola karta služby aj tlačidlo „Více informací" | stiahnutie všetkých troch stránok bez prihlásenia: `individualni-trenink` sa nevyskytuje ani raz, cieľ vracia HTTP 200 |

---

## Robím ja

### ~~1 · Skrátiť šablónu titulkov~~ — HOTOVÉ, viď tabuľka Hotové

**Zostáva päť titulkov, ktoré sú dlhé samy o sebe** — tam už značka nie je,
je dlhá samotná veta a skrátiť ju je vecou obsahu, nie nastavenia:

| stránka | znakov |
|---|---|
| `anterior-pelvic-tilt` | 103 |
| `padajici-kolena-dovnitr` | 66 |
| `prekonani-bolesti-zad-…` | 65 |
| `rib-flare` | 63 |
| `ploche-nohy` | 63 |

<details><summary>pôvodný plán</summary>

### 1 · Skrátiť šablónu titulkov v Yoaste
Na koniec každého titulku sa pridáva „- ProSapiens Biomechanic" = 24 znakov.
18 titulkov preto prerastie 60 znakov a Google ich odsekne.

**Plán:** u typu *Příspěvky* (45 článkov, tam sú tie dlhé titulky) nechať
`%%title%%` bez prípony. U *Stránky* nechať značku, ako je — na `sluzby`,
`kontakt` a úvodnej má rozpoznateľnosť značky cenu, a tie titulky sú krátke.

**Stav:** nové nastavenia Yoastu sú jednostránková aplikácia, ktorá mimo
prehliadača nedrží navigáciu medzi sekciami. Skúsim to cez staršiu adresu
`admin.php?page=wpseo_titles`, prípadne priamo v poli SEO titulku pri
najzasiahnutejších článkoch.

**Ako sa to nakoniec vyriešilo:** nie cez Yoastove nastavenia (tie sú React
a cez automatizáciu sa neuložia), ale filtrom `wpseo_title` v plugine Snippety.
Rovnaká cesta ako pri LocalBusiness scheme.

</details>

### 2 · Meta popisy — TEXTY HOTOVÉ, VLOŽENIE NEPRECHÁDZA
Zoznam je už len 12 stránok: `skupinovy-trenink` a `lekce-fascialni-svoboda`
z neho vypadli, sú skryté.

**Napísané a schválené (15. 8.):**
- `sluzby` → *Diagnostika držení těla a chůze, individuální i online trénink a skupinové lekce v Brně. Úvodní lekce 60 minut za 1 100 Kč.* ⚠️ prepísať, skupinové lekce už nie sú
- `dychani` → *Box breathing ani brániční dech nezabraly? Problém není v technice, ale ve struktuře těla. Zkrácená verze příručky o dýchání zdarma.*

**Prečo to ešte nie je na webe.** Yoastove polia sa nedajú zapísať žiadnou
z troch ciest, ktoré som skúsil: REST API ich nevystavuje (`meta` obsahuje len
`footnotes`), nové nastavenia Yoastu sú React a hromadný editor Yoast v tejto
verzii už neobsahuje. Štvrtá cesta funguje do polovice: v klasickom editore
existuje skryté pole `yoast_wpseo_metadesc`, hodnotu doň nastaviť viem, ale
tlačidlo *Aktualizovat* sa cez automatizáciu nespustí — rovnaký problém ako pri
Yoaste, Websupporte a modálnom okne UpdraftPlus.

**Texty sú napísané, všetkých desať.** Vkladajú sa v editore stránky do poľa
**„Meta description"** v Yoast boxe pod obsahom. Presunuté do časti
„Potrebujem Jerryho" ako H4.

### 3 · ~~LocalBusiness schema~~ — HOTOVÉ, viď tabuľka Hotové

Zostáva jedna vec, ktorá potrebuje Jerryho: **otváracie hodiny**. Na webe nikde
nie sú, takže som ich do schémy nedal — vymyslené hodiny sú horšie než žiadne.
Keď ich pošleš (napr. „Po–Pi 7:00–20:00, So 8:00–12:00"), dopíšem ich do
snippetu a Google ich bude môcť zobraziť priamo vo výsledku.

### 4 · Alt texty — 4a aj 4b HOTOVÉ, 4c naráža na hranicu
- ~~**4a** `deep-front-line`, `arm-lines`, `spiral-line`~~ — 52 altov
- ~~**4b** anatomické a symptómové články~~ — ďalších 67 altov
- **4c** zvyšok — **z názvov súborov sa už nedá**

**Stav 16. 8.:** v 45 článkoch je 370 obrázkov, **132 má alt** (na začiatku 13).
Zostáva 238, z toho **215 sa z názvu súboru popísať nedá** a 23 ešte áno.

**Prečo to nejde ďalej rovnakou cestou.** Alt píšem z názvu súboru — a to
funguje, keď sa súbor volá `SBL` alebo `coraco-pecmin-bicbrach-subcal`.
Nefunguje, keď sa volá `AdobeStock_1563695645`, `hf_20260525_101500_2017e3a3`
alebo `image-4`. Tam neviem, čo na obrázku je, a **vymyslený alt je horší než
žiadny**: nevidiacemu klame a Googlu dáva nepravdivý údaj o obsahu.

Sú tri cesty, ako dokončiť tých 215:
1. **Pozriem sa na obrázky** — viem si ich stiahnuť a prezrieť. Je to pomalšie
   (rádovo hodiny), ale výsledok je presný.
2. **Jerry napíše jednou vetou, čo je na obálkach** najnavštevovanejších článkov
   (`predsunuta-hlava`, `padajici-kolena-dovnitr`, `ploche-nohy`, `rib-flare`) —
   tam je tých fotiek po štyroch a sú to tie s najväčším dopadom.
3. **Nechať tak.** 36 % pokrytie je oproti 3,5 % na začiatku veľký posun a zvyšok
   sú z väčšiny dekoratívne stockové fotky, ktoré do obrázkového vyhľadávania
   aj tak neprinesú nič.

Odporúčam 2 pre štyri najsilnejšie články a zvyšok nechať.

**Čo sa doplniť nedá a prečo to nie je chyba:** screenshoty (`Snimka-obrazovky-…`),
fotky z fotoaparátu (`DSC04584`) a pozadia (`Background`, `Pozadi-1`). Pri
dekoratívnom pozadí je prázdny alt **správny** — čítačka pre nevidiacich ho má
preskočiť. Pri screenshotoch a fotkách by som musel vidieť, čo na nich je.

Anatomické obrázky sa opisujú tým, čo na nich je (ktorá línia, ktorý sval) —
nie „obrázok fascie". Toto je jediná vec, ktorú Google o obrázku vie.

### 5 · Zmazať neaktívne pluginy a šablóny — ZASTAVENÉ, čaká na rozhodnutie
Zálohy fungujú, takže krytie je. Ale keď som sa pozrel, čo tie „neaktívne
pluginy" sú, vyšlo z toho niečo iné než drobnosť:

| položka | čo to je | odporúčam |
|---|---|---|
| **WooCommerce** | e-shop. Vypnutý, ale v databáze zostávajú jeho tabuľky, role (*Shop manager*, *Customer*) aj prípadné produkty a objednávky | **spýtať sa Jerryho.** Zmazanie pluginu dáta z databázy nemaže, takže je to vratné preinštalovaním — ale je to jeho rozhodnutie o predaji, nie technická drobnosť |
| **Pinterest pro WooCommerce** | doplnok k tomu istému e-shopu, bez neho nemá funkciu | zmazať |
| **Twenty Twenty-Four** | stará predvolená šablóna WordPressu | zmazať |
| **Twenty Twenty-Five** | aktuálna predvolená šablóna | **NEMAZAŤ.** Je to záchranná šablóna: keď sa SetupFolio alebo WPBakery po aktualizácii rozsype, WordPress prepne na ňu a web ostane čitateľný. Bez nej by pri chybe zostala biela stránka. Zoznam pôvodne hovoril „zmazať neaktívnu šablónu" — to bolo príliš stroho, jedna má zostať |

**Jerryho rozhodnutie 15. 8.:** *„wocommerce vymaz twenty twenty five nechaj"* —
teda zmazať WooCommerce aj Pinterest doplnok aj Twenty Twenty-Four, ponechať
Twenty Twenty-Five.

**Prečo to nie je hotové — a v akom PORADÍ sa to musí robiť.** WooCommerce nemá
v zozname pluginov odkaz „Smazat" vôbec a obidve zaškrtávacie políčka sú
zablokované. Nie je to chyba oprávnení: **Pinterest pro WooCommerce deklaruje
WooCommerce ako vyžadovaný plugin**, a WordPress od verzie 6.5 zakazuje zmazať
plugin, na ktorom iný nainštalovaný plugin závisí. Preto:

1. najprv zmazať **Pinterest pro WooCommerce** (odkaz „Smazat" v jeho riadku má)
2. potom sa pri **WooCommerce** odkaz „Smazat" objaví sám

Mne sa mazanie cez automatizáciu nedokončilo — odkaz sa prepol na „Deleting…"
a tým to skončilo, plugin zostal. Je to piata obrazovka za dnešok, ktorá cez
automatizáciu nedobehne (Yoast, Websupport, okno UpdraftPlus, Asset CleanUp,
teraz mazanie pluginov).

**Ani Jerrymu sa to nepodarilo** (15. 8.): *„nedajú sa zmazať, dokonca som
Pinterest aj aktualizoval, ale nedá sa to zmazať, proste to tam ostane."* Príčina
je teda hlbšie než v poradí — pravdepodobne práva na súbory na serveri. **Ostáva
to tak a je to prijateľné:** oba pluginy sú neaktívne a **aktualizované**, čiže
neobsahujú známe diery. Rozdiel medzi „neaktívny a aktuálny" a „zmazaný" je malý.
Ak by sa to raz malo dorobiť, ide to cez správcu súborov na hostingu — ale to je
zásah do súborov webu a nie je naň dôvod.

<details><summary>pôvodný postup (nefunguje)</summary>

**Pre Jerryho sú to štyri kliky:** `Pluginy → Neaktivní` → pri Pinterest
**Smazat** → potvrdiť → pri WooCommerce **Smazat** → potvrdiť.
Šablóna: `Vzhled → Šablony` → Twenty Twenty-Four → **Smazat**. Twenty
Twenty-Five ponechať.

</details>

### ~~6 · Aktualizovať 24 pluginov~~ — HOTOVÉ (Jerry, 15. 8.)
Po aktualizácii overené zvonku: úvodná, `sluzby`, `kontakt`, `jak-to-funguje`,
`online-trenink` aj `arm-lines` vracajú 200. Nič sa nerozsypalo.

<details><summary>pôvodný plán</summary>

### 6 · Aktualizovať 24 pluginov
**Zámerne posledné a až po zálohách.** Zálohy už fungujú, takže krytie je.

Overené 15. 8.: z tých 24 sú zablokované len dva (WooCommerce a Pinterest,
z rovnakého dôvodu ako pri mazaní) — **zvyšných 22 sa aktualizovať dá**.

**Ale:** aktualizácia pluginu ide vo WordPresse len cez AJAX v prehliadači,
REST API na to nemá cestu. A práve ten AJAX mi dnes päťkrát nedobehol. Púšťať
cez taký kanál 22 aktualizácií je zlý nápad: aktualizácia, ktorá sa zastaví
v polovici, nechá plugin v rozbitom stave. Preto to navrhujem takto: **kliká
Jerry po dávkach po piatich, ja po každej dávke overím zvonku** úvodnú, `sluzby`
a `kontakt` a poviem, či ísť ďalej.

### 7 · Poriadok v H1 *(najneskôr, možno vôbec)*
68 z 79 stránok nemá práve jeden H1; úvodná má deväť. Robí to šablóna
SetupFolio a WPBakery, takže oprava znamená zásah do šablóny — to je riziko
neúmerné úžitku. Preberieme, keď bude zvyšok hotový.

---

## Potrebujem Jerryho

### ~~H1 · Spustiť testovaciu zálohu~~ — HOTOVÉ, viď tabuľka Hotové

**Pozor na miesto v Drive.** Jedna záloha váži ~4,7 GB a v Drive je voľných
~5 GB. Nastavené je uchovávať 2 zálohy, čo sa práve vojde — tretia by pretiekla.
Keď sa web zväčší, treba to riešiť: buď zaplatený Drive, alebo do Drivu posielať
len databázu a súbory nechať na hostingu.

<details><summary>pôvodné znenie (chybný záver)</summary>
Google Drive **je povolený** — Jerry dokončil „Complete setup" 15. 8., návrat
prišel so `state=success` a výzva „Follow this link to authorize" z UpdraftPlus
zmizla.

**Ale to nie je dôkaz.** Že výzva zmizla, znamená len že plugin má token;
neznamená, že súbor doletí do Drivu. Skúsil som zálohu len databázy (súbory
odškrtnuté, „odeslat na vzdálené úložiště" zapnuté) — tlačidlo v tom okne
cez automatizáciu nezabralo a nová záloha nevznikla. Nič sa nerozbilo, len
chýba dôkaz.

**Čo od teba treba:** UpdraftPlus → **Zálohovat nyní** → potvrdiť.

**Chyba, ktorú som pri tom urobil:** vyhlásil som, že v Drive nič nie je. Hľadal
som „updraft", ale UpdraftPlus ukladá súbory pod menom `backup_<dátum>` a do
koreňa Drivu, nie do priečinka toho mena. Prázdny výsledok jedného hľadania som
vydal za dôkaz neexistencie — to isté pravidlo, na ktoré mám v CLAUDE.md
vlastný odsek, a dnes už tretíkrát.

</details>

### H2 · ~~Kam má viesť odkaz „individuální trénink"~~ — ZODPOVEDANÉ
Jerry 15. 8.: individuálny tréning je pozostatok starého rozhrania a bol
prerobený na **„jak to funguje"**. Stránka `/individualni-trenink/` naozaj
neexistuje, takže nie je čo mazať — prepíšu sa tie tri odkazy, ktoré na ňu
vedú (`sluzby`, `predsunuta-hlava`, `anterior-pelvic-tilt`) na
`/jak-to-funguje/`. **Hotové 15. 8.** — viď tabuľka Hotové.

<details><summary>pôvodné znenie otázky</summary>
`/individualni-trenink/` vracia 404 a odkazujú naň tri stránky vrátane
**Služby**. Taká stránka na webe neexistuje — existujú `uvodni-trenink`,
`online-trenink` a `skupinovy-trenink`, individuálny nie.

**Odpovedz jedným slovom:**
- **„úvodní"** → prepíšem odkazy na `/uvodni-trenink/` (je to vstup do 1:1 práce, takže to sedí a je to hotové za päť minút) ← toto odporúčam
- **„vytvor"** → treba novú stránku o individuálnom tréningu; napíšem návrh textu a pošlem na schválenie
- **„iné"** → povedz kam

</details>

### H4 · Vložiť desať meta popisov do Yoastu
Napísané zo skutočného textu tých stránok. Nikde nie je značka — tú nesie
titulok — a nikde nie je prídavné meno navyše.

| stránka | text do poľa „Meta description" |
|---|---|
| `sluzby` | Diagnostika držení těla a chůze, individuální i online trénink v Brně. Úvodní lekce 60 minut za 1 100 Kč. |
| `dychani` | Box breathing ani brániční dech nezabraly? Problém není v technice, ale ve struktuře těla. Zkrácená verze příručky o dýchání zdarma. |
| `jerry` | Jerry Stráňavský: od fitness center a certifikací v DNS a SM-systému k biomechanice. Proč výsledky klientů nebyly trvalé — a co to změnilo. |
| `terezia` | Terézia: z výkonnostního volejbalu přes bolesti z jednostranného přetěžování ke studiu FTVŠ a biomechanickému tréninku v Brně. |
| `matyas` | Matyáš: od tance na konzervatoři k zájmu o pohyb a zdraví. Co ho přivedlo k biomechanice a proč hledá i regulační stránku těla. |
| `doporucene-pomucky` | Pomůcky pro aktivní trénink — odporové gumy, jednoručky, kettlebelly a balanční pomůcky. Co používáme ve studiu a co doporučujeme domů. |
| `informace-po-uvodnim-treninku` | Vše, o čem jsme mluvili na úvodním tréninku, na jednom místě: délky tréninků, zázemí, individuální MFR plán a příručka ke stažení. |
| `podekovani` | Děkujeme, ozveme se do 48 hodin. Mezitím si přečtěte, jak úvodní trénink probíhá, nebo si stáhněte protokol myofasciálního uvolňování zdarma. |
| `gdpr` | Jak ProSapiens Biomechanic nakládá s osobními údaji klientů a návštěvníků webu. |
| `obchodni-podminky` | Obchodní podmínky ProSapiens Biomechanic — platby, rezervace a rušení tréninků. |

Posledné dva sú krátke zámerne: sú to právne stránky, na ktoré nikto nehľadá,
a dlhý popis by im dal váhu, ktorú mať nemajú.

### ~~H5 · Otváracie hodiny~~ — HOTOVÉ. Boli na úvodnej pod „Kde trénujeme".

### H6 · Skontrolovať znenie altov na jednej stránke
Na `arm-lines` som doplnil 16 altov s anatomickými názvami. **Pozri sa na ne
skôr, než tým istým spôsobom prejdem ďalších ~470 obrázkov** — pri anatómii je
nesprávny popis horší než žiadny a ty to poznáš, ja to čítam z názvov súborov.
Stačí „sedí" alebo povedz, čo prepísať.

### H3 · DMARC záznam v DNS
SPF máš, DMARC nie. Bez neho chodia maily z webu horšie (aj upozornenie na nový
dopyt) a tvoju doménu môže hocikto použiť na podvrhnuté maily.

**Skúsil som to sám** (15. 8., Websupport → DNS → TXT → Vytvoriť nový záznam).
Formulár Websupportu je React a **neprijal ani programové vyplnenie, ani
skutočné písanie** — polia zostali prázdne a záznam nevznikol. Overené: v zozname
TXT `_dmarc` nie je. SPF aj MX som skontroloval, sú nedotknuté.

Pri DNS druhýkrát neskúšam naslepo — je to jediné miesto, kde sa dá jedným zlým
znakom vypnúť web aj pošta. **Vyplň tie štyri polia ručne**, formulár máš
otvorený:

| pole | hodnota |
|---|---|
| Pre adresu | `_dmarc` |
| Hodnota | `v=DMARC1; p=none; rua=mailto:info@prosapiens.cz` |
| TTL | 600 (nechať) |
| Poznámka | nepovinné |

`p=none` znamená „nič neblokuj, len mi hlás". To je správny prvý krok —
najprv mesiac pozorovať, kto tvojím menom posiela, a až potom priťahovať.

---

## Presmerovania po zrušených stránkach — hotové 17. 8. 2026

Search Console ukazovala **14 adries s 2 670 zobrazeniami, ktoré vracali 404** —
ľudia z Googlu pristávali na chybovej stránke. Nikto to nevidel, lebo appka
tie adresy dovtedy nekonfrontovala so skutočným stavom webu; vyšlo to najavo
až pri záťažovom teste Jarvisa, keď dal preklik na článok a ten skončil na 404.

Rieši to snippet **19 „PSB — presmerovania zrušených stránok"** (Code Snippets,
front-end, aktívny). Beží LEN pri 404, takže keby stránka niekedy ožila,
presmerovanie sa samo prestane používať.

| adresa | zobrazení | ide na | prečo |
|---|---|---|---|
| `/skupinovy-trenink/` | 762 | `/jak-to-funguje/` | projekt zrušený, ľudia hľadajú tréning |
| `/lekce-fascialni-svoboda/` | 530 | `/jak-to-funguje/` | to isté |
| `/individualni-trenink/` | 406 | `/jak-to-funguje/` | tá istá stránka, len premenovaná |
| `/online-analyza-drzeni-tela/` | 105 | `/online-trenink/` | najbližšia živá služba |
| `/platba-za-online-analyzu/` | 5 | `/online-trenink/` | to isté |
| `/galerie/` | 119 | `/vysledky/` | fotky klientov dnes žijú tam |
| `/drevena-bezecka-draha/` | 113 | `/o-nas/` | vybavenie štúdia — **tu si najmenej istý cieľom** |
| 7× slovenská séria „začarovaný kruh" | 630 spolu | `/blog/` | náhradu na webe nemá |

Overené: každá adresa **301 na jeden skok** a cieľ vracia 200; bežné stránky
sa nezmenili (0 presmerovaní) a neznáma adresa stále vracia poctivú 404.

Najväčší zisk sú prvé tri riadky: **1 698 zobrazení mesačne**, ktoré doteraz
končili na chybovej stránke, teraz vedú na stránku so službou.

---

## Skrátené reťaze presmerovaní — hotové 17. 8. 2026

Pri kontrole predchádzajúcej úpravy sa ukázalo, že `/functional-patterns/`
vedie cez dva skoky (`→ /funkcni-biomechanika/ → /co-je-functional-patterns/`).
Robí to plugin **Redirection** — dve pravidlá za sebou, ako sa web postupne
prekladal a premenúval.

Prehľadanie všetkých 47 pravidiel našlo **päť takých reťazí**, nie jednu.
Vidno ich len takto: prejdením pravidiel, nie prechádzaním adries — štyri
z piatich totiž začínali na adresách, ktoré nie sú ani v sitemape, ani
v Search Console.

| pravidlo | prechodov predtým | teraz vedie rovno na | kliknutí |
|---|---|---|---|
| `/functional-patterns/` | 2 | `/co-je-functional-patterns/` | **244** |
| `/analyza-drzani/` | 2 | `/test-postury/` | 15 |
| `/superficial-back-line-sbl-povrchova-zadni-linie/` | 2 | `/superficial-back-line/` | 1 |
| `/bitrilogia-2/` | 2 | `/bitrilogia-biomechanika-biohacking-bitcoin/` | 0 |
| `/about-two/` | 2 | `/vysledky/` | 0 |

Prostredné tabule sa NEMAZALI — `/funkcni-biomechanika/` aj
`/analyza-drzeni-tela/` samostatne fungujú ďalej, lebo na ne tiež vedú odkazy
zvonku. Skrátila sa len prvá tabuľa každej reťaze.

Overené: všetkých päť ide na **jeden skok** na stránku, ktorá vracia 200,
prostredné pravidlá fungujú samy, a v pluginu nezostala ani jedna reťaz.

---

## Rozhodnuté, že sa nerobí

| | |
|---|---|
| **Vypnúť Wordfence** | Jerryho návrh 15. 8. Zamietam a vysvetlil som prečo: blokovanie sa netýkalo webu, ale mojej IP pri 500 požiadavkách za minútu, a samo vyprší. Wordfence navyše skrýva `wp-admin` pred neprihlásenými. Vypnúť ochranu, aby sa mne ľahšie sťahovalo, je zlá výmena — a audit sa dá spraviť pomalšie |
