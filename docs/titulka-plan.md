# Titulka — čo všetko treba urobiť

Stav k 25. 8. 2026. **Hotové všetko.** Nástrely žijú na `/navrhy-titulky`, generátor je v editore
slotu v Mape nákupného cyklu (`vyrobiť titulku ↗`).

Jerry vybral **8 skladieb**, ktoré sú v skutočnosti **7 v troch rodinách**
(35 a 36 sú tá istá sadzba s iným obsahom):

| rodina | skladby | na čo |
|---|---|---|
| **Slovo** | 23, 26, 30, 31 | Edukácia a otázky — téza je celý obsah |
| **Číslo** | 35 = 36 | výsledky a merania |
| **Fotka** | 39, 40 | klientske príbehy |

V posledných 14 príspevkoch: 9× Edukácia, 4× Klientsky príbeh, 1× Otázka.
Preto sa začína rodinou Slovo.

---

## A · Skladby ako dáta, nie ako kód

Dnes je rozvrh titulky natvrdo v `titulka.ts`. Sedem skladieb sa tam
nezmestí bez toho, aby sa každá zmena musela robiť sedemkrát.

- **A1 — skelet. HOTOVÉ (v698).** Skladba sa stane popisom: ktoré bloky, aké veľkosti,
  aké farby, kde značka. Jedno miesto, sedem záznamov. *veľké, blokuje všetko
  ostatné*
- **A2 — 26 uhlopriečny rez. HOTOVÉ (v698).** Uhlopriečka je odvodená od prvého
  riadku, nie pevná: pri 760 mu ostávalo 16 px a stačilo väčšie písmo, aby text
  prerezal hranu poľa.
- **A3 — 31 riadok po riadku inou farbou. HOTOVÉ (v698).** Tóny sa opakujú dokola,
  takže skladba znesie ľubovoľný počet riadkov.
- **A4 — 30 slovo vyseknuté z bloku. HOTOVÉ (v700).** Maska rastrovanie prežije —
  overené rozborom pixelov hotového PNG: vnútri bloku sú obe farby, čiže diera je
  skutočná. Blok rastie s počtom riadkov a v tmavom režime je svetlý, lebo výsek
  potrebuje kontrast s pozadím.
- **A5 — 23 písmeno cez šev. HOTOVÉ (v700).** Vyriešené opačne, než sa čakalo:
  šev je pevný a NADPIS sa posunie tak, aby doň prostredný riadok sadol. Skladba
  je tmavá hore a svetlá dole v oboch režimoch — keby sa v tmavom stmavili obe
  polovice, šev by zmizol a s ním celý nápad.
- **A6 — 39 a 40 fotkové. HOTOVÉ (v702).** Duotón zvýrazní prostredný riadok
  (rovnaké pravidlo ako šev). Výrez fotky v štyridsiatke sa počíta z rozsahu
  nadpisu, nie z pevného obdĺžnika.
- **A7 — 35/36 číselná.** Dve nové polia: číslo a jednotka. *malé*

## B · Vkladanie fotky

Toto je odpoveď na „ploché, bez hĺbky, bez emócie". Hĺbku nedá sadzba ani
generátor — dá ju prvý snímok z reelu, klient, štúdio.

- **B1 — pretiahnutie súboru do okna titulky. HOTOVÉ (v702).** Overené na hotovom
  PNG: fotka rastrovanie prežije. `createImageBitmap` s `imageOrientation`, inak
  by fotka z telefónu vyšla naležato.
- **B2 — zmenšenie pred vložením. HOTOVÉ (v702).** 3000×4000 PNG (239 kB) →
  1080×1440 JPEG (27 kB). Hotová titulka s fotkou má 135 kB.
- **B3 — výrez a posun v ráme. HOTOVÉ (v707).** Ukázalo sa, že to nie je vedľa
  upravovača, ale JE to upravovač: pri role „fotka" posun a mierka menia VÝREZ,
  nie rám. Rámom je pri týchto skladbách celé plátno (duotón) alebo tvar písmen
  (fotka v písmenách) — posunúť ho by znamenalo spraviť dieru. Posun sa oreže
  presne o toľko, o koľko obrázok z rámu prečnieva, takže na kraji nikdy
  nevznikne prázdno; priblíženie nesmie pod 100 % z toho istého dôvodu.

## C · Upravovač (Jerryho požiadavka č. 1)

