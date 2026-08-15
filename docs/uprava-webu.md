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
| ✅ **4a čiastočne · alt texty na `arm-lines`** | 16 obrázkov dostalo alt: štyri línie paže (SFAL, SBAL, DFAL, DBAL), úpony, rotátory ramena. Kde názov súboru neurčoval sval jednoznačne, opisujem oblasť namiesto hádania | stiahnutie stránky bez prihlásenia: **41 zo 47** obrázkov má alt (predtým 25). Zvyšných 6 sú screenshoty a jedna fotka — z názvu súboru sa obsah zistiť nedá |
| ✅ **LocalBusiness schema na webe** | Meno, adresa, telefón, mail a logo v JSON-LD na úvodnej stránke a na Kontakte. Vložené ako snippet č. 17 v plugine Snippety, bez ďalšieho pluginu. Otváracie hodiny zámerne chýbajú — na webe nie sú | stiahnutie oboch stránok bez prihlásenia: JSON-LD sa načíta a rozparsuje, typ `LocalBusiness`, adresa Fanderlíková 70, 616 00 Brno – Žabovřesky. Na článku `arm-lines` sa nevyskytuje (má tam byť len na tých dvoch). Úvodná, Kontakt, Služby aj článok ďalej vracajú 200 |
| ✅ **Nič neodkazuje na skryté stránky** | Prehľadaných všetkých 32 adries zo sitemapy | na `skupinovy-trenink` ani `lekce-fascialni-svoboda` nevedie ani jeden odkaz. Moje tvrdenie o karte „Skupinový trénink" na Službách bolo nesprávne — taká karta tam nie je |
| ✅ **Zálohy chodia do Google Drivu** | Kompletná záloha z 15. 8. 20:11 (databáza, pluginy, šablóny, nahrané súbory) leží v Drive; ~4,7 GB, Drive obsadený 9,78 z 15 GB | v UpdraftPlus má riadok štítok **„Vzdálené úložiště: Google Drive"** (staršie dva majú OneDrive), a v Drive sú súbory `backup_2026-08-15…` z 20:12–20:21 |
| ✅ **Zrušené služby stiahnuté z webu** | `skupinovy-trenink` a `lekce-fascialni-svoboda` dané do konceptu — Jerry 15. 8.: „skupinový trénink sme upustili, tento projekt nerealizujeme… rovnako lekce fasciálni svoboda". Obsah v WordPresse zostáva | zvonku obidve vracajú **404** a zmizli zo sitemapy (32 adries namiesto 34); `jak-to-funguje`, `online-trenink` a `sluzby` ďalej 200 |
| ✅ **1b · Mŕtvy odkaz „individuální trénink" opravený** | 4 výskyty na 3 stránkach prepísané na `/jak-to-funguje/` — na Službách to bola karta služby aj tlačidlo „Více informací" | stiahnutie všetkých troch stránok bez prihlásenia: `individualni-trenink` sa nevyskytuje ani raz, cieľ vracia HTTP 200 |

---

## Robím ja

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

### 4 · Alt texty
512 obrázkov bez altu. Po dávkach podľa návštevnosti, nie podľa abecedy:
- **4a** `deep-front-line` (43), `arm-lines` (22), `spiral-line` (16)
- **4b** `superficial-front-line` (19), `superficial-back-line` (18), `biotensegrita` (23)
- **4c** zvyšok podľa zobrazení

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

**Pre Jerryho sú to štyri kliky:** `Pluginy → Neaktivní` → pri Pinterest
**Smazat** → potvrdiť → pri WooCommerce **Smazat** → potvrdiť.
Šablóna: `Vzhled → Šablony` → Twenty Twenty-Four → **Smazat**. Twenty
Twenty-Five ponechať.

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

### H5 · Otváracie hodiny do LocalBusiness schémy
Na webe nikde nie sú. Keď mi ich napíšeš, dopíšem ich do snippetu a Google ich
bude môcť ukázať priamo vo výsledku vyhľadávania.

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

## Rozhodnuté, že sa nerobí

| | |
|---|---|
| **Vypnúť Wordfence** | Jerryho návrh 15. 8. Zamietam a vysvetlil som prečo: blokovanie sa netýkalo webu, ale mojej IP pri 500 požiadavkách za minútu, a samo vyprší. Wordfence navyše skrýva `wp-admin` pred neprihlásenými. Vypnúť ochranu, aby sa mne ľahšie sťahovalo, je zlá výmena — a audit sa dá spraviť pomalšie |
