# Otvorené úlohy a otázky

Stav k 11. 8. 2026, večer. Dva zoznamy: čo sa má postaviť a na čo čakám odpoveď.
Keď na otázku odpovieš, riadok zmizne a zmena ide do kódu.

---

## A · Úlohy — čo zostáva postaviť

Poradie je zámerné: bez jednotky sa dvojka nemá o čo oprieť a trojka nemá čo merať.

### 1. Dopyty, ktoré sa naozaj vedú
Stav, dôvod straty a väzba na kampaň. Dnes má všetkých 37 dopytov od januára
stav „nový" — nikdy sa ani jeden neposunul. Dvanásť z nich netrénovalo a nikto
nevie prečo.

**Bez tohto sa reklama nedá vyhodnotiť.** Je to vedro, do ktorého by sa lialo.

### 2. Konverzia a ekonomika do kontextu Jarvisa
Dopyt → trénoval → zostal, po zdrojoch, nad ROVNAKÝM obdobím. Plus marginálna
marža a strop ceny za dopyt.

Súčasne opraviť mínu, ktorú som tam sám nechal: vedľa seba sú `klienti` po
zdrojoch (celá história) a `dopyty` po zdrojoch (len od januára 2026). Jarvis
si z toho vypočíta „Instagram: 23 klientov z 12 dopytov = 190 % konverzia".

### 3. Meta Marketing API — len čítanie
Výdavok a výsledky po kampaniach do Kokpitu. Dá cenu za dopyt automaticky.
**Čaká na otázku B5** — appku a token musíš vytvoriť ty.

### 4. Obsah → dopyt
Ku každému dopytu, čo vyšlo v predchádzajúcich dvoch týždňoch. Toto je tá
analýza obsahu, ktorá slúži cieľu — nie „ktorý hák má uloženia", ale „po čom
nám niekto napísal".

### 5. Rozhodovacia obrazovka kampaní
Kampaň → výdavok → dopyty → klienti → cena za klienta, proti stropu 2 200 Kč.
Jediné miesto na svete, kde sa to dá zobraziť — Meta nevie, kto sa stal
klientom. Stavia sa až po 1 a 3.

### 6. Instagram Graph API
Metriky po príspevkoch samé, bez ručného exportu. Po dnešnom doplnení Metricoolu
klesla priorita — export funguje, len je ručný.

---

## B · Otázky — čakám na teba

### B1 · Spustiť `uprav-pnl` naostro?
Pri teste Jarvisa som zapisovacie akcie preveril čítaním celej cesty, ale
nespustil — prostredie mi zablokovalo zápis do živej appky a `uprav-pnl` mení
reálne čísla v P&L. Spravil by som to na jednej položke, ktorú presne vrátim
späť, a ukázal by som ti pred aj po.

Práve v tejto ceste som našiel dve chyby čítaním (chýbajúci zámok mesiaca,
tichý orez JSONu). Tretiu by odhalil až beh.

### B2 · Sviežosť dát z PTmindera — 10 alebo 8 dní?
Appka pýta nový export, keď sú dáta staršie než 10 dní. Exportuješ raz týždenne,
takže 10 dní znamená, že jeden vynechaný týždeň nikto nezbadá. Pri 8 sa ozve
hneď po prvom vynechanom týždni.

### B3 · Kroky mesačnej uzávierky do Jarvisa?
Posledná vec, ktorú po dnešku nevidí. Nevie odpovedať na „čo mi ešte chýba do
uzávierky júla". Je to tá istá práca ako kalendár — asi hodina.

### B4 · Naďa Khamaziuk — rok narodenia 2036
V exporte z PTmindera má budúci rok. Prepíše sa v ⟦Klienti⟧ (✎ pri klientovi),
ručná hodnota má prednosť pred exportom. Je to tvoj údaj, nie môj odhad.

### B5 · Meta for Developers — vytvoríš appku a token?
Potrebné pre úlohu A3. Poviem presne, čo naklikať. **Token nikdy neposielaj
cez chat** — ani mne; vkladá sa priamo do nastavení.

### B6 · Export júla 2026 z Metricoolu
V priečinku končia exporty júnom. Z júla mám 3 reely, ale Metricool hlási 7
reelov, 1 post a 64 stories — appka ten mesiac označuje ako neúplný (chýba 69
kusov). Keď júl vyexportuješ a nahráš, príznak zmizne sám.

---

## C · Odložené tebou — nie sú to otázky

Sú tu len preto, aby sa nezabudli:

- **Veľké chatovacie okno v Marketingu** namiesto Claude Projectu — povedal si
  „nerieš teraz", obava z tokenov z API.
- **Púšťanie reklám priamo z Kokpitu** — odhováral som ťa; Meta mení rozhranie
  rýchlejšie, než by sme ho stíhali dobiehať.
- **Mobilná appka s push notifikáciami** — 3. fáza.
- **Klientsky prístup** (klient vidí svoje tempo) — nápad, nie plán.
- **Export uzávierky do PDF** pre účtovníčku.
- **Google Calendar API na zrušené tréningy** — dnes to appka sleduje cez
  rozdiel dvoch stiahnutí iCal, funguje od 31. 7. 2026.
- **Vlastná doména** — appka beží na `workers.dev` a funguje.

---

## D · Tvoja úloha, nie moja

**Fáza 1 reklamného testu: ~6 000 Kč na 4–6 týždňov.** Cieľom nie je zarobiť,
ale zistiť, čo u teba stojí jeden dopyt. Zastavovacie pravidlo: keď je po
6 000 Kč cena dopytu nad 2 200, problém nie je kanál, ale ponuka alebo kreatíva.

Má zmysel až po úlohe 1 — inak sa výsledok nedá zmerať.