- **C1 — chytenie a ťahanie prvkov. HOTOVÉ (v703).** Prvky nesú ROLU, takže sa
  dá povedať „posuň nadpis" nad plochým zoznamom tvarov. Chytá sa celý rám
  (`pointer-events: boundingBox`) — písmená sú tenké a trafiť ich v štvrtinovom
  náhľade by nešlo. Ukladajú sa POSUNY, nie pevné pozície: pri zmene textu sa
  vezú so skladbou namiesto toho, aby ostali visieť v prázdne.
- **C2 — zväčšovanie a zmenšovanie. HOTOVÉ (v703).** Mierka nadpisu ide do
  MERANIA, nie do hotových prvkov — väčšie písmo mení zalomenie a to vie povedať
  len prehliadač. Plochy sa zväčšujú od stredu, inak by prvok pri každom kroku
  utekal doprava dole.
- **C3 — návrat na východzie. HOTOVÉ (v703).** Po prvku aj naraz. Prichytenie
  do 8 px robí cestu späť ľahšou než cestu preč.
- **C4 — uloženie úprav k príspevku. HOTOVÉ (v703).** Migrácia 0060, stĺpec
  `mkt_napady.titulka`. Z reťaze v CLAUDE.md: 1–5 hotové, **6 (Jarvis) a
  7 (register) vynechané zámerne** — na skladbu titulky sa nikto nepýta a na
  nikoho nečaká. Fotka sa NEUKLADÁ: ako `data:` URI by nafúkla každú odpoveď
  plánovača o stovky kilobajtov. Okno to pri načítaní povie.

Postavené až po šiestich živých skladbách, ako sa plánovalo.

## D · Generátor obrázkov (Jerryho požiadavka č. 2)

Odhováral som od toho a Jerry na tom trvá, takže to ide do plánu. Ale nie ako
„appka nakreslí titulku" — tam by sa vrátil presne ten problém, kvôli ktorému
sme titulku Higgsfieldu nedali (o mesiac iný štýl). Ide to ako **obrázok pre
rodinu Fotka**, keď zrovna niet čo odfotiť.

- **D1 — appka napíše prompt. HOTOVÉ (v706).** V okne titulky pri fotkových
  skladbách: „Nemáš čo odfotiť? skopírovať prompt". Deväť riadkov — jedna veta
  o téme z nadpisu, zvyšok pevný: paleta so všetkými ôsmimi farbami, zoznam
  áno/nie z Jerryho pravidiel, pomer 9:16, a **zákaz textu v obrázku**. Ten je
  dôležitý: titulku sádže appka a písmená z modelu by sa prekryli s nadpisom
  a ešte mali chyby v diakritike. Prompt tiež žiada nechať hornú polovicu
  pokojnú — tam sadá nadpis.
- **D2 — priame volanie API z Workera. HOTOVÉ (v711).** Ukázalo sa menšie, než
  som čakal: **Cloudflare Workers AI je väzba, nie kľúč** — beží na tom istom
  účte ako appka, takže niet čo nastavovať ani utajovať. Model
  `@cf/black-forest-labs/flux-1-schnell`, 4 kroky, ~3 sekundy, rádovo desatina
  centa za obrázok. Volá sa len na kliknutie a každé generovanie ide do auditu —
  je to jediná vec v appke, ktorá stojí peniaze za kus.

  **Dve veci, ktoré to skoro zhodili:**
  - Nasadzovací skript púšťa `wrangler deploy` BEZ `-c`, takže číta
    `wrangler.jsonc`, nie `wrangler.psb.jsonc` — hoci komentár v druhom súbore
    tvrdí opak. Väzba pridaná len do „psb" verzie sa nikdy nenasadila. Teraz je
    v oboch a sú v zhode.
  - Bezpečnostný filter Workers AI označí `human bodies` za nevhodný obsah
    (chyba 8007) — pri biomechanike dosť podstatné. Pevná časť promptu preto
    hovorí `a person in movement`. Keď filter aj tak zaberie, appka to povie
    po ľudsky a ponúkne prompt vziať do Higgsfieldu.

  **Model dáva štvorec 1024×1024**, nie 9:16. Ktorá časť je v titulke vidieť
  sa nastaví ťahaním fotky — presne na to je B3.
- **D3 — výsledok ide tou istou cestou ako fotka.** Stiahne sa a vloží cez B1.
  Žiadna druhá vetva. *nič navyše*

## E · Aby si skladbu nemusel vyberať

