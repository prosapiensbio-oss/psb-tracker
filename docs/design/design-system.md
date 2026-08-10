# PSB Kokpit — Design systém „Živé sklo"

> Prepis priloženého .docx do textu, aby sa dal čítať, komentovať aj
> diffovať v repozitári. Zdroj: `PSB_Kokpit_design_system.docx` (Jerry,
> august 2026). Pri rozpore platí .docx — toto je kópia pre pohodlie.
>
> **Stav: NENASADENÉ.** Uložené na neskôr, viď rozhovor 10. 8. 2026 —
> najprv sa rozhodne, ČO na obrazovkách je, až potom AKO to vyzerá.

PSB Kokpit · Design systém — Živé sklo (Lesný mesh + Jantárová)
Implementačná špecifikácia pre Claude Code. Finálny vybraný vizuálny smer po niekoľkých kolách iterácie.
Verzia: august 2026

01 — Princíp
Dizajn stojí na dvoch vrstvách naraz:
  — Mesh gradient pozadie — namiesto plochej farby jemný viacfarebný radiálny gradient zložený z 3 farebných škvŕn nad tmavou/svetlou základňou. Farby vychádzajú z lesnej fotografie (machová, olivová, tmavozelená).
  — Glass karty — všetky obsahové bloky (karty, taby, vyhľadávacie pole) sú polopriehľadné s blur efektom (glassmorphism), takže mesh pozadie presvitá cez ne. Vytvára to pocit hĺbky a atmosféry namiesto plochého UI.
Interaktívne prvky (aktívny tab, primárne tlačidlo, progress bar) nesú teplý jantárovo-oranžový akcent — kontrastuje so studenším zeleným pozadím a jasne odlišuje 'čo je klikateľné/aktívne' od 'čo je len informácia'.

02 — Tri úrovne svetlosti
Appka potrebuje tri režimy (prepínateľné v nastaveniach alebo podľa systémovej preferencie): Tmavý, Stredný, Svetlý. Mesh aj karty sa menia spolu — nie je to len invertovanie farieb, každý režim má vlastné gradient stopy.
Tmavý režim
Najsilnejší efekt mesh gradientu — takmer čierne pozadie s výraznými olivovo-zelenými žiarami v rohoch.
mesh glow 1
#4a5c2e
mesh glow 2
#5c6b3a
mesh glow 3
#2e3a1c
base start
#14180f
base end
#1c2216

text
#f0eee2
text2
#c0bda8
muted
#867f68
accent
#e2914e
accent2
#f0b06e

warn
#e2a25e
bad
#e2604a
card bg
#2a2e26
card border
#3a3e34

card: rgba(255,255,255,0.06)   border: rgba(255,255,255,0.12)

Stredný režim
Mesh farby zosýtené a posunuté vyššie — pozadie samo je teplejšie olivovo-zelené, nie čierne.
mesh glow 1
#7a8f4e
mesh glow 2
#8fa25e
mesh glow 3
#566b32
base start
#2e3624
base end
#3a4530

text
#faf8ee
text2
#ecdec0
muted
#c2b48f
accent
#f0a55e
accent2
#f7c186

card: rgba(255,255,255,0.16)   border: rgba(255,255,255,0.28)

Svetlý režim
Najjemnejší — pastelová jarná zelená, takmer biela základňa, akcent musí byť tmavší (hnedastá jantárová) aby bol na svetlom podklade čitateľný.
mesh glow 1
#dce8c0
mesh glow 2
#e8edc8
mesh glow 3
#cddab0
base start
#f6f7ee
base end
#f2f4e8

text
#242018
text2
#5c5442
muted
#8f8770
accent
#b5691f
accent2
#8f5417

card: rgba(255,255,255,0.55)   border: rgba(255,255,255,0.9)

Spoločné pre všetky režimy (warn/bad)
Warning a error farby sa medzi režimami nemenia veľa — musia zostať rozpoznateľné ako 'pozor/problém' bez ohľadu na náladu pozadia:
warn (tmavý/stredný): #e2a25e / #f0c26e     warn (svetlý): #a5701f
bad  (tmavý): #e2604a   bad (stredný): #f27a5c   bad (svetlý): #c14328

03 — Mesh gradient — presný vzorec
Pozadie každej celoobrazovkovej plochy (nie kariet) používa túto CSS štruktúru — tri radiálne gradienty naskladané nad lineárnou základňou:
background:
  radial-gradient(circle at 15% 8%,  [glow1] 0%, transparent 45%),
  radial-gradient(circle at 88% 12%, [glow2] 0%, transparent 50%),
  radial-gradient(circle at 45% 95%, [glow3] 0%, transparent 55%),
  linear-gradient(160deg, [base-start] 0%, [base-end] 100%);

