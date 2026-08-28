# Stavba nového webu prosapiens.cz

> Kompletní podklad pro AI, která web postaví: kdo jsme, komu mluvíme, za kolik, jak vypadá dnešní web, co je na něm změřeně špatně, jak má vypadat nový — a co se přitom nesmí ztratit ani vymyslet.

**Zadavatel:** ProSapiens Biomechanic, Brno  
**Implementátor:** ChatGPT Codex  
**Verze:** 3 · 28. 8. 2026  

---

## 01 · Jak číst tento dokument

Web bude stavět AI podle tohoto zadání. Dokument je proto psaný jako specifikace, ne jako inspirace: co je v něm napsané jako číslo nebo adresa, je ověřený fakt; co je napsané jako rozhodnutí, se nemá znovu otevírat.

> **Tři pravidla nad všemi ostatními ⛔**
>
> **1. Nic si nevymýšlej.** Žádné smyšlené recenze, jména klientů, počty, certifikáty, loga „důvěřují nám", roky praxe ani citáty. Každé číslo a jméno na webu musí pocházet z tohoto dokumentu nebo ze současného webu. Když podklad chybí, nech místo prázdné a napiš to do seznamu chybějících podkladů — **nedoplňuj to odhadem.**
> **2. Texty se přebírají, nepřepisují.** Současný web má texty psané majitelem podle vlastních pravidel (sekce 07). Migrují se doslova. Přepis textu je samostatné rozhodnutí, ne součást přestavby.
> **3. Adresy se nemění bez mapy přesměrování.** Web má roky organické historie v Googlu. Podrobnosti v sekci 13.

Sekce 02–08 jsou **kontext** — bez nich vzniknou správně vypadající stránky se špatným obsahem. Sekce 09–10 jsou **vizuální ambice**. Sekce 11–13 jsou **výchozí stav**. Sekce 14–19 jsou **vlastní zadání**.

---

## 02 · Kdo je ProSapiens

Specializované **biomechanické pohybové studio v Brně**. Pracujeme metodikou Functional Patterns. Individuální práce 1:1, offline v Brně i online.

> **Positioning v jedné větě**
>
> ProSapiens je pro lidi, kteří nechtějí jen cvičit — chtějí systematicky změnit způsob, jakým se jejich tělo pohybuje, aby snížili chronické přetížení, bolest a neefektivní pohybové vzorce.

| Co ProSapiens je | Co ProSapiens není |
|---|---|
| Individuální 1:1 práce s pohybem a biomechanikou | Fitness centrum |
| Diagnostika, dlouhodobé vedení, systematická změna pohybového chování | Skupinové lekce |
| Řešení držení těla, chůze, běhu, přenosu sil, chronického přetížení | Masová pohybová služba |
| Práce s příčinou, ne s místem bolesti | Klasická fyzioterapie · rychlé opravy bolesti · motivační wellness |

**Tenhle rozdíl je jádro veškeré komunikace.** Většina obsahu, který u nás funguje, vysvětluje právě ho: ProSapiens versus běžné cvičení, masáž nebo nárazové řešení. Nový web má tenhle rozdíl nést v každé sekci, ne ho zmínit na jedné podstránce.

**Kontaktní údaje**

| | |
|---|---|
| Adresa | Fanderlíková 70, 616 00 Brno – Žabovřesky |
| E-mail | info@prosapiens.cz |
| Telefon | +420 702 147 704 |
| Otevírací doba | Po–Pá 7:00–20:00 · Ne 8:00–14:00 |
| Instagram | @prosapiens.biomechanic |

---

## 03 · Lidé

| Kdo | Role | Témata |
|---|---|---|
| **Filip „Jerry" Stráňavský** | Majitel, hlavní biomechanický trenér | Trénink, biomechanika, byznys, marketing, technologie, analytika |
| **Terézia „Terezka" Zaťková** | Biomechanická trenérka, spolumajitelka | Výživa, hormony, metabolismus, zdraví, lifestyle, péče o klienty |
| **Matyáš** | Trenér | Trénink |

**Tým má tři členy a nový web má mít tři profily trenérů.** Matyáš zůstává (potvrzeno 28. 8. 2026).

Oba zakladatelé mají certifikaci **Human Biomechanics Specialist Level 1** (Functional Patterns, Las Vegas, duben 2025, platnost do 7. 5. 2027), ověřitelnou v oficiálním registru. Oba jsou absolventi magisterského oboru na FTVŠ Univerzity Komenského v Bratislavě. Ověřovací odkazy jsou dnes na profilech, na stránce o metodice a v autorském bloku pod články — **musí zůstat.**

Témata Jerryho a Terezky se **nemíchají** — biomechanický a výživový obsah mluví za různé lidi. Web to musí unést: autorství u článků, oddělené profily, případně oddělené rubriky.

---

## 04 · Persona klienta

Toto je nejdůležitější sekce pro psaní a řazení obsahu. **Demografie:** muž nebo žena, 30–45 let, sedavé zaměstnání (kancelář, IT, podnikání). Má za sebou zkušenost, že běžné cvičení, masáže ani nárazová řešení problém trvale nevyřešily. Má kapacitu investovat čas, pozornost i peníze do dlouhodobé spolupráce. Sekundárně: sportovci s biomechanickými limity, ženy po těhotenství.

### 4.1 S čím přichází

| Okruh | Konkrétně |
|---|---|
| **Posturální problémy** | Kyfóza · odstávající lopatky (scapular winging) · skolióza · hyperlordóza · padlé klenby · padající kolena · jedno rameno níž než druhé · propadlá ramena |
| **Pohybové obtíže** | Bolesti při chůzi · bolesti při běhu |
| **Prevence civilizačních onemocnění** | Ploténky · osteoporóza · menisky |
| **Vzhled** | Vypadlé podbřišky · celulitida · předsunutá hlava · hrb · tvar zadku a stehen |
| **Dlouhověkost** | „Jak se budeš mít v důchodu?" |
| **Začarovaný kruh** | „Už jsi zkusil všechno?" |
| **Obavy** | Přeplněná fitka · klasický silový trénink |

### 4.2 Co získá

| Okruh | Výsledek |
|---|---|
| Posturální problémy | Minimalizace bolesti, lepší vzhled, víc energie, víc sebevědomí |
| Pohyb | Užitek z turistiky, bezbolestná chůze a běh |
| Vzhled | Silnější a funkčnější zadek, lepší vzpřímenost proti celulitidě |
| Dlouhověkost | Lepší mentální zdraví, zlepšení neuroplasticity, lepší koordinace |

### 4.3 Proč mu nefungovalo, co zkoušel předtím

Tohle je jádro námitek. Web na ně musí odpovídat dřív, než je člověk vysloví.

- **Fyzioterapie** tě posune někam, ale nakonec se vrátíš.
- **Optimalizace sedu** — a bolest neodchází.
- **Core jen na zemi** — potřebuješ ho i ve stoje.
- **Masáže** a proč nefungují.
- **Víkendový kurz o správné chůzi.**
- **Online kurzy na lepší držení těla.**
- **„Hackni si chůzi"** — ne jen spánek, strava a trénink.