- **E1 — návrh skladby z dát. HOTOVÉ (v702).** Zmerané na 262 vyšlých príspevkoch:
  fáza sama je slabý signál (Edukácia je najpočetnejšia v každej fáze, až v piatej
  sa klientske príbehy koncentrujú — 9 z 23). Hlavné slovo má preto TEXT: meranie
  v ňom → Číslo, klientsky príbeh → Fotka, piata fáza → Fotka, inak Slovo.
  Vnútri rodiny sa vyberá podľa kľúča príspevku: ten istý príspevok má navždy tú
  istú skladbu, susedné dostanú rôzne.

---

## Poradie

1. **A1** skelet — bez neho sa nedá nič ďalšie
2. **A2, A3** dve najjednoduchšie skladby zo Slova → Jerry vie hneď publikovať
3. **A4, A5** zvyšok Slova
4. **E1** automatický návrh
5. **B1, B2** vkladanie fotky → **A6** dve fotkové skladby
6. **C1–C4** upravovač
7. **A7** číselná skladba
8. **D1** prompt do Higgsfieldu
9. **B3** výrez fotky (spolu s C)
10. **D2** priame volanie API — len ak to D1 nestačí

## Doplnené 25. 8. večer (v713–714)

- **Zarovnanie prvkov** vľavo / na stred / vpravo. Je to KOTVA, nie posun:
  prvok drží okraj aj po zmene textu, a `dx` sa pripočíta až k nej. Optická
  predsádzka sa uplatní len pri zarovnaní doľava — inde by riadok ťahala mimo
  osi, na ktorej má visieť.
- **Fotka aj v skladbách zo Slova a Čísla.** Pás medzi textom a podpisom sa
  ponúkne len vtedy, keď je vyšší než 320 px — nižší by z fotky spravil prúžok.
  Generovanie je tým pádom dostupné pri všetkých siedmich.
- **Vodiace čiary** (len v náhľade, nikdy v PNG): profilová mriežka 4:5,
  bezpečná zóna reelu (108 hore, 320 dole, 60 vľavo, 120 vpravo) a pás
  ovládania. Ten posledný je čiarkovaný zámerne — zdroje sa rozchádzajú
  (320 až 430 px podľa dĺžky popisu), takže sa nesmie tváriť ako istota.

**ČO VODIDLÁ ODHALILI — a čo sa s tým stalo (v715).** Podpis sedel na y 1712,
bezpečná zóna končí na 1600: v reeli ho prekrýval popis s tlačidlami. Jerry
rozhodol posunúť na **1540**. Vyvolalo to dva dôsledky, ktoré chytili testy:

- Strop podnadpisu klesol o 172 px a pri štvorriadkovom nadpise sa podnadpis
  dostal NAD posledný riadok. Opravené: podnadpis nikdy nevyjde nad text —
  prekrytý nadpis je horšia chyba než podnadpis zabiehajúci do pásu, ktorý
  Instagram aj tak zakryje.
- Pás pre fotku prestal vychádzať. `MIN_PAS` znížený z 320 na 260 px (pomer
  4 : 1 pri šírke 1080, bežná časopisecká sadzba).

Pribudlo aj **hlásenie, keď text spadne pod bezpečnú zónu** — inak by si Jerry
prečítal na obrazovke vetu, ktorú v telefóne nikto neuvidí.

## Ďalšie kolo (Jerry, 25. 8. večer)

Očíslované tak, ako sa budú brať po jednom.

### 1 · Návrat z Jarvisa otvorí PRÁZDNE okno *(chyba)* — HOTOVÉ (v723)

Jarvis založí príspevok, tlačidlo vráti do mapy, okno sa otvorí — ale koncept
ani úvodný záber v ňom nie sú.

**Príčina je nájdená:** mapa si nápady ťahá vlastným dopytom pri otvorení
(`nacitaj()`), a ten je asynchrónny. Návrat otvorí okno hneď na `nonce`, teda
skôr, než sa nový príspevok stihne načítať — nenájde ho a spadne na prázdny
slot. Nie je to strata dát, príspevok v databáze je.

**Vyriešené dvoma vecami:**

1. Focus si počká. Uloží sa ako „čakajúci slot" a okno sa otvorí až vtedy, keď
   sa hľadaný príspevok v načítaných nápadoch objaví. Keď je načítané a aj tak
   tam nie je (niekto ho zmazal), otvorí sa prázdny slot tej bunky — je to
   stále to miesto, odkiaľ sa odišlo.