Toto sa aplikuje raz na najvrchnejší kontajner obrazovky (napr. #app alebo hlavný layout wrapper), nie opakovane na každú podstránku zvlášť — pri prechode medzi tabmi (Dashboard/Prevádzka/...) mesh zostáva rovnaký, nesmie sa re-renderovať alebo blikať.

04 — Glass karty — presný vzorec
Každý obsahový blok (karta, tab pill, vyhľadávacie pole, dropdown) používa:
background: [card farba pre daný režim];
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border: 1px solid [border farba pre daný režim];
border-radius: 20px;  /* menšie prvky (taby, chip) 10-14px */
box-shadow: 0 8px 32px rgba(0,0,0,0.15);

DÔLEŽITÉ pre Safari/WebKit kompatibilitu: -webkit-backdrop-filter prefix je povinný, inak sa blur v Safari nezobrazí vôbec. Ak backdrop-filter nie je podporovaný (starší prehliadač), karta zostane funkčná aj bez blur — len card farba musí mať dostatočnú vlastnú nepriehľadnosť (aktuálne hodnoty rgba už na to myslia), takže netreba explicitný @supports fallback, len ho otestovať.

05 — Interaktívne prvky
Primárne tlačidlo a aktívny tab
Vždy gradient, nie plná farba — vytvára jemný lesk:
background: linear-gradient(135deg, [accent], [accent2]);
color: [tmavý text na svetlom accent podklade — použi #161608 alebo #1c1c1a];
box-shadow: 0 4px 16px [accent]55;  /* accent farba s 33% alpha ako farebný tieň pod tlačidlom */

Neaktívne taby a sekundárne prvky
Používajú rovnaký glass efekt ako karty (pozri 04), len menší padding a border-radius. Text farba = text2.
Progress bar / health indikátory
Výplň pruhu je rovnaký gradient ako primárne tlačidlo (accent → accent2), pozadie pruhu je polopriehľadné biele (rgba(255,255,255,0.15) v tmavom/strednom, tmavšie v svetlom).
Negatívne/warning stavy
Karta s problémom (napr. 'pod break-even') dostáva border v bad farbe namiesto štandardného border, plus malý badge/pill s bad farbou na pozadí s ~13% alpha (zápis [bad]22 v hex-alpha notácii) a bad farbou textu.

06 — Typografia
Font: Inter (fallback -apple-system, BlinkMacSystemFont, 'SF Pro Display', Segoe UI, sans-serif).
  — Hlavné číslo v karte (napr. zisk, tržby): 36-44px, weight 700, letter-spacing -0.4 až -0.5px.
  — Sekundárne číslo v malej karte: 24-26px, weight 700.
  — Label nad číslom: 10-11px, weight 600, uppercase, letter-spacing 0.6px, farba muted.
  — Popisný text pod číslom: 11-12px, weight 400, farba text2.
  — Nadpisy sekcií (napr. 'ČO SA CHYSTÁ'): 11px, weight 600, uppercase, letter-spacing 0.8px, farba text2.

07 — Rozostupy a rozmery
  — Hlavný padding obsahu: 20-24px horizontálne, 18-20px vertikálne medzi sekciami.
  — Gap medzi kartami v riadku: 14px.
  — Padding vnútri veľkej karty: 24-26px.
  — Padding vnútri malej karty: 20-22px.
  — Border-radius veľkých kariet: 20px. Malých prvkov (taby, chipy, badge): 10-14px.
  — Šírka layoutu: navrhnuté a testované na 1280px, responzívne správanie treba doriešiť pre mobil/tablet zvlášť — mockupy toto nepokrývajú.

08 — Čo sa NEMÁ robiť
  — Nemiešať glass efekt s plnou nepriehľadnou farbou v tom istom module — buď je prvok glass (karty, taby), alebo je to gradient tlačidlo. Miešanie pôsobí nekonzistentne.
  — Nepoužívať accent farbu (jantárová) na plochy väčšie než tlačidlo/progress bar/aktívny tab. Vo veľkých plochách patrí len do mesh pozadia v tlmenej forme.
  — Nezabudnúť -webkit- prefix pre backdrop-filter — v Safari/iOS by inak karty vyzerali ako obyčajné farebné bloky bez presvitania.
  — Nemeniť mesh gradient pri prepínaní tabov v rámci jedného režimu — mesh je vlastnosť obrazovky/session, nie jednotlivej podstránky.

09 — Rozsah nasadenia
Tento design systém sa má aplikovať na CELÝ Kokpit (Dashboard, Prevádzka, Marketing, Peniaze, Bitcoin, Kalendár, Výsledky) — mockupy pokrývajú len tri reprezentatívne obrazovky (Dashboard, Fluktuácia, Výsledky/Mesačné), ale princíp z bodov 01-08 je univerzálny a platí pre každú obrazovku vrátane budúceho VZAS modulu.
Odporúčaný postup implementácie:
  — 1. Zaviesť CSS custom properties (premenné) pre všetky farby z bodu 02, zvlášť pre každý z troch režimov (napr. cez data-theme atribút na <html> alebo <body>).
  — 2. Vytvoriť dva reusable komponenty/utility triedy: .glass-card (bod 04) a .accent-button (bod 05) — všetky karty a tlačidlá v appke z nich dedia.
  — 3. Mesh gradient aplikovať raz na root layout, nie per-page.
  — 4. Prepínač režimu (tmavý/stredný/svetlý) uložiť do local storage / user preferencie, nech sa pamätá naprieč session.

10 — Referenčné súbory
Priložené k tejto špecifikácii sú tri PNG mockupy (Dashboard, Fluktuácia, Výsledky) v tmavom režime ako vizuálna referencia presných proporcií a rozloženia. Stredný a svetlý režim majú rovnaké rozloženie, len farby podľa bodu 02.