### 4.4 Nepravdivá přesvědčení, se kterými přichází

- Ze silového tréninku zesílíš.
- Dřep bez pocitu v zadku — „při dřepu máš cítit přední stehna".
- Izolovanými cviky zlepšíš posturu.
- Jóga ti zlepší flexibilitu a mobilitu.
- Myšlenka na to, jak chodíš, ti chůzi napraví.

### 4.5 Chyby, které dělá

- Posiloval tělo dřív, než vyřešil jeho držení.
- Začal běhat maratony — dal si maraton za cíl dřív, než měl funkční zadek a biomechaniku.
- Převážně bilaterální cvičení se skoliózou.
- Rehabilitační cvičení s příliš malým odporem.

Struktura vstupních stránek má kopírovat cestu v hlavě čtenáře: **symptom → proč to, co zkusil, nezabralo → co je skutečná příčina → co s tím děláme my → první krok**. Současná stránka `/uvodni-trenink/` to už dělá dobře („Fyzioterapie pomohla. Na chvíli.") — je to vzor, ne výjimka.

---

## 05 · Služby a ceny

Stav k 28. 8. 2026, tak jak je uvedený na webu. **Hlavní produkt je dlouhodobá spolupráce, ne jednorázová hodina** — tomu má odpovídat i hierarchie na stránce se službami.

| Služba | Offline (Brno) | Online | Poznámka |
|---|---|---|---|
| **Úvodní trénink** — diagnostika a analýza držení těla a chůze, 60 min | 1 100 Kč | 990 Kč | Vstupní brána do celé spolupráce |
| **Jednorázová lekce**, 1 hodina | 1 450 Kč | 1 390 Kč | Online cena je dnes jen ve větě v textu, ne na kartě |
| **Balíček 6 h — bez závazku** | 7 790 Kč | 6 590 Kč | 1 289 Kč/h offline · platnost 2 měsíce |
| **Předplatné 6 h / měsíc — se závazkem** | 6 990 Kč | 5 640 Kč | 1 165 Kč/h offline · online v režimu 6 h × 6 měsíců |

**Co je součástí balíčku**

- Individuální trénink s trenérem 60 minut, s možností přijít dřív nebo zůstat déle (±60 minut)
- Masáž podle potřeby — uvolnění fascií, svalů, lepší regenerace
- Káva, čaj nebo kakao zdarma
- Sprchy a základní hygienické potřeby (non-toxic šampon a mýdlo; ručník vlastní)
- Mobilní aplikace **PT Minder** — sledování tréninků, zbývajících hodin a plateb

**Struktura spolupráce, jak ji web dnes popisuje**

- **Fáze 1 — Obnova** (0–6 měsíců)
- **Fáze 2 — Integrace** (6–18 měsíců)
- Doporučený rytmus: 6 hodin měsíčně

Interní názvy služeb v PT Minderu se s webem neshodují (`OFF - 6h BEZ viazanosti`, `OFF - 8 hodín offline`, `TC - 1 hodina`, paušály GOLD/SILVER/DIAMOND). Existují i varianty, které web vůbec neuvádí — například balíčky 8 h a 18 h. Před spuštěním nového ceníku je potřeba rozhodnout, co se veřejně nabízí a co zůstane interní.

---

## 06 · Obchodní realita

- **58** — aktivních klientů
- **60–70** — kapacitní strop
- **189 tis.** — Kč měsíčně

Tržby září 2025 – červenec 2026 (11 uzavřených měsíců): **2 083 068 Kč**, tedy průměr 189 370 Kč měsíčně, s rozptylem 122 286 – 311 800 Kč.

**Odkud přicházejí poptávky**

| Kanál | Poptávek | Co to znamená pro web |
|---|---|---|
| Doporučení | 16 | Člověk přichází s předem vysokou důvěrou a chce si nás jen ověřit. Web musí obstát jako *ověření*, ne jako přesvědčování. |
| Instagram | 8 | Přichází z profilu na jednu konkrétní stránku. Vstupní stránka musí fungovat samostatně. |
| Google | 6 | Nejčastěji přes odborný článek, ne přes stránku služby. |
| Web (přímo) | 4 |  |
| Jiné | 6 |  |

Cílem webu **není maximalizovat objem poptávek**. Při stropu 60–70 klientů je kampaň, která přivede hodně nevhodných lidí, zátěž, ne úspěch. Web má tři úkoly v tomhle pořadí: **obstát při ověřování** (doporučení), **vysvětlit rozdíl** (organické vyhledávání), **odfiltrovat nevhodné** dřív, než dojde na hovor.

---

## 07 · Značka a vizuální identita

### Barvy (závazné)

### Písmo

Firemní font je **Agrandir Variable** (licencovaný, používá se v Canvě a na tištěných materiálech). **Na webu dnes není vůbec** — běží tam Open Sans a Raleway z koupené šablony. Sjednocení písma napříč webem, sociálními sítěmi a tiskem je jeden z důvodů, proč web měníme. Pokud licence Agrandiru neumožňuje webové nasazení, chceme **návrh náhrady**, ne tiché ponechání Open Sans.

### Estetika

Klinická, editoriální — „vědecká terénní zpráva". Ne fitness, ne wellness.

> **Zakázáno ⛔**
>
> Gradienty · ikony · emoji · fitness estetika · motivační jazyk · bílá pozadí (kromě světlezelených variant) · stock fotografie lidí ve fitness.

### Tón hlasu

Věcně, klidně, odborně, přesně. **Bez klišé a přehánění.** Nepoužívají se formulace typu *„transformuj svůj život", „revoluční metoda", „garantované výsledky", „rychlá úleva"*.

**Co se nepoužívá nikdy — ani jako UI prvek**

- **Umělá urgence a odpočty** — „nakup do 48 h", mizející bonusy
- **Vymyšlená vzácnost** — „zbývají 3 místa", resetované countdowny *(skutečný kapacitní strop je legitimní a uvádět se smí)*
- **Slevy jako růstový mechanismus** — pravidelné výprodeje, „−50 %" jako motor
- **Pseudovědecké nálepky a sliby rychlých výsledků**
- **Výkonový, pushovací tón**

To platí i pro komponenty, které dodavatel běžně nabízí: žádné exit-intent popupy s odpočtem, žádné „14 lidí právě prohlíží", žádné hvězdičkové odznaky bez zdroje.

### Jazyk

**Všechno, co jde ke klientovi, je česky** — texty, titulky, meta popisy, chybové hlášky, e-maily z formulářů, texty tlačítek. Bez výjimky. Klienti jsou Češi a slovenská věta je v českém textu vidět na první pohled. (V srpnu 2026 se ukázalo, že pět stránek mělo roky slovenský meta popis — mimo jiné stránka s 5 761 zobrazeními v Googlu.)

---

## 08 · Metodické omezení (Functional Patterns)

Tohle je tvrdý limit, ne preference. Dodavatel ho musí znát, protože se dotýká grafiky i textů.

| Pravidlo | Prakticky |
|---|---|
| **Jméno „Functional Patterns" se smí použít** | Ale jménem se neodlišíme — konkurence ho používá taky. Jméno má cenu tam, kde se *dokazuje* (ověření certifikace), ne tam, kde se *přitahuje* (reklama, první dotek). Obsah stojí na symptomu a mechanismu, ne na názvu metody. |
| **Logo a slovní značka FP se nepoužívají nikdy** | Ani ve vizuálech, ani v patičce, ani jako „certifikováno" odznak s jejich grafikou. |
| **Neodhaluje se interní metodika** | Žádný cueing krok za krokem, žádná struktura výuky, žádné neveřejné technické detaily. |
| **Před/po fotografie mají dvě branky** | Schválení na fp.app *a* předchozí písemný souhlas klienta. Bez obojího se nepublikuje — počítejte s tím, že galerie proměn nemusí být naplněná. |

---

## 09 · Ambice: co znamená „o deset úrovní výš"

Zadání majitele doslova: *„Chci web, na který když kliknu, tak jediné, co řeknu, bude wow. Chci web, který bude vypadat tak dobře, že konkurence pukne závistí."* Tahle sekce překládá to přání do rozhodnutí, protože existují dva různé druhy „wow" a jen jeden z nich sedí k ProSapiens.

| Podívaná | Řemeslo |
|---|---|
| WebGL scény, 3D světy, kurzor jako hračka, načítací animace | Typografie, rytmus stránky, fotografie, tempo odhalování, přesnost detailu |
| Wow trvá 5 sekund, pak překáží | Wow trvá celé čtení a zůstane v paměti jako „tihle vědí, co dělají" |
| Zabíjí mobil — přesně ten problém, který přestavbou řešíme | Rychlé i na telefonu |
| Konkurence to umí koupit taky | Konkurence to nedokáže zkopírovat, protože to stojí na obsahu, který nemá |
| Odporuje kánonu značky (sekce 07): klinický, bez hype | Kánon naplňuje |

> **Rozhodnutí**
>
> Jdeme cestou **řemesla**. Web má působit jako **vědecká terénní zpráva vysazená na úrovni luxusní značky** — ne jako demo grafického enginu. Ambice je stejně vysoká, jen se utrácí jinde: do písma, prostoru, fotografií, pohybu, který něco vysvětluje, a do detailů, které si člověk neuvědomí, ale cítí je.

### Kde se ambice utratí — sedm konkrétních míst

| Prvek | Co to znamená |
|---|---|
| **1 · Typografie jako hlavní zbraň** | Velký, sebevědomý display řez v nadpisech. Skutečná typografická stupnice, ne tři velikosti. Optické zarovnání, vyvážené zlomy řádků, čísla s tabulkovou šířkou v cenících. Písmo nese celý web — proto je vyřešení firemního řezu podmínka, ne detail. |
| **2 · Fotografie jako podklad, ne dekorace** | Skutečné fotky studia, trenérů a práce s klientem, velké, na celou šířku, s prostorem kolem. Žádné stock fotky. Pokud kvalitní fotky chybí, je to úkol pro majitele — ne důvod sáhnout po fotobance. |
| **3 · Pohyb, který něco říká** | Animace se použije tam, kde vysvětluje: fáze chůze, přenos síly řetězcem, rozdíl mezi kompenzací a funkčním vzorcem, šestiměsíční proces. Nikde jinde. Žádné rozjíždějící se texty jen proto, že to jde. Musí respektovat `prefers-reduced-motion`. |
| **4 · Diagnostika jako vizuální motiv** | Studio se dívá na tělo a měří. Vizuální jazyk to může nést: jemné osy, značky, měřítka, popisky jako v terénním zápisníku. Střídmě, jako systém — ne jako ozdoba. |
| **5 · Klientské příběhy jako hlavní obsah** | Video testimonialy jsou dnes nejsilnější konverzní prvek webu a jsou schované v půlce stránky. Na novém webu dostanou vlastní formát: diagnóza, výchozí stav, délka spolupráce, co se změnilo. Prostor a klid, ne karusel. |
| **6 · Články jako publikace** | 45 článků je největší aktivum, které web má. Zaslouží si čtenářskou sazbu: šířka řádku okolo 65 znaků, poznámky na okraji, popisky u obrázků, zdroje, autor s ověřenou certifikací, odhad délky čtení. |
| **7 · Ticho** | Nejsilnější prvek, který dnešní web nemá vůbec. Prázdné místo, jedna věc na obrazovku, žádné vložené feedy a widgety v každé patičce. Střídmost je tady *vzhled*, ne šetření. |

### Kde se ambice utratí konkrétně — tvůrčí směr

Sedm bodů výše říká, *do čeho* se investuje. Tahle část říká, *jak to má vypadat* — protože „řemeslo" bez konkrétního nápadu skončí jako slušný, ale zaměnitelný web.

> **Jádro nápadu**
>
> **Web se hýbe tak, jak se hýbe tělo.**

Předmět podnikání je přenos sil tělem, chůze a řetězce. To je vizuálně mimořádně bohaté téma, které dnešní web nepoužívá **vůbec** — má fotky a slidery jako kterékoli fitko. Konkurence v biomechanice v ČR nemá nic ani zdaleka podobného, a hlavně: nemůže to okopírovat, protože k tomu potřebuje odbornost, kterou nemá.

- **Linka místo obrázku.** Postura, fasciální řetězce a fáze kroku se kreslí jako čistá vektorová linka v barvách značky. Ne 3D model, ne stock fotka — anatomická kresba, která se hýbe. Doplňuje fotografii, nenahrazuje ji.
- **Scroll je pohyb těla.** Jak čtenář roluje, linka prochází krokovým cyklem, přenáší sílu, mění se z kompenzovaného držení na organizované. Obsah a animace vyprávějí jednu věc.
- **Typografie jako přístroj.** Velká, přesná, s hairline linkami a čísly v tabulkovém řezu — vzhled měřicího protokolu, ne reklamy.
- **Klid jako luxus.** V oboru plném křiku je ticho to, co působí draze.

### Tři směry k rozhodnutí [navrhni]

Předlož všechny tři jako vizuální návrh úvodní stránky (krok 3 postupu v sekci 18), doporuč jeden a zdůvodni to.

- **Terénní zpráva** — Směr A
- **Pohyb** — Směr B — doporučeno jako základ

**Doporučení:** postav **B jako vizuální jazyk**, s typografickou přesností **A**, a **C** použij jako vstupní vrstvu na úvodní stránce — jeden výběr symptomu, ne celý dotazník.

> **Tvrdá podmínka ⛔**
>
> Animace primárně **CSS a SVG**, řízené `scroll-timeline` nebo `IntersectionObserver`. Nic z toho nesmí blokovat první vykreslení — motion se importuje dynamicky až po `load`. Při `prefers-reduced-motion: reduce` statická verze, plně použitelná. Animace se nesmí zaseknout na 4× zpomaleném CPU. Limit v sekci 18 platí i pro animovanou úvodní stránku.

Vezmi tři weby přímé konkurence (biomechanická a fyzioterapeutická studia v ČR) a postav vedle nich úvodní stránku ProSapiens na telefonu. Rozdíl musí být viditelný do dvou sekund a musí být poznat, že vzniká z **preciznosti**, ne z efektů.

---

## 10 · Referenční weby

Všechny odkazy níže byly ověřeny 28. 8. 2026. Rozdělené podle toho, *co* si z nich brát — nekopírovat vzhled, převzít princip.

### 10.1 Hlavní reference — přesně náš register

| Web | Co si vzít |
|---|---|
| [tracksmith.com](https://tracksmith.com) [nejbližší vzor] | Běžecká značka, která se chová jako redakce. Fotografie nese layout, jazyk je zdrženlivý a emocionální zároveň („Race Day is Sacred"), kurzívy místo vykřičníků, štědrý prostor, „The Journal" jako plnohodnotná část webu. **Prodává, aniž by tlačila** — přesně to potřebujeme. |
| [klim.co.nz](https://klim.co.nz) | Písmolijna. Ukazuje, co znamená typografická preciznost: hierarchie, prostor, žádné dekorace, obsah nese sám sebe. Vzor pro nadpisy, stupnici a klid stránky. |
| [pudding.cool](https://pudding.cool) | Vysvětlování složitých věcí posouváním. Vzor pro články o biomechanice: postupné odhalování, kde animace nese informaci, ne efekt. |

### 10.2 Typografická studia — sazba a řemeslo

Z kurátorského seznamu [Typewolf: Top 40 Design Studio Sites](https://www.typewolf.com/design-studios), který sleduje weby podle použitého písma. Stojí za projití celý; jmenovitě: **Common Office** (Heldane Display + Founders Grotesk), **Foreign Policy** (Suisse International + Caslon), **Civilization** (Larish Neue + Gill Sans), **Studio HMVD**, **Oak** (Tiempos Headline), **Post Typography**. Dále **AREA 17** a **Upstatement** — obě dělají obsahově náročné weby pro redakce a instituce.

### 10.3 Technická špička — pro srovnání, ne k napodobení

| Studio | Čím je známé |
|---|---|
| [Studio Freight](https://studiofreight.com) | Autoři knihovny **Lenis** pro plynulé posouvání, kterou dnes používá půlka oceňovaných webů. Čtyři nominace Awwwards „Best of the Web". |
| [Locomotive](https://locomotive.ca) | Montrealské studio, silná značková i technická stránka, opakovaně oceňované. |
| [basement.studio](https://basement.studio) | Nominace na Webby, otevřený zdrojový kód vlastního webu — dá se z něj učit. |
| [Immersive Garden](https://immersive-g.com) | Pařížské studio, 3D scény a přechody mezi stránkami. |
| [Active Theory](https://activetheory.net) | Špička WebGL a 3D prostředí. |

> **Proč jsou v druhé kategorii ⚠️**
>
> Tohle jsou nejlepší weboví designéři na světě a stojí za prohlédnutí, aby bylo vidět, kde je strop řemesla. Ale jejich hlavní nástroj — WebGL podívaná — je pro ProSapiens špatně. Mezi oceňovanými weby vévodí 3D podívaná; je obdivuhodná a naprosto nevhodná pro člověka, který má bolesti zad a hledá, jestli mu někdo v Brně pomůže. **Berte odsud úroveň provedení, ne formát.**

### 10.4 Obor — laťka pro anatomickou grafiku

Nikdo z nich není vzor pro layout webu. Jsou tu proto, že ukazují, jak vysoko je laťka ve zpracování **těla** — a směr B ze sekce 09 na ní stojí.

| Web | Co si vzít |
|---|---|
| [biodigital.com](https://biodigital.com) | Interaktivní 3D anatomie. Úroveň zpracování těla — my chceme totéž v ploché lince. |
| [3d4medical.com](https://3d4medical.com) | Complete Anatomy. Jak se prezentuje anatomický obsah profesionálně, bez fitness estetiky. |
| [muscleandmotion.com](https://muscleandmotion.com) | Animace pohybu a kineziologie — jak animovat pohyb tak, aby něco vysvětlil. |

### 10.5 Další ověřené reference

| Web | Co si vzít |
|---|---|
| [lynnandtonic.com](https://lynnandtonic.com) | **Důkaz, že wow nepotřebuje megabajty.** Mistrovské CSS bez těžkých knihoven — přesně náš rozpočet na výkon. |
| [garden.bradwoods.io](https://garden.bradwoods.io) | Vysvětlování složitých věcí interaktivní grafikou. Nejbližší analogie k výkladu biomechaniky. |
| [linear.app](https://linear.app) | Absolutní přesnost v typografii, odstupech a tmavé paletě. Nejlepší studijní materiál pro tmavou variantu. |
| [unseen.co](https://unseen.co) | Typografie a pohyb jako jeden jazyk. |
| [huncwot.com](https://huncwot.com) | Editoriální přísnost, skoro žádná dekorace. |
| [14islands.com](https://14islands.com) | Rovnováha designu a výkonu — hezké weby, které jsou zároveň rychlé. |
| [hellomonday.com](https://hellomonday.com) | Vyprávění příběhu posouváním. Model pro sekci „proč ti to nefungovalo". |
| [obys.agency](https://obys.agency) | Odvážná typografie na tmavé paletě — blízko naší barevnosti. |

### 10.6 Česká scéna — s čím nás budou srovnávat

| Web | Poznámka |
|---|---|
| [najbrt.cz](https://najbrt.cz) | Přední české grafické studio. Měřítko typografie v češtině — včetně diakritiky. |
| [superkoderi.cz](https://superkoderi.cz) | České weby s důrazem na výkon. |
| [ackee.cz](https://ackee.cz) | Technická úroveň. |

### 10.4 Kde hledat dál

[Awwwards — Sites of the Month](https://www.awwwards.com/websites/sites_of_the_month/) · [SiteInspire](https://www.siteinspire.com) (kurátorované, méně efektů, víc řemesla) · [Typewolf](https://www.typewolf.com) (weby řazené podle písma) · [Codrops](https://tympanus.net/codrops/) (technické rozbory).

---

## 11 · Současný web — inventář

### 11.1 Technologie

| | |
|---|---|
| Systém | WordPress |
| Šablona | `setupfolio` (komerční) + `templatation-framework` |
| Page builder | **WPBakery** (js_composer 6.8.0) — veškerý layout je uzamčený v jeho shortcodech |
| Pluginy na frontendu | Slider Revolution, Contact Form 7, Forminator, PixelYourSite, Instagram Feed, Simple Download Monitor, Social Icons Widget, Cookie Law Info, Easy Accordion, Responsive Lightbox, Testimonial Free |
| Pluginy v adminu | Wordfence, WP Fastest Cache, UpdraftPlus (zálohy na Google Drive), Asset CleanUp, Yoast SEO, Code Snippets, WP Mail SMTP, Site Kit |
| Vlastní kód | **22 snippetů v pluginu Code Snippets, 12 aktivních** — záplatují chování šablony i pluginů (viz 11.5) |
| Server | openresty · doména běží na `www.prosapiens.cz` |
| Písma | Open Sans + Raleway z Google Fonts |
| Strukturovaná data | LocalBusiness JSON-LD (vlastní snippet) na úvodní stránce a Kontaktu |
| Autor současného webu | Emglare Technologies s.r.o. (uvedeno v patičce) |

### 11.2 Informační architektura

| Hlavní menu | Podpoložky |
|---|---|
| Domů | — |
| Služby | Jak to funguje · Úvodní trénink · Online trénink |
| Výsledky | — |
| Vzdělávaní | Co je Functional Patterns · Pochopte své tělo · Články · Protokol MFR – ZDARMA |
| O nás | FAQ |
| Kontakt | — |
| Kariera | — |

Patička obsahuje jen copyright, GDPR a Obchodní podmínky. Profily trenérů (`/jerry/`, `/terezia/`, `/matyas/`) nejsou v menu — dostanete se na ně jen přes slider na stránce O nás.

### 11.3 Stránky

34 stránek celkem (z toho 2 stažené do konceptu) a 45 publikovaných článků. Sloupec „slov" je celý text stránky včetně hlavičky a patičky, takže srovnává relativní délku, ne čistý obsah.

| Adresa | Úkol stránky | Slov | Zvláštnosti |
|---|---|---|---|
| / | Rozcestník + důkaz. Počitadla 10 let / 350 klientů / 9000 hodin, tři kroky procesu, tři profily „pro koho", tři video testimonialy | 1 696 | 4 videa, Slider Revolution |
| /sluzby/ | Ceník offline: tři karty služeb, čtyři cenové karty, storno podmínky, co je v balíčku | 1 440 | Odkaz na PT Minder |
| /jak-to-funguje/ | Vysvětlení metody a 6měsíčního procesu (Fáze 1 Obnova, Fáze 2 Integrace) | 1 622 | 1 video |
| /uvodni-trenink/ | Prodejní stránka vstupní služby. Nadpis „Fyzioterapie pomohla. Na chvíli." | 1 631 | Formulář, 3 videa |
| /online-trenink/ | Online varianta: tři kroky, šest FAQ, tři cenové karty | 1 729 | Formulář |
| /vysledky/ | Pět klientských příběhů s diagnózou a délkou spolupráce | 1 731 | 5 videí — nejsilnější konverzní prvek webu |
| /co-je-functional-patterns/ | Vysvětlení metodiky, srovnání s fitness a fyzioterapií | 1 694 | 3 videa · nově ověření certifikace |
| /o-nas/ | Příběh studia, 10 principů, kde trénujeme, sekce o Bitcoinu | 1 384 | Jediná cesta na profily trenérů |
| /jerry/ /terezia/ /matyas/ | Profily trenérů — životopis, zkušenosti, vzdělání | 1 124–1 349 | Mimo menu. Terezčin profil neuváděl vzdělání |
| /faq/ | Často kladené otázky | 1 419 | Accordion plugin |
| /kontakt/ | Kontakt + formulář | 1 006 | CF7 #127 |
| /test-postury/ | Dotazník držení těla — nejdelší stránka webu | 3 724 | CF7 #5111, 9 polí, automatický follow-up e-mail |
| /dychani/ | Landing page funnelu: placená příručka 290 Kč (Gumroad) + free PDF za e-mail | 1 642 | Forminator #5445, poděkování inline |
| /podekovani/ | Děkovací stránka poptávek — časová osa 24–48 h, odkaz na test postury | 1 366 | Měří konverze poptávek |
| /pochopte-sve-telo/ | Rozcestník vzdělávacího obsahu | 1 516 | Má podstránky |
| /protokol-o-myofascialnim-uvolnovani/ | Lead magnet — protokol MFR zdarma | 1 316 | Formulář · nejpomalejší stránka webu |
| /blog/ | Výpis 45 článků | 1 860 | Bez filtrů a rubrik |
| /kariera/ | Nábor trenérů | 3 400 | Formulář |
| /doporucene-pomucky/ | Doporučené vybavení | 1 049 |  |
| /informace-po-uvodnim-treninku/ | Stránka pro klienta po první lekci | 1 845 | Neveřejná v menu |
| /gdpr/ /obchodni-podminky/ | Právní texty | 3 107–3 122 |  |

### 11.4 Formuláře

| Formulář | Kde | Pole | Co se s tím děje |
|---|---|---|---|
| CF7 `#127` | Kontakt, Úvodní trénink, Online trénink, Kariéra | jméno, e-mail, telefon, zpráva | E-mail + zápis poptávky do interní aplikace, přesměrování na /podekovani/ |
| CF7 `#5111` | Test postury | bolest, postura, vhled, jméno, telefon, e-mail, poznámka, preference hovoru, GDPR | Automatický follow-up e-mail podle vzorce odpovědí |
| Forminator `#5445` | Dýchání | e-mail | Odemkne free PDF. Poděkování se zobrazí **inline**, nepřesměrovává se |

### 11.5 Napojení na okolní systémy

| Systém | K čemu | Vazba na web |
|---|---|---|
| **PT Minder** | Klientská aplikace — rezervace, balíčky, platby, docházka | Dnes jen zmínka a odkaz. Není napojený na web. |
| **Gumroad** | Prodej příručky za 290 Kč | Odkaz z /dychani/. Nákup probíhá mimo web. |
| **GA4 + Meta Pixel** | Měření | Přes PixelYourSite. Automatické sledování je záměrně vypnuté, události se posílají cíleně. Meta CAPI je nastavené. |
| **Google Search Console** | Organické vyhledávání | Data se stahují do interní aplikace |
| **Interní aplikace „Kokpit"** | Řízení studia — klienti, peníze, marketing | Každou noc ve 3:30 stahuje obsah celého webu a poptávky z formulářů. **Tohle napojení musí zůstat funkční.** |
| **Instagram** | @prosapiens.biomechanic | Vložený feed na každé stránce |
| **Mailer** | ~450 kontaktů z lead magnetu | Dnes bez napojení na web |

---

## 12 · Co je změřeně špatně

Nejde o dojmy. Všechno níže je měření, u každého bodu je uvedeno čím.

### 12.1 Rychlost na mobilu

- **56** — výkon na mobilu
- **11,3 s** — LCP na mobilu
- **80** — výkon na desktopu

Nejhorší stránky na mobilu: `/terezia/` 35 bodů (LCP 19,0 s), **úvodní stránka 37 bodů (LCP 19,0 s)**, `/protokol-o-myofascialnim-uvolnovani/` 38 (29,5 s), `/jak-to-funguje/` 41 (16,3 s), `/uvodni-trenink/` 45 (16,7 s).

Úvodní stránka posílá **162 požadavků** a její HTML má 200 kB. To je kombinace Slider Revolution, WPBakery, vloženého Instagram feedu a čtyř YouTube přehrávačů. **Tohle je nejsilnější jednotlivý důvod pro přestavbu:** většina lidí nás v Googlu vidí na telefonu a čeká 19 sekund.

### 12.2 Obsah přitahuje jiné lidi, než potřebujeme

Celkem 141 stránek s historií v Search Console, **125 159 zobrazení a 2 729 prokliků**. Ale rozložení je nezdravé:

| Stránka | Zobrazení | Prokliky | CTR | Typ |
|---|---|---|---|---|
| /lateral-line/ | 15 777 | 97 | 0,6 % | anatomie |
| /arm-lines/ | 9 555 | 31 | 0,3 % | anatomie |
| /spiral-line/ | 8 809 | 126 | 1,4 % | anatomie |
| /padajici-kolena-dovnitr/ | 7 508 | 202 | 2,7 % | **symptom** |
| /odstavajici-lopatky/ | 7 032 | 173 | 2,5 % | **symptom** |
| /anterior-pelvic-tilt/ | 4 351 | 118 | 2,7 % | **symptom** |
| / (úvodní) | 4 284 | 447 | 10,4 % | značka |
| /co-je-functional-patterns/ | 3 344 | 283 | 8,5 % | metoda |

Deset anatomických stránek dohromady nese **53 % všech zobrazení, ale jen 19 % prokliků** (66 160 zobrazení → 520 prokliků). Symptomové stránky mají proklik **čtyřikrát až devětkrát lepší**. Anatomie přivádí studenty a kolegy, ne klienty. Nový web s tím musí umět pracovat: symptomové stránky patří výš v architektuře než anatomický atlas.

### 12.3 Blog nemá strukturu

45 článků, **jediná kategorie** („blog"), žádné štítky, žádné filtry, žádné související články podle tématu. Čtenář, který přijde z Googlu na článek o fasciích, nemá kam pokračovat.

### 12.4 Měření funnelu je slepé

Formulář na free PDF (`/dychani/`) zobrazuje poděkování **inline na téže stránce**. Události GA4 i Pixelu jsou přitom navázané na děkovací stránku, takže se u tohoto formuláře **nikdy nespustí**. Odeslání reálně fungují, ale v datech nejsou vidět.

### 12.5 Drobné vady šablony

- Cenové karty ukazují **„/Month" i u jednorázové lekce** — zbytek anglické šablony, na všech ceníkových stránkách.
- Základní text webu je **14 px šedou #757575** — pod dnešním standardem čitelnosti.
- Průměrná přístupnost 82/100 na obou zařízeních.
- Profily trenérů jsou dostupné jen přes slider, tedy prakticky neviditelné pro Google i pro člověka.
- Chování šablony a pluginů dnes záplatuje **12 aktivních kusů vlastního PHP** (odstranění značky z titulků, české meta popisy, přesměrování zrušených stránek, LocalBusiness schema, autorský blok, zdroj poptávky, follow-up e-maily). Nový web by je z velké části neměl potřebovat — ale *funkce*, které dělají, se musí zachovat.

---

## 13 · Co se nesmí ztratit

> **Kritické ⛔**
>
> Web má za sebou roky organického růstu. **Ztráta pozic v Googlu by byla dražší než celý web.** Migrace musí být řízená, ne „překlopíme obsah a uvidíme".

| Co | Proč | Jak to ohlídat |
|---|---|---|
| **141 adres s historií** | Top 15 z nich nese většinu ze 125 tisíc zobrazení | Mapa 1:1 starých a nových adres, u každé změněné adresy přesměrování 301, kontrola po nasazení |
| **Existující přesměrování** | Už teď běží pravidla pro zrušené stránky; pět řetězů bylo zkráceno na jeden skok | Převzít pravidla, nezakládat nové řetězy |
| **Alt texty obrázků** | 375 obsahových obrázků, 100% pokrytí, anatomicky popsané | Přenést i s obrázky, ne generovat znovu |
| **Meta popisy a titulky** | Přepsané v srpnu 2026 do češtiny, žádný titulek nad 60 znaků, u článků bez přípony se značkou | Přenést; pravidlo o délce a příponě zachovat |
| **LocalBusiness schema** | Adresa, telefon, otevírací doba pro Google | Reimplementovat nativně, ideálně rozšířit |
| **Autorství článků** | Skutečné autorství (36 Jerry, 9 Terezka) + ověření certifikace u každého článku | Zachovat autorský blok a odkazy do registru FP |
| **Video testimonialy** | Nejsilnější konverzní prvek, který web má | Přenést všechna a dát jim víc prostoru |
| **Napojení na interní aplikaci** | Poptávky z formulářů a noční čtení obsahu webu | Zachovat rozhraní nebo dohodnout nové *před* spuštěním |
| **Měření** | GA4, Meta Pixel a CAPI, Search Console | Přenést včetně cílených událostí; nezapínat automatické sledování |

---

## 14 · Rozhodnutí o platformě

Zadání majitele: *„Umím pracovat ve WordPressu, ale nevadilo by mi ani CSS nebo HTML, které jen nasadím. Ve WordPressu by se mi ale lépe vydávaly články."*

> **Rozhodnuto**
>
> **Zůstává WordPress. Mění se všechno ostatní: šablona se píše na míru, page builder se ruší.**

Tohle rozhodnutí řeší obě půlky té věty najednou. Články se dál píší v editoru, který majitel zná — a zároveň je celý vzhled obyčejný kód (PHP, CSS, JavaScript), který se nasadí jako téma. Není to kompromis; je to přesně ta „HTML a CSS, které jen nasadím" varianta, jen zabalená tak, aby pod ní zůstala redakce.

**Co se konkrétně ruší**

- **WPBakery** (js_composer) — layout se přestane skládat ze shortcodů. Obsah se převede do bloků nebo do šablon.
- **Slider Revolution** — nahradí ho vlastní kód, pokud je slider vůbec potřeba.
- **Šablona setupfolio** a její framework.
- Pluginy, které nová šablona nahradí nativně: accordion, testimonial, lightbox, social icons.

**Proč ne headless nebo statický web**

Byl by rychlejší, ale zdvojí infrastrukturu (WordPress *a* frontend *a* build), zkomplikuje publikování článku a přidá další místo, kde se něco rozbije. Cíl PageSpeed ≥ 90 je dosažitelný i s dobře napsanou vlastní šablonou. Pokud se ukáže, že není, je to důvod k novému rozhodnutí — ne k tichému snížení laťky.

**Struktura šablony**

```
psb-theme/
  style.css                 hlavicka theme
  functions.php             registrace, enqueue, cisteni WP hlavicky
  inc/
    setup.php               theme supports, menu, obrazove velikosti
    assets.php              nacitani CSS/JS, preload pisem
    schema.php              JSON-LD: LocalBusiness, Article, Person, FAQPage, Breadcrumb
    blocks.php              vlastni bloky pro editor (cenik, testimonial, symptom karta)
    forms.php               napojeni CF7 -> udalosti mereni + Kokpit
    cleanup.php             odstraneni emoji, oEmbed balastu, zbytecnych dotazu
  templates/
    front-page.php  page.php  page-sluzby.php  page-kontakt.php
    single.php              clanek + autorsky blok
    archive.php             blog s rubrikami a filtrem
    taxonomy-symptom.php    symptomove rozcestniky
    404.php
  parts/
    header.php  footer.php  hero.php  cta.php  autor.php  testimonial.php
  assets/
    css/main.css            jeden soubor, design tokeny nahore
    js/main.js              ES modul, zadne jQuery
    js/motion.js            scroll-driven animace, lazy import
    fonts/
```

**Pravidla kódu**

- Žádné jQuery. Žádný Bootstrap. Žádný Tailwind z CDN.
- CSS: jeden soubor, vlastní vlastnosti (custom properties) nahoře, `@layer` pro pořadí kaskády. Žádné `!important` kromě dokumentovaných výjimek.
- JS: ES moduly, `defer`. Těžké věci (motion) se importují dynamicky až po `load`.
- Šablona musí být funkční **i s vypnutým JavaScriptem** — obsah, navigace, formuláře.
- Šablona ve verzovacím systému. Nasazení = nahrání složky, ne editace v adminu.
- README popisuje nasazení a seznam funkcí přesunutých ze snippetů do šablony.

Šablona musí být napsaná tak, aby **majitel zvládl sám změnit text, cenu, obrázek a publikovat článek** — bez zásahu do kódu a bez toho, aby si mohl rozbít layout. Kde je potřeba strukturovaný obsah (ceníky, profily trenérů, klientské příběhy), použij vlastní typy obsahu a pole, ne volný text v editoru.

---

## 15 · Požadavky na nový web

### Musí umět [nutné]

- **Být rychlý na mobilu.** PageSpeed mobil ≥ 90, LCP pod 2,5 s na každé stránce v menu. Přejímací podmínka, ne přání.
- **Nést vizuální identitu** ze sekce 07 a ambici ze sekce 09.
- **Editovatelnost bez vývojáře** — viz sekce 14.
- **Blog s rubrikami** — tematické kategorie, filtrování, související články, oddělené autorství Jerry / Terezka / Matyáš.
- **Formuláře** se zachováním dnešní logiky: poptávka, test postury s follow-upem, sběr e-mailů. Zdroj poptávky se musí předávat dál.
- **Přístupnost** alespoň WCAG 2.1 AA — dnes 82/100.
- **Cookie lišta** a GDPR v souladu s českou úpravou.
- **Migrace obsahu** podle sekce 13, včetně mapy přesměrování.

### Anatomický atlas zůstává beze změny [rozhodnuto]

Série článků o myofasciálních řetězcích podle Anatomy Trains (`/lateral-line/`, `/arm-lines/`, `/spiral-line/`, `/superficial-front-line/`, `/superficial-back-line/` a další) se **nepřepisuje, nepřeskupuje ani nepřejmenovává**. Adresy, texty i obrázky zůstávají. Dostane jen novou sazbu jako zbytek blogu.

Platí to i přesto, že tyto stránky mají špatný proklik (sekce 12.2). Jsou to nejsilnější zdroje zobrazení, které web má, a jejich role je odborná autorita, ne získávání klientů. **Řešení není je měnit, ale postavit vedle nich symptomové vstupy** a propojit je odkazy: kdo čte o laterální linii, má vidět cestu ke stránce o padajících kolenech.

### Chceme probrat [k rozhodnutí]

- **Online rezervace úvodního tréninku.** Dnes je vstup přes formulář a ozveme se do 48 hodin. Rezervace přímo v kalendáři by zkrátila cestu — ale musí sednout k PT Minderu a k tomu, že vstupní hovor je zároveň filtr.
- **Prodej příručky přímo na webu** místo Gumroadu.
- **Klientská zóna** — dnes tuhle roli plní PT Minder.
- **Slovenská jazyková verze** — část klientů je ze Slovenska, ale obsah je záměrně český.

### Výslovně nechceme

- Odpočty, popupy s urgencí, „zbývají 3 místa" — viz sekce 07.
- Stock fotografie ve fitness estetice.
- Chatbota, který předstírá člověka.
- Slevové mechaniky jako součást návrhu.

---

## 16 · Technické zadání

| Oblast | Požadavek |
|---|---|
| **Rychlost** | PageSpeed mobil ≥ 90 a LCP < 2,5 s na všech stránkách v hlavním menu, měřeno po nasazení na ostré doméně. CLS < 0,1, INP < 200 ms. |
| **Platforma** | WordPress, vlastní šablona, bez page builderu. Viz sekce 14. |
| **Písmo** | Firemní řez je Agrandir Variable. Nejdřív ověřit webovou licenci. Pokud ji nemá, navrhnout **tři konkrétní náhrady** s ukázkou v českých diakritických znacích (ě š č ř ž ý á í é ú ů ň ť ď) — ne tiše nechat Open Sans. |
| **Obrázky** | Moderní formáty, responzivní varianty, lazy loading pod ohybem, explicitní rozměry proti posunu layoutu. Alt texty se **přenášejí, negenerují**. |
| **Vložený obsah** | YouTube a Instagram se načítají až na kliknutí (facade s náhledovým obrázkem). Dnes stojí úvodní stránku většinu její váhy. |
| **Skripty** | Žádná těžká knihovna kvůli jednomu efektu. Animace přes CSS a Web Animations API; když je potřeba plynulé posouvání, sáhni po ověřené lehké knihovně, ne po vlastním řešení. |
| **Strukturovaná data** | LocalBusiness, Article u článků, Person u profilů trenérů, FAQPage u FAQ, BreadcrumbList. LocalBusiness dnes běží přes vlastní snippet — reimplementovat nativně v šabloně. |
| **Měření** | GA4 + Meta Pixel + CAPI. Automatické sledování zůstává vypnuté, události se posílají cíleně. **Každý formulář musí spouštět vlastní událost — včetně těch s poděkováním na téže stránce.** |
| **Sitemapa a robots** | Aktuální sitemapa bez zpoždění cache. Dnešní hosting drží starou sitemapu i hodiny po úpravě. |
| **Napojení na Kokpit** | Interní aplikace každou noc ve 3:30 stahuje obsah celého webu (přes sitemapu, s jednorázovým parametrem v adrese kvůli cache) a přijímá poptávky z formulářů. **Obojí musí fungovat dál** — sitemapa musí zůstat na standardní adrese a formuláře musí dál odesílat poptávku i s jejím zdrojem. |
| **Zálohy a bezpečnost** | Automatické zálohy mimo hosting. Skrytá administrace, dvoufázové přihlášení. |
| **Vývojové prostředí** | Stavět na testovací doméně nebo lokálně. **Ostrý web se nepřepisuje, dokud není nový hotový a odsouhlasený.** |

---

## 17 · Pravidla pro implementaci

Tahle sekce existuje proto, že web staví AI. Body níže popisují chyby, které jazykový model dělá spolehlivě, když mu je nikdo nezakáže.

### 17.1 Nevymýšlej si

| Nikdy | Místo toho |
|---|---|
| Smyšlené recenze, jména klientů, hvězdičky, „⭐ 4,9 z 312 hodnocení" | Použij jen pět skutečných klientských příběhů z `/vysledky/` a existující video testimonialy |
| Vymyšlená čísla („přes 500 spokojených klientů") | Skutečná čísla z tohoto dokumentu: 10 let praxe, 350 klientů, 9 000 hodin (tak, jak je uvádí dnešní úvodní stránka) |
| Loga „důvěřují nám" a certifikační odznaky | Jediná certifikace, kterou máme, je HBS Level 1 — a smí se uvádět jen textem s odkazem na ověření, bez cizího loga (sekce 08) |
| Vyplňovací text („Lorem ipsum", „Zde bude popis služby") | Skutečný text ze současného webu. Když chybí, nech místo prázdné a nahlas to |
| Vymyšlené e-maily, telefony, IČO, adresy | Údaje ze sekce 02 |
| Přepis nebo „vylepšení" existujících textů | Doslovná migrace. Návrh na úpravu textu předlož zvlášť, needituj potichu |

### 17.2 Vizuální klišé, po kterých AI sahá — zakázaná

- **Fialovo-modrý přechod** v hlavičce (ani žádný jiný přechod — sekce 07 zakazuje gradienty).
- **Sklo a rozostření** (glassmorphism), neonové stíny, zářící okraje.
- **Inter jako „bezpečné" písmo.** Písmo je hlavní nositel identity, viz sekce 16.
- **Emoji jako ikony sekcí.** Kánon zakazuje emoji i ikony obecně.
- **Karty se zaoblením 16 px a barevným proužkem nahoře**, všechno vycentrované.
- **Trojice „vlastností" s ikonkou, nadpisem a dvěma řádky** jako univerzální výplň sekce.
- **Animovaná počitadla, která naskakují**, a plovoucí částice v pozadí.
- **Hero přes celou výšku obrazovky s nadpisem uprostřed a dvěma tlačítky.**

Když si nejsi jistý, jestli je prvek klišé: podívej se, jestli by mohl stát na webu jakékoli jiné firmy beze změny. Pokud ano, nepatří sem.

### 17.3 Jazyk

Všechno viditelné je **česky**: texty, popisky tlačítek, chybové hlášky formulářů, potvrzení odeslání, texty v `alt`, titulky, meta popisy, texty ve strukturovaných datech. Kód, komentáře a názvy proměnných jsou anglicky. **Nikde nesmí zůstat anglický zbytek šablony** — dnešní web má na cenících „/Month" i u jednorázové lekce.

### 17.4 Kde se ptát místo hádání

Zastav se a zeptej se, když: chybí fotografie v potřebné kvalitě · není jasné, která varianta ceny platí · text na staré stránce si protiřečí s tímto dokumentem · adresa nemá v novém webu ekvivalent · licence písma není dohledatelná. **Tichý odhad v těchto bodech je horší než prodleva.**

---

## 18 · Postup stavby a přejímka

### Pořadí

1. **Inventura.** Stáhnout všech 141 adres z sekce 13, kompletní obsah, obrázky s alt texty, meta popisy, titulky. Výstup: tabulka „stará adresa → nová adresa → stav".
2. **Vizuální systém.** Barvy, písmo (včetně vyřešené licence), typografická stupnice, mřížka, odstupy, stavy tlačítek a odkazů, tmavé i světlé prostředí. Výstup: jedna stránka se všemi prvky vedle sebe, ke schválení *před* stavbou.
3. **Tři vzorové stránky.** Úvodní, jedna stránka služby (`/uvodni-trenink/`) a jeden článek. Na nich se schvaluje směr. Teprve po odsouhlasení se pokračuje.
4. **Zbytek stránek** podle inventáře.
5. **Blog** — 45 článků, rubriky, autorství, autorský blok s ověřením certifikace.
6. **Formuláře, měření, strukturovaná data, napojení na Kokpit.**
7. **Přesměrování a nasazení.**
8. **Měření po nasazení** a doložení splnění limitů.

### Přejímka — web je hotový, když platí všechno níže

| Kritérium | Jak se ověří |
|---|---|
| PageSpeed mobil ≥ 90 na všech stránkách v menu | Měření PageSpeed Insights po nasazení, doložit výsledky |
| LCP < 2,5 s · CLS < 0,1 · INP < 200 ms | Totéž měření |
| Žádná ze 141 adres nevrací 404 | Projít seznam adres, každá vrací 200 nebo 301 na jeden skok |
| Všechny obrázky mají alt text | Automatická kontrola, porovnat počty se starým webem |
| Žádný titulek nad 60 znaků, žádný meta popis chybí | Stažení všech stránek a kontrola délek |
| Všechny formuláře doručí zprávu *a* spustí událost v měření | Živý test každého formuláře, kontrola v GA4 a v Kokpitu |
| Kokpit v noci načte obsah webu | Kontrola nočního běhu následující den |
| Web je čitelný a ovladatelný z klávesnice | Průchod tabulátorem, kontrola kontrastu |
| Nikde není text z jiného jazyka ani zbytek šablony | Vyhledání anglických řetězců napříč webem |
| Na webu není žádný údaj, který nemá zdroj v tomto dokumentu nebo na starém webu | Seznam všech čísel a jmen na webu s uvedením zdroje |

---

## 19 · Zbývající otevřené otázky

Rozhodnuto 28. 8. 2026: **platforma** (WordPress, vlastní šablona) · **tým** (Matyáš zůstává, tři profily) · **anatomický atlas** (beze změny). Otevřené zůstává:

- **Licence firemního písma** — 
- **Fotografie** — 
- **Online rezervace** — 
- **Prodej příručky na webu** — 
- **Slovenská verze** — 
- **Zveřejnění ceníku po přestavbě** — 
---

*Verze 3, sestavená 28. 8. 2026 z živého webu prosapiens.cz, dat Google Search Console a GA4, měření PageSpeed Insights ze 16. 8. 2026 (82 měření), interní evidence studia a dokumentu *Persona PSB*. Referenční weby v sekci 10 byly ověřeny týž den. Čísla o tržbách a klientech pocházejí z interního systému.*