2. **Návrat nesie aj id príspevku.** Pri odchode z EXISTUJÚCEHO príspevku sa
   id predtým zahadzovalo, takže návrat otvoril prázdny slot aj vtedy, keď
   Jarvis nič nezaložil. To bola druhá polovica tej istej chyby.

### 6 · Značka defaultne na stred — HOTOVÉ (v720)

### 2 · Alternatívne úvodné vety ako vlastné pole — HOTOVÉ (v736)

Migrácia 0062, stĺpec `mkt_napady.uvodne_vety`. Jedna veta na riadok — text,
nie JSON: Jerry to číta a prepisuje, štruktúra by mu prekážala.

**Zo sedembodovej reťaze v CLAUDE.md hotové 1–6.** Bod 7 (register) vynechaný
zámerne: pole na nikoho nečaká, je to podklad, nie úloha.

**Kde to žije:**
- v editore slotu hneď za scenárom — sú to jeho varianty, nie samostatný text
- **na natáčacom liste pod scenárom** — kvôli tomu to celé je: prvá veta
  nesadne, oko skočí o kus nižšie a skúsi sa druhá. Na konci papiera by ich
  Jerry pri statíve nehľadal.
- v zadaní pre Claude Project ako bod 2 z troch, a terajšie vety sa doň vkladajú
  na úpravu (nie na prepísanie)
- Jarvis o stĺpci vie

**Chyba, ktorú test odhalil:** `kus()` v API zráža všetky biele znaky na medzeru,
takže INSERT zlepil tri vety do jednej a pole stratilo zmysel. Pribudol
`riadkyKus()`, ktorý riadky drží, a používa ho INSERT aj UPDATE — aby sa
nemohli rozísť.

### 3 · Rozpis záberov navrhne Jarvis sám — HOTOVÉ (v734)

Tlačidlo **„nech zábery rozpíše Jarvis"** v hlavičke sekvencie. Dostane scenár,
fázu a celý katalóg záberov aj s pohybmi, plus pravidlá: dva rovnaké pohyby za
sebou nie, záber dve až päť sekúnd, celková stopáž podľa fázy, prvý záber je hák.

**Neznáme id sa nezahadzuje potichu.** Model si vie vymyslieť záber, ktorý
v katalógu nie je; taký sa zahodí a appka povie, koľko krokov ostalo bez záberu.
Ticho by z toho bola diera, ktorú by Jerry našiel až pri statíve.

**Ostrý beh (fáza 3, staccato scenár):** päť záberov, 16 s pri cieli 15–30 s,
striedané pohyby, žiadne varovanie od vstavanej kontroly.

**Dve veci, ktoré test odhalil:**

- Rozdelil som `hotovyText` a `scenar` na dva parametre a málem tým zahodil
  prednosť scenára pri výbere viet. Zábery patria k tomu, čo sa HOVORÍ, nie
  k captionu — sú to dva rôzne texty, scenár slovenský, caption český.
- Jarvis zlúčil staccato riadky („Plank. Skľapovačky. Mŕtvy ťah.") do jedného
  záberu, čo je filmársky správne — ale rozbaľovačka viet takú možnosť nepoznala
  a krok sa tváril ako nepriradený. Vlastná veta kroku sa teraz do ponuky doplní.

### 4 · Prompt na obrázok robí PRÍLIŠ ZLOŽITÉ obrázky — HOTOVÉ (v724)

Higgsfield z terajšieho promptu vyrobí fotoreálne štúdio s tabuľami, monitormi
a modelmi. Do titulky, ktorá stojí na sadzbe, sa taký obraz nezmestí — je
prepchatý a s nadpisom sa bije. Jerry chce **jednoduchú vektorovú grafiku**.

Chyba bola v mojej pevnej časti promptu: mal som tam „muted duotone
photography" a „restrained studio scenes" — čo model priamo pozývalo
k fotorealizmu, a navyše to bolo proti Jerryho vlastným pravidlám, kde je
fotografický realizmus v zozname NIE.

**Prepísané na opak:** plochá vektorová kresba, nie fotka a nie 3D render;
tenká rovnomerná linka; plochá výplň; JEDEN motív a **najviac tri prvky** na
plátne; väčšina plátna prázdna. Zvlášť sú vymenované zákazy tieňovania, hĺbky,
perspektívy a svetelných efektov — bez nich model „plochý" ignoruje.

Jednoduchosť sa žiada ČÍSLOM, nie prívlastkom: „simple" znamená pre model
čokoľvek, „at most three elements" je merateľné.

Ostáva znenie „a person in movement" namiesto „human bodies" — to druhé
Workers AI odmietol ako nevhodný obsah (chyba 8007), hoci ide o biomechaniku.

### 5 · Okno „navrhni si obrázok" — HOTOVÉ (v730)

V okne titulky, pri poli na fotku: **„napíš po svojom, čo chceš vidieť"**.
Jerry napíše zámer, Jarvis z neho vyrobí prompt, ten sa dá pred použitím
doladiť a potom buď vygenerovať priamo, alebo skopírovať do Higgsfieldu.

**Znalosť promptovania je z Jerryho vlastného návodu** (`higgsfield-prompting`),
nie z mojej hlavy: buď konkrétny („anatomical side-view silhouette, thin line
art, no fill“ namiesto „diagram tela“), popisuj vzťahy medzi prvkami, popíš aj
to, čo na obrázku NIE JE, farby vždy hex kódom, nemiešaj fotorealizmus
s infografikou. Plus zákaz slova „human bodies“ kvôli bezpečnostnému filtru.

**Ostrý beh:** zo želania „chrbtica zboku, jeden stavec v drieku zvýraznený,
tenká šípka naň ukazuje“ vyšla presne tá kresba — chrbtica z profilu tenkou
linkou, jeden stavec zvýraznený, šípka naň, zvyšok prázdny, žiadny text.

**Dve obmedzenia modelu, ktoré prompt neprebije:**

- Flux **nedodržiava hex kódy**. Zvýraznený stavec vyšiel červený, hoci prompt
  žiadal `#2D7D5A`. V Higgsfielde (Nano Banana Pro) je vernosť palete lepšia —
  preto má cesta „skopírovať prompt“ zmysel aj naďalej.
- Občas domaľuje **skomolený text**, hoci prompt ho zakazuje trikrát.

### 7 · „Nech navrhne Jarvis" aj v tvorbe titulky — HOTOVÉ (v727)

Tlačidlo **„nech texty navrhne Jarvis"** v okne titulky vyplní štítok, nadpis
aj podnadpis naraz.

**Nejde to cez rozhovor, ale vlastnou adresou** (`/api/titulka-navrh`), ktorá
vráti jeden JSON. Okno titulky je formulár — keby sa návrh vypísal
v konverzácii, Jerry by ho musel prepisovať späť do polí, a to je presne tá
práca, ktorú má návrh ušetriť.

V zadaní je doslova aj to, čo appke chýbalo pri prvom ostrom behu: nadpis nemá
byť ZHRNUTIE, ale NAPÄTIE. Prvý ostrý beh to potvrdil — z captionu o plankoch
navrhol „Sval sílí. Záda *stejná*." namiesto výpočtu cvikov, aj so správne
umiestnenou hviezdičkou na pointe.

Tlačidlo sa volá inak než to v editore slotu („nech navrhne Jarvis"), aby dve
rôzne veci nemali ten istý názov.

**Vedľajší nález:** hranica hviezdičky nie je hranica slova. Bodka za
`*stejná*.` sa stala samostatným slovom a spadla na vlastný riadok. Interpunkcia
sa teraz lepí na predchádzajúce slovo.

### Odporúčané poradie

**Všetkých sedem hotových.** Najprv dve maličkosti a jedna chyba (hneď
viditeľný rozdiel), potom Jarvisove návrhy, nakoniec nové pole s celou reťazou.

## Čo je mimo titulky a stále visí

- **Inšpirácia z Instagramu: METADÁTA SA STIAHNUŤ NEDAJÚ.** Overené 25. 8. 2026
  na piatich pokusoch a dvoch odkazoch — Instagram vracia cloudflarovým
  adresám HTTP 429 zakaždým. Nie je to výpadok a rada „skús to o chvíľu" by
  bola klamstvo. Riešené priložením snímky obrazovky (v717): Jerry ju vloží
  k nápadu a Jarvis rozoberá tú. Odkaz sa ukladá tak či tak.
- Nástrely na `/navrhy-titulky` sú vlastný kód, oddelený od skutočných štýlov
- PTminder cez Zapier, osobné instagramové účty, zlúčený zoznam nedopísaných
  tréningov

**Vybavené 25. 8.:** mesiac 13 (9 miest na `jeMesiac`), druhý wrangler config
(zmazaný), fotka sa ukladá k príspevku (tabuľka `napad_obrazky`, migrácia
0061), Jarvis o titulke vie, „skladby" premenované na „štýly" s rozklikávacím
zoznamom.